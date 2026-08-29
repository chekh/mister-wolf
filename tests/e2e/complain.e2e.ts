import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('wolf complain (B3)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('жалоба: объект с about/trigger, relation complain, get отдаёт JSON', () => {
    const r = runCli(['complain', '--about', 'skill:apprentice', '--text', 'агент пропускает шаги плана'], cwd);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Complaint recorded: ');
    const id = r.stdout.trim().split('\n')[0].split(': ')[1];
    expect(id).toMatch(/^mem_/);

    const relations = readFileSync(join(cwd, '.wolf/memory/relations.jsonl'), 'utf-8');
    expect(relations).toContain('"predicate":"complain"');
    expect(relations).toContain(`"subject":"${id}"`);
    expect(relations).toContain('"object":"skill:apprentice"');

    const got = runCli(['get', id], cwd);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"type": "observation"');
    expect(got.stdout).toContain('"about": "skill:apprentice"');
    expect(got.stdout).toContain('"trigger": true');
  });
});
