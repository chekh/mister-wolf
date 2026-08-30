/**
 * Ф20 (D1.2): детерминированный классификатор ошибок — hot path, без LLM.
 * Спека: docs/superpowers/specs/2026-08-26-self-learning-design.md §2.1 (M20-03/04):
 * error_class_id по таблице; uncategorized — резерв для холодного ErrorClassRefiner
 * (D2, не в D1). Инвариант «запись без LLM» (§9): чистая функция, одинаковый
 * вход → одинаковый id.
 */

export interface ErrorClassRule {
  /** Стабильный id класса; входит в ключ кластеризации Ф21 `tool_name:error_class_id`. */
  id: string;
  /** Подстроки для матчинга (lowercase includes по message+code); порядок правил значим. */
  match: readonly string[];
}

/**
 * Дефолтная таблица классов. Стартовая (~19 классов); калибровка — по доле
 * uncategorized в `wolf learn status` (спека: 20–50 классов, покрытие ≥95%).
 * Порядок значим: более специфичные классы раньше (например, file_not_found
 * матчится раньше tool_not_found: «ENOENT: no such file...» — файл, «spawn ... ENOENT» — тул).
 */
export const DEFAULT_ERROR_CLASS_RULES: readonly ErrorClassRule[] = [
  { id: 'file_not_found', match: ['no such file or directory'] },
  {
    id: 'tool_not_found',
    match: ['enoent', 'command not found', 'not found in path', 'executable not found', 'spawn'],
  },
  { id: 'dependency_missing', match: ['cannot find module', 'module not found', 'npm err'] },
  { id: 'syntax_error', match: ['syntaxerror', 'unexpected token'] },
  {
    id: 'context_overflow',
    match: ['context length', 'context window', 'maximum context', 'prompt is too long', 'too many tokens'],
  },
  { id: 'rate_limit', match: ['rate limit', '429', 'too many requests', 'quota'] },
  { id: 'timeout', match: ['timeout', 'timed out', 'etimedout'] },
  {
    id: 'auth',
    match: ['unauthorized', '401', '403', 'forbidden', 'permission denied', 'eacces', 'api key', 'authentication'],
  },
  {
    id: 'network',
    match: [
      'econnrefused',
      'econnreset',
      'enotfound',
      'eai_again',
      'fetch failed',
      'connection refused',
      'connection reset',
      'network',
    ],
  },
  {
    id: 'invalid_input',
    match: [
      'invalid argument',
      'invalid option',
      'unknown option',
      'missing required',
      'requiredoption',
      'validation',
      'must be',
      'failed to parse',
      'invalid json',
      'invalid yaml',
    ],
  },
  { id: 'conflict', match: ['already exists', 'conflict', 'eexist'] },
  { id: 'busy', match: ['ebusy', 'resource busy', 'locked', 'lock timeout'] },
  { id: 'interrupted', match: ['eintr', 'sigint', 'sigterm', 'aborted', 'cancelled', 'canceled'] },
  { id: 'disk_full', match: ['enospc', 'disk full'] },
  { id: 'broken_pipe', match: ['epipe', 'broken pipe'] },
  { id: 'oom', match: ['out of memory', 'heap out of memory'] },
  {
    id: 'llm_error',
    match: ['overloaded', '503', '500 internal', 'internal server error', 'unexpected server error', 'llm'],
  },
  { id: 'unsupported', match: ['not supported', 'unsupported', 'not implemented'] },
];

export const UNCATEGORIZED_ERROR_CLASS = 'uncategorized';

/**
 * Ошибка → error_class_id. Детерминированно: проектные правила (error_class_taxonomy
 * из .wolf/config.yaml) матчатся раньше дефолтной таблицы; первое совпадение по порядку;
 * нет совпадения — uncategorized.
 */
export function classifyError(
  input: { message?: string; code?: string },
  projectRules: readonly ErrorClassRule[] = []
): string {
  const haystack = `${input.message ?? ''} ${input.code ?? ''}`.toLowerCase();
  for (const rule of [...projectRules, ...DEFAULT_ERROR_CLASS_RULES]) {
    if (rule.match.some((needle) => haystack.includes(needle))) return rule.id;
  }
  return UNCATEGORIZED_ERROR_CLASS;
}
