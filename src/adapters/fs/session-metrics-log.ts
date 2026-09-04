/**
 * Ф20 (D1.1): сигнальный лог контура самообучения — .wolf/metrics/session-metrics.jsonl.
 * Append-only, derived/rebuildable (инвариант §9), запись детерминированная, без LLM.
 * Формат: OTEL GenAI-совместимые поля по спеке §2.1 (session_id, gen_ai.*, orchestration.*,
 * outcome); gen_ai.modelID — обязательное поле (PoC#4, §21 п.23; null — модель неизвестна).
 * Документация формата: docs/guide/signal-log.md. Спека:
 * docs/superpowers/specs/2026-08-26-self-learning-design.md §2.1, §2.2.
 *
 * Writer-матрица D1 (M20-07, решение Q3): writer'ы — сами CLI-команды (run, complain,
 * scaffold, tool expose, recordToolError); `wolf metrics emit` не вводится.
 *
 * P1 D1: identity-поля v2 (event_id, schema_version, run_id, trace_id, parent_span_id,
 * role_level, attempt, task_id, config_hash, prompt_hash, tools) — все опциональные,
 * записи v1 валидны без изменений. Upcast-совместимость (P1 D2): записи без
 * schema_version = v1, поля остаются undefined; писатели переходят на v2 отдельно.
 * Спека: docs/superpowers/specs/2026-09-04-p1-telemetry-identity-design.md.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { metricsDir } from './project-paths.js';
import { classifyError } from '../../domain/error-class.js';
import { loadWolfConfigSync } from './config-file.js';

export type SignalEventName = 'run' | 'complaint' | 'delivery' | 'tool_error' | 'task_evaluated';

/**
 * Схема сигнального лога (P0 D6): чтение лога валидируется Zod, неизвестные поля
 * отбрасываются (strip — дефолт zod-object). Тип SignalEvent выводится из схемы.
 */
export const SignalEventSchema = z.object({
  /** ISO8601. */
  ts: z.string(),
  event: z.enum(['run', 'complaint', 'delivery', 'tool_error', 'task_evaluated']),
  session_id: z.string().nullable(),
  /** gen_ai-неймспейс OTEL; modelID — обязательное поле записи (null = неизвестна). */
  gen_ai: z.object({ modelID: z.string().nullable(), agent: z.string().nullable() }),
  orchestration: z.object({ task: z.string().nullable(), actor: z.string() }),
  /** weighted-токены (input + 0.1×cache_read + 5×output) — для run-событий. */
  weighted: z.number().optional(),
  /** M1 (D4): wall-clock длительность прогона, мс (только run-события). */
  duration_ms: z.number().optional(),
  /** M1 (D3): сырые токены прогона (только run-события). */
  tokens: z.object({ input: z.number(), output: z.number(), cache_read: z.number() }).optional(),
  /** M1 (D5): экспериментальные примитивы (arm/task_id пишутся только с experiment). */
  experiment: z
    .object({ id: z.string(), arm: z.enum(['wolf', 'baseline']), task_id: z.string().optional() })
    .optional(),
  /** run: 'ok' | 'exit_<code>'; tool_error: 'error'. */
  outcome: z.string().optional(),
  /** tool_error. */
  tool_name: z.string().optional(),
  /** tool_error: id из classifyError. */
  error_class_id: z.string().optional(),
  // --- P1 D1: identity-поля v2 (все опциональные → записи v1 валидны) ---
  /** Уникальный id события (uuid). Отсутствует в v1-записях. */
  event_id: z.string().optional(),
  /** 2 = схема v2 (identity-поля). Отсутствует = v1 (D2 upcast: поля остаются undefined). */
  schema_version: z.literal(2).optional(),
  /** Идентификатор прогона `wolf run` (uuid) — сквозная цепочка задачи. */
  run_id: z.string().optional(),
  /** Трасса (uuid; `--trace-id` в wolf run) — объединяет раны одной задачи. */
  trace_id: z.string().optional(),
  /** Родительский span (span-модель — P2; поле зарезервировано). */
  parent_span_id: z.string().optional(),
  /** Уровень роли писателя по actor-конвенции; дефолт — поле не пишется. */
  role_level: z.enum(['L0', 'L1', 'L2']).optional(),
  /** Попытка (retry-номер) в рамках run. */
  attempt: z.number().optional(),
  /** Общий id задачи (не только эксперименты; пишется всегда при передаче). */
  task_id: z.string().optional(),
  /** sha256(.wolf/config.yaml).slice(0,12) — конфиг-подпись. */
  config_hash: z.string().optional(),
  /** sha256(prompt).slice(0,12) — подпись промпта. */
  prompt_hash: z.string().optional(),
  /** Инструменты прогона (из --tool wolf run). */
  tools: z.array(z.string()).optional(),
  /** Факты события: about/text у жалобы, name/mechanism/target у доставки, message у ошибки. */
  detail: z.record(z.string(), z.unknown()).optional(),
});

