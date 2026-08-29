/** Приоритет actor-атрибуции мутаций: явный флаг CLI > env WOLF_ACTOR > "user:cli". */
export function resolveCreatedBy(flag: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  if (flag && flag.trim() !== '') return flag;
  const fromEnv = env.WOLF_ACTOR;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return 'user:cli';
}
