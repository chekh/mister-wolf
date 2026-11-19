// src/app/use-cases/micro-note-contradiction.ts
import { UserFacingError } from '../../domain/errors.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { learningSignalRevision } from '../../domain/learning-signals.js';
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { MicroNoteDeliveryLog } from '../../ports/micro-note-delivery-log.port.js';
import { MICRO_NOTE_TAG } from './micro-note-delivery.js';

/**
 * 3.2.0 T-09 (REQ-03/REQ-09, S-27, design §7/§10): жизненный цикл противоречия
 * активной micro-note. Обнаруженное противоречие временно выводит подсказку из
 * доставки до разрешения: ОБА evidence (исходная подсказка locator+revision и
 * наблюдённое противоречие) сохраняются, исходный факт в памяти не удаляется и
 * не изменяется, подсказка помечается на пересмотр. Разрешение — явное (lead
 * резолвит) или правка факта (новая ревизия снова доставляется, запись конфликта
 * остаётся в журнале аудита). observed_use наблюдается из СУЩЕСТВУЮЩИХ данных
 * (memory_stage cited/applied) — новых фоновых runtime-механик нет.
 */

export interface ReportMicroNoteContradictionInput {
  note_id: string;
  reason: string;
  /** Observation contradicting the note, kept verbatim (data, never executed). */
  contradiction_evidence: string;
  /**
   * REQ-333-5 (ADR-340-5): revision the contradiction was OBSERVED on
   * (12–64 lowercase hex). Absent/empty → bind to the current revision
   * (pre-3.4.0 behavior). A prefix of the current revision → same. Anything
   * else (divergence) → the record binds to the OBSERVED revision and the
   * result carries `divergence` for the caller's explicit warning.
   */
  observed_revision?: string;
}

export interface MicroNoteSuppressionResult {
  /** Patch 3.3.1 (AC-1.2): id of THIS contradiction record (cnr_YYYYMMDD_<hex>). */
  suppression_id: string;
  memory_id: string;
  revision: string;
  note_evidence: string;
  contradiction_evidence: string;
  suppressed_at: string;
  /** REQ-333-5: present only when the observed revision diverges from the current one. */
  divergence?: { observed_revision: string; current_revision: string };
}

/** REQ-333-5 (ADR-340-5): единый текст предупреждения о расхождении — один
 *  источник для CLI и MCP («то же поведение и текст»). */
export function divergenceWarning(divergence: { observed_revision: string; current_revision: string }): string {
  return (
    `WARNING: the observed revision ${divergence.observed_revision.slice(0, 12)} differs from the current revision ${divergence.current_revision.slice(0, 12)}` +
    ' — the CURRENT revision is NOT suppressed and the note keeps being delivered; if the contradiction reproduces on the current text, report it again'
  );
}

/** REQ-333-5 (ADR-340-5): формат наблюдаемой ревизии — 12–64 lowercase hex
 *  (12 — длина префикса, которым журнал всегда показывает ревизию). */
const OBSERVED_REVISION_RE = /^[0-9a-f]{12,64}$/;

/** Is the object an addressed micro-note (same convention as the selector). */
function isMicroNoteObject(obj: MemoryObject): boolean {
  return (
    obj.status === 'active' &&
    obj.superseded_by == null &&
    (obj.tags ?? []).includes(MICRO_NOTE_TAG) &&
    ['note', 'lesson', 'rule'].includes(obj.type)
  );
}

/**
 * Patch 3.3.1 (REQ-331-1, design §4): suppression id from the project id
 * generator (the same one that creates `mem_…` ids) with the `cnr_` prefix —
 * `cnr_<YYYYMMDD>_<hash6>`. The observation fingerprint (note + both evidences
 * + timestamp) makes distinct reports distinct ids; a retry at a later moment
 * generates a new id (design §4: duplicate → port refusal, retry ok).
 */
function suppressionId(idGen: IdGenerator, at: Date, fingerprint: string): string {
  return idGen.generateMemoryId(at, undefined, fingerprint).replace(/^mem_/, 'cnr_');
}

