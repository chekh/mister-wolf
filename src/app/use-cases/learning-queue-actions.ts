// src/app/use-cases/learning-queue-actions.ts
import { resolveLearningMode, type LearningMode, type LearningModeConfig } from '../../domain/learning-mode.js';
import { UserFacingError } from '../../domain/errors.js';
import type { LearningSignalIndex } from '../../ports/learning-signal-index.port.js';

/**
 * 3.2.0 T-05 (REQ-03, REQ-12, design §7/§9): явные мутации очереди. Курсор
 * двигает только обработка пакета (ack) — чтение due и обычные сообщения его
 * не двигают (S-23); dismissed-сигнал не возвращается в очередь автоматически
 * (REQ-03). Ни ack, ни dismiss ничего не диспетчируют и не создают работу.
 */

export interface LearningQueueActionsDeps {
  signals: LearningSignalIndex;
  mode?: LearningMode;
  config?: LearningModeConfig | null;
  env?: NodeJS.ProcessEnv;
}

export interface AckBatchResult {
  mode: LearningMode;
  /** Курсор до и после ack. */
  cursor_before: number;
  cursor: number;
  advanced: boolean;
}

/** Отметить пакет обработанным: курсор → target (по умолчанию наибольший seq
 * индекса). Монотонно: назад не двигается (S-23). */
export function ackLearningBatch(deps: LearningQueueActionsDeps, input: { seq?: number } = {}): AckBatchResult {
  const mode = deps.mode ?? resolveLearningMode(deps.env ?? process.env, deps.config);
  const cursorBefore = deps.signals.getCursor();
  const target = input.seq ?? deps.signals.maxSeq();
  if (!Number.isInteger(target) || target < 0) {
    throw new UserFacingError(`ack seq must be a non-negative integer, got ${input.seq}`);
  }
  deps.signals.advanceCursor(target);
  const cursor = deps.signals.getCursor();
  return { mode, cursor_before: cursorBefore, cursor, advanced: cursor > cursorBefore };
}

export interface DismissSignalResult {
  memory_id: string;
  disposition: 'dismissed';
}

/** Отклонить сигнал: исключается из due; новая ревизия не возвращает его
 * автоматически (REQ-03 AC) — новое наблюдение создаёт новый сигнал. */
export function dismissLearningSignal(
  deps: LearningQueueActionsDeps,
  input: { memory_id: string }
): DismissSignalResult {
  if (!input.memory_id || input.memory_id.trim() === '') {
    throw new UserFacingError('dismiss requires a signal memory id (REQ-03: unknown stays unknown)');
  }
  deps.signals.setDisposition(input.memory_id.trim(), 'dismissed');
  return { memory_id: input.memory_id.trim(), disposition: 'dismissed' };
}
