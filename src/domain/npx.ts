/**
 * Критерий npx-запуска (спека §3): под npx проверка «wolf на PATH» всегда истинна
 * (шим из _npx-кэша), поэтому критерий — сам факт npx-запуска: npm ставит npm_command='npx'.
 */
export function isNpxRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.npm_command === 'npx';
}
