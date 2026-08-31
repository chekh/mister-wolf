import { join } from 'path';
import { homedir } from 'os';

/** Глобальный юзер-конфиг Wolf: `$XDG_CONFIG_HOME/wolf`, по умолчанию `~/.config/wolf` (спека §3). */
export function wolfUserConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== '' ? env.XDG_CONFIG_HOME : join(homedir(), '.config');
  return join(xdg, 'wolf');
}
