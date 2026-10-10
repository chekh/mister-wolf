import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../src/adapters/fs/project-paths.js';

/** Изоляция: tmp XDG (реестр проектов) + срез npm_command (не npx-try-out). */
function isoEnv(dir: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: join(dir, '.wolf', 'cache', 'xdg') };
}

describe('write integrity (спека 2.16 §14.9)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    expect(runCli(['init'], cwd, isoEnv(cwd)).status).toBe(0);
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  const idOf = (out: string): string => out.match(/mem_\S+/)?.[0] ?? '';

  it('id collision does not overwrite the existing object', async () => {
    const a = runCli(
      [
        'add',
        '--type',
        'note',
        '--facet',
        'context',
        '--title',
        'Dup Title',
        '--body',
        'first body',
        '--created-by',
        'user:t',
      ],
      cwd,
      isoEnv(cwd)
    );
    expect(a.status).toBe(0);
    const id = idOf(a.stdout);
    // Отклонение от листинга: коллизия id через spawn-CLI недостижима — хэш
    // включает created_at до мс (прецедент add-collision-guard.e2e.ts:2-3),
    // поэтому второй add — in-process с фиксированным clock = created_at
    // первого объекта (тот же детерминизм, guard тот же).
    const created = JSON.parse(runCli(['get', id], cwd, isoEnv(cwd)).stdout);
    const deps = {
      store: new MarkdownMemoryStore(cwd),
      log: new JsonlEventLog(eventsPath(cwd)),
      clock: { now: () => new Date(created.created_at) },
      idGen: new HashIdGenerator(),
    };
    let err: unknown;
    await addMemoryObject(deps, {
      type: 'note',
      facet: 'context',
      title: 'Dup Title',
      body: 'second body',
      createdBy: 'user:t',
    }).catch((e) => {
      err = e;
    });
    expect((err as Error).message).toContain('already exists');
    const g = runCli(['get', id], cwd, isoEnv(cwd));
    expect(g.stdout).toContain('first body');
    expect(g.stdout).not.toContain('second body');
  });

  it('proposed does not reach call', () => {
    const r = runCli(
      [
        'add',
        '--type',
        'note',
        '--facet',
        'context',
        '--title',
        'Secret Proposed Fact',
        '--set',
        'status=proposed',
        '--created-by',
        'user:t',
      ],
      cwd,
      isoEnv(cwd)
    );
    expect(r.status).toBe(0);
    const c = runCli(['call'], cwd, isoEnv(cwd));
    expect(c.status).toBe(0);
    expect(c.stdout).not.toContain('Secret Proposed Fact');
  });

  it('supersede cycle is rejected', () => {
    const a = runCli(
      ['add', '--type', 'note', '--facet', 'context', '--title', 'Cyc A', '--created-by', 'user:t'],
      cwd,
      isoEnv(cwd)
    );
    const b = runCli(
      ['add', '--type', 'note', '--facet', 'context', '--title', 'Cyc B', '--created-by', 'user:t'],
      cwd,
      isoEnv(cwd)
    );
    const idA = idOf(a.stdout);
    const idB = idOf(b.stdout);
    expect(runCli(['supersede', idA, idB], cwd, isoEnv(cwd)).status).toBe(0);
    const cyc = runCli(['supersede', idB, idA], cwd, isoEnv(cwd));
    expect(cyc.status).not.toBe(0);
    expect(cyc.stderr).toContain('cycle');
    expect(runCli(['get', idB], cwd, isoEnv(cwd)).stdout).not.toContain(idA);
  });
});
