import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { homedir } from 'os';
import { wolfUserConfigDir } from '../../../src/adapters/fs/user-config.js';

describe('wolfUserConfigDir (XDG, спека §3 уровень 0)', () => {
  it('honors XDG_CONFIG_HOME', () => {
    expect(wolfUserConfigDir({ XDG_CONFIG_HOME: '/custom/xdg' } as NodeJS.ProcessEnv)).toBe(
      join('/custom/xdg', 'wolf')
    );
  });

  it('falls back to ~/.config when XDG_CONFIG_HOME is unset', () => {
    expect(wolfUserConfigDir({} as NodeJS.ProcessEnv)).toBe(join(homedir(), '.config', 'wolf'));
  });

  it('falls back to ~/.config when XDG_CONFIG_HOME is empty/whitespace', () => {
    expect(wolfUserConfigDir({ XDG_CONFIG_HOME: '   ' } as NodeJS.ProcessEnv)).toBe(join(homedir(), '.config', 'wolf'));
  });
});
