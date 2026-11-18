// src/domain/schemas/learning-change-schema.ts
import { createHash } from 'crypto';
import { z } from 'zod';
import { UserFacingError } from '../errors.js';
import type { MemoryObject } from './memory-object-schema.js';

/**
 * 3.2.0 T-04 (REQ-03/REQ-05, design §5): валидируемый кодом контракт кандидата
 * изменения и связности сигналов. Конверт хранится в body note/proposal с тегом
 * `wolf:learning-change:v1` (прецедент — council-record v1, record-council.ts);
 * общие поля proposal заполняются штатно (saveLearningCandidate). Поля конверта
 * (phase, trial, baseline, …) НЕ добавляются в произвольные memory-объекты через
 * --set (REQ-05 AC): guard unknown-полей в add-memory-object их отклоняет, а
 * легальный путь записи — только saveLearningCandidate.
 *
 * phase внутри конверта — не MemoryStatus: proposed → trialled → approved →
 * active; declined/needs_context/retired/rolled_back — отдельные результаты
 * переходов. Создание кандидата ставит ровно 'proposed'; переходы фаз и
 * заполнение acceptance/activation — контур trial/apply (T-06), не этот файл.
 */

/** Тег-маркер конверта кандидата на note/proposal (design §5). */
export const LEARNING_CHANGE_TAG = 'wolf:learning-change:v1';

/** Фазы жизненного цикла конверта (design §5) — не статусы памяти. */
export const LEARNING_PHASES = [
  'proposed',
  'trialled',
  'approved',
  'active',
  'declined',
  'needs_context',
  'retired',
  'rolled_back',
] as const;
export type LearningPhase = (typeof LEARNING_PHASES)[number];

const nonEmpty = z.string().min(1);
/** Hash-поля конверта: sha256 в нижнем hex (baseline/candidate/oracle/rollback/request_key). */
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'expected 64-char lowercase sha256 hex');

/** REQ-03: сигнал — наблюдение с источником. unknown остаётся unknown:
 * observed_outcome='unknown' валиден, выдумывать исход нельзя. Тексты источника —
 * данные (REQ-06): контекст хранится как строка и никогда не исполняется. */
export const LearningSourceSchema = z.strictObject({
  /** ID сигнала — связность сигнал↔кандидат (REQ-03 AC). */
  signal_id: nonEmpty,
  /** Locator: memory id или путь/URL источника. */
  ref: nonEmpty,
  revision: nonEmpty,
  /** Происхождение наблюдения: complaint/lesson/note/external и т.п. (REQ-04). */
  source: nonEmpty,
  context: nonEmpty,
  observed_outcome: nonEmpty,
});
export type LearningSource = z.infer<typeof LearningSourceSchema>;

const ScopeSchema = z.strictObject({
  project_id: nonEmpty,
  target_paths: z.array(nonEmpty).min(1),
  /** REQ-05 AC: нет валидного кандидата без границ применимости. */
  applicability: z.array(nonEmpty).min(1),
});

const BaselineSchema = z.strictObject({
  files: z.array(z.strictObject({ path: nonEmpty, sha256: sha256Hex })).min(1),
  model: nonEmpty,
  harness: nonEmpty,
});

const CandidatePartSchema = z.strictObject({
  /** Ссылка на точный diff/изменение знания (kind различает форму изменения). */
  diff_ref: nonEmpty,
  sha256: sha256Hex,
  rationale: nonEmpty,
  /** REQ-05: отрицательные сценарии обязательны (false trigger/missing context/…). */
  negative_cases: z.array(nonEmpty).min(1),
});

const TrialSchema = z.strictObject({
  suite_ref: nonEmpty,
  /** Независимый оракул фиксируется hash'ем — кандидат не правит оценщик (REQ-07). */
  oracle_sha256: sha256Hex,
  budget: z.strictObject({ tool_calls: z.number().int().min(0) }),
});

const RollbackSchema = z.strictObject({
  previous_ref: nonEmpty,
  expected_active_sha256: sha256Hex,
});

/** Вход создания кандидата (строгий): phase/acceptance/activation/trial.result_ref
 * ставит use-case, поэтому во входе их нет — неизвестные поля отклоняются (S-08). */
