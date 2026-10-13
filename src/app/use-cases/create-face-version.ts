// src/app/use-cases/create-face-version.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import { resolveCreatedBy, resolveSessionId } from '../../domain/actor.js';
import { UserFacingError } from '../../domain/errors.js';
import { addMemoryObject } from './add-memory-object.js';
import { supersedeMemoryObject } from './supersede-memory-object.js';
import { createMutationRecord, missingG17Field, type MutationG17Input } from './create-mutation-record.js';
import { recordRelation } from './record-relation.js';

/** Волна 2.17 REQ-03/REQ-04 (design §«Механика версий», §Guard): единая
 * версионирующая механика лиц — guard, номер версии, supersede head, журнал;
 * всё под внешним MemoryLock (прецедент tool-librarian.ts:167: вложенные
 * addMemoryObject/supersedeMemoryObject идут с lock: undefined).
 * REQ-06 (design §«Запись мутации Стюарда»): мутация Стюарда (initiator
 * 'steward') атомарно создаёт G17-запись + relation 'mutates' → версия.
 * T-05: 'migrate'/'seed' — служебные пути (вход migrateFaces/посева base-set,
 * design §Guard «посев идёт внутренним путём с initiator: 'seed'»): guard
 * полномочий не применяется, содержание задаёт вызывающий. */
export type FaceCommand = 'new' | 'restore' | 'breakglass' | 'migrate' | 'seed';
export type FaceInitiator = 'steward' | 'owner' | 'breakglass' | 'migration' | 'seed';

/** Поля типа face поверх MemoryObject (декларация — memory-types.ts, T-01). */
export interface FaceFields {
  owner_skill: string;
  /** '1','2',… — номер назначает эта команда под lock. */
  version: string;
  /** id версии-основы; отсутствует у первой версии (optional, не null). */
  based_on?: string;
  reason: string;
  initiator: FaceInitiator;
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
}

export interface CreateFaceVersionResult {
  face: FaceObject;
  /** Прежняя активная версия, superseded этой операцией; null у первой версии. */
  supersededId: string | null;
  /** G17-запись мутации (REQ-06): id note(history); null, если мутация не
   * Стюардом (restore/breakglass). */
  mutationRecordId: string | null;
}

const INITIATOR_BY_COMMAND: Record<FaceCommand, FaceInitiator> = {
  new: 'steward',
  restore: 'owner',
  breakglass: 'breakglass',
  migrate: 'migration',
  seed: 'seed',
};

function asFace(obj: MemoryObject): FaceObject {
  return obj as FaceObject;
}

async function facesOfOwner(store: MemoryStore, ownerSkill: string): Promise<FaceObject[]> {
  return (await store.list({ type: 'face' })).filter((o) => asFace(o).owner_skill === ownerSkill).map(asFace);
}

/** Активная (head) версия владельца; null — владельца ещё нет. Дубликаты активных
 * ловит doctor (NFR-02); здесь детерминированно берётся старшая версия. */
async function activeFace(store: MemoryStore, ownerSkill: string): Promise<FaceObject | null> {
  const active = (await facesOfOwner(store, ownerSkill)).filter((f) => f.status === 'active');
  if (active.length === 0) return null;
  return active.sort((a, b) => Number(b.version) - Number(a.version))[0]!;
}

