import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
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

  it('Ф20 (г): ENOENT-ошибка запуска пишет tool_error-сигнал с error_class_id', () => {
    const dir = tmpProject();
    dirs.push(dir);
    const result = runCliWithoutOpencode(['run', '--agent', 'build', '--title', 't', 'ping'], dir);
    expect(result.status).toBe(1);
    const metricsPath = join(dir, '.wolf', 'metrics', 'session-metrics.jsonl');
    expect(existsSync(metricsPath)).toBe(true);
    const records = readFileSync(metricsPath, 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: 'tool_error',
      tool_name: 'opencode',
      error_class_id: 'tool_not_found',
    });
    expect(records[0].gen_ai).toHaveProperty('modelID');
  });
});