export async function reportMicroNoteContradiction(
  deps: { store: MemoryStore; clock: Clock; log: MicroNoteDeliveryLog; idGen: IdGenerator },
  input: ReportMicroNoteContradictionInput
): Promise<MicroNoteSuppressionResult> {
  // Patch 3.3.1 (REQ-331-4, design §8): одно место правила для CLI и MCP —
  // пустая или whitespace-only reason ИЛИ evidence — отказ; в журнал пишутся trim-значения.
  const reason = input.reason.trim();
  const evidence = input.contradiction_evidence.trim();
  if (!reason || !evidence) {
    throw new UserFacingError('report requires reason and contradiction evidence (REQ-03: unknown stays unknown)');
  }
  const objects = await deps.store.list();
  const note = objects.find((o) => o.id === input.note_id);
  if (!note || !isMicroNoteObject(note)) {
    // REQ-03: unknown stays unknown — suppressing an unknown id is a refusal, not a guess.
    throw new UserFacingError(`unknown micro-note "${input.note_id}": no active micro-note with this id`);
  }
  const revision = learningSignalRevision(note);
  const observedRaw = (input.observed_revision ?? '').trim();
  if (observedRaw !== '' && !OBSERVED_REVISION_RE.test(observedRaw)) {
    throw new UserFacingError(
      `observed revision must be 12–64 lowercase hex chars (got "${observedRaw}") — pass the revision prefix as shown by "wolf contradict list" or the brief evidence`
    );
  }
  // REQ-333-5 (ADR-340-5): наблюдаемая ревизия — префикс текущей (или равна) →
  // запись как сегодня; иначе (расхождение) — запись под НАБЛЮДАЕМОЙ ревизией
  // (свидетельство остаётся привязано к тексту наблюдения, r5 не
  // воспроизводится: старое свидетельство не глушит исправленный текст).
  const diverged = observedRaw !== '' && !revision.startsWith(observedRaw);
  const boundRevision = diverged ? observedRaw : revision;
  const at = deps.clock.now();
  const noteEvidence = `${note.id}@${boundRevision.slice(0, 12)}`;
  const record = {
    suppression_id: suppressionId(deps.idGen, at, `${input.note_id}|${reason}|${evidence}|${at.toISOString()}`),
    memory_id: note.id,
    revision: boundRevision,
    reason,
    note_evidence: noteEvidence,
    contradiction_evidence: evidence,
    suppressed_at: at.toISOString(),
    resolved_at: null,
    resolution: null,
  };
  deps.log.recordSuppression(record);
  return {
    suppression_id: record.suppression_id,
    memory_id: note.id,
    revision: boundRevision,
    note_evidence: noteEvidence,
    contradiction_evidence: evidence,
    suppressed_at: record.suppressed_at,
    ...(diverged ? { divergence: { observed_revision: observedRaw, current_revision: revision } } : {}),
  };
}

export interface ResolveSuppressionResult {
  /** Patch 3.3.1 (AC-1.3): resolve addresses ONE suppression record by its id. */
  suppression_id: string;
  memory_id: string;
  resolved_at: string;
  resolution: string;
}

export function resolveMicroNoteSuppression(
  deps: { clock: Clock; log: MicroNoteDeliveryLog },
  input: { suppression_id: string; resolution: string }
): ResolveSuppressionResult {
  if (!input.suppression_id.trim() || !input.resolution.trim()) {
    throw new UserFacingError('resolve requires suppression id and resolution text (REQ-03: unknown stays unknown)');
  }
  const suppressionId = input.suppression_id.trim();
  const at = deps.clock.now().toISOString();
  // Unknown/unresolved record id → port refuses (REQ-03: unknown stays unknown).
  deps.log.resolveSuppression(suppressionId, input.resolution.trim(), at);
  const record = deps.log.suppressions().find((s) => s.suppression_id === suppressionId)!;
  return {
    suppression_id: record.suppression_id,
    memory_id: record.memory_id,
    resolved_at: at,
    resolution: input.resolution.trim(),
  };
}

/** Valid memory_stage signal guard (same shape as build-analytics). */
function memoryStageOf(s: SignalEvent): { stage: string; ids: string[] } | null {
  if (s.event !== 'memory_stage') return null;
  const d = s.detail as Record<string, unknown> | undefined;
  if (d === undefined) return null;
  const stage = d.stage;
  if (stage !== 'retrieved' && stage !== 'injected' && stage !== 'cited' && stage !== 'applied') return null;
  if (!Array.isArray(d.memory_ids)) return null;
  const ids = d.memory_ids.filter((id): id is string => typeof id === 'string' && id !== '');
  return ids.length > 0 ? { stage, ids } : null;
}

/**
 * observed_use из существующих данных (design §10): memory_stage cited/applied по
 * id доставленной подсказки. delivered не доказывает пользы — счётчик only;
 * observed_outcome остаётся 'unknown', пока не записан явно (unknown stays unknown).
 */
export function reconcileMicroNoteObservations(
  deps: { clock: Clock; log: MicroNoteDeliveryLog },
  signals: readonly SignalEvent[]
): { observed: { memory_id: string; observed_use: string }[] } {
  const at = deps.clock.now().toISOString();
  // Strongest stage per note: applied > cited > injected/retrieved.
  const rank: Record<string, number> = { retrieved: 0, injected: 1, cited: 2, applied: 3 };
  const best = new Map<string, string>();
  for (const s of signals) {
    const st = memoryStageOf(s);
    if (st === null) continue;
    for (const id of st.ids) {
      const cur = best.get(id);
      if (cur === undefined || rank[st.stage]! > rank[cur]!) best.set(id, st.stage);
    }
  }
  const delivered = new Map<string, string>(); // id → revision of the latest delivered record
  for (const d of deps.log.deliveries()) {
    if (d.kind !== 'delivered') continue;
    delivered.set(d.memory_id, d.revision);
  }
  const observed: { memory_id: string; observed_use: string }[] = [];
  for (const [id, stage] of [...best.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const revision = delivered.get(id);
    if (revision === undefined) continue;
    deps.log.setObservation({ memory_id: id, revision, field: 'observed_use', value: stage, at });
    observed.push({ memory_id: id, observed_use: stage });
  }
  return { observed };
}
