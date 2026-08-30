/**
 * Ф21 (D1.3): детерминированная паттерн-детекция по сигнальному логу.
 * Чистые функции без fs (вход — массивы записей); LLM не участвует.
 * Ключ кластера и порог — из session-metrics-log (единый канон Ф20).
 * Спека: docs/superpowers/specs/2026-08-26-self-learning-design.md §2.2, §6.
 */
import { signalKey, DEFAULT_PATTERN_THRESHOLD, type SignalEvent } from '../../adapters/fs/session-metrics-log.js';

/** Активный паттерн: кластер сигналов, пересёкший порог. */
export interface PatternSummary {
  key: string;
  count: number;
  first_ts: string;
  last_ts: string;
  /** Evidence-ссылки на исходные сигналы: `session-metrics.jsonl:<строка>` (1-based). */
  evidence: string[];
}

/**
 * Группировка O(n) по signalKey (run-события пропускаются: ключ null).
 * Паттерн = группа с count >= threshold. Сортировка: count убыв., затем key —
 * стабильный вывод без зависимости от порядка входа.
 */
export function detectPatterns(
  signals: SignalEvent[],
  threshold: number = DEFAULT_PATTERN_THRESHOLD
): PatternSummary[] {
  const groups = new Map<string, { count: number; first_ts: string; last_ts: string; evidence: string[] }>();
  for (let i = 0; i < signals.length; i++) {
    const key = signalKey(signals[i]!);
    if (key === null) continue;
    const ref = `session-metrics.jsonl:${i + 1}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.last_ts = signals[i]!.ts;
      g.evidence.push(ref);
    } else {
      groups.set(key, { count: 1, first_ts: signals[i]!.ts, last_ts: signals[i]!.ts, evidence: [ref] });
    }
  }
  return [...groups.entries()]
    .filter(([, g]) => g.count >= threshold)
    .map(([key, g]) => ({ key, ...g }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Здоровье контура: объёмы + Layer 1–2 meta-metrics (§6 observability). */
export interface SignalLogSummary {
  totalEvents: number;
  byEvent: Record<string, number>;
  /** Последние 5 событий по порядку файла. */
  lastEvents: SignalEvent[];
  layer1: {
    uncategorized_errors: number;
    /** Доля tool_error с классом uncategorized среди всех tool_error; null — ошибок 0. */
    uncategorizedShare: number | null;
    orphanSignals: number;
    /** Доля событий с известной моделью (gen_ai.modelID !== null); null — событий 0. */
    signalCoverage: number | null;
  };
  layer2: {
    /** Средний count по активным паттернам; null — паттернов нет. */
    clusterDensity: number | null;
    emergingPatterns: number;
  };
}

export function summarizeSignalLog(
  signals: SignalEvent[],
  threshold: number = DEFAULT_PATTERN_THRESHOLD
): SignalLogSummary {
  const byEvent: Record<string, number> = {};
  let orphans = 0;
  let withModel = 0;
  let toolErrors = 0;
  let uncategorized = 0;
  for (const ev of signals) {
    byEvent[ev.event] = (byEvent[ev.event] ?? 0) + 1;
    if (ev.session_id === null) orphans += 1;
    if (ev.gen_ai.modelID !== null) withModel += 1;
    if (ev.event === 'tool_error') {
      toolErrors += 1;
      // отсутствующий класс трактуется как uncategorized — так же, как в signalKey
      if ((ev.error_class_id ?? 'uncategorized') === 'uncategorized') uncategorized += 1;
    }
  }
  const patterns = detectPatterns(signals, threshold);
  return {
    totalEvents: signals.length,
    byEvent,
    lastEvents: signals.slice(-5),
    layer1: {
      uncategorized_errors: uncategorized,
      uncategorizedShare: toolErrors > 0 ? uncategorized / toolErrors : null,
      orphanSignals: orphans,
      signalCoverage: signals.length > 0 ? withModel / signals.length : null,
    },
    layer2: {
      clusterDensity: patterns.length > 0 ? patterns.reduce((s, p) => s + p.count, 0) / patterns.length : null,
      emergingPatterns: patterns.length,
    },
  };
}
