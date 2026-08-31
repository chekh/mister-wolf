/**
 * Критерий npx-запуска (спека §3): под npx проверка «wolf на PATH» всегда истинна
 * (шим из _npx-кэша), поэтому критерий — сам факт npx-запуска.
 * Реальный npx ставит npm_command='exec'; 'npx' оставлен для совместимости
 * (старые версии npm/моки окружения).
 */
export function isNpxRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.npm_command === 'npx' || env.npm_command === 'exec';
}
