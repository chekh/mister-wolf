// src/domain/learning-mode.ts
import { UserFacingError } from './errors.js';

/**
 * 3.2.0 T-04 (REQ-12, design §6): режимы контура обучения. off — ничего не
 * назначается, не подсказывается и не создаёт работы; suggest (default) —
 * очередь и предложения без активации; apply-approved — применение принятого
 * контуром apply (T-06). Приоритет разрешения: явный программный mode →
 * config.learning.mode (маппинг config.yaml — задача владельца конфига) →
 * env WOLF_LEARNING_MODE → 'suggest'.
 */

export type LearningMode = 'off' | 'suggest' | 'apply-approved';

/** Структурная проекция config.yaml, из которой читается learning.mode. */
export interface LearningModeConfig {
  learning?: { mode?: LearningMode };
}

const MODES: readonly LearningMode[] = ['off', 'suggest', 'apply-approved'];

function parseMode(value: string, origin: string): LearningMode {
  if ((MODES as readonly string[]).includes(value)) return value as LearningMode;
  throw new UserFacingError(`Invalid learning mode "${value}" in ${origin} (valid: ${MODES.join(' | ')})`);
}

/** Разрешает активный режим обучения (см. модульную docstring). */
export function resolveLearningMode(
  env: NodeJS.ProcessEnv = process.env,
  config?: LearningModeConfig | null
): LearningMode {
  const fromConfig = config?.learning?.mode;
  if (fromConfig !== undefined) return parseMode(fromConfig, 'config learning.mode');
  const fromEnv = env.WOLF_LEARNING_MODE;
  if (fromEnv !== undefined && fromEnv !== '') return parseMode(fromEnv, 'env WOLF_LEARNING_MODE');
  return 'suggest';
}