/** Резолв ссылки на основу: mem_-id напрямую, иначе номер версии ('v2'/'2'). */
async function resolveBase(store: MemoryStore, ownerSkill: string, ref: string): Promise<FaceObject> {
  if (ref.startsWith('mem_')) {
    const obj = await store.get(ref);
    if (!obj || obj.type !== 'face' || asFace(obj).owner_skill !== ownerSkill) {
      throw new UserFacingError(`Face version not found for ${ownerSkill}: ${ref}`);
    }
    return asFace(obj);
  }
  const n = ref.replace(/^v/, '');
  const found = (await facesOfOwner(store, ownerSkill)).filter((f) => f.version === n);
  if (found.length === 0) throw new UserFacingError(`Face version not found for ${ownerSkill}: ${ref}`);
  return found.sort((a, b) => Number(b.version) - Number(a.version))[0]!;
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

    // Номер версии и head — строго под lock: параллельные вызовы сериализуются.
    const cur = await activeFace(deps.store, input.ownerSkill);
    const base = input.from ? await resolveBase(deps.store, input.ownerSkill, input.from) : cur;
    const nextVersion =
      (await facesOfOwner(deps.store, input.ownerSkill)).reduce((m, f) => Math.max(m, Number(f.version) || 0), 0) + 1;

    const restoreLike = input.command === 'restore' || input.command === 'breakglass';
    const source = restoreLike ? base : null;
    const title = restoreLike ? source!.title : (input.title ?? `Face: ${input.ownerSkill}`);
    const body = restoreLike ? source!.body : input.body!;
    const tags = restoreLike ? source!.tags : (input.tags ?? []);

    const extra: Record<string, unknown> = {
      owner_skill: input.ownerSkill,
      version: String(nextVersion),
      reason: input.reason,
      initiator: INITIATOR_BY_COMMAND[input.command],
    };
    if (base) extra.based_on = base.id;

    // lock не передаём: мы уже внутри deps.lock.withLock (FsMemoryLock не реентерабелен)
    const { object } = await addMemoryObject(
      {
        store: deps.store,
        log: deps.log,
        clock: deps.clock,
        idGen: deps.idGen,
        index: deps.index,
        declarations: deps.declarations,
      },
      { type: 'face', title, body, tags, createdBy: actor, extra, internalFacePath: true }
    );
    const face = asFace(object);

    let supersededId: string | null = null;
    if (cur && cur.id !== face.id) {
      await supersedeMemoryObject(
        { store: deps.store, log: deps.log, clock: deps.clock, idGen: deps.idGen, index: deps.index },
        cur.id,
        face.id
      );
      supersededId = cur.id;
    }

    // REQ-06 (design §«Механика версий»): initiator 'steward' → атомарно
    // G17-запись note(history) + relation 'mutates' → версия; та же
    // lock-транзакция (внутренние вызовы без lock).
    let mutationRecordId: string | null = null;
    if (INITIATOR_BY_COMMAND[input.command] === 'steward') {
      const note = await createMutationRecord(
        {
          store: deps.store,
          log: deps.log,
          clock: deps.clock,
          idGen: deps.idGen,
          index: deps.index,
          relations: deps.relations,
        },
        {
          ownerSkill: input.ownerSkill,
          version: face.version,
          faceId: face.id,
          createdBy: actor,
          reason: g17.reason!,
          minimalChange: g17.minimalChange!,
          boundaries: g17.boundaries!,
          exampleHelps: g17.exampleHelps!,
          exampleKeep: g17.exampleKeep!,
          verification: g17.verification!,
          rollback: g17.rollback!,
        }
      );
      mutationRecordId = note.id;
    }

    // T-09 (design §«Механика версий», строка 88): --from-proposal → relation
    // ('proposes', proposal, faceNew); только связь, не применение (REQ-09)
    if (input.fromProposal !== undefined) {
      await recordRelation(
        { relations: deps.relations, idGen: deps.idGen },
        deps.clock.now(),
        input.fromProposal,
        'proposes',
        face.id,
        'system'
      );
    }

    // Design §События журнала: versioned — на КАЖДУЮ версию (включая breakglass,
    // REQ-07 «результат = новая версия»); breakglass дополнительно журналируется
    // own-событием в составе самой операции (REQ-07 AC2). Порядок: versioned, затем breakglass.
    const now = deps.clock.now();
    const versionPayload = {
      owner_skill: input.ownerSkill,
      from: supersededId,
      new: face.id,
      initiator: INITIATOR_BY_COMMAND[input.command],
      reason: input.reason,
    };
    const versioned: MemoryEvent = {
      id: deps.idGen.generateEventId(now),
      type: 'memory.face.versioned',
      timestamp: now.toISOString(),
      actor,
      payload: versionPayload,
    };
    await deps.log.append(versioned);
    if (input.command === 'breakglass') {
      const breakglass: MemoryEvent = {
        id: deps.idGen.generateEventId(now),
        type: 'memory.face.breakglass',
        timestamp: now.toISOString(),
        actor,
        payload: versionPayload,
      };
      await deps.log.append(breakglass);
    }

    return { face, supersededId, mutationRecordId };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
