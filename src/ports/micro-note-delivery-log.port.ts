// src/ports/micro-note-delivery-log.port.ts

/**
 * 3.2.0 T-09 (REQ-09, REQ-11, design §10): attribution log for addressed
 * micro-notes. Four facts per design §10 — selected, delivered, observed_use,
 * observed_outcome — recorded through the same SQLite store as the signal
 * projection (no parallel storage, no background runtime mechanics):
 * the use-cases write a record only at the moment they actually select or
 * deliver a note, and read observations from existing signal data.
 *
 * Delivered does not prove usefulness (design §10): counters are attribution,
 * not effect evidence. Unknown stays unknown — observed_outcome defaults to
 * 'unknown' and is never guessed.
 */

export type MicroNoteChannel = 'call' | 'brief';
/** selected = eligible after filters; delivered = actually emitted in output. */
export type MicroNoteDeliveryKind = 'selected' | 'delivered';

export interface MicroNoteDeliveryRecord {
  /** Note id (locator) + exact content revision — REQ-09 AC. */
  memory_id: string;
  revision: string;
  channel: MicroNoteChannel;
  kind: MicroNoteDeliveryKind;
  ts: string;
}

export interface MicroNoteSuppressionRecord {
  memory_id: string;
  /** Note content revision at suppression time (S-27: binds the conflict). */
  revision: string;
  reason: string;
  /** Evidence side A: the contradicted active note (locator + revision). */
  note_evidence: string;
  /** Evidence side B: the observed contradiction. Both sides are kept (S-27). */
  contradiction_evidence: string;
  suppressed_at: string;
  /** null while the conflict is unresolved; note stays out of delivery. */
  resolved_at: string | null;
  resolution: string | null;
}

export interface MicroNoteObservation {
  memory_id: string;
  revision: string;
  /** Use observed in existing data (e.g. memory_stage cited/applied); null — not observed yet. */
  observed_use: string | null;
  /** Outcome stays 'unknown' until explicitly recorded (REQ-03: unknown stays unknown). */
  observed_outcome: string;
  updated_at: string;
}

export interface MicroNoteDeliveryLog {
  recordDelivery(record: MicroNoteDeliveryRecord): void;
  /** Upsert by note id: the current conflict replaces a previous record; both
   * evidences of the current one are kept verbatim (S-27). */
  recordSuppression(record: MicroNoteSuppressionRecord): void;
  /** Resolve the open conflict (audit row stays; delivery resumes). */
  resolveSuppression(memoryId: string, resolution: string, at: string): void;
  /** All records, open ones first-class for the selector (S-27 filter). */
  suppressions(): MicroNoteSuppressionRecord[];
  deliveries(): MicroNoteDeliveryRecord[];
  /** Upsert one observation field; unknown → never set implicitly. */
  setObservation(input: {
    memory_id: string;
    revision: string;
    field: 'observed_use' | 'observed_outcome';
    value: string;
    at: string;
  }): void;
  observations(): MicroNoteObservation[];
}
