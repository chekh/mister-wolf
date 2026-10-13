// src/app/use-cases/migrate-faces.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import { resolveCreatedBy } from '../../domain/actor.js';
import { createFaceVersion, type CreateFaceVersionInput, type FaceObject } from './create-face-version.js';
import { supersedeMemoryObject } from './supersede-memory-object.js';
import { generateOpId, type FaceFaultInjector } from './face-operation.js';

/** Волна 2.17 T-05: идемпотентная физическая миграция legacy-записей лица в
 * контракт face. Кандидат — запись, читаемая как note + facet howto + непустой
 * owner_skill (включая legacy-тип playbook: alias-резолв P211 отдаёт его как
 * note+howto); howto без owner_skill не мигрируется (AC4 — не всякий howto
 * есть лицо).
 *
 * 2.17.1 REQ-04 (R05, design §3.4/ADR-4): миграция идёт на общей операции
 * лица (createFaceVersion command 'migrate', механизм §3.3 — resume/abort
 * в face-operation.ts), skip-логика заменена разбором состояния владельца:
 * 1) незавершённая операция migrate в журнале → resume (детерминированно из
 *    input операции op_started);
 * 2) лицо есть, активного legacy head нет → честный idempotent-skip;
 * 3) лицо есть + активный legacy head + дословное совпадение face.reason с
 *    форматом волны 2.17 `migrated from playbook note <head.id> (2.17)`
 *    (anchored: точное равенство, без усечения) → healing-операция
 *    [supersede_legacy, announce] — body НИКОГДА не пишется (AC-3);
 * 4) неоднозначности (несколько live-лиц, несколько активных head, reason не
 *    матчится) → report.conflicts + запись в failed (CLI даёт exit ≠ 0);
 *    записи не изменяются, «успех» не объявляется.
 *
 * Поэтапность (§Отказов): каждый owner_skill — независимая итерация; падение
 * на N-м не откатывает N-1, ошибка попадает в report.failed, обход
 * продолжается. Свой внешний lock НЕ держим: fresh-миграцию создаёт
 * createFaceVersion под собственным lock, healing/resume-путь берёт тот же
 * lock сам (FsMemoryLock не реентерабелен, прецедент tool-librarian.ts:167).
 *
 * Fresh-миграция передаёт legacyHeadId в операцию: supersede_legacy — шаг
 * ТОЙ ЖЕ операции migrate между supersede_prev и announce (design §3.4/F9;
 * закрыто решением L1 — allowlist на face-operation.ts). Healing-операция
 * [supersede_legacy, announce] остаётся только для докомпьютерных частичных
 * переходов (разбор 3: лицо создано волной 2.17.0 без op_id) и их
 * дозавершения по незавершённой healing-записи в журнале. */
export interface MigrateFacesDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  declarations?: readonly MemoryTypeDeclaration[];
  env?: NodeJS.ProcessEnv;
  /** Тестовый seam (test-plan REQ-03/REQ-04): fault(point) бросается после
   * завершения шага; прод-код не задаёт. Прокидывается в операцию лица и
   * в healing (точка supersede_legacy). */
  fault?: FaceFaultInjector;
}

export interface MigrateOutcome {
  ownerSkill: string;
  action: 'migrated' | 'healed' | 'resumed' | 'skipped';
  faceId?: string;
  headId?: string;
  reason: string;
}

export interface MigrateConflict {
  ownerSkill: string;
  kind: 'multiple-faces' | 'multiple-legacy-heads' | 'reason-mismatch' | 'broken-healing-op';
  error: string;
}

export interface MigrateFacesReport {
  outcomes: MigrateOutcome[];
  /** REQ-02 AC4: howto-записи без owner_skill — не кандидаты (skip с отчётом). */
  skippedHowtoIds: string[];
  /** §Отказов: ошибки по владельцам; уже мигрированные N-1 остаются на месте.
   * Дублирует конфликты — существующий CLI-маппинг (face.ts) даёт exit ≠ 0. */
  failed: { ownerSkill: string; error: string }[];
  /** §3.4 разбор 4: неоднозначные legacy-переходы — записи не изменены. */
  conflicts: MigrateConflict[];
}

