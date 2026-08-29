import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { ensureBuilt, cliPath, tmpProject } from './helpers.js';

/**
 * E2E только для ENOENT-ветки: реальный запуск opencode в тестах запрещён.
 * node вызываем по абсолютному пути (process.execPath), PATH подменяем —
 * CLI жив, но spawn('opencode') получает ENOENT.
 */
function runCliWithoutOpencode(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...process.env, PATH: '/nonexistent' },
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

describe('wolf run without opencode in PATH', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('exits 1 with a user-facing error mentioning opencode', () => {
    const dir = tmpProject();
    dirs.push(dir);
    const result = runCliWithoutOpencode(['run', '--agent', 'build', '--title', 't', 'ping'], dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('opencode');
  });
});
