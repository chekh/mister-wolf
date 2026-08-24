import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeTaskBrief(id: string): MemoryObject {
  return {
    id,
    type: 'task-brief',
    title: 'Batch task',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: [],
    superseded_by: null,
    body: '...',
    executor: 'executor-lead',
    priority: 'high',
  };
}

describe('transitionMemoryObject', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-transition-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies allowed transitions', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Governance test', body: '...', createdBy: 'user:test' }
    );

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'stale');
    const stale = await store.get(added.object.id);
    expect(stale?.status).toBe('stale');

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'active');
    const active = await store.get(added.object.id);
    expect(active?.status).toBe('active');
  });

  it('rejects invalid transitions', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Governance test', body: '...', createdBy: 'user:test' }
    );

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'superseded');
    await expect(transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'active')).rejects.toThrow(
      'Invalid transition'
    );
  });

  it('rejects active to accepted transition', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Transition test', body: '...', createdBy: 'user:test' }
    );

    await expect(transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'accepted')).rejects.toThrow(
      'Invalid transition from active to accepted'
    );
  });

  it('rejects globally allowed transition outside type lifecycle (task-brief active -> open)', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const id = idGen.generateMemoryId(clock.now(), 'Batch task');
    await store.save(makeTaskBrief(id));

    await expect(transitionMemoryObject({ store, log, clock, idGen }, id, 'open')).rejects.toThrow(/lifecycle/);
  });

  it('allows transition within type lifecycle (task-brief active -> completed)', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const id = idGen.generateMemoryId(clock.now(), 'Batch task');
    await store.save(makeTaskBrief(id));

    await transitionMemoryObject({ store, log, clock, idGen }, id, 'completed');
    const updated = await store.get(id);
    expect(updated?.status).toBe('completed');
  });
});
