// src/app/use-cases/record-council.ts
// REL-231-A P04/REQ-09 (AC-A3, design 2026-11-05-council §4): доменная операция
// записи council envelope (question/opinion/synthesis) поверх штатного note-пути:
// addMemoryObject (тот же governance/event/index), строгая схема envelope
// (эквивалент additionalProperties:false), канонический JSON body,
// question_revision = sha256 от canonical JSON вопроса, идемпотентность
// request_key, recovery недостающих рёбер после частичного сбоя (сбой между
// note и relations). Прецеденты: deps-паттерн — create-mutation-record.ts;
// рёбра — record-relation.ts (прямое + обратное, дедуп subject+predicate+object).
// Lock: если deps.lock передан — берём один раз здесь; в addMemoryObject/recordRelation
// не пробрасываем (FsMemoryLock не реентерабелен, комментарий create-mutation-record).

import { createHash } from 'crypto';
import { z } from 'zod';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { addMemoryObject } from './add-memory-object.js';
import { recordRelation } from './record-relation.js';
import { UserFacingError } from '../../domain/errors.js';

export interface RecordCouncilDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  relations: RelationLog;
}

export interface SourceRef {
  ref: string;
  revision: string;
}

export interface CouncilQuestionPayload {
  question: string;
  decision_owner: string;
  sources?: SourceRef[];
  lenses?: string[];
  budget?: string;
  constraints?: string[];
}

export interface CouncilOpinionPayload {
  expert_id: string;
  round: number;
  claims: string[];
  evidence?: EvidenceRefShape[];
  assumptions?: string[];
  confidence: 'low' | 'medium' | 'high';
  risks?: string[];
  failure_conditions?: string[];
  counterexamples?: string[];
  recommendation?: string;
}

/** A9 (memory-types.ts EvidenceRef): memory_id | path + контекст quote/note. */
export interface EvidenceRefShape {
  memory_id?: string;
  path?: string;
  quote?: string;
  note?: string;
}

export interface CouncilSynthesisPayload {
  outcome: 'ready' | 'insufficient_evidence';
  opinion_ids: string[];
  accepted_claims: string[];
  rejected_alternatives?: { claim: string; reason: string }[];
  unresolved_dissent: string[];
  required_validation: string[];
  confidence: 'low' | 'medium' | 'high';
  actual_participants: string[];
  missing_participants?: string[];
  cost_note?: string;
  isolation_limits?: string[];
}

export type CouncilRecordEnvelope =
  | {
      schema_version: 1;
      record_kind: 'question';
      request_key: string;
      task_id: string;
      payload: CouncilQuestionPayload;
    }
  | {
      schema_version: 1;
      record_kind: 'opinion';
      request_key: string;
      task_id: string;
      question_id: string;
      question_revision: string;
      payload: CouncilOpinionPayload;
    }
  | {
      schema_version: 1;
      record_kind: 'synthesis';
      request_key: string;
      task_id: string;
      question_id: string;
      question_revision: string;
      payload: CouncilSynthesisPayload;
    };

export interface RecordCouncilResult {
  memoryId: string;
  created: boolean;
  recovered: boolean;
}

const COUNCIL_TAG = 'wolf:council-record:v1';
export const MAX_BODY_BYTES = 256 * 1024;

// --- Строгая схема envelope (D-W3-1: ручная zod-схема здесь, не FieldSpec в memory-types) ---

const nonEmpty = z.string().min(1);
const nonEmptyStrings = z.array(nonEmpty);

const SourceRefSchema = z.strictObject({
  ref: nonEmpty,
  revision: nonEmpty,
});

