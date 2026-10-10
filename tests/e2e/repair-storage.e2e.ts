import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

/** Изоляция: tmp XDG (реестр проектов) + срез npm_command (не npx-try-out). */
function isoEnv(dir: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: join(dir, '.wolf', 'cache', 'xdg') };
}

describe('wolf doctor --repair (WP4)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd, isoEnv(cwd)).status).toBe(0);
    expect(
      runCli(
        ['add', '--type', 'note', '--facet', 'context', '--title', 'r1', '--created-by', 'user:t'],
        cwd,
        isoEnv(cwd)
      ).status
    ).toBe(0);
    expect(
      runCli(
        ['add', '--type', 'note', '--facet', 'context', '--title', 'r2', '--created-by', 'user:t'],
        cwd,
        isoEnv(cwd)
      ).status
    ).toBe(0);
    // повреждаем производные/журнальную часть: сносим индекс, откусываем последнюю строку events.jsonl
    const events = join(cwd, '.wolf', 'memory', 'events.jsonl');
    const lines = readFileSync(events, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    writeFileSync(events, lines.slice(0, -1).join('\n') + '\n');
    const index = join(cwd, '.wolf', 'cache', 'index.sqlite');
    if (existsSync(index)) unlinkSync(index);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('repairs index and backfills events', () => {
    const r1 = runCli(['doctor', '--repair'], cwd, isoEnv(cwd));
    expect(r1.status).toBe(0);
    expect(r1.stdout).toContain('rebuild');
    expect(r1.stdout).toContain('backfill 1');
  });

  it('second run is a no-op (idempotent)', () => {
    expect(runCli(['doctor', '--repair'], cwd, isoEnv(cwd)).stdout).toContain('nothing to repair');
  });

  it('delivery works after repair', () => {
    expect(runCli(['call'], cwd, isoEnv(cwd)).status).toBe(0);
  });
});
