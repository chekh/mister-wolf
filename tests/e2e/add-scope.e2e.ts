import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('generic add supports --scope for types that declare one', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('creates a rule via generic add --scope project', () => {
    const init = runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], cwd);
    expect(init.status).toBe(0);

    const r = runCli(
      ['add', '--type', 'rule', '--title', 'Use strict mode', '--body', 'Enable TS strict.', '--scope', 'project'],
      cwd
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Created memory object:');

    // 2.13 §6.3: генерённый `rule list` — формат единого list-пути
    const list = runCli(['rule', 'list'], cwd);
    expect(list.stdout).toContain('[rule] [active] Use strict mode');
  });

  it('stores scope value as-is (2.16 §6.2: scope is a passthrough string, not an enum)', () => {
    const r = runCli(
      ['add', '--type', 'rule', '--title', 'Worktree scope', '--body', 'B', '--scope', 'worktree:wave-216'],
      cwd
    );
    expect(r.status).toBe(0);
    const id = r.stdout.match(/Created memory object: (\S+)/)![1];
    const got = runCli(['get', id], cwd);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"scope": "worktree:wave-216"');
  });

  it('rejects --scope on type without scope field', () => {
    const r = runCli(['add', '--type', 'lesson', '--title', 'No scope here', '--body', 'B', '--scope', 'project'], cwd);
    expect(r.status).not.toBe(0);
  });
});
