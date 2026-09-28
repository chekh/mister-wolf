/**
 * Волна 0 0.1 (dogfooding-hardening §4): CLI-канал телеметрии — mcp_call-сигнал
 * с actor='user:cli' вокруг CLI-команд. Обёртка вариадическая: commander вызывает
 * action с (…args, options) — для `get`/`search` первый аргумент позиционный.
 * Телеметрия в try/catch — сбой не ломает команду; sessionId = env WOLF_SESSION.
 */
import { appendMcpCallSignal } from '../../fs/session-metrics-log.js';
import { getWolfVersion } from '../../version.js';
import { resolveSessionId } from '../../../domain/actor.js';

export function withCliCall<TArgs extends unknown[]>(
  command: string,
  action: (...args: TArgs) => Promise<unknown>,
  enrich?: (...args: TArgs) => Record<string, unknown>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    const startedAt = Date.now();
    const detail = (): Record<string, unknown> => ({
      method: command,
      wolf_version: getWolfVersion(),
      cli_command: command,
      ...(enrich?.(...args) ?? {}),
    });
    try {
      await action(...args); // commander игнорирует результат action — возвращать нечего
      try {
        appendMcpCallSignal(process.cwd(), {
          tool: command,
          outcome: 'ok',
          durationMs: Date.now() - startedAt,
          actor: 'user:cli',
          sessionId: resolveSessionId(),
          detail: detail(),
        });
      } catch {
        // телеметрия не должна ломать команду
      }
    } catch (err) {
      try {
        appendMcpCallSignal(process.cwd(), {
          tool: command,
          outcome: 'error',
          durationMs: Date.now() - startedAt,
          actor: 'user:cli',
          sessionId: resolveSessionId(),
          detail: detail(),
          error: {
            message: err instanceof Error ? err.message : String(err),
            code: typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : undefined,
          },
        });
      } catch {
        // телеметрия не должна ломать команду
      }
      throw err;
    }
  };
}