export type SignalEvent = z.infer<typeof SignalEventSchema>;

export interface PatternRecord {
  ts: string;
  event: 'pattern';
  /** Ключ кластера Ф21. */
  key: string;
  count: number;
  threshold: number;
}

/** Порог паттерна N≥3 — дефолт спеки §2.2/§16; параметр процесса (config.yaml). */
export const DEFAULT_PATTERN_THRESHOLD = 3;

export function metricsLogPath(baseDir: string): string {
  return join(metricsDir(baseDir), 'session-metrics.jsonl');
}

export function patternsLogPath(baseDir: string): string {
  return join(metricsDir(baseDir), 'patterns.jsonl');
}

/** Эффективный порог: learning.pattern_threshold из .wolf/config.yaml, иначе дефолт. */
export function patternThreshold(baseDir: string): number {
  try {
    const t = loadWolfConfigSync(baseDir)?.learning?.patternThreshold;
    return typeof t === 'number' && Number.isInteger(t) && t >= 1 ? t : DEFAULT_PATTERN_THRESHOLD;
  } catch {
    return DEFAULT_PATTERN_THRESHOLD;
  }
}

/**
 * Ключ кластеризации Ф21 (детерминированный, O(n)-группировка):
 * tool_error → `tool_name:error_class_id`; complaint/delivery → `тип:цель`;
 * run/task_evaluated → null (контекст-событие, не кластеризуется).
 */
export function signalKey(ev: SignalEvent): string | null {
  if (ev.event === 'tool_error') return `${ev.tool_name ?? 'unknown'}:${ev.error_class_id ?? 'uncategorized'}`;
  if (ev.event === 'complaint') return `complaint:${String(ev.detail?.about ?? 'unknown')}`;
  if (ev.event === 'delivery') return `delivery:${String(ev.detail?.name ?? 'unknown')}`;
  return null;
}

/**
 * Мягкое чтение jsonl: без схемы — только JSON.parse (patterns.jsonl), со схемой —
 * Zod-валидация каждой строки (session-metrics.jsonl). Малформ-строки (не-JSON или
 * не прошедшие схему) считаются и пропускаются: лог append-only, битая строка
 * не должна ронять контур.
 */
function readJsonl<T>(
  path: string,
  schema?: z.ZodType<T>
): {
  items: T[];
  malformedLines: number;
  totalLines: number;
} {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return { items: [], malformedLines: 0, totalLines: 0 };
  }
  const items: T[] = [];
  let malformedLines = 0;
  let totalLines = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    totalLines++;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (schema) {
        const res = schema.safeParse(parsed);
        if (!res.success) {
          malformedLines++;
          continue;
        }
        items.push(res.data);
      } else {
        items.push(parsed as T);
      }
    } catch {
      malformedLines++;
    }
  }
  return { items, malformedLines, totalLines };
}

