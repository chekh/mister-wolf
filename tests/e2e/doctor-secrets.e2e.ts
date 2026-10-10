import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('doctor masks secrets (спека 2.16 §14.5)', () => {
  let cwd: string;
  /** Изоляция: tmp XDG (реестр проектов) + срез npm_command (не npx-try-out). */
  const isoEnv = (): NodeJS.ProcessEnv => {
    const { npm_command: _drop, ...rest } = process.env;
    return { ...rest, XDG_CONFIG_HOME: join(cwd, '.wolf', 'cache', 'xdg') };
  };
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd, isoEnv()).status).toBe(0);
    const dir = join(cwd, 'docs', 'dev', '2026-10-10-x');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'requirements.md'),
      [
        '---',
        'slug: x',
        'status: approved',
        'created: 2026-10-10',
        '---',
        '',
        '- CR-01: sk-live1234567890abcdef rotated',
        '',
      ].join('\n')
    );
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('doctor output never contains the secret', () => {
    const d = runCli(['doctor'], cwd, isoEnv());
    expect(d.stdout).not.toContain('sk-live1234567890abcdef');
    expect(d.stdout).toContain('[redacted]');
  });
});
