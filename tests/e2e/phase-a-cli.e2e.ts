import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('search: superseded marking and --hide-superseded (W3)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd).status).toBe(0);
    expect(
      runCli(['add', '--type', 'decision', '--title', 'alpha decision unique', '--body', 'first'], cwd).status
    ).toBe(0);
    expect(
      runCli(['add', '--type', 'decision', '--title', 'beta decision unique', '--body', 'second'], cwd).status
    ).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  function idOf(line: string): string {
    return line.split(' ')[0];
  }

  it('по умолчанию superseded показывается с пометкой [superseded]', () => {
    const list = runCli(['list', '--type', 'decision'], cwd).stdout.trim().split('\n');
    const oldId = idOf(list[0]);
    const newId = idOf(list[1]);
    expect(runCli(['supersede', oldId, newId], cwd).status).toBe(0);

    const out = runCli(['search', 'decision unique'], cwd).stdout.trim().split('\n');
    const supersededLine = out.find((l) => l.startsWith(oldId));
    const activeLine = out.find((l) => l.startsWith(newId));
    expect(supersededLine).toContain('[superseded]');
    expect(activeLine).not.toContain('[superseded]');
  });

  it('--hide-superseded скрывает superseded объекты', () => {
    const list = runCli(['list', '--type', 'decision'], cwd).stdout.trim().split('\n');
    const oldId = idOf(list[0]);
    const out = runCli(['search', 'decision unique', '--hide-superseded'], cwd).stdout;
    expect(out).not.toContain(oldId);
    expect(out).toContain('beta decision unique');
  });
});

describe('clean CLI errors (W4): одна строка Error:, exit 1, без стека', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  function expectCleanError(r: { stdout: string; stderr: string; status: number | null }, messageRe: RegExp) {
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(messageRe);
    const lines = r.stderr.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Error: /);
    expect(r.stderr).not.toMatch(/\n\s+at /); // без stack trace
  }

  it('unknown field: add --scope на типе без scope', () => {
    const r = runCli(['add', '--type', 'decision', '--title', 'T', '--scope', 'project'], cwd);
    expectCleanError(r, /Unknown field "scope" for type "decision"/);
  });

  it('invalid enum value: rule --scope team', () => {
    const r = runCli(['add', '--type', 'rule', '--title', 'T', '--scope', 'team'], cwd);
    expectCleanError(r, /Type validation failed:.*scope/);
  });

  it('malformed id: supersede', () => {
    const r = runCli(['supersede', 'not-an-id', 'mem_20260829_x_y'], cwd);
    expectCleanError(r, /Malformed memory id/);
  });

  it('несуществующий id: get', () => {
    const r = runCli(['get', 'mem_20260829_nobody_000000'], cwd);
    expectCleanError(r, /Memory object not found: mem_20260829_nobody_000000/);
  });
});

describe('WOLF_ACTOR env в wolf add (W1, e2e-ветка)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('created_by берётся из env, когда флаг не задан', () => {
    process.env.WOLF_ACTOR = 'agent:e2e-worker';
    try {
      const r = runCli(['add', '--type', 'decision', '--title', 'env actor'], cwd);
      expect(r.status).toBe(0);
      const list = runCli(['list', '--type', 'decision'], cwd).stdout.trim().split('\n');
      const id = list[0].split(' ')[0];
      const got = runCli(['get', id], cwd);
      expect(got.stdout).toContain('"created_by": "agent:e2e-worker"');
    } finally {
      delete process.env.WOLF_ACTOR;
    }
  });
});
