// tests/unit/global-registry-isolation.test.ts
// F16 (спека 2.1.0 §2.4): инвариант XDG-изоляции — тестовый прогон не трогает
// реальный ~/.config/wolf/projects.yaml; реестр пишется под TEST_XDG (tests/setup.ts).
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { existsSync, readFileSync, mkdtempSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { ProjectsRegistry } from '../../src/adapters/fs/projects-registry.js';
import { wolfUserConfigDir } from '../../src/adapters/fs/user-config.js';
import { TEST_XDG } from '../setup.js';

describe('F16: изоляция глобального реестра (XDG_CONFIG_HOME в тестах)', () => {
  it('register пишет под TEST_XDG и не меняет реальный ~/.config/wolf/projects.yaml', async () => {
    const real = join(homedir(), '.config', 'wolf', 'projects.yaml');
    const before = existsSync(real) ? createHash('sha256').update(readFileSync(real)).digest('hex') : null; // файла нет — сравнение пропускаем, изоляцию проверяет вторая половина

    const registry = new ProjectsRegistry(wolfUserConfigDir());
    await registry.register(mkdtempSync(join(tmpdir(), 'wolf-iso-')), 2);

    if (before !== null) {
      expect(createHash('sha256').update(readFileSync(real)).digest('hex')).toBe(before);
    }
    // файл реестра лёг под тестовый XDG — изоляция работает
    expect(wolfUserConfigDir()).toBe(join(TEST_XDG, 'wolf'));
    expect(existsSync(join(TEST_XDG, 'wolf', 'projects.yaml'))).toBe(true);
  });
});
