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
    const oldObj = await addMemoryObject({ store, log, clock, idGen }, {
      type: 'lesson',
      title: 'Old',
      createdBy: 'user:test',
    });
    const newObj = await addMemoryObject({ store, log, clock, idGen }, {
      type: 'lesson',
      title: 'New',
      createdBy: 'user:test',
    });

    await supersedeMemoryObject({ store, log, clock, idGen }, oldObj.object.id, newObj.object.id);

    const loaded = await store.get(oldObj.object.id);
    expect(loaded?.status).toBe('superseded');
    expect(loaded?.superseded_by).toBe(newObj.object.id);

    const events = await log.readAll();
    expect(events.some((e) => e.type === 'memory.superseded')).toBe(true);
  });
});
