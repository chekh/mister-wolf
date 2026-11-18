// src/app/use-cases/micro-note-contradiction.ts
import { UserFacingError } from '../../domain/errors.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { learningSignalRevision } from '../../domain/learning-signals.js';
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { Clock } from '../../ports/clock.port.js';
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
}

export interface MicroNoteSuppressionResult {
  memory_id: string;
  revision: string;
  note_evidence: string;
  contradiction_evidence: string;
  suppressed_at: string;
}

/** Is the object an addressed micro-note (same convention as the selector). */
function isMicroNoteObject(obj: MemoryObject): boolean {
  return (
    obj.status === 'active' &&
    obj.superseded_by == null &&
    (obj.tags ?? []).includes(MICRO_NOTE_TAG) &&
    ['note', 'lesson', 'rule'].includes(obj.type)
  );
}

export async function reportMicroNoteContradiction(
  deps: { store: MemoryStore; clock: Clock; log: MicroNoteDeliveryLog },
  input: ReportMicroNoteContradictionInput
): Promise<MicroNoteSuppressionResult> {
  const objects = await deps.store.list();
  const note = objects.find((o) => o.id === input.note_id);
  if (!note || !isMicroNoteObject(note)) {
    // REQ-03: unknown stays unknown — suppressing an unknown id is a refusal, not a guess.
    throw new UserFacingError(`unknown micro-note "${input.note_id}": no active micro-note with this id`);
  }
  const revision = learningSignalRevision(note);
  const at = deps.clock.now().toISOString();
  const noteEvidence = `${note.id}@${revision.slice(0, 12)}`;
  deps.log.recordSuppression({
    memory_id: note.id,
    revision,
    reason: input.reason,
    note_evidence: noteEvidence,
    contradiction_evidence: input.contradiction_evidence,
    suppressed_at: at,
    resolved_at: null,
    resolution: null,
  });
  return {
    memory_id: note.id,
    revision,
    note_evidence: noteEvidence,
    contradiction_evidence: input.contradiction_evidence,
    suppressed_at: at,
  };
}

export interface ResolveSuppressionResult {
  memory_id: string;
  resolved_at: string;
  resolution: string;
}

export function resolveMicroNoteSuppression(
  deps: { clock: Clock; log: MicroNoteDeliveryLog },
  input: { note_id: string; resolution: string }
): ResolveSuppressionResult {
  if (!input.note_id.trim() || !input.resolution.trim()) {
    throw new UserFacingError('resolve requires note id and resolution text (REQ-03: unknown stays unknown)');
  }
  const at = deps.clock.now().toISOString();
  // Unknown/unresolved id → port refuses (REQ-03: unknown stays unknown).
  deps.log.resolveSuppression(input.note_id.trim(), input.resolution.trim(), at);
  return { memory_id: input.note_id.trim(), resolved_at: at, resolution: input.resolution.trim() };
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
