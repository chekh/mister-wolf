import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('wolf learn (Ф21)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('digest: паттерн после 3 жалоб; status: счётчики и порог; patterns.jsonl — 1 запись', () => {
    for (let i = 1; i <= 3; i++) {
      const r = runCli(
        ['complain', '--about', 'skill:demo', '--rule', 'r', '--proposal', 'p', '--text', `жалоба ${i}`],
        cwd
      );
      expect(r.status).toBe(0);
    }

    const digest = runCli(['learn', 'digest'], cwd);
    expect(digest.status).toBe(0);
    expect(digest.stdout).toContain('complaint:skill:demo');

    const status = runCli(['learn', 'status'], cwd);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain('events: 3');
    expect(status.stdout).toContain('threshold: 3');

    const patterns = readFileSync(join(cwd, '.wolf/metrics/patterns.jsonl'), 'utf-8');
    expect(patterns.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(patterns.trim())).toMatchObject({
      event: 'pattern',
      key: 'complaint:skill:demo',
      count: 3,
      threshold: 3,
    });
  });
});
