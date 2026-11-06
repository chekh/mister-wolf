import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

// REL-231-A (S12, REQ-10): единая точка классификации council-записей для
// council-аналитики. Один объект памяти может быть представлен тремя способами:
//  (legacy)  core-тип council-question / council-opinion / synthesis;
//  (alias)   мигрированная запись: note + transient alias_origin;
//  (envelope) новая запись: note + тег wolf:council-record:v1 + canonical JSON
//            envelope в body (контракт — docs/dev/2026-11-05-council/design.md §4).
// Аналитика считает запись по её memory id один раз (дедуп и приоритет
// представлений — в buildCouncils); повреждённое envelope-тело НЕ роняет отчёт.

export type CouncilRecordKind = 'question' | 'opinion' | 'synthesis';
export type CouncilRecordSource = 'legacy' | 'alias' | 'envelope';

export const COUNCIL_ENVELOPE_TAG = 'wolf:council-record:v1';

/** Строго распарсенный canonical JSON envelope (design §4). */
export interface CouncilEnvelope {
  schema_version: 1;
  record_kind: CouncilRecordKind;
  request_key: string;
  task_id: string;
  question_id?: string;
  question_revision?: string;
  payload: Record<string, unknown>;
}

/** Запись опознана как council-объект (kind известен). */
export interface ClassifiedCouncilRecord {
  kind: CouncilRecordKind;
  source: CouncilRecordSource;
  envelope?: CouncilEnvelope;
}

/** Запись не является council-объектом; damaged envelope диагностируется
 *  признаком corrupted (kind:null), не крашем аналитики (AC-W5-1). */
export interface UnclassifiedCouncilRecord {
  kind: null;
  source: null;
  envelope?: undefined;
  /** Тег envelope есть, но тело не прошло строгий parse. */
  corrupted?: boolean;
}

export type CouncilRecord = ClassifiedCouncilRecord | UnclassifiedCouncilRecord;

const RECORD_KINDS: ReadonlySet<string> = new Set(['question', 'opinion', 'synthesis']);

/** alias_origin мигрированных записей → kind (прецедент паттерна: generate-agent-brief). */
const ALIAS_ORIGIN_KINDS: Readonly<Record<string, CouncilRecordKind>> = {
  'council-question': 'question',
  'council-opinion': 'opinion',
  synthesis: 'synthesis',
};

/** Строгий parse canonical envelope: любое несоответствие контракту → null. */
function parseEnvelope(body: string): CouncilEnvelope | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  if (e.schema_version !== 1) return null;
  if (typeof e.record_kind !== 'string' || !RECORD_KINDS.has(e.record_kind)) return null;
  if (typeof e.request_key !== 'string' || e.request_key === '') return null;
  if (typeof e.task_id !== 'string' || e.task_id === '') return null;
  if (e.question_id !== undefined && typeof e.question_id !== 'string') return null;
  if (e.question_revision !== undefined && typeof e.question_revision !== 'string') return null;
  if (typeof e.payload !== 'object' || e.payload === null || Array.isArray(e.payload)) return null;
  const envelope: CouncilEnvelope = {
    schema_version: 1,
    record_kind: e.record_kind as CouncilRecordKind,
    request_key: e.request_key,
    task_id: e.task_id,
    payload: e.payload as Record<string, unknown>,
  };
  if (e.question_id !== undefined) envelope.question_id = e.question_id;
  if (e.question_revision !== undefined) envelope.question_revision = e.question_revision;
  return envelope;
}

/** Классификация одного объекта памяти. Чистая функция, не бросает исключений.
 *  Порядок проверки одного объекта: legacy-тип → alias_origin → envelope-тег. */
export function classifyCouncilRecord(o: MemoryObject): CouncilRecord {
  if (o.type === 'council-question') return { kind: 'question', source: 'legacy' };
  if (o.type === 'council-opinion') return { kind: 'opinion', source: 'legacy' };
  if (o.type === 'synthesis') return { kind: 'synthesis', source: 'legacy' };
  if (o.type === 'note') {
    const aliasOrigin = (o as { alias_origin?: unknown }).alias_origin;
    const aliasKind = typeof aliasOrigin === 'string' ? ALIAS_ORIGIN_KINDS[aliasOrigin] : undefined;
    if (aliasKind !== undefined) return { kind: aliasKind, source: 'alias' };
    if (o.tags.includes(COUNCIL_ENVELOPE_TAG)) {
      const envelope = parseEnvelope(o.body);
      if (envelope === null) return { kind: null, source: null, corrupted: true };
      return { kind: envelope.record_kind, source: 'envelope', envelope };
    }
  }
  return { kind: null, source: null };
}