// A9/F-02: хотя бы одно непустое memory_id или path; quote ≤ 200, note ≤ 500
const EvidenceRefSchema = z
  .strictObject({
    memory_id: nonEmpty.optional(),
    path: nonEmpty.optional(),
    quote: z.string().max(200).optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    (data) =>
      Boolean((data.memory_id && data.memory_id.trim().length > 0) || (data.path && data.path.trim().length > 0)),
    { message: 'EvidenceRef must contain at least one non-empty field: memory_id or path' }
  );

const RejectedAlternativeSchema = z.strictObject({
  claim: nonEmpty,
  reason: nonEmpty,
});

const QuestionPayloadSchema = z.strictObject({
  question: nonEmpty,
  decision_owner: nonEmpty,
  sources: z.array(SourceRefSchema).optional(),
  lenses: nonEmptyStrings.optional(),
  budget: nonEmpty.optional(),
  constraints: nonEmptyStrings.optional(),
});

const OpinionPayloadSchema = z.strictObject({
  expert_id: nonEmpty,
  round: z.number().int().min(1),
  claims: nonEmptyStrings.min(1),
  evidence: z.array(EvidenceRefSchema).optional(),
  assumptions: nonEmptyStrings.optional(),
  confidence: z.enum(['low', 'medium', 'high']),
  risks: nonEmptyStrings.optional(),
  failure_conditions: nonEmptyStrings.optional(),
  counterexamples: nonEmptyStrings.optional(),
  recommendation: nonEmpty.optional(),
});

const SynthesisPayloadSchema = z
  .strictObject({
    outcome: z.enum(['ready', 'insufficient_evidence']),
    opinion_ids: nonEmptyStrings,
    accepted_claims: nonEmptyStrings,
    rejected_alternatives: z.array(RejectedAlternativeSchema).optional(),
    unresolved_dissent: nonEmptyStrings,
    required_validation: nonEmptyStrings,
    confidence: z.enum(['low', 'medium', 'high']),
    actual_participants: nonEmptyStrings.min(1),
    missing_participants: nonEmptyStrings.optional(),
    cost_note: nonEmpty.optional(),
    isolation_limits: nonEmptyStrings.optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.outcome === 'ready' && payload.accepted_claims.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['accepted_claims'],
        message: 'accepted_claims must be non-empty when outcome is "ready"',
      });
    }
    if (payload.outcome === 'insufficient_evidence') {
      if (payload.unresolved_dissent.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['unresolved_dissent'],
          message: 'outcome "insufficient_evidence" requires an explanation in unresolved_dissent',
        });
      }
      if (payload.required_validation.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['required_validation'],
          message: 'outcome "insufficient_evidence" requires non-empty required_validation',
        });
      }
    }
  });

const envelopeBase = {
  schema_version: z.literal(1),
  request_key: nonEmpty,
  task_id: nonEmpty,
};

const QuestionEnvelopeSchema = z.strictObject({
  ...envelopeBase,
  record_kind: z.literal('question'),
  payload: QuestionPayloadSchema,
});

const OpinionEnvelopeSchema = z.strictObject({
  ...envelopeBase,
  record_kind: z.literal('opinion'),
  question_id: nonEmpty,
  question_revision: nonEmpty,
  payload: OpinionPayloadSchema,
});

const SynthesisEnvelopeSchema = z.strictObject({
  ...envelopeBase,
  record_kind: z.literal('synthesis'),
  question_id: nonEmpty,
  question_revision: nonEmpty,
  payload: SynthesisPayloadSchema,
});

function envelopeSchemaFor(kind: unknown): z.ZodType | null {
  if (kind === 'question') return QuestionEnvelopeSchema;
  if (kind === 'opinion') return OpinionEnvelopeSchema;
  if (kind === 'synthesis') return SynthesisEnvelopeSchema;
  return null;
}

/** Строгая валидация envelope; любая ошибка — UserFacingError (до любых записей). */
function parseEnvelope(raw: unknown): CouncilRecordEnvelope {
  const kind = (raw as { record_kind?: unknown } | null | undefined)?.record_kind;
  const schema = envelopeSchemaFor(kind);
  if (!schema) {
    throw new UserFacingError(
      `Invalid council envelope: record_kind must be one of "question" | "opinion" | "synthesis" (got ${JSON.stringify(
        kind
      )})`
    );
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new UserFacingError(
      `Invalid council envelope: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`
    );
  }
  return result.data as CouncilRecordEnvelope;
}

/** Терпеливый разбор чужих note (для поиска по request_key/дайджеста): битые пропускаем. */
function tryParseEnvelope(raw: unknown): CouncilRecordEnvelope | null {
  const schema = envelopeSchemaFor((raw as { record_kind?: unknown } | null | undefined)?.record_kind);
  if (!schema) return null;
  const result = schema.safeParse(raw);
  return result.success ? (result.data as CouncilRecordEnvelope) : null;
}

// --- Канонизация и дайджест (байт-в-байт как в тестах W1) ---

/** Канонический JSON (stable stringify): рекурсивная сортировка ключей, без пробелов. */
function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) out[key] = walk(src[key]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** Семантика 2: question_revision = sha256-hex от canonical JSON
 * {schema_version, record_kind:'question', task_id, payload} вопроса. */
function questionDigest(envelope: Extract<CouncilRecordEnvelope, { record_kind: 'question' }>): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        schema_version: envelope.schema_version,
        record_kind: 'question',
        task_id: envelope.task_id,
        payload: envelope.payload,
      }),
      'utf8'
    )
    .digest('hex');
}

