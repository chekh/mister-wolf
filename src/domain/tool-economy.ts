/**
 * Экономика переиспользования инструментов (C3, roadmap v3).
 * Чистые функции анализа run-log: без side-effects и импортов.
 * weighted = input + 0.1×cache.read + 5×output (считается в opencode-run-metrics).
 */

export interface RunLogEntry {
  ts?: string;
  model?: string;
  agent?: string;
  title?: string;
  weighted?: number;
  tools?: string[];
}

export interface EconomyResult {
  sufficient: boolean;
  /** Почему данных недостаточно (только при sufficient: false). */
  reason?: string;
  /** Задач с непустой пометкой tools и конечным weighted. */
  toolRuns: number;
  /** Всех задач с конечным weighted. */
  totalRuns: number;
  medianTool: number | null;
  medianAll: number | null;
  /** (1 − medianTool/medianAll)×100; null при medianAll ≤ 0. */
  savingsPct: number | null;
}

/** Парсит jsonl run-log; пустые и битые строки молча пропускаются. */
export function parseRunLog(text: string): RunLogEntry[] {
  const entries: RunLogEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === 'object' && parsed !== null) entries.push(parsed as RunLogEntry);
    } catch {
      // битая строка — пропускаем
    }
  }
  return entries;
}

/** Медиана: чётная длина — среднее двух центральных; [] → null. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Сравнивает weighted-медиану задач с пометкой tools против медианы всех задач.
 * При нехватке выборки (minSample на группу) — sufficient: false, числа не выдумываем.
 */
export function analyzeEconomy(entries: RunLogEntry[], minSample = 3): EconomyResult {
  const marked = entries.filter((e) => Array.isArray(e.tools) && e.tools.length > 0 && isFiniteNumber(e.weighted));
  const all = entries.filter((e) => isFiniteNumber(e.weighted));

  if (marked.length < minSample || all.length < minSample) {
    return {
      sufficient: false,
      reason: `недостаточно данных (tool-задач: ${marked.length}, всего: ${all.length}, нужно ≥ ${minSample} в каждой группе)`,
      toolRuns: marked.length,
      totalRuns: all.length,
      medianTool: null,
      medianAll: null,
      savingsPct: null,
    };
  }

  const medianTool = median(marked.map((e) => e.weighted as number));
  const medianAll = median(all.map((e) => e.weighted as number));
  const savingsPct =
    medianTool !== null && medianAll !== null && medianAll > 0 ? (1 - medianTool / medianAll) * 100 : null;

  return { sufficient: true, toolRuns: marked.length, totalRuns: all.length, medianTool, medianAll, savingsPct };
}
