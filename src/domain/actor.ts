import { randomUUID } from 'crypto';

/** Приоритет actor-атрибуции мутаций: явный флаг CLI > env WOLF_ACTOR > fallback. */
export function resolveCreatedBy(
  flag: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  fallback: string = 'user:cli'
): string {
  if (flag && flag.trim() !== '') return flag;
  const fromEnv = env.WOLF_ACTOR;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return fallback;
}

/** P2 D4: session-связка авто-писателей memory_stage — env WOLF_SESSION (харнес выставляет
 * на сессию агента); null — вне сессии. Симметрия с WOLF_ACTOR. */
export function resolveSessionId(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env.WOLF_SESSION;
  return s && s.trim() !== '' ? s : null;
}

/** Волна 0 (0.2): продюсер session-ключа CLI-канала. Один вызов CLI-процесса = один
 * стабильный id: без WOLF_SESSION генерирует `cli-<uuid>` и запоминает в env (все
 * writers процесса получают один id). Явно выставленный env не перезаписывается.
 * MCP-канал не вызывает продюсер: long-lived процесс, один env на все запросы =
 * фальшивая сессия. */
export function ensureCliSessionId(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.WOLF_SESSION;
  if (s && s.trim() !== '') return s;
  const id = `cli-${randomUUID()}`;
  env.WOLF_SESSION = id;
  return id;
}