export interface SignalLogStats {
  /** Валидные события в порядке записи. */
  events: SignalEvent[];
  /** Не-JSON строки + строки, не прошедшие схему. */
  malformedLines: number;
  /** Все непустые строки лога. */
  totalLines: number;
}

/** Сигнальный лог со счётчиком малформа (P0 D6: честная статистика аналитики). */
export function readSignalLog(baseDir: string): SignalLogStats {
  const { items, malformedLines, totalLines } = readJsonl(metricsLogPath(baseDir), SignalEventSchema);
  return { events: items, malformedLines, totalLines };
}

/** Все сигналы лога (порядок записи); отсутствующий/битый лог → максимально читаемое. */
export function readSignals(baseDir: string): SignalEvent[] {
  return readSignalLog(baseDir).events;
}

/** Зафиксированные паттерны (события пересечения порога). */
export function readPatterns(baseDir: string): PatternRecord[] {
  return readJsonl<PatternRecord>(patternsLogPath(baseDir)).items;
}

/**
 * Append сигнала + событийный триггер Ф21: в момент записи, перевалившей порог,
 * паттерн фиксируется в patterns.jsonl (один раз на ключ — повторных фиксаций нет).
 * НЕ календарный (спека §7: event-driven пороги вместо расписания). Порог —
 * настраиваемый параметр (§2.2): при снижении порога уже накопленный кластер
 * фиксируется на следующей же записи, не ждёт нового пересечения.
 */
export function appendSignal(
  baseDir: string,
  ev: SignalEvent
): { key: string | null; count: number; patternFixed: boolean } {
  mkdirSync(metricsDir(baseDir), { recursive: true });
  appendFileSync(metricsLogPath(baseDir), JSON.stringify(ev) + '\n');
  const key = signalKey(ev);
  if (key === null) return { key: null, count: 0, patternFixed: false };
  // ponytail: O(n)-пересчёт по файлу на запись — норм для local-first объёмов;
  // инкрементальные счётчики если лог вырастет до десятков тысяч строк.
  const count = readSignals(baseDir).filter((s) => signalKey(s) === key).length;
  const threshold = patternThreshold(baseDir);
  const alreadyFixed = readPatterns(baseDir).some((p) => p.key === key);
  const patternFixed = count >= threshold && !alreadyFixed;
  if (patternFixed) {
    appendFileSync(
      patternsLogPath(baseDir),
      JSON.stringify({ ts: ev.ts, event: 'pattern', key, count, threshold } satisfies PatternRecord) + '\n'
    );
  }
  return { key, count, patternFixed };
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Writer (а): `wolf run` — метрики сессии (модель из routing, weighted, outcome; M1: duration/tokens/experiment). */
export function appendRunSignal(
  baseDir: string,
  input: {
    model: string;
    agent: string;
    title: string;
    session: string | null;
    weighted: number;
    outcome: string;
    actor: string;
    task?: string;
    durationMs?: number;
    tokens?: { input: number; output: number; cache_read: number };
    experiment?: { id: string; arm: 'wolf' | 'baseline'; taskId?: string };
  }
): { key: string | null; count: number; patternFixed: boolean } {
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'run',
    session_id: input.session,
    gen_ai: { modelID: input.model, agent: input.agent },
    orchestration: { task: input.title, actor: input.actor },
    weighted: input.weighted,
    outcome: input.outcome,
    ...(input.task !== undefined ? { detail: { task: input.task } } : {}),
    ...(input.durationMs !== undefined ? { duration_ms: input.durationMs } : {}),
    ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
    ...(input.experiment !== undefined
      ? {
          experiment: {
            id: input.experiment.id,
            arm: input.experiment.arm,
            ...(input.experiment.taskId !== undefined ? { task_id: input.experiment.taskId } : {}),
          },
        }
      : {}),
  });
}

