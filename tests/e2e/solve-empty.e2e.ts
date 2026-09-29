import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

/** 2.13: init сеет 7 плейбук-notes — вычищаем посев для деградации на пустой памяти. */
function wipeSeed(dir: string): void {
  const notesDir = join(dir, '.wolf', 'memory', 'shared', 'notes');
  if (existsSync(notesDir)) {
    for (const f of readdirSync(notesDir)) {
      if (f.endsWith('.md')) rmSync(join(notesDir, f));
    }
  }
  rmSync(join(dir, '.wolf', 'memory', 'threads'), { recursive: true, force: true });
  // stale SQLite-индекс выдаёт удалённые объекты в search/solve — сносим целиком
  rmSync(join(dir, '.wolf', 'cache'), { recursive: true, force: true });
}

describe('solve on empty memory degrades gracefully', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('solve on empty memory degrades gracefully', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    wipeSeed(dir);

    const solve = runCli(['solve', 'anything at all'], dir);
    expect(solve.status).toBe(0);
    expect(solve.stdout).toContain('No relevant memory found');

    const call = runCli(['call', '--for', 'x'], dir);
    expect(call.status).toBe(0);
    expect(call.stdout).toContain('No active call injections.');
  });
});
