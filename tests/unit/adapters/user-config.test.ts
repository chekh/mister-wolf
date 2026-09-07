import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { wolfUserConfigDir } from '../../../src/adapters/fs/user-config.js';

// F26: контракт env-изоляции глобального юзер-конфига. OS-homedir fallback
// (getpwuid-канал побега из песочницы) удалён — без XDG/HOME явный отказ.
describe('wolfUserConfigDir (XDG, спека §3 уровень 0)', () => {
  it('honors XDG_CONFIG_HOME', () => {
    expect(wolfUserConfigDir({ XDG_CONFIG_HOME: '/custom/xdg' } as NodeJS.ProcessEnv)).toBe(
      join('/custom/xdg', 'wolf')
    );
  });

  it('falls back to $HOME/.config when XDG_CONFIG_HOME is unset (env HOME, not os.homedir)', () => {
    expect(wolfUserConfigDir({ HOME: '/custom/home' } as NodeJS.ProcessEnv)).toBe(
      join('/custom/home', '.config', 'wolf')
    );
  });

  describe('WOLF_SANDBOX marker (F26: транзитивная изоляция дочерних процессов)', () => {
    it('non-empty marker wins over XDG_CONFIG_HOME and HOME: <sandbox>/.config/wolf', () => {
      const sandbox = mkdtempSync(join(tmpdir(), 'f26-unit-sandbox-'));
      try {
        expect(
          wolfUserConfigDir({
            WOLF_SANDBOX: sandbox,
            XDG_CONFIG_HOME: '/custom/xdg',
            HOME: '/custom/home',
          } as NodeJS.ProcessEnv)
        ).toBe(join(sandbox, '.config', 'wolf'));
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });

    it('marker pointing to a nonexistent path → explicit refusal mentioning WOLF_SANDBOX', () => {
      const base = mkdtempSync(join(tmpdir(), 'f26-unit-missing-'));
      try {
        const missing = join(base, 'definitely-missing');
        expect(() => wolfUserConfigDir({ WOLF_SANDBOX: missing } as NodeJS.ProcessEnv)).toThrowError(/WOLF_SANDBOX/);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });

    it('empty/whitespace marker is ignored — chain continues (XDG wins)', () => {
      expect(wolfUserConfigDir({ WOLF_SANDBOX: '   ', XDG_CONFIG_HOME: '/custom/xdg' } as NodeJS.ProcessEnv)).toBe(
        join('/custom/xdg', 'wolf')
      );
    });
  });

  it('refuses when env has neither WOLF_SANDBOX, XDG_CONFIG_HOME nor HOME (sandbox suspicion)', () => {
    expect(() => wolfUserConfigDir({} as NodeJS.ProcessEnv)).toThrowError(/WOLF_SANDBOX|XDG_CONFIG_HOME/);
  });
});
