import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWorkThread } from '../../../src/app/use-cases/create-work-thread.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createWorkThread', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-thread-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves an active work-thread with title and goal', async () => {
    const result = await createWorkThread(
      { store, log, clock, idGen },
      {
        title: 'Implement phase 1 thread object',
        goal: 'Create work-thread use-case and tests',
        createdBy: 'user:chekh',
      }
    );

    expect(result.object.type).toBe('work-thread');
    expect(result.object.title).toBe('Implement phase 1 thread object');
    expect(result.object.goal).toBe('Create work-thread use-case and tests');
    expect(result.object.status).toBe('active');
    expect(result.object.review_state).toBe('accepted');

    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('work-thread');

    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
  });

  it('sets review_state to proposed when created by an agent', async () => {
    const result = await createWorkThread(
      { store, log, clock, idGen },
      {
        title: 'Agent-initiated thread',
        goal: 'Verify agent review state',
        currentState: 'in progress',
        nextSteps: ['step one', 'step two'],
        createdBy: 'agent:zorg',
      }
    );

    expect(result.object.review_state).toBe('proposed');
    expect(result.object.current_state).toBe('in progress');
    expect(result.object.next_steps).toEqual(['step one', 'step two']);
  });
});