/** Дословный формат reason миграции волны 2.17 (migrate-faces.ts:95 той волны);
 * детект healing — только точное равенство (anchored, с суффиксом), усечённое
 * сравнение запрещено (ADR-4: риск «формат сломает детект» закрыт контрактом). */
function legacyMigrationReason(headId: string): string {
  return `migrated from playbook note ${headId} (2.17)`;
}

async function facesOfOwner(store: MemoryStore, ownerSkill: string): Promise<FaceObject[]> {
  return (await store.list({ type: 'face' }))
    .filter((o) => (o as FaceObject).owner_skill === ownerSkill)
    .map((o) => o as FaceObject);
}

/** Незавершённые операции migrate из журнала (§3.4 разбор 1). healing-операция
 * — план не начинается с add_face (план [supersede_legacy, announce]). */
interface MigrateOpJournal {
  opId: string;
  ownerSkill: string;
  healing: boolean;
  input: Record<string, unknown>;
  steps: Set<string>;
  seq: number;
}

function parseMigrateOps(events: readonly MemoryEvent[]): Map<string, MigrateOpJournal> {
  const ops = new Map<string, MigrateOpJournal>();
  let seq = 0;
  for (const e of events) {
    const opId = typeof e.payload['opId'] === 'string' ? e.payload['opId'] : null;
    if (opId === null) continue;
    if (e.type === 'memory.face.op_started') {
      if (e.payload['command'] !== 'migrate') continue;
      const plan = Array.isArray(e.payload['plan']) ? e.payload['plan'].map(String) : [];
      ops.set(opId, {
        opId,
        ownerSkill: String(e.payload['owner_skill'] ?? ''),
        healing: plan[0] !== 'add_face',
        input: (e.payload['input'] ?? {}) as Record<string, unknown>,
        steps: new Set(),
        seq: seq++,
      });
    } else if (e.type === 'memory.face.op_step') {
      const op = ops.get(opId);
      if (op) op.steps.add(String(e.payload['step']));
    } else if (e.type === 'memory.face.op_committed' || e.type === 'memory.face.op_aborted') {
      // незавершённая = нет op_committed/op_aborted (как incompleteFaceOperations §3.3)
      ops.delete(opId);
    }
  }
  return ops;
}

async function appendFaceEvent(
  deps: MigrateFacesDeps,
  type: MemoryEvent['type'],
  payload: Record<string, unknown>,
  actor: string
): Promise<void> {
  const now = deps.clock.now();
  await deps.log.append({ id: deps.idGen.generateEventId(now), type, timestamp: now.toISOString(), actor, payload });
}

/** FTS-индекс производный (§3.3): сбой его обновления не рушит healing —
 * зеркалирует safeIndex face-operation.ts (обёртка без прототипного spread). */
function healingSafeIndex(deps: MigrateFacesDeps, opId: string): SearchIndex | undefined {
  const idx = deps.index;
  if (!idx) return undefined;
  return {
    rebuild: (objects) => idx.rebuild(objects),
    indexObject: (o) =>
      idx.indexObject(o).catch((err) => {
        console.error(
          `face healing ${opId}: FTS index update failed (wolf doctor --repair rebuilds it): ${err instanceof Error ? err.message : String(err)}`
        );
      }),
    removeObject: (id) => idx.removeObject(id),
    search: (q, o) => idx.search(q, o),
  };
}

/** Healing-операция (§3.4 разбор 3): дозавершение доказуемо связанного
 * legacy-перехода — ТОЛЬКО переходы статусов и события; body лица не пишется
 * (REQ-04 AC-3). Каждый шаг идемпотентен (повторный supersede_legacy — skip);
 * resume существующей незавершённой healing-операции — по её op_started input
 * (faceId/headId записаны в него — resume детерминирован). Идёт под тем же
 * MemoryLock, что и fresh-миграция (createFaceVersion берёт его сам; lock
 * не реентерабелен — внутри шагов lock не берётся). */
