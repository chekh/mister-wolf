import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { supersedeMemoryObject } from '../../../src/app/use-cases/supersede-memory-object.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('supersedeMemoryObject', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-super-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('marks old object as superseded and logs event', async () => {
    const oldObj = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Old',
        createdBy: 'user:test',
      }
    );
    const newObj = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'New',
        createdBy: 'user:test',
      }
    );

    await supersedeMemoryObject({ store, log, clock, idGen }, oldObj.object.id, newObj.object.id);

    const loaded = await store.get(oldObj.object.id);
    expect(loaded?.status).toBe('superseded');
    expect(loaded?.superseded_by).toBe(newObj.object.id);

    const events = await log.readAll();
    expect(events.some((e) => e.type === 'memory.superseded')).toBe(true);
  });

  it('rejects nonexistent replacement id without writing superseded_by', async () => {
    const oldObj = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Old', createdBy: 'user:test' }
    );

    await expect(
      supersedeMemoryObject({ store, log, clock, idGen }, oldObj.object.id, 'mem_20260824_ghost_abc123')
    ).rejects.toThrow(/mem_20260824_ghost_abc123/);

    const loaded = await store.get(oldObj.object.id);
    expect(loaded?.status).toBe('active');
    expect(loaded?.superseded_by).toBeNull();
  });

  it('rejects malformed ids', async () => {
    await expect(supersedeMemoryObject({ store, log, clock, idGen }, 'garbage-id', 'also_bad')).rejects.toThrow(
      /malformed/i
    );
  });

  it('rejects empty-slug id without hash', async () => {
    await expect(
      supersedeMemoryObject({ store, log, clock, idGen }, 'mem_20260824__', 'mem_20260825_x_abc123')
    ).rejects.toThrow(/malformed/i);
  });

  it('accepts legacy ids with empty slug and valid hash', async () => {
    const legacy = {
      id: 'mem_20260825__16322d',
      type: 'lesson',
      title: 'Легаси-объект с кириллическим заголовком',
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-08-25T12:00:00.000Z',
      updated_at: '2026-08-25T12:00:00.000Z',
      created_by: 'user:test',
      source: { kind: 'manual' },
    } as const;
    await store.save(legacy);
    const newObj = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Replacement', createdBy: 'user:test' }
    );

    await supersedeMemoryObject({ store, log, clock, idGen }, 'mem_20260825__16322d', newObj.object.id);

    const loaded = await store.get('mem_20260825__16322d');
    expect(loaded?.status).toBe('superseded');
    expect(loaded?.superseded_by).toBe(newObj.object.id);
  });

  it('rejects superseding an object with itself', async () => {
    const obj = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Self', createdBy: 'user:test' }
    );

    await expect(supersedeMemoryObject({ store, log, clock, idGen }, obj.object.id, obj.object.id)).rejects.toThrow(
      /same/i
    );

    const loaded = await store.get(obj.object.id);
    expect(loaded?.status).toBe('active');
  });
});
