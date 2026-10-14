// src/app/use-cases/face-operation.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { canTransition } from '../../domain/governance.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import { resolveCreatedBy } from '../../domain/actor.js';
import { UserFacingError } from '../../domain/errors.js';
import { addMemoryObject } from './add-memory-object.js';
import { supersedeMemoryObject } from './supersede-memory-object.js';
import { createMutationRecord } from './create-mutation-record.js';
import { recordRelation } from './record-relation.js';
import type {
  CreateFaceVersionInput,
  CreateFaceVersionResult,
  FaceCommand,
  FaceInitiator,
  FaceObject,
} from './create-face-version.js';

/** 2.17.1 REQ-03 (R04), design §3.3/ADR-3: операция лица — журналируемая
 * цепочка шагов (staging `candidate` → activation как точка commit) в
 * существующем append-only event log; resume/abort идемпотентны по opId,
 * reconcile читает фактическое состояние store (журнал — намёк, store —
 * истина). `supersede_legacy` — шаг операций 'migrate'/'seed' (design §3.4/F9
 * + §3.6 — популяция 2.16.3 тем же input.legacyHeadId): добавляется планом
 * только при legacyHeadId во input (между supersede_prev
 * и announce); план 'new'/'restore'-подобных его не содержит. Всё исполняется под ВНЕШНИМ MemoryLock (прецедент
 * create-face-version.ts): сам модуль lock не реентерабельно не берёт,
 * кроме публичных точек recover (self-locking). */

export type FaceOperationStep =
  | 'add_face'
  | 'g17_record'
  | 'proposal_relation'
  | 'activate'
  | 'supersede_prev'
  | 'supersede_legacy'
  | 'announce';

/** Точки тестового seam'а (test-plan REQ-03): fault(point) бросается ПОСЛЕ
 * завершения указанного шага (данные на диске, следующий не начат);
 * 'op_committed' — перед финальной записью (F7: событие отсутствует). */
export type FaceFaultPoint = 'op_started' | FaceOperationStep | 'op_committed';
export type FaceFaultInjector = (point: FaceFaultPoint) => void;

export interface FaceOperationDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  /** Публичные точки (resume/abort) берут lock сами; runFaceMutation зовётся
   * вызывающим уже под его lock (FsMemoryLock не реентерабелен). */
  lock?: MemoryLock;
  relations?: RelationLog;
  declarations?: readonly MemoryTypeDeclaration[];
  env?: NodeJS.ProcessEnv;
  fault?: FaceFaultInjector;
}

export const INITIATOR_BY_COMMAND: Record<FaceCommand, FaceInitiator> = {
  new: 'steward',
  restore: 'owner',
  breakglass: 'breakglass',
  migrate: 'migration',
  seed: 'seed',
};

export function asFace(obj: MemoryObject): FaceObject {
  return obj as FaceObject;
}

export async function facesOfOwner(store: MemoryStore, ownerSkill: string): Promise<FaceObject[]> {
  return (await store.list({ type: 'face' })).filter((o) => asFace(o).owner_skill === ownerSkill).map(asFace);
}

/** Активная (head) версия владельца; null — владельца ещё нет. Дубль активных
 * ловит doctor; здесь детерминированно берётся старшая версия (§3.3 — окно
 * «два активных» между activate и supersede закрывается этим детерминизмом). */
export async function activeFace(store: MemoryStore, ownerSkill: string): Promise<FaceObject | null> {
  const active = (await facesOfOwner(store, ownerSkill)).filter((f) => f.status === 'active');
  if (active.length === 0) return null;
  return active.sort((a, b) => Number(b.version) - Number(a.version))[0]!;
}

