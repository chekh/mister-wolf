// src/app/use-cases/create-face-version.ts
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import { resolveCreatedBy, resolveSessionId } from '../../domain/actor.js';
import { UserFacingError } from '../../domain/errors.js';
import { missingG17Field, type MutationG17Input } from './create-mutation-record.js';
import { resolveBase, runFaceMutation, type FaceFaultInjector } from './face-operation.js';

/** Волна 2.17 REQ-03/REQ-04 (design §«Механика версий», §Guard): единая
 * версионирующая механика лиц — guard, номер версии, supersede head, журнал;
 * всё под внешним MemoryLock (прецедент tool-librarian.ts:167: вложенные
 * addMemoryObject/supersedeMemoryObject идут с lock: undefined).
 * REQ-06 (design §«Запись мутации Стюарда»): мутация Стюарда (initiator
 * 'steward') атомарно создаёт G17-запись + relation 'mutates' → версия.
 * T-05: 'migrate'/'seed' — служебные пути (вход migrateFaces/посева base-set,
 * design §Guard «посев идёт внутренним путём с initiator: 'seed'»): guard
 * полномочий не применяется, содержание задаёт вызывающий.
 *
 * 2.17.1 REQ-03 (R04, design §3.3/ADR-3): сама цепочка — журналируемая
 * операция в face-operation.ts (add_face(candidate) → G17 → relations →
 * activate(commit) → supersede_prev → announce → op_committed) с resume
 * по opId, авто-resume и abort; этот файл — валидация входа и guard
 * (guard — до op_started, под lock). */
export type FaceCommand = 'new' | 'restore' | 'breakglass' | 'migrate' | 'seed';
export type FaceInitiator = 'steward' | 'owner' | 'breakglass' | 'migration' | 'seed';

/** Поля типа face поверх MemoryObject (декларация — memory-types.ts, T-01). */
export interface FaceFields {
  owner_skill: string;
  /** '1','2',… — номер назначает операция add_face под lock. */
  version: string;
  /** id версии-основы; отсутствует у первой версии (optional, не null). */
  based_on?: string;
  reason: string;
  initiator: FaceInitiator;
  /** 2.17.1 REQ-03 (§3.3): привязка к операции — правило усыновления candidate. */
  op_id?: string;
}

export type FaceObject = MemoryObject & FaceFields;

export interface CreateFaceVersionDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  relations?: RelationLog;
  declarations?: readonly MemoryTypeDeclaration[];
  /** Атрибуция только из env (WOLF_ACTOR / WOLF_SESSION), по умолчанию process.env.
   * Параметра-актёра у API нет: подмена инициатора (--created-by-подобная)
   * исключена структурно (design §Guard, F-04). */
  env?: NodeJS.ProcessEnv;
  /** Тестовый seam (test-plan REQ-03): fault(point) бросается после завершения
   * шага операции; прод-код не задаёт. */
  fault?: FaceFaultInjector;
}

export interface CreateFaceVersionInput {
  command: FaceCommand;
  ownerSkill: string;
  /** REQ-04 AC2: причина обязательна — без неё операция падает. */
  reason: string;
  /** Тело лица; для new обязательно, restore/breakglass берут из версии-основы. */
  body?: string;
  title?: string;
  tags?: string[];
  /** Основа: id записи или номер версии ('v2'/'2'). Обязателен для restore/breakglass. */
  from?: string;
  /** REQ-06 (G17): обязательны для command='new' (мутация Стюарда); для
   * restore/breakglass шаблон не применяется (ADR-2: только мутации Стюарда). */
  minimalChange?: string;
  boundaries?: string;
  exampleHelps?: string;
  exampleKeep?: string;
  verification?: string;
  rollback?: string;
  /** T-09 (design §«Механика версий», строка 88): id предложения, породившего
   * версию — записывает relation ('proposes', proposal, faceNew). Связь только
   * фиксируется: применение предложения остаётся решением Стюарда (REQ-09). */
  fromProposal?: string;
  /** 2.17.1 REQ-03 (§3.3): идентификатор операции — resume/идемпотентный
   * повтор; при отсутствии генерируется faceop-<ts>-<rand4> (в результате). */
  opId?: string;
  /** 2.17.1 REQ-04 (design §3.4, F9): id активного legacy-head волны 2.17 —
   * добавляет шаг supersede_legacy операции (между supersede_prev и announce).
   * Служебный вход migrateFaces и посева 2.16.3 (§3.6); resume берёт значение
   * из op_started input. */
  legacyHeadId?: string;
}

export interface CreateFaceVersionResult {
  face: FaceObject;
  /** Прежняя активная версия, superseded этой операцией; null у первой версии. */
  supersededId: string | null;
  /** G17-запись мутации (REQ-06): id note(history); null, если мутация не
   * Стюардом (restore/breakglass). */
  mutationRecordId: string | null;
  /** 2.17.1 REQ-03: id журналируемой операции (печатают CLI/MCP для recover). */
  opId: string;
}

