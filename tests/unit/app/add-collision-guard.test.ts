import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, statSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';

// P300/2.14 §5.1: фиксированный clock — два add с одним timestamp дают
// идентичный детерминированный id (HashIdGenerator: slug+date.toISOString())
const fixedClock = { now: () => new Date('2026-09-30T12:00:00.000Z') };

/** Снапшот всех .md под .wolf/memory: path → содержимое. */
function snapshotMemoryFiles(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) out.set(full, readFileSync(full, 'utf-8'));
    }
  };
  const memRoot = join(dir, '.wolf', 'memory');
  if (statSync(memRoot, { throwIfNoEntry: false })) walk(memRoot);
  return out;
}

describe('addMemoryObject collision guard (P300/2.14 §5.1)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-add-collision-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('второй add того же title → UserFacingError, без перезаписи и лишних событий', async () => {
    const deps = { store, log, clock: fixedClock, idGen: new HashIdGenerator() };
    const first = await addMemoryObject(deps, {
      type: 'lesson',
      title: 'Router reconnect failure mode',
      body: 'original body',
      createdBy: 'user:test',
    });

    const before = snapshotMemoryFiles(dir);
    let err: unknown;
    await addMemoryObject(deps, {
      type: 'lesson',
      title: 'Router reconnect failure mode',
      body: 'overwriting body',
      createdBy: 'user:test',
    }).catch((e) => {
      err = e;
    });

    expect(err).toBeInstanceOf(UserFacingError);
    const msg = (err as Error).message;
    expect(msg).toContain('already exists');
    expect(msg).toContain('wolf edit');
    expect(msg).toContain('wolf supersede');
    expect(msg).toContain('--title');

    expect(await store.list()).toHaveLength(1);
    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');

    const after = snapshotMemoryFiles(dir);
    expect(after.size).toBe(before.size);
    for (const [path, content] of before) expect(after.get(path)).toBe(content);
    expect(first.object.id).toMatch(/^mem_/);
  });

  // 2.32.0 (Q1/Q2): slug даёт агент-создатель, id = slug+дата; два разных
  // заголовка с одним slug — не дубль, а коллизия → детерминированный tie-break.
  it('одинаковый slug у разных title → tie-break -2, а не отказ (Q2)', async () => {
    const deps = { store, log, clock: fixedClock, idGen: new HashIdGenerator() };
    const first = await addMemoryObject(deps, {
      type: 'lesson',
      title: 'A'.repeat(60) + 'one',
      slug: 'shared-lesson-slug',
      createdBy: 'user:test',
    });
    const second = await addMemoryObject(deps, {
      type: 'lesson',
      title: 'A'.repeat(60) + 'two',
      slug: 'shared-lesson-slug',
      createdBy: 'user:test',
    });
    expect(second.object.id).toBe(`${first.object.id}-2`);
    expect(await store.list()).toHaveLength(2);
  });

  it('сообщение содержит фактический id первого объекта', async () => {
    const deps = { store, log, clock: fixedClock, idGen: new HashIdGenerator() };
    const { object } = await addMemoryObject(deps, {
      type: 'decision',
      title: 'Release 2.14 plan',
      createdBy: 'user:test',
    });

    await expect(
      addMemoryObject(deps, {
        type: 'decision',
        title: 'Release 2.14 plan',
        createdBy: 'user:test',
      })
    ).rejects.toThrow(object.id);
  });
});
