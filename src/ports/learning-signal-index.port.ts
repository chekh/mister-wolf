// src/ports/learning-signal-index.port.ts

/**
 * 3.2.0 T-05 (REQ-03, REQ-12, NFR-05, design §7): порт адресного индекса
 * сигналов с монотонным курсором. Реализация (SQLiteSearchIndex) ведёт
 * производную проекцию learning_signals из тех же записей, что и поисковый
 * индекс: full body-scan при due/list запрещён — запросы читают только индекс,
 * тело доступно вызывающему отдельно через store по выбранным id страницы.
 */

export type LearningSignalDisposition = 'pending' | 'dismissed' | 'candidate';

export interface LearningSignal {
  /** ID сигнала = locator: id memory-объекта (REQ-03 AC). */
  memory_id: string;
  type: string;
  status: string;
  title: string;
  /** sha256 содержимого на момент индексирования (детерминизм S-23). */
  revision: string;
  /** Монотонный номер последней ревизии сигнала (домен курсора). */
  seq: number;
  /** updated_at объекта на момент индексирования (changed_at, design §7). */
  changed_at: string;
  disposition: LearningSignalDisposition;
}

export interface LearningSignalIndex {
  /** Текущая позиция курсора: сигналы с seq ≤ cursor уже обработаны. */
  getCursor(): number;
  /** Наибольший выданный seq (цель ack по умолчанию). */
  maxSeq(): number;
  /** Сколько pending-сигналов после курсора (детерминированный размер пакета). */
  dueCount(): number;
  /** Bounded страница due: pending после курсора, порядок по seq, ровно ≤ limit.
   * Только для read-only подсказки: курсор НЕ двигается (S-23). */
  duePage(limit: number): LearningSignal[];
  /** Bounded страница аудита всего индекса: seq > afterSeq, порядок по seq.
   * Работает независимо от due-курсора (в т.ч. по уже обработанным). */
  listSignalPage(limit: number, afterSeq: number): LearningSignal[];
  /** Двигает курсор вперёд (только вперёд: назад не двигается — S-23). */
  advanceCursor(seq: number): void;
  /** Меняет disposizione сигнала; unknown id — отказ (REQ-03: unknown остаётся unknown). */
  setDisposition(memoryId: string, disposition: LearningSignalDisposition): void;
  /** EXPLAIN QUERY PLAN фактического due/list SQL — S-29 (инструментирование I/O:
   * поиск по индексу, не полный скан). */
  signalQueryPlan(kind: 'due' | 'list'): string[];
}