function titleFor(envelope: CouncilRecordEnvelope): string {
  if (envelope.record_kind === 'question') return `[council] question: ${envelope.task_id}`;
  if (envelope.record_kind === 'opinion') {
    return `[council] opinion ${envelope.payload.expert_id} r${envelope.payload.round}: ${envelope.task_id}`;
  }
  return `[council] synthesis ${envelope.payload.outcome}: ${envelope.task_id}`;
}

interface CouncilEdge {
  subject: string;
  predicate: 'answers' | 'based_on';
  object: string;
}

/** Контракт §6: opinion → answers → question; synthesis → based_on → question и каждое opinion. */
function requiredEdges(envelope: CouncilRecordEnvelope, noteId: string): CouncilEdge[] {
  if (envelope.record_kind === 'opinion') {
    return [{ subject: noteId, predicate: 'answers', object: envelope.question_id }];
  }
  if (envelope.record_kind === 'synthesis') {
    return [
      { subject: noteId, predicate: 'based_on', object: envelope.question_id },
      ...envelope.payload.opinion_ids.map((opinionId) => ({
        subject: noteId,
        predicate: 'based_on' as const,
        object: opinionId,
      })),
    ];
  }
  return [];
}

// --- Чтение существующих council-записей (только note с тегом wolf:council-record:v1) ---

async function councilNotes(deps: RecordCouncilDeps): Promise<Array<{ id: string; env: CouncilRecordEnvelope }>> {
  const notes = await deps.store.list({ type: 'note' });
  const found: Array<{ id: string; env: CouncilRecordEnvelope }> = [];
  for (const note of notes) {
    if (!note.tags.includes(COUNCIL_TAG)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(note.body);
    } catch {
      continue; // чужой/битый body — не council-контракт
    }
    const env = tryParseEnvelope(raw);
    if (env) found.push({ id: note.id, env });
  }
  return found;
}