/** Резолв ссылки на основу: mem_-id напрямую, иначе номер версии ('v2'/'2'). */
export async function resolveBase(store: MemoryStore, ownerSkill: string, ref: string): Promise<FaceObject> {
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

/** opId по контракту §3.3: faceop-<ts>-<rand4>. */
export function generateOpId(clock: Clock): string {
  const rand = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `faceop-${clock.now().getTime()}-${rand}`;
}

interface FaceOpRecord {
  opId: string;
  command: FaceCommand;
  ownerSkill: string;
  plan: FaceOperationStep[];
  input: CreateFaceVersionInput;
  committed: boolean;
  aborted: boolean;
  activated: boolean;
  /** detail завершённых шагов из журнала (face_id/note_id/prev_id). */
  steps: Map<FaceOperationStep, Record<string, unknown>>;
  /** позиция op_started в потоке — «последняя» незавершённая для авто-resume. */
  seq: number;
}

/** Журнал операций из event log (последний op_started с данным opId выигрывает). */
async function readOperations(log: EventLog): Promise<Map<string, FaceOpRecord>> {
  const ops = new Map<string, FaceOpRecord>();
  for (const [seq, e] of (await log.readAll()).entries()) {
    const opId = e.payload['opId'];
    if (typeof opId !== 'string') continue;
    if (e.type === 'memory.face.op_started') {
      ops.set(opId, {
        opId,
        command: String(e.payload['command'] ?? '') as FaceCommand,
        ownerSkill: String(e.payload['owner_skill'] ?? ''),
        plan: Array.isArray(e.payload['plan']) ? (e.payload['plan'] as FaceOperationStep[]) : [],
        input: (e.payload['input'] ?? {}) as CreateFaceVersionInput,
        committed: false,
        aborted: false,
        activated: false,
        steps: new Map(),
        seq,
      });
      continue;
    }
    const op = ops.get(opId);
    if (!op) continue;
    if (e.type === 'memory.face.op_step') {
      const step = String(e.payload['step']) as FaceOperationStep;
      op.steps.set(step, (e.payload['detail'] as Record<string, unknown> | undefined) ?? {});
      if (step === 'activate') op.activated = true;
    } else if (e.type === 'memory.face.op_committed') {
      op.committed = true;
    } else if (e.type === 'memory.face.op_aborted') {
      op.aborted = true;
    }
  }
  return ops;
}

export interface IncompleteFaceOperation {
  opId: string;
  command: string;
  ownerSkill: string;
  /** true — activation прошла (состояние «применено, требуется след»). */
  activated: boolean;
}

/** Doctor (§3.3): op_started без op_committed/op_aborted — «неполный след
 * мутации». Чистая функция над журналом; авто-healing doctor не делает. */
export function incompleteFaceOperations(events: readonly MemoryEvent[]): IncompleteFaceOperation[] {
  const byOp = new Map<string, IncompleteFaceOperation & { done: boolean }>();
  for (const e of events) {
    const opId = e.payload['opId'];
    if (typeof opId !== 'string') continue;
    const rec = byOp.get(opId);
    if (e.type === 'memory.face.op_started') {
      if (rec) {
        rec.command = String(e.payload['command'] ?? rec.command);
        rec.ownerSkill = String(e.payload['owner_skill'] ?? rec.ownerSkill);
      } else {
        byOp.set(opId, {
          opId,
          command: String(e.payload['command'] ?? ''),
          ownerSkill: String(e.payload['owner_skill'] ?? ''),
          activated: false,
          done: false,
        });
      }
    } else if (rec && e.type === 'memory.face.op_step' && e.payload['step'] === 'activate') {
      rec.activated = true;
    } else if (rec && (e.type === 'memory.face.op_committed' || e.type === 'memory.face.op_aborted')) {
      rec.done = true;
    }
  }
  return [...byOp.values()]
    .filter((r) => !r.done)
    .map(({ opId, command, ownerSkill, activated }) => ({
      opId,
      command,
      ownerSkill,
      activated,
    }));
}

async function appendEvent(
  deps: FaceOperationDeps,
  type: MemoryEvent['type'],
  payload: Record<string, unknown>,
  actor: string
): Promise<void> {
  const now = deps.clock.now();
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type,
    timestamp: now.toISOString(),
    actor,
    payload,
  });
}

/** Индекс FTS производный (§3.3): сбой его обновления не рушит операцию —
 * предупреждение в stderr, лечение — wolf doctor --repair (rebuild). */
