// src/app/use-cases/learning-queries.ts
import { resolveLearningMode, type LearningMode, type LearningModeConfig } from '../../domain/learning-mode.js';
import type { LearningSignal, LearningSignalIndex } from '../../ports/learning-signal-index.port.js';

/**
 * 3.2.0 T-05 (REQ-03, REQ-12, NFR-05, design §7/§9): read-only запросы адресной
 * очереди сигналов. due детерминирован: новые/изменившиеся сигналы после
 * курсора, порядок по seq, страница конечна. Чтение due НЕ двигает курсор и
 * НИЧЕГО не диспетчирует (S-23); off не подсказывает работу (REQ-12); пустая
 * очередь даёт has_work=false без каких-либо модельных вызовов (NFR-01) —
 * вызов Стюарда решает вызывающий по has_work/pending_count.
 */

/** Лимит страницы по умолчанию (design §7: лимит пакета конфигурируется). */
export const DEFAULT_SIGNAL_PAGE_LIMIT = 20;
/** Верхняя граница страницы: bounded response (S-29) независимо от запроса. */
export const MAX_SIGNAL_PAGE_LIMIT = 200;

export function clampSignalPageLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_SIGNAL_PAGE_LIMIT;
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_SIGNAL_PAGE_LIMIT);
}

export interface LearningQueriesDeps {
  signals: LearningSignalIndex;
  /** Явный программный режим; иначе config → env WOLF_LEARNING_MODE → 'suggest'. */
  mode?: LearningMode;
  config?: LearningModeConfig | null;
  env?: NodeJS.ProcessEnv;
}

export interface LearningDueResult {
  mode: LearningMode;
  /** false — off или пустая очередь: Стюарда вызывать не нужно (REQ-12, NFR-01). */
  has_work: boolean;
  /** Позиция курсора на момент запроса. При off очередь не читается: это
   * «нет подсказки работы», а не утверждение о числе сигналов. */
  cursor: number;
  /** Всего pending-сигналов после курсора (не ограничено страницей). */
  pending_count: number;
  items: LearningSignal[];
  limit: number;
}

export function getLearningDue(deps: LearningQueriesDeps, input: { limit?: number } = {}): LearningDueResult {
  const mode = deps.mode ?? resolveLearningMode(deps.env ?? process.env, deps.config);
  const limit = clampSignalPageLimit(input.limit);
  if (mode === 'off') {
    // REQ-12/S-23: off — нет due/dispatch и не создаётся работа; очередь не читается.
    return { mode, has_work: false, cursor: deps.signals.getCursor(), pending_count: 0, items: [], limit };
  }
  const items = deps.signals.duePage(limit);
  return {
    mode,
    has_work: items.length > 0,
    cursor: deps.signals.getCursor(),
    pending_count: deps.signals.dueCount(),
    items,
    limit,
  };
}

export interface SignalPageResult {
  items: LearningSignal[];
  /** seq последней записи страницы; следующая страница — after_seq = это значение. */
  next_after_seq: number | null;
  has_more: boolean;
  limit: number;
}

/** Аудит всего сигнального индекса страницами по seq (S-29: bounded, порядок
 * детерминирован). Это чтение реестра, не подсказка работы: работает и в off. */
export function listSignalPage(
  deps: LearningQueriesDeps,
  input: { limit?: number; after_seq?: number } = {}
): SignalPageResult {
  const limit = clampSignalPageLimit(input.limit);
  const afterSeq = input.after_seq ?? 0;
  const items = deps.signals.listSignalPage(limit, afterSeq);
  return {
    items,
    next_after_seq: items.length > 0 ? items[items.length - 1].seq : null,
    has_more: items.length === limit,
    limit,
  };
}
