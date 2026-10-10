import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('init 2.0: минимальный набор (спека 2.16 §14.3)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('minimal init: .wolf skeleton + config + AGENTS.md marker, no base set', () => {
    expect(runCli(['init'], cwd).status).toBe(0);
    expect(existsSync(join(cwd, '.wolf', 'config.yaml'))).toBe(true);
    expect(existsSync(join(cwd, '.wolf', 'memory'))).toBe(true);
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf-8')).toContain('<!-- wolf:onboarding');
    expect(existsSync(join(cwd, '.opencode', 'agents'))).toBe(false);
    expect(existsSync(join(cwd, '.opencode', 'skills'))).toBe(false);
  });

  it('--full renders the base set', () => {
    const dir = tmpProject();
    expect(runCli(['init', '--full'], dir).status).toBe(0);
    expect(existsSync(join(dir, '.opencode', 'agents', 'mr-wolf.md'))).toBe(true);
    expect(existsSync(join(dir, '.opencode', 'skills', 'wolf-sdd'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
