import { join } from 'path';
import { existsSync } from 'fs';
import { UserFacingError } from '../../domain/errors.js';

function nonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}

/**
 * Глобальный юзер-конфиг Wolf (спека §3). F26 (sandbox escape): резолв строится
 * ТОЛЬКО на env — fallback на os.homedir() (getpwuid, env-независимый канал побега
 * из песочницы) удалён. Приоритет:
 *   1. WOLF_SANDBOX (корень песочницы) — перебивает XDG/HOME, делает изоляцию
 *      транзитивной для дочерних процессов; несуществующий корень — явный отказ.
 *   2. XDG_CONFIG_HOME → `<xdg>/wolf`.
 *   3. HOME → `$HOME/.config/wolf`.
 *   4. Ничего нет — явный отказ (подозрение песочницы со срезанным env).
 */
export function wolfUserConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  if (nonEmpty(env.WOLF_SANDBOX)) {
    const sandbox = env.WOLF_SANDBOX as string;
    if (!existsSync(sandbox)) {
      throw new UserFacingError(
        `WOLF_SANDBOX is set but does not exist: ${sandbox} — refusing to use it as the sandbox root; create the directory or unset WOLF_SANDBOX`
      );
    }
    return join(sandbox, '.config', 'wolf');
  }
  if (nonEmpty(env.XDG_CONFIG_HOME)) return join(env.XDG_CONFIG_HOME as string, 'wolf');
  if (nonEmpty(env.HOME)) return join(env.HOME as string, '.config', 'wolf');
  throw new UserFacingError(
    'Cannot resolve the Wolf user config directory: none of WOLF_SANDBOX, XDG_CONFIG_HOME, HOME is set. ' +
      'Refusing to fall back to the OS home directory (possible sandbox with a stripped environment); ' +
      'set one of these variables explicitly.'
  );
}
