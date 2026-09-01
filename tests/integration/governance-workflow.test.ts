import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../src/app/use-cases/init-project-memory.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { FsProjectInitializer } from '../../src/adapters/fs/fs-project-initializer.js';
import { transitionMemoryObject } from '../../src/app/use-cases/transition-memory-object.js';
import { createWorkThread } from '../../src/app/use-cases/create-work-thread.js';
import { eventsPath } from '../../src/adapters/fs/project-paths.js';

describe('Governance workflow', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-gov-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies agent defaults', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);

    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Agent lesson',
        body: 'Created by an agent.',
        createdBy: 'agent:opencode',
        tags: ['test'],
      }
    );

    expect(object.memory_class).toBe('working');
    expect(object.truth_role).toBe('proposed_knowledge');
    expect(object.lifetime).toBe('long_term');
  });

  it('applies user defaults', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);

    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'User lesson',
        body: 'Created by a user.',
        createdBy: 'user:cli',
        tags: ['test'],
      }
    );

    expect(object.memory_class).toBe('working');
    expect(object.truth_role).toBe('accepted_knowledge');
    expect(object.lifetime).toBe('long_term');
  });

  it('rejects invalid status transitions', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);

    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Archived lesson',
        body: 'Will be archived.',
        createdBy: 'user:cli',
        tags: ['test'],
      }
    );

    await transitionMemoryObject({ store, log, clock, idGen }, object.id, 'archived');
    await expect(transitionMemoryObject({ store, log, clock, idGen }, object.id, 'active')).rejects.toThrow(
      'Invalid transition from archived to active'
    );
  });

  // onboarding v2 §5.1: владелец сознательно откладывает bootstrap-thread
  it('allows active → paused for work-thread', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);

    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const { object } = await createWorkThread(
      { store, log, clock, idGen },
      {
        title: 'Bootstrap: наполнение стартовой памяти',
        goal: 'Свёртка черновиков и завершение онбординга',
        createdBy: 'user:cli',
      }
    );

    await transitionMemoryObject({ store, log, clock, idGen }, object.id, 'paused');

    expect((await store.get(object.id))?.status).toBe('paused');
  });
});