async function healLegacyTransition(
  deps: MigrateFacesDeps,
  ownerSkill: string,
  face: FaceObject,
  headId: string,
  existing: MigrateOpJournal | null,
  actor: string
): Promise<void> {
  const run = async (): Promise<void> => {
    let opId: string;
    let done: Set<string>;
    if (existing) {
      opId = existing.opId;
      done = existing.steps;
    } else {
      opId = generateOpId(deps.clock);
      await appendFaceEvent(
        deps,
        'memory.face.op_started',
        {
          opId,
          command: 'migrate',
          owner_skill: ownerSkill,
          plan: ['supersede_legacy', 'announce'],
          input: { command: 'migrate', ownerSkill, reason: face.reason, faceId: face.id, headId },
        },
        actor
      );
      done = new Set();
    }

    // supersede_legacy — уже погашенный head не перезаписывается (идемпотентность)
    const head = await deps.store.get(headId);
    if (head && head.status !== 'superseded') {
      await supersedeMemoryObject(
        { store: deps.store, log: deps.log, clock: deps.clock, idGen: deps.idGen, index: healingSafeIndex(deps, opId) },
        headId,
        face.id
      );
    }
    if (!done.has('supersede_legacy')) {
      await appendFaceEvent(
        deps,
        'memory.face.op_step',
        { opId, step: 'supersede_legacy', detail: { head_id: headId, face_id: face.id } },
        actor
      );
      done.add('supersede_legacy');
    }
    deps.fault?.('supersede_legacy');

    // announce — идемпотентен по событию memory.face.versioned(new = face)
    const announced = (await deps.log.readAll()).some(
      (e) => e.type === 'memory.face.versioned' && e.payload['new'] === face.id
    );
    if (!announced) {
      await appendFaceEvent(
        deps,
        'memory.face.versioned',
        { owner_skill: ownerSkill, from: null, new: face.id, initiator: 'migration', reason: face.reason },
        actor
      );
    }
    if (!done.has('announce')) {
      await appendFaceEvent(deps, 'memory.face.op_step', { opId, step: 'announce' }, actor);
      done.add('announce');
    }

    // op_committed — F7-крайний случай: дозаписывается повторным запуском
    const committed = (await deps.log.readAll()).some(
      (e) => e.type === 'memory.face.op_committed' && e.payload['opId'] === opId
    );
    if (!committed) {
      deps.fault?.('op_committed');
      await appendFaceEvent(deps, 'memory.face.op_committed', { opId }, actor);
    }
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}

interface OwnerResult {
  outcome?: MigrateOutcome;
  conflict?: Omit<MigrateConflict, 'ownerSkill'>;
}

async function migrateOwner(
  deps: MigrateFacesDeps,
  ownerSkill: string,
  records: MemoryObject[],
  actor: string
): Promise<OwnerResult> {
  // §3.4 разбор 1: незавершённая операция migrate владельца → resume
  const migrateOps = parseMigrateOps(await deps.log.readAll());
  const lastUnfinished = (healing: boolean): MigrateOpJournal | null =>
    [...migrateOps.values()]
      .filter((o) => o.healing === healing && o.ownerSkill === ownerSkill)
      .sort((a, b) => a.seq - b.seq)
      .pop() ?? null;
  const unfinishedMigration = lastUnfinished(false);
  let resumed = false;
  if (unfinishedMigration) {
    // input — JSON-чистый payload op_started (JSONL); недоверенные ключи createFaceVersion
    // валидирует сам (reason/body обязательны, guard — до op_started)
    await createFaceVersion(deps, unfinishedMigration.input as unknown as CreateFaceVersionInput);
    resumed = true;
  }

  // разборы 2–4 — по фактическому состоянию store (журнал — намёк, store — истина)
  const liveFaces = (await facesOfOwner(deps.store, ownerSkill)).filter(
    (f) => f.status === 'active' || f.status === 'candidate'
  );
  const heads = (await Promise.all(records.map((r) => deps.store.get(r.id)))).filter(
    (r): r is MemoryObject => r !== null && r.status !== 'superseded'
  );

  if (liveFaces.length > 1) {
    return {
      conflict: {
        kind: 'multiple-faces',
        error: `owner ${ownerSkill} has ${liveFaces.length} live faces (${liveFaces.map((f) => f.id).join(', ')}) — ambiguous, resolve manually`,
      },
    };
  }
  if (heads.length > 1) {
    return {
      conflict: {
        kind: 'multiple-legacy-heads',
        error: `owner ${ownerSkill} has ${heads.length} active legacy playbook notes (${heads.map((h) => h.id).join(', ')}) — ambiguous legacy head, resolve manually`,
      },
    };
  }

  // дозавершение незавершённой healing-операции (сбой внутри healing)
  const unfinishedHealing = lastUnfinished(true);
  if (unfinishedHealing) {
    const faceId = typeof unfinishedHealing.input['faceId'] === 'string' ? unfinishedHealing.input['faceId'] : null;
    const headId = typeof unfinishedHealing.input['headId'] === 'string' ? unfinishedHealing.input['headId'] : null;
    const face = faceId ? ((await deps.store.get(faceId)) as FaceObject | null) : null;
    if (!face || !headId) {
      return {
        conflict: {
          kind: 'broken-healing-op',
          error: `unfinished healing operation ${unfinishedHealing.opId} lacks face/head binding — resolve manually (wolf face recover ${unfinishedHealing.opId})`,
        },
      };
    }
    await healLegacyTransition(deps, ownerSkill, face, headId, unfinishedHealing, actor);
    resumed = true;
  }

  if (liveFaces.length === 1) {
    const face = liveFaces[0]!;
    if (heads.length === 0) {
      return {
        outcome: {
          ownerSkill,
          action: resumed ? 'resumed' : 'skipped',
          faceId: face.id,
          reason: resumed
            ? 'unfinished migration operation completed by re-run (resume)'
            : 'face already exists and no active legacy head — idempotent, nothing to do',
        },
      };
    }
    const head = heads[0]!;
    if (face.reason === legacyMigrationReason(head.id)) {
      // доказуемая связь → healing; body не пишется (AC-3)
      await healLegacyTransition(deps, ownerSkill, face, head.id, null, actor);
      return {
        outcome: {
          ownerSkill,
          action: resumed ? 'resumed' : 'healed',
          faceId: face.id,
          headId: head.id,
          reason: `provable link by exact reason "${legacyMigrationReason(head.id)}" — legacy head superseded, face body untouched`,
        },
      };
    }
    return {
      conflict: {
        kind: 'reason-mismatch',
        error: `face ${face.id} of ${ownerSkill} does not prove the link to active legacy head ${head.id} (expected exact reason "${legacyMigrationReason(head.id)}", got "${face.reason}") — not healing blindly, resolve manually`,
      },
    };
  }

  // fresh-миграция: дословный перенос (ADR-4 волны 2.17: FTS-совместимость router)
  if (heads.length === 0) {
    return {
      outcome: {
        ownerSkill,
        action: 'skipped',
        reason: 'no active playbook note — superseded chain stays legacy and reads as before',
      },
    };
  }
  const head = heads[0]!;
  const reason = legacyMigrationReason(head.id);
  const { face } = await createFaceVersion(deps, {
    command: 'migrate',
    ownerSkill,
    reason,
    title: head.title,
    body: head.body,
    tags: head.tags,
    legacyHeadId: head.id,
  });
  return {
    outcome: { ownerSkill, action: resumed ? 'resumed' : 'migrated', faceId: face.id, headId: head.id, reason },
  };
}

export async function migrateFaces(deps: MigrateFacesDeps): Promise<MigrateFacesReport> {
  const skippedHowtoIds: string[] = [];
  const byOwner = new Map<string, MemoryObject[]>();
  for (const obj of await deps.store.list({ type: 'note', facet: 'howto' })) {
    const owner = (obj as { owner_skill?: unknown }).owner_skill;
    if (typeof owner !== 'string' || owner.trim() === '') {
      skippedHowtoIds.push(obj.id);
      continue;
    }
    const records = byOwner.get(owner) ?? [];
    records.push(obj);
    byOwner.set(owner, records);
  }

  const outcomes: MigrateOutcome[] = [];
  const failed: { ownerSkill: string; error: string }[] = [];
  const conflicts: MigrateConflict[] = [];
  const actor = resolveCreatedBy(undefined, deps.env ?? process.env);
  for (const [ownerSkill, records] of [...byOwner.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      const result = await migrateOwner(deps, ownerSkill, records, actor);
      if (result.conflict) {
        conflicts.push({ ownerSkill, ...result.conflict });
        // параллельная запись в failed: существующий CLI-маппинг даёт exit ≠ 0
        failed.push({ ownerSkill, error: result.conflict.error });
      } else if (result.outcome) {
        outcomes.push(result.outcome);
      }
    } catch (err) {
      failed.push({ ownerSkill, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { outcomes, skippedHowtoIds, failed, conflicts };
}
