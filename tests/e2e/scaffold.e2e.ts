import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('wolf scaffold (B1)', () => {
  let cwd: string;

  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], cwd).status).toBe(0);
  });

  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('scaffold agent: рамка + playbook + relation owner_skill', () => {
    const r = runCli(['scaffold', 'agent', 'demo-agent', '--persona', 'тест'], cwd);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');

    const framePath = join(cwd, '.opencode', 'agents', 'demo-agent.md');
    expect(existsSync(framePath)).toBe(true);
    const frame = readFileSync(framePath, 'utf-8');
    expect(frame).toContain('agent-id: demo-agent');
    expect(frame).toContain('mode: all');
    expect(frame).toContain('model: zai-coding-plan/glm-5.3');
    expect(frame).toContain('temperature: 0.2');
    expect(frame).toContain('тест');

    const id = r.stdout.match(/Created playbook: (\S+)/)?.[1];
    expect(id).toMatch(/^mem_/);

    const got = runCli(['get', id!], cwd);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"type": "playbook"');
    expect(got.stdout).toContain('"owner_skill": "demo-agent"');
    expect(got.stdout).toContain('"version": "v1"');

    const relations = readFileSync(join(cwd, '.wolf', 'memory', 'relations.jsonl'), 'utf-8');
    expect(relations).toContain('"predicate":"owner_skill"');
    expect(relations).toContain(`"subject":"${id}"`);
    expect(relations).toContain('"object":"agent:demo-agent"');
  });

  it('повторный scaffold того же имени — чистая ошибка, exit 1', () => {
    const r = runCli(['scaffold', 'agent', 'demo-agent'], cwd);
    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toMatch(/^Error: .*already exists$/);
  });

  it('scaffold skill и command пишут в правильные каталоги', () => {
    expect(runCli(['scaffold', 'skill', 'demo-skill'], cwd).status).toBe(0);
    expect(existsSync(join(cwd, '.opencode', 'skills', 'demo-skill', 'SKILL.md'))).toBe(true);

    expect(runCli(['scaffold', 'command', 'demo-cmd'], cwd).status).toBe(0);
    expect(existsSync(join(cwd, '.opencode', 'command', 'demo-cmd.md'))).toBe(true);
  });
});
