// src/ports/micro-note-delivery-log.port.ts

/**
 * 3.2.0 T-09 (REQ-09, REQ-11, design §10): attribution log for addressed
 * micro-notes. Four facts per design §10 — selected, delivered, observed_use,
 * observed_outcome — recorded through one persistent delivery log:
 * the use-cases write a record only at the moment they actually select or
 * deliver a note, and read observations from existing signal data.
 * (Patch 3.3.1: the log moved out of the SQLite cache into the persistent
 * `.wolf/memory/micro-note-delivery.jsonl` journal owned by
 * JsonlMicroNoteDeliveryLog — REQ-331-2.)
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
  /**
   * Patch 3.3.1 (REQ-331-1, ADR-1): identity of THIS contradiction record —
   * the primary key of the journal. Several records per note are allowed;
   * format `cnr_YYYYMMDD_<hex>`.
   */
  suppression_id: string;
  /** The contradicted note; NOT unique — several records may address one note. */
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
  /**
   * REQ-333-7 (ADR-340-6): one lock, one repair, ONE append of N rows (row
   * order identical to N recordDelivery calls); no full parse of the journal
   * (deliveries are never read through the delivery path); the fresh
   * first-import trigger and the loss refusal stay (ADR-340-2).
   */
  recordDeliveries(records: MicroNoteDeliveryRecord[]): void;
  /**
   * Patch 3.3.1 (REQ-331-1, ADR-1): append — every contradiction is a new
   * record. A duplicate `suppression_id` is a UserFacingError (the journal is
   * append-only; silent overwrite is forbidden — a retry generates a new id).
   */
  recordSuppression(record: MicroNoteSuppressionRecord): void;
  /**
   * Patch 3.3.1 (REQ-331-1): resolve addresses ONE record by its
   * `suppression_id` (audit row stays; delivery of that record's constraint
   * resumes; other open records of the same note keep suppressing).
   */
  resolveSuppression(suppressionId: string, resolution: string, at: string): void;
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