/** Writer (б): `wolf complain` — сигнал жалобы (hot-signal Стюарда). */
export function appendComplaintSignal(
  baseDir: string,
  input: { about: string; text: string; actor: string; objectId: string }
): { key: string | null; count: number; patternFixed: boolean } {
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'complaint',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: input.actor },
    outcome: 'complaint',
    detail: { about: input.about, text: input.text, object_id: input.objectId },
  });
}

/** Writer (в): delivery_event — факт доставки методики/инструмента (scaffold / tool expose;
 * Ф22 — активация draft: доставка через wolf call / trigger_keywords). */
export function appendDeliverySignal(
  baseDir: string,
  input: {
    name: string;
    mechanism: 'skill' | 'frame' | 'plugin' | 'search' | 'call';
    target?: string;
    actor: string;
    detail?: Record<string, unknown>;
  }
): { key: string | null; count: number; patternFixed: boolean } {
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'delivery',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: input.actor },
    outcome: 'delivered',
    detail: {
      name: input.name,
      mechanism: input.mechanism,
      ...(input.target ? { target: input.target } : {}),
      ...input.detail,
    },
  });
}

/**
 * Writer (г): ошибка тула — через классификатор D1.2 (проектная таксономия из
 * config.yaml матчится раньше дефолтной таблицы).
 */
export function recordToolError(
  baseDir: string,
  input: {
    tool_name: string;
    message: string;
    code?: string;
    session_id?: string | null;
    task?: string | null;
    agent?: string | null;
    actor?: string;
  }
): { error_class_id: string; key: string; count: number; patternFixed: boolean } {
  let projectRules: readonly { id: string; match: string[] }[] = [];
  try {
    projectRules = loadWolfConfigSync(baseDir)?.errorClassTaxonomy ?? [];
  } catch {
    // битый конфиг — классифицируем дефолтной таблицей
  }
  const error_class_id = classifyError({ message: input.message, code: input.code }, projectRules);
  const result = appendSignal(baseDir, {
    ts: nowIso(),
    event: 'tool_error',
    session_id: input.session_id ?? null,
    gen_ai: { modelID: null, agent: input.agent ?? null },
    orchestration: { task: input.task ?? null, actor: input.actor ?? 'user:cli' },
    outcome: 'error',
    tool_name: input.tool_name,
    error_class_id,
    detail: { message: input.message, ...(input.code ? { code: input.code } : {}) },
  });
  return {
    error_class_id,
    key: result.key ?? `${input.tool_name}:${error_class_id}`,
    count: result.count,
    patternFixed: result.patternFixed,
  };
}

/**
 * Writer (д): task_evaluated (P0 D2) — вердикт по задаче от скорера. Контекст-событие:
 * signalKey → null (как run), пороги Ф21 не считаются. Дефолт scorer='human'
 * задаётся на уровне CLI-команды `wolf task-eval` (P0 D3).
 */
export function appendTaskEvaluatedSignal(
  baseDir: string,
  input: {
    verdict: 'accepted' | 'rejected' | 'partial' | 'inconclusive';
    scorer: 'human' | 'deterministic' | 'llm_judge' | 'hidden_tests';
    sessionId?: string | null;
    taskId?: string;
    criteriaPassed?: number;
    criteriaTotal?: number;
    criticalFailure?: boolean;
    note?: string;
  }
): { key: string | null; count: number; patternFixed: boolean } {
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'task_evaluated',
    session_id: input.sessionId ?? null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'evaluated',
    detail: {
      verdict: input.verdict,
      scorer: input.scorer,
      ...(input.taskId !== undefined ? { task_id: input.taskId } : {}),
      ...(input.criteriaPassed !== undefined ? { criteria_passed: input.criteriaPassed } : {}),
      ...(input.criteriaTotal !== undefined ? { criteria_total: input.criteriaTotal } : {}),
      ...(input.criticalFailure ? { critical_failure: true } : {}),
      ...(input.note ? { note: input.note } : {}),
    },
  });
}
