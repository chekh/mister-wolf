import { describe, it, expect } from 'vitest';
import { rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

/** Изоляция: tmp XDG (реестр проектов) + срез npm_command (не npx-try-out). */
function isoEnv(dir: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: join(dir, '.wolf', 'cache', 'xdg') };
}

describe('init writes .gitignore wolf block (WP4)', () => {
  it('block present and idempotent on re-init --yes', () => {
    const dir = tmpProject();
    expect(runCli(['init'], dir, isoEnv(dir)).status).toBe(0);
    const g = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(g).toContain('# wolf-gitignore:v1');
    expect(g).toContain('.wolf/cache/');
    expect(runCli(['init', '--yes'], dir, isoEnv(dir)).status).toBe(0);
    const g2 = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect((g2.match(/# wolf-gitignore:v1/g) ?? []).length).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});