function safeIndex(deps: FaceOperationDeps, opId: string): SearchIndex | undefined {
  const idx = deps.index;
  if (!idx) return undefined;
  return {
    rebuild: (objects) => idx.rebuild(objects),
    indexObject: (o) =>
      idx.indexObject(o).catch((err) => {
        console.error(
          `face operation ${opId}: FTS index update failed (wolf doctor --repair rebuilds it): ${err instanceof Error ? err.message : String(err)}`
        );
      }),
    removeObject: (id) => idx.removeObject(id),
    search: (q, o) => idx.search(q, o),
  };
}

/** Привязка объект↔операция (§3.3): face владельца с совпадающим op_id.
 * Дубль с одним op_id — честная ошибка (вскрыть вручную). */
async function faceByOpId(store: MemoryStore, ownerSkill: string, opId: string): Promise<FaceObject | null> {
  const found = (await facesOfOwner(store, ownerSkill)).filter((f) => f.op_id === opId);
  if (found.length > 1) {
    throw new UserFacingError(
      `multiple faces of ${ownerSkill} carry op_id ${opId} (${found.map((f) => f.id).join(', ')}) — resolve manually`
    );
  }
  return found[0] ?? null;
}

/** G17-запись ищется по детерминированному title (create-mutation-record.ts). */
async function findMutationNote(store: MemoryStore, ownerSkill: string, version: string): Promise<MemoryObject | null> {
  const title = `mutation: ${ownerSkill} v${version}`;
  return (
    ((await store.list({ type: 'note', facet: 'history' })).find((n) => n.title === title) as
      | MemoryObject
      | undefined) ?? null
  );
}

function journalDetail(op: FaceOpRecord, step: FaceOperationStep, key: string): string | null {
  const v = op.steps.get(step)?.[key];
  return typeof v === 'string' ? v : null;
}

/** План шагов операции по команде (§3.3): g17 — только initiator 'steward';
 * proposal_relation — только при --from-proposal; supersede_legacy — только
 * 'migrate'/'seed' с legacyHeadId (design §3.4/F9 + §3.6: между supersede_prev
 * и announce). */
function planFor(input: CreateFaceVersionInput): FaceOperationStep[] {
  const plan: FaceOperationStep[] = ['add_face'];
  if (INITIATOR_BY_COMMAND[input.command] === 'steward') plan.push('g17_record');
  if (input.fromProposal !== undefined) plan.push('proposal_relation');
  plan.push('activate', 'supersede_prev');
  if ((input.command === 'migrate' || input.command === 'seed') && input.legacyHeadId !== undefined) {
    plan.push('supersede_legacy');
  }
  plan.push('announce');
  return plan;
}

/** input для op_started: JSON-чистый (undefined-ключи исчезают — payload JSONL). */
function serializeInput(input: CreateFaceVersionInput): CreateFaceVersionInput {
  return JSON.parse(JSON.stringify(input)) as CreateFaceVersionInput;
}

/** Каноничное сравнение input'ов (порядок ключей не важен, undefined = отсутствие):
 * одинаковый input незавершённой операции — этот вызов и есть её повтор
 * (одна логическая мутация = одна версия, REQ-03 AC-2); разный — новая мутация
 * после дозавершения старой (§3.3 авто-resume). */
