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