/** Семантика 2: opinion/synthesis ссылаются на существующую валидную question-запись. */
async function loadQuestion(
  deps: RecordCouncilDeps,
  questionId: string
): Promise<Extract<CouncilRecordEnvelope, { record_kind: 'question' }>> {
  const note = await deps.store.get(questionId);
  if (!note) {
    throw new UserFacingError(`council question "${questionId}" not found (dangling question_id)`);
  }
  if (!note.tags.includes(COUNCIL_TAG)) {
    throw new UserFacingError(`memory "${questionId}" is not a council record (missing tag "${COUNCIL_TAG}")`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(note.body);
  } catch {
    throw new UserFacingError(`council question "${questionId}" has unreadable body`);
  }
  const env = tryParseEnvelope(raw);
  if (!env || env.record_kind !== 'question') {
    throw new UserFacingError(`memory "${questionId}" is not a council question record`);
  }
  return env;
}

/** Семантика 6: opinion_ids существуют и принадлежат этому же question. */
async function assertOpinionsBelong(
  deps: RecordCouncilDeps,
  envelope: Extract<CouncilRecordEnvelope, { record_kind: 'synthesis' }>
): Promise<void> {
  for (const opinionId of envelope.payload.opinion_ids) {
    const note = await deps.store.get(opinionId);
    if (!note || !note.tags.includes(COUNCIL_TAG)) {
      throw new UserFacingError(`council opinion "${opinionId}" not found (referenced from synthesis opinion_ids)`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(note.body);
    } catch {
      raw = null;
    }
    const env = raw === null ? null : tryParseEnvelope(raw);
    if (!env || env.record_kind !== 'opinion') {
      throw new UserFacingError(`memory "${opinionId}" is not a council opinion record`);
    }
    if (env.question_id !== envelope.question_id) {
      throw new UserFacingError(
        `council opinion "${opinionId}" belongs to question "${env.question_id}", not "${envelope.question_id}"`
      );
    }
  }
}

/** Семантика 6: дубль expert_id+round на тот же question под другим request_key — отказ. */
async function assertNoExpertRoundDup(
  deps: RecordCouncilDeps,
  envelope: Extract<CouncilRecordEnvelope, { record_kind: 'opinion' }>
): Promise<void> {
  const others = await councilNotes(deps);
  for (const { env } of others) {
    if (env.record_kind !== 'opinion') continue;
    if (env.request_key === envelope.request_key) continue; // тот же ключ — идемпотентность, не дубль
    if (env.question_id !== envelope.question_id) continue;
    if (env.payload.expert_id === envelope.payload.expert_id && env.payload.round === envelope.payload.round) {
      throw new UserFacingError(
        `opinion of expert "${envelope.payload.expert_id}" round ${envelope.payload.round} already recorded for question "${envelope.question_id}" (request_key "${env.request_key}")`
      );
    }
  }
}

async function edgeExists(deps: RecordCouncilDeps, edge: CouncilEdge): Promise<boolean> {
  const listed = await deps.relations.list({ subject: edge.subject, predicate: edge.predicate, object: edge.object });
  return listed.some(
    (relation) =>
      relation.subject === edge.subject && relation.predicate === edge.predicate && relation.object === edge.object
  );
}

async function appendEdge(deps: RecordCouncilDeps, edge: CouncilEdge): Promise<void> {
  // recordRelation кладёт прямое и обратное ребро (проектная конвенция);
  // дедуп перед вызовом — здесь (subject+predicate+object)
  await recordRelation(
    { relations: deps.relations, idGen: deps.idGen },
    deps.clock.now(),
    edge.subject,
    edge.predicate,
    edge.object,
    'agent'
  );
}

/**
 * Запись council envelope как note (facet context, тег wolf:council-record:v1,
 * body = canonical JSON envelope) + relations. Идемпотентна по request_key;
 * после частичного сбоя (note есть, рёбер нет) дописывает только недостающие
 * рёбра без повторного memory.added. Валидация и лимиты — до любых записей
 * (отказ атомарен: ни note, ни event, ни ребра).
 */
export async function recordCouncil(
  deps: RecordCouncilDeps,
  input: { envelope: CouncilRecordEnvelope; createdBy: string }
): Promise<RecordCouncilResult> {
  const envelope = parseEnvelope(input.envelope);
  const body = canonicalJson(envelope);

  // Семантика 5: лимит 256 KiB на вход и на итоговый body
  const inputBytes = Buffer.byteLength(JSON.stringify(input.envelope), 'utf8');
  if (inputBytes > MAX_BODY_BYTES) {
    throw new UserFacingError(`council envelope exceeds 256 KiB limit (${inputBytes} bytes after stringify)`);
  }
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  if (bodyBytes > MAX_BODY_BYTES) {
    throw new UserFacingError(`council record body exceeds 256 KiB limit (${bodyBytes} bytes)`);
  }

  const core = async (): Promise<RecordCouncilResult> => {
    // Перекрёстная валидация (только чтение) — до любых записей
    if (envelope.record_kind !== 'question') {
      const question = await loadQuestion(deps, envelope.question_id);
      const digest = questionDigest(question);
      if (digest !== envelope.question_revision) {
        throw new UserFacingError(
          `question_revision mismatch for question "${envelope.question_id}": expected ${digest}, got ${envelope.question_revision}`
        );
      }
      if (envelope.record_kind === 'synthesis') {
        await assertOpinionsBelong(deps, envelope);
      }
    }

    // Идемпотентность/recovery: существующий note с этим request_key
    const notes = await councilNotes(deps);
    const existing = notes.find(({ env }) => env.request_key === envelope.request_key);
    if (existing) {
      if (existing.env && canonicalJson(existing.env) !== body) {
        throw new UserFacingError(
          `request_key "${envelope.request_key}" is already recorded with a different payload (council conflict)`
        );
      }
      const edges = requiredEdges(envelope, existing.id);
      const missing: CouncilEdge[] = [];
      for (const edge of edges) {
        if (!(await edgeExists(deps, edge))) missing.push(edge);
      }
      for (const edge of missing) {
        await appendEdge(deps, edge);
      }
      return { memoryId: existing.id, created: false, recovered: missing.length > 0 };
    }

    if (envelope.record_kind === 'opinion') {
      await assertNoExpertRoundDup(deps, envelope);
    }

    // Запись через штатный путь (governance/event/index); lock не пробрасываем —
    // он уже удержан этим вызовом (не реентерабелен)
    const addDeps: Parameters<typeof addMemoryObject>[0] = {
      store: deps.store,
      log: deps.log,
      clock: deps.clock,
      idGen: deps.idGen,
      ...(deps.index ? { index: deps.index } : {}),
    };
    const { object } = await addMemoryObject(addDeps, {
      type: 'note',
      facet: 'context',
      title: titleFor(envelope),
      // 2.32.0: два разных совета с одинаковым заголовком-вопросом — разные записи
      idFingerprint: `${titleFor(envelope)}\u0000${body}`,
      body,
      createdBy: input.createdBy,
      tags: [COUNCIL_TAG],
      // W8/F3: вопрос открыт до закрытия синтезом — симметрия с legacy
      // council-question defaultStatus 'open'; статус — поле note, не входит
      // в canonical body/question_revision (идемпотентность не меняется)
      ...(envelope.record_kind === 'question' ? { status: 'open' as const } : {}),
    });

    for (const edge of requiredEdges(envelope, object.id)) {
      await appendEdge(deps, edge);
    }
    return { memoryId: object.id, created: true, recovered: false };
  };

  return deps.lock ? deps.lock.withLock(core) : core();
}
