import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('careful re-init (спека 2.16 §14.6)', () => {
  let cwd: string;
  let agentsBefore: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd).status).toBe(0);
    agentsBefore = readFileSync(join(cwd, 'AGENTS.md'), 'utf-8');
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('non-TTY re-init refuses with a --yes hint and changes nothing', () => {
    const r = runCli(['init'], cwd);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('--yes');
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf-8')).toBe(agentsBefore);
  });

  it('re-init --yes applies the plan without rewriting files', () => {
    const r = runCli(['init', '--yes'], cwd);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Planned changes');
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf-8')).toBe(agentsBefore);
  });

  it('foreign AGENTS.md is not clobbered on re-init --yes', () => {
    writeFileSync(join(cwd, 'AGENTS.md'), '# My project\n\nOwn rules.\n');
    expect(runCli(['init', '--yes'], cwd).status).toBe(0);
    const after = readFileSync(join(cwd, 'AGENTS.md'), 'utf-8');
    expect(after).toContain('# My project');
    expect(after).toContain('<!-- wolf:onboarding');
  });

  it('profile with a user-pinned model line survives re-init --yes untouched (спека §5)', () => {
    const dir = tmpProject();
    expect(runCli(['init', '--full', '--yes'], dir).status).toBe(0);
    const agent = join(dir, '.opencode/agents/mr-wolf.md');
    writeFileSync(agent, `${readFileSync(agent, 'utf-8')}\nmodel: pinned/provider-model\n`);
    expect(runCli(['init', '--full', '--yes'], dir).status).toBe(0);
    expect(readFileSync(agent, 'utf-8')).toContain('model: pinned/provider-model');
    rmSync(dir, { recursive: true, force: true });
  });
});
