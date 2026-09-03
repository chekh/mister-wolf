/**
 * Ф22 (D2.1): механические советы по классам ошибок — детерминированная таблица,
 * без LLM (инвариант записи §9). Дефолтный режим генерации draft'ов
 * propose→validate→activate работает на ней; «обязательный LLM-слой» генерации
 * отклонён (спека §2.3, §7): LLM подключается позже за интерфейсом DraftGenerator.
 * Спека: docs/superpowers/specs/2026-08-26-self-learning-design.md §2.3, §7.
 */

/** id класса ошибки (DEFAULT_ERROR_CLASS_RULES + 'uncategorized') → императив. */
export const MECHANICAL_ADVICE: Readonly<Record<string, string>> = {
  file_not_found: 'check the path exists before accessing it (existsSync/Glob), do not guess the path',
  tool_not_found: 'verify the tool is available before calling it (which <tool> / <tool> --version)',
  dependency_missing: 'check dependencies before running (npm ls / require check) and install them explicitly',
  syntax_error: 'run the compiler/linter before executing and fix the syntax from the first error',
  context_overflow: 'do not read files whole without a limit — slice reads (offset/limit) and compact the context',
  rate_limit: 'wrap external calls with retry and backoff on 429/quota',
  timeout: 'set an explicit timeout and handle it with retry and backoff, do not wait forever',
  auth: 'check credentials/token availability before calling a protected API',
  network: 'handle network failures with retry and backoff and verify endpoint reachability before work',
  invalid_input: 'validate input with a schema before use and pass arguments in the command’s exact format',
  conflict: 'check the target object exists before creating and make the operation idempotent',
  busy: 'do not touch a locked resource — wait for the lock to release or work around it',
  interrupted: 'handle SIGINT/SIGTERM correctly and make long operations interruptible',
  disk_full: 'check free space and clean temporary files before large writes',
  broken_pipe: 'check the output consumer is alive and handle EPIPE without crashing the process',
  oom: 'do not load large data into memory whole — stream and process in chunks',
  llm_error: 'wrap LLM calls with retry on 5xx/overloaded',
  unsupported: 'do not use an unsupported operation — find a supported equivalent in the docs',
  uncategorized:
    'extract the exact cause from the error message and register a class in the project’s error_class_taxonomy',
};

/** Совет по error_class_id; null — класс неизвестен таблице. */
export function mechanicalAdviceFor(errorClassId: string): string | null {
  return MECHANICAL_ADVICE[errorClassId] ?? null;
}