/** Guard (design §Guard): new — строго agent:steward; restore/breakglass — user:*;
 * breakglass дополнительно отказывает из агент-сессии (WOLF_SESSION=opc-*).
 * migrate/seed — служебные пути (T-05): без проверки полномочий — вход
 * внутренний (migrateFaces / посев base-set), содержание переносится дословно.
 * null — доступ разрешён. */
function guardFailure(command: FaceCommand, actor: string, sessionId: string | null): string | null {
  if (command === 'migrate' || command === 'seed') return null;
  if (command === 'new') {
    if (actor !== 'agent:steward') {
      return `Face mutation is steward-only: actor "${actor}" is not agent:steward (attribution is env-only, WOLF_ACTOR)`;
    }
    return null;
  }
  if (!actor.startsWith('user:')) {
    return `face ${command} is owner-only: actor "${actor}" is not user:* (attribution is env-only, WOLF_ACTOR)`;
  }
  if (command === 'breakglass' && sessionId !== null && sessionId.startsWith('opc-')) {
    return 'breakglass is not available from an agent session (WOLF_SESSION=opc-*)';
  }
  return null;
}

async function appendDenied(
  deps: Pick<CreateFaceVersionDeps, 'log' | 'clock' | 'idGen'>,
  ownerSkill: string,
  actor: string,
  command: FaceCommand
): Promise<void> {
  const now = deps.clock.now();
  const event: MemoryEvent = {
    id: deps.idGen.generateEventId(now),
    type: 'memory.face.denied',
    timestamp: now.toISOString(),
    actor,
    payload: { owner_skill: ownerSkill, actor, command },
  };
  await deps.log.append(event);
}

export async function createFaceVersion(
  deps: CreateFaceVersionDeps,
  input: CreateFaceVersionInput
): Promise<CreateFaceVersionResult> {
  const env = deps.env ?? process.env;
  const actor = resolveCreatedBy(undefined, env);
  const sessionId = resolveSessionId(env);

  if (!input.ownerSkill || input.ownerSkill.trim() === '') {
    throw new UserFacingError('Face version requires owner_skill');
  }
  if (!input.reason || input.reason.trim() === '') {
    throw new UserFacingError('Face version requires a reason (REQ-04)');
  }
  if ((input.command === 'restore' || input.command === 'breakglass') && !input.from) {
    throw new UserFacingError(`face ${input.command} requires the base version (--from <id|vN>)`);
  }
  const restoreLikeCommand = input.command === 'restore' || input.command === 'breakglass';
  if (!restoreLikeCommand && (input.body === undefined || input.body.trim() === '')) {
    throw new UserFacingError(`face ${input.command} requires a body`);
  }

  const run = async (): Promise<CreateFaceVersionResult> => {
    const deny = guardFailure(input.command, actor, sessionId);
    if (deny !== null) {
      await appendDenied(deps, input.ownerSkill, actor, input.command);
      throw new UserFacingError(deny);
    }

    // REQ-06 AC2: шаблон G17 неопционален для мутации Стюарда — проверка ДО
    // любых записей: без обязательных полей операция целиком не выполняется.
    const g17: Partial<MutationG17Input> = {
      reason: input.reason,
      minimalChange: input.minimalChange,
      boundaries: input.boundaries,
      exampleHelps: input.exampleHelps,
      exampleKeep: input.exampleKeep,
      verification: input.verification,
      rollback: input.rollback,
    };
    if (input.command === 'new') {
      const missing = missingG17Field(g17);
      if (missing !== null) {
        throw new UserFacingError(
          `Face mutation requires G17 field "${missing}" (REQ-06: the template is not optional)`
        );
      }
    }

    // T-09: валидация предложения ДО любых записей — битая ссылка не оставляет
    // половину операции (та же атомарность, что у G17-проверки выше)
    if (input.fromProposal !== undefined) {
      const proposal = await deps.store.get(input.fromProposal);
      if (!proposal) {
        throw new UserFacingError(`Proposal not found: ${input.fromProposal}`);
      }
      if ((proposal as { facet?: string }).facet !== 'proposal') {
        throw new UserFacingError(`Memory object ${input.fromProposal} is not a proposal (facet=proposal required)`);
      }
    }

    // Основа (restore/breakglass) проверяется до op_started: битая ссылка не
    // оставляет незавершённую операцию в журнале (fail fast).
    if (input.from) {
      await resolveBase(deps.store, input.ownerSkill, input.from);
    }

    // 2.17.1 REQ-03: цепочка шагов — журналируемая операция (face-operation.ts);
    // мы уже под lock, engine его не пере-берёт.
    return runFaceMutation(deps, { input, actor });
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