function sameInput(a: CreateFaceVersionInput, b: CreateFaceVersionInput): boolean {
  const ser = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return `[${v.map(ser).join(',')}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${ser(o[k])}`)
      .join(',')}}`;
  };
  return ser(serializeInput(a)) === ser(serializeInput(b));
}

async function stepDone(
  deps: FaceOperationDeps,
  op: FaceOpRecord,
  step: FaceOperationStep,
  detail: Record<string, unknown>,
  actor: string
): Promise<void> {
  await appendEvent(deps, 'memory.face.op_step', { opId: op.opId, step, detail }, actor);
  op.steps.set(step, detail);
  if (step === 'activate') op.activated = true;
  deps.fault?.(step);
}

/** Результат из фактического состояния (идемпотентный повтор завершённой
 * операции): supersede-цель — единственная face с superseded_by на новую. */
async function resultFromRecord(deps: FaceOperationDeps, op: FaceOpRecord): Promise<CreateFaceVersionResult> {
  const face = await faceByOpId(deps.store, op.ownerSkill, op.opId);
  if (!face) {
    throw new UserFacingError(`face operation ${op.opId} has no face object — inspect the store manually`);
  }
  const supersededId =
    ((await facesOfOwner(deps.store, op.ownerSkill)).find((f) => f.superseded_by === face.id)?.id as
      | string
      | undefined) ?? null;
  const mutationRecordId =
    journalDetail(op, 'g17_record', 'note_id') ??
    ((await findMutationNote(deps.store, op.ownerSkill, face.version))?.id as string | undefined) ??
    null;
  return { face, supersededId, mutationRecordId, opId: op.opId };
}

/** F-01 (фикс-раунд 1 ревью фазы 4): healing-операция миграции — план не
 * начинается с add_face (тот же признак, что parseMigrateOps в
 * migrate-faces.ts). Её вход не содержит body, а add_face не входит в план:
 * recovery-пути (wolf face recover, авто-resume, явный --op-id) её НЕ
 * исполняют — иначе executeChain создал бы версию с пустым body и погасил
 * живой канон. Дозавершение — только повторный `wolf face migrate`
 * (migrateOwner → healLegacyTransition). */
function healingRefusal(op: FaceOpRecord): UserFacingError {
  return new UserFacingError(
    `face operation ${op.opId} is a healing migration (plan: ${op.plan.join(', ')}) — recovery cannot resume it; re-run wolf face migrate to complete it (or wolf face recover ${op.opId} --abort to cancel)`
  );
}

/** Цепочка шагов с reconcile (§3.3): каждый шаг перед записью проверяет
 * фактическое состояние — уже-выполненное пропускается молча (без второго
 * op_step). Вызывается под внешним lock. */
async function executeChain(
  deps: FaceOperationDeps,
  op: FaceOpRecord,
  actor: string
): Promise<CreateFaceVersionResult> {
  // F-01 defense-in-depth: шаг add_face гейтен планом — версия с пустым body
  // (вход healing-операции body не содержит) из recovery-пути невозможна в принципе.
  if (op.plan[0] !== 'add_face') throw healingRefusal(op);
  const index = safeIndex(deps, op.opId);
  const { store } = deps;
  const input = op.input;

  // 1 add_face — версия лица, status 'candidate'; номер версии назначается здесь.
  // Правило усыновления: candidate с совпадающим op_id принадлежит операции
  // (окно «объект сохранён, op_step не дописан»); чужой/пустой op_id — конфликт.
  let face = await faceByOpId(store, op.ownerSkill, op.opId);
  if (!face) {
    const candidates = (await facesOfOwner(store, op.ownerSkill)).filter((f) => f.status === 'candidate');
    if (candidates.length > 0) {
      throw new UserFacingError(
        `unfinished face operation ${op.opId} for ${op.ownerSkill} conflicts with candidate(s) ${candidates
          .map((c) => `${c.id} (op_id: ${c.op_id ?? 'empty'})`)
          .join(
            ', '
          )} — not adopted blindly; resolve: wolf face recover ${op.opId} --abort, or archive the foreign candidate`
      );
    }
    const base = input.from
      ? await resolveBase(store, op.ownerSkill, input.from)
      : await activeFace(store, op.ownerSkill);
    const nextVersion =
      (await facesOfOwner(store, op.ownerSkill)).reduce((m, f) => Math.max(m, Number(f.version) || 0), 0) + 1;
    const restoreLike = input.command === 'restore' || input.command === 'breakglass';
    const title = restoreLike ? base!.title : (input.title ?? `Face: ${op.ownerSkill}`);
    const body = restoreLike ? base!.body : input.body!;
    const tags = restoreLike ? base!.tags : (input.tags ?? []);
    const extra: Record<string, unknown> = {
      owner_skill: op.ownerSkill,
      version: String(nextVersion),
      reason: input.reason,
      initiator: INITIATOR_BY_COMMAND[input.command],
      op_id: op.opId,
    };
    if (base) extra.based_on = base.id;
    const { object } = await addMemoryObject(
      { store, log: deps.log, clock: deps.clock, idGen: deps.idGen, index, declarations: deps.declarations },
      { type: 'face', title, body, tags, createdBy: actor, status: 'candidate', extra, internalFacePath: true }
    );
    face = asFace(object);
    await stepDone(deps, op, 'add_face', { face_id: face.id, version: face.version }, actor);
  }

  // 2 g17_record — G17-запись + relation 'mutates' (только initiator steward).
  let mutationRecordId = journalDetail(op, 'g17_record', 'note_id');
  if (op.plan.includes('g17_record') && mutationRecordId === null) {
    const existing = await findMutationNote(store, op.ownerSkill, face.version);
    if (existing === null) {
      const note = await createMutationRecord(
        { store, log: deps.log, clock: deps.clock, idGen: deps.idGen, index, relations: deps.relations },
        {
          ownerSkill: op.ownerSkill,
          version: face.version,
          faceId: face.id,
          createdBy: actor,
          reason: input.reason,
          minimalChange: input.minimalChange ?? '',
          boundaries: input.boundaries ?? '',
          exampleHelps: input.exampleHelps ?? '',
          exampleKeep: input.exampleKeep ?? '',
          verification: input.verification ?? '',
          rollback: input.rollback ?? '',
        }
      );
      mutationRecordId = note.id;
      await stepDone(deps, op, 'g17_record', { note_id: note.id }, actor);
    } else {
      mutationRecordId = existing.id;
    }
  }

  // 3 proposal_relation — relation 'proposes' (если --from-proposal).
  if (op.plan.includes('proposal_relation') && input.fromProposal !== undefined) {
    const recorded =
      deps.relations &&
      (await deps.relations.list({ subject: input.fromProposal, predicate: 'proposes', object: face.id })).length > 0;
    if (!recorded) {
      await recordRelation(
        { relations: deps.relations, idGen: deps.idGen },
        deps.clock.now(),
        input.fromProposal,
        'proposes',
        face.id,
        'system'
      );
      await stepDone(deps, op, 'proposal_relation', { proposal_id: input.fromProposal }, actor);
    }
  }

  // 4 activate — ТОЧКА COMMIT: candidate → active; всё содержимое написано выше.
  if (face.status === 'candidate') {
    if (!canTransition('candidate', 'active')) {
      throw new UserFacingError(`transition candidate → active is not allowed (face ${face.id})`);
    }
    const updated = await store.update(face.id, { status: 'active' });
    await appendEvent(deps, 'memory.transitioned', { memory_id: face.id, from: 'candidate', to: 'active' }, actor);
    await index?.indexObject(updated);
    face = asFace(updated);
    await stepDone(deps, op, 'activate', { face_id: face.id }, actor);
  } else if (face.status === 'active') {
    op.activated = true; // окно «activation записана, op_step не дописан»
  } else {
    throw new UserFacingError(
      `face ${face.id} is "${face.status}" — operation ${op.opId} cannot proceed; resolve manually (wolf face recover ${op.opId} --abort or restore)`
    );
  }

  // 5 supersede_prev — погасить прежнюю активную (если была); идемпотентно.
  let supersededId = journalDetail(op, 'supersede_prev', 'prev_id');
  const others = (await facesOfOwner(store, op.ownerSkill))
    .filter((f) => f.id !== face.id && f.status === 'active')
    .sort((a, b) => Number(b.version) - Number(a.version));
  if (others.length > 0) {
    const prev = others[0]!;
    await supersedeMemoryObject(
      { store, log: deps.log, clock: deps.clock, idGen: deps.idGen, index },
      prev.id,
      face.id,
      { internalFacePath: true }
    );
    supersededId = prev.id;
    await stepDone(deps, op, 'supersede_prev', { prev_id: prev.id }, actor);
  }

  // 5b supersede_legacy — погасить legacy-head волны 2.17 (design §3.4/F9 +
  // §3.6; только migrate/seed с legacyHeadId). Идемпотентность §3.3: op_step уже в
  // журнале → skip; head уже погашен (окно «supersede записан, op_step не
  // дописан») → погашение не повторяется, op_step дописывается.
  if (op.plan.includes('supersede_legacy') && input.legacyHeadId !== undefined) {
    const legacyHeadId = input.legacyHeadId;
    if (journalDetail(op, 'supersede_legacy', 'head_id') === null) {
      const head = await store.get(legacyHeadId);
      if (!head) {
        throw new UserFacingError(`legacy head not found: ${legacyHeadId} (operation ${op.opId}) — resolve manually`);
      }
      if (head.status !== 'superseded') {
        await supersedeMemoryObject(
          { store, log: deps.log, clock: deps.clock, idGen: deps.idGen, index },
          legacyHeadId,
          face.id
        );
      }
      await stepDone(deps, op, 'supersede_legacy', { head_id: legacyHeadId, face_id: face.id }, actor);
    }
  }

  // 6 announce — публичное событие memory.face.versioned (+ breakglass).
  const announced = (await deps.log.readAll()).some(
    (e) => e.type === 'memory.face.versioned' && e.payload['new'] === face.id
  );
  if (!announced) {
    const versionPayload = {
      owner_skill: op.ownerSkill,
      from: supersededId,
      new: face.id,
      initiator: INITIATOR_BY_COMMAND[input.command],
      reason: input.reason,
    };
    await appendEvent(deps, 'memory.face.versioned', versionPayload, actor);
    if (input.command === 'breakglass') {
      await appendEvent(deps, 'memory.face.breakglass', versionPayload, actor);
    }
    await stepDone(deps, op, 'announce', {}, actor);
  }

  // 7 op_committed — финал журнала операции (F7: может отсутствовать — данные целы).
  if (!op.committed) {
    deps.fault?.('op_committed');
    await appendEvent(deps, 'memory.face.op_committed', { opId: op.opId }, actor);
    op.committed = true;
  }

  return { face, supersededId, mutationRecordId, opId: op.opId };
}

/** Мутация лица как операция (вызывается из createFaceVersion ПОД его lock):
 * явный opId → resume/идемпотентный повтор; иначе авто-resume незавершённой
 * операции того же owner_skill (§3.3) и старт новой. */
export async function runFaceMutation(
  deps: FaceOperationDeps,
  opts: { input: CreateFaceVersionInput; actor: string }
): Promise<CreateFaceVersionResult> {
  const owner = opts.input.ownerSkill;
  const ops = await readOperations(deps.log);
  const given = opts.input.opId !== undefined ? ops.get(opts.input.opId) : undefined;
  if (opts.input.opId !== undefined && given) {
    if (given.ownerSkill !== owner) {
      throw new UserFacingError(`face operation ${opts.input.opId} belongs to ${given.ownerSkill}, not ${owner}`);
    }
    if (given.aborted) {
      throw new UserFacingError(`face operation ${opts.input.opId} was aborted — start a new mutation without --op-id`);
    }
    if (given.committed) return resultFromRecord(deps, given); // повтор без второй версии
    return executeChain(deps, given, opts.actor); // resume: args из op_started
  }
  // Авто-resume: первая же мутация владельца дозавершает незавершённую
  // операцию под тем же lock до старта новой (детерминированно из op_started).
  // Тот же input — вызов является повтором той же операции (без второй версии).
  // F-01: healing-операции пропускуются — их дозавершает только wolf face migrate.
  let unfinished: FaceOpRecord | null = null;
  for (const op of ops.values()) {
    if (op.ownerSkill !== owner || op.committed || op.aborted) continue;
    if (op.plan[0] !== 'add_face') continue;
    if (unfinished === null || op.seq > unfinished.seq) unfinished = op;
  }
  if (unfinished) {
    if (sameInput(unfinished.input, opts.input)) return executeChain(deps, unfinished, opts.actor);
    await executeChain(deps, unfinished, opts.actor);
  }

  const opId = opts.input.opId ?? generateOpId(deps.clock);
  await appendEvent(
    deps,
    'memory.face.op_started',
    {
      opId,
      command: opts.input.command,
      owner_skill: owner,
      plan: planFor(opts.input),
      input: serializeInput(opts.input),
    },
    opts.actor
  );
  deps.fault?.('op_started');
  const record: FaceOpRecord = {
    opId,
    command: opts.input.command,
    ownerSkill: owner,
    plan: planFor(opts.input),
    input: opts.input,
    committed: false,
    aborted: false,
    activated: false,
    steps: new Map(),
    seq: Number.MAX_SAFE_INTEGER,
  };
  return executeChain(deps, record, opts.actor);
}

/** `wolf face recover <opId>`: дозавершение незавершённой операции (без --abort).
 * Идемпотентно: завершённая операция возвращает своё состояние без записей. */
export async function resumeFaceOperation(
  deps: FaceOperationDeps,
  opId: string,
  actor?: string
): Promise<CreateFaceVersionResult> {
  const who = actor ?? resolveCreatedBy(undefined, deps.env ?? process.env);
  const run = async (): Promise<CreateFaceVersionResult> => {
    const ops = await readOperations(deps.log);
    const op = ops.get(opId);
    if (!op) throw new UserFacingError(`face operation not found: ${opId}`);
    if (op.plan[0] !== 'add_face') throw healingRefusal(op); // F-01/MINOR-1: гейт выше committed — завершённой healing-операции честный отказ вместо «no face object»
    if (op.committed) return resultFromRecord(deps, op);
    if (op.aborted) throw new UserFacingError(`face operation ${opId} was aborted — nothing to resume`);
    return executeChain(deps, op, who);
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}

export interface AbortFaceOperationResult {
  opId: string;
  archivedFaceId: string | null;
}

/** `wolf face recover <opId> --abort` (§3.3): только в состоянии «не применено»
 * — candidate → archived (NFR-02: история не уничтожается) + op_aborted.
 * После activation — только вперёд (restore штатным путём). Идемпотентен. */
export async function abortFaceOperation(
  deps: FaceOperationDeps,
  opId: string,
  actor?: string,
  reason?: string
): Promise<AbortFaceOperationResult> {
  const who = actor ?? resolveCreatedBy(undefined, deps.env ?? process.env);
  const why = reason ?? 'aborted via wolf face recover --abort';
  const run = async (): Promise<AbortFaceOperationResult> => {
    const ops = await readOperations(deps.log);
    const op = ops.get(opId);
    if (!op) throw new UserFacingError(`face operation not found: ${opId}`);
    if (op.committed) {
      throw new UserFacingError(
        `face operation ${opId} is committed — abort is not possible; roll forward with wolf face restore`
      );
    }
    const face = await faceByOpId(deps.store, op.ownerSkill, opId);
    if (op.aborted) return { opId, archivedFaceId: face?.id ?? null };
    if (face) {
      if (face.status === 'active') {
        throw new UserFacingError(
          `face operation ${opId} is already activated — abort is only possible before activation; roll forward with wolf face restore`
        );
      }
      if (face.status !== 'candidate') {
        throw new UserFacingError(`face ${face.id} is "${face.status}" — cannot abort ${opId} safely`);
      }
      const index = safeIndex(deps, opId);
      const updated = await deps.store.update(face.id, { status: 'archived' });
      await appendEvent(deps, 'memory.transitioned', { memory_id: face.id, from: 'candidate', to: 'archived' }, who);
      await index?.indexObject(updated);
      await appendEvent(deps, 'memory.face.op_aborted', { opId, by: who, reason: why }, who);
      return { opId, archivedFaceId: face.id };
    }
    await appendEvent(deps, 'memory.face.op_aborted', { opId, by: who, reason: why }, who);
    return { opId, archivedFaceId: null };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
