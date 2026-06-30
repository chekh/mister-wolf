import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createSessionCheckpoint } from '../../../src/app/use-cases/create-session-checkpoint.js';
import { createWorkThread } from '../../../src/app/use-cases/create-work-thread.js';
import { createInfoRequest } from '../../../src/app/use-cases/create-info-request.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createSessionCheckpoint', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-cp-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('captures thread state and related artifacts', async () => {
    const thread = await createWorkThread(
      { store, log, clock, idGen },
      { title: 'T', goal: 'G', currentState: 'Initial', createdBy: 'user:test' }
    );
    const ireq = await createInfoRequest(
      { store, log, clock, idGen },
      {
        title: 'Q',
        thread: thread.object.id,
        question: 'What?',
        detourReason: 'R',
        expectedAnswer: ['A'],
        createdBy: 'user:test',
      }
    );

    const checkpoint = await createSessionCheckpoint(
      { store, log, clock, idGen },
      { threadId: thread.object.id, createdBy: 'user:test' }
    );

    expect(checkpoint.object.type).toBe('session-checkpoint');
    expect(checkpoint.object.thread).toBe(thread.object.id);
    expect(checkpoint.object.captured_state.thread_current_state).toBe('Initial');
    expect(checkpoint.object.captured_state.related_ids).toContain(ireq.object.id);
  });
});
