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
 */
import { appendFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { metricsDir } from './project-paths.js';
import { classifyError } from '../../domain/error-class.js';
import { loadWolfConfigSync } from './config-file.js';

export type SignalEventName = 'run' | 'complaint' | 'delivery' | 'tool_error';

export interface SignalEvent {
  /** ISO8601. */
  ts: string;
  event: SignalEventName;
  session_id: string | null;
  /** gen_ai-неймспейс OTEL; modelID — обязательное поле записи (null = неизвестна). */
  gen_ai: { modelID: string | null; agent: string | null };
  orchestration: { task: string | null; actor: string };
  /** weighted-токены (input + 0.1×cache_read + 5×output) — для run-событий. */
  weighted?: number;
  /** run: 'ok' | 'exit_<code>'; tool_error: 'error'. */
  outcome?: string;
  /** tool_error. */
  tool_name?: string;
  /** tool_error: id из classifyError. */
  error_class_id?: string;
  /** Факты события: about/text у жалобы, name/mechanism/target у доставки, message у ошибки. */
  detail?: Record<string, unknown>;
}

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
 * run → null (контекст-событие, не кластеризуется).
 */
export function signalKey(ev: SignalEvent): string | null {
  if (ev.event === 'tool_error') return `${ev.tool_name ?? 'unknown'}:${ev.error_class_id ?? 'uncategorized'}`;
  if (ev.event === 'complaint') return `complaint:${String(ev.detail?.about ?? 'unknown')}`;
  if (ev.event === 'delivery') return `delivery:${String(ev.detail?.name ?? 'unknown')}`;
  return null;
}

function readJsonl<T>(path: string): T[] {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // малформ-строка пропускается: лог append-only, битая строка не должна ронять контур
    }
  }
  return out;
}

/** Все сигналы лога (порядок записи); отсутствующий/битый лог → максимально читаемое. */
export function readSignals(baseDir: string): SignalEvent[] {
  return readJsonl<SignalEvent>(metricsLogPath(baseDir));
}

/** Зафиксированные паттерны (события пересечения порога). */
export function readPatterns(baseDir: string): PatternRecord[] {
  return readJsonl<PatternRecord>(patternsLogPath(baseDir));
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

/** Writer (а): `wolf run` — метрики сессии (модель из routing, weighted, outcome). */
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

/** Writer (в): delivery_event — факт доставки методики/инструмента (scaffold / tool expose). */
export function appendDeliverySignal(
  baseDir: string,
  input: {
    name: string;
    mechanism: 'skill' | 'frame' | 'plugin' | 'search';
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