export const LearningCandidateInputSchema = z.strictObject({
  /** skill_delta — правка навыка/файлов; knowledge_delta — изменение знания. */
  kind: z.enum(['skill_delta', 'knowledge_delta']),
  problem: nonEmpty,
  goal: nonEmpty,
  expected_benefit: nonEmpty,
  scope: ScopeSchema,
  /** REQ-05 AC: нет валидного кандидата без evidence (источники-сигналы). */
  sources: z.array(LearningSourceSchema).min(1),
  baseline: BaselineSchema,
  candidate: CandidatePartSchema,
  trial: TrialSchema,
  rollback: RollbackSchema,
  /** Явный change_id; не передан — детерминированно `lc-<префикс request_key>`. */
  change_id: nonEmpty.optional(),
});
export type LearningCandidateInput = z.infer<typeof LearningCandidateInputSchema>;

/** Полный конверт (design §5): ровно то, что хранится в body note/proposal. */
export const LearningChangeEnvelopeSchema = z.strictObject({
  schema_version: z.literal(1),
  change_id: nonEmpty,
  request_key: sha256Hex,
  phase: z.enum(LEARNING_PHASES),
  kind: LearningCandidateInputSchema.shape.kind,
  problem: nonEmpty,
  goal: nonEmpty,
  expected_benefit: nonEmpty,
  scope: ScopeSchema,
  sources: z.array(LearningSourceSchema).min(1),
  baseline: BaselineSchema,
  candidate: CandidatePartSchema,
  /** result_ref заполняет trial-запись (T-06); при создании — null. */
  trial: TrialSchema.extend({ result_ref: z.string().nullable() }),
  /** Схемы приёмки/активации фиксирует apply-контур (T-06); при создании — null:
   * suggest/propose НИЧЕГО не активирует (REQ-08 AC). */
  acceptance: z.unknown().nullable(),
  activation: z.unknown().nullable(),
  rollback: RollbackSchema,
});
export type LearningChangeEnvelope = z.infer<typeof LearningChangeEnvelopeSchema>;

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

/** request_key = sha256(project + target_paths + problem + source-референ@revision)
 * (design §5 dedup_key). Детерминирован: повтор тех же источников и той же проблемы
 * даёт тот же ключ и связывается с существующим кандидатом (REQ-03, S-09). */
export function learningRequestKey(input: LearningCandidateInput): string {
  const parts = [
    input.scope.project_id,
    ...[...input.scope.target_paths].sort(),
    input.problem,
    ...input.sources.map((s) => `${s.ref}@${s.revision}`).sort(),
  ];
  return createHash('sha256').update(parts.join('\u0000'), 'utf8').digest('hex');
}

/** Содержимое изменения для сравнения повторов: lifecycle-поля (phase, acceptance,
 * activation, trial.result_ref) и презентационный change_id исключены — replay
 * после перехода фазы остаётся дедупом, а изменённое содержимое с тем же
 * request_key даёт конфликт (design §9, S-09). */
export function learningCandidateContent(envelope: LearningChangeEnvelope): string {
  return canonicalJson({
    kind: envelope.kind,
    problem: envelope.problem,
    goal: envelope.goal,
    expected_benefit: envelope.expected_benefit,
    scope: envelope.scope,
    sources: [...envelope.sources].map((s) => canonicalJson(s)).sort(),
    baseline: envelope.baseline,
    candidate: envelope.candidate,
    trial: {
      suite_ref: envelope.trial.suite_ref,
      oracle_sha256: envelope.trial.oracle_sha256,
      budget: envelope.trial.budget,
    },
    rollback: envelope.rollback,
  });
}

/** Строгий разбор конверта кандидата из memory-объекта: нет тега → null; тег есть,
 * а body не валидный конверт → UserFacingError (наш маркер с битым содержимым —
 * повреждение данных, не чужая запись). */
export function parseLearningChangeEnvelope(obj: MemoryObject): LearningChangeEnvelope | null {
  if (!(obj.tags ?? []).includes(LEARNING_CHANGE_TAG)) return null;
  return parseTaggedBody(obj);
}

/** Терпеливый разбор для сканов дедупа (прецедент tryParseEnvelope): чужая/битая
 * запись с тегом пропускается, а не ломает очередь. */
export function tryParseLearningChangeEnvelope(obj: MemoryObject): LearningChangeEnvelope | null {
  if (!(obj.tags ?? []).includes(LEARNING_CHANGE_TAG)) return null;
  try {
    return parseTaggedBody(obj);
  } catch {
    return null;
  }
}

function parseTaggedBody(obj: MemoryObject): LearningChangeEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(obj.body);
  } catch {
    throw new UserFacingError(
      `learning candidate "${obj.id}" has unreadable body (tag ${LEARNING_CHANGE_TAG} present)`
    );
  }
  const result = LearningChangeEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    throw new UserFacingError(
      `learning candidate "${obj.id}" body is not a valid ${LEARNING_CHANGE_TAG} envelope: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`
    );
  }
  return result.data;
}
