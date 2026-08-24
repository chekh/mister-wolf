import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('relation add via CLI', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function newProject(): string {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init'], dir);
    return dir;
  }

  it('records a relation and writes forward+inverse pair', () => {
    const dir = newProject();
    const r1 = runCli(['relation', 'add', 'mem_a', 'answers', 'mem_q'], dir);
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('Recorded relation');

    const relPath = join(dir, '.wolf/memory/relations.jsonl');
    expect(existsSync(relPath)).toBe(true);
    const lines = readFileSync(relPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const forward = JSON.parse(lines[0]);
    const inverse = JSON.parse(lines[1]);
    expect(forward).toMatchObject({ subject: 'mem_a', predicate: 'answers', object: 'mem_q' });
    expect(inverse).toMatchObject({ subject: 'mem_q', predicate: 'answered_by', object: 'mem_a' });
  });

  it('defaults source to agent and accepts explicit --source manual', () => {
    const dir = newProject();
    runCli(['relation', 'add', 'mem_x', 'related_to', 'mem_y'], dir);
    runCli(['relation', 'add', 'mem_p', 'supports', 'mem_d', '--source', 'manual'], dir);
    const lines = readFileSync(join(dir, '.wolf/memory/relations.jsonl'), 'utf-8').trim().split('\n');
    expect(JSON.parse(lines[0]).source).toBe('agent');
    expect(JSON.parse(lines[2]).source).toBe('manual');
  });

  it('rejects an unknown predicate', () => {
    const dir = newProject();
    const r = runCli(['relation', 'add', 'mem_a', 'loves', 'mem_b'], dir);
    expect(r.status).not.toBe(0);
  });
});
