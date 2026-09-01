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

    const list = runCli(['rule', 'list'], cwd);
    expect(list.stdout).toContain('[active] [project] Use strict mode');
  });

  it('rejects invalid scope value', () => {
    const r = runCli(['add', '--type', 'rule', '--title', 'Bad scope', '--body', 'B', '--scope', 'team'], cwd);
    expect(r.status).not.toBe(0);
  });

  it('rejects --scope on type without scope field', () => {
    const r = runCli(['add', '--type', 'lesson', '--title', 'No scope here', '--body', 'B', '--scope', 'project'], cwd);
    expect(r.status).not.toBe(0);
  });
});
