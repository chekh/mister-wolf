import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createInfoRequest } from '../../../src/app/use-cases/create-info-request.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createInfoRequest', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-info-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves an open info-request linked to a thread', async () => {
    const result = await createInfoRequest(
      { store, log, clock, idGen },
      {
        title: 'Missing schema field docs',
        thread: 'thread-abc',
        question: 'Where is the schema field documented?',
        detourReason: 'Blocked on implementation',
        neededFor: ['thread-abc'],
        expectedAnswer: ['Link to docs'],
        preliminaryAnswer: 'Maybe in README',
        createdBy: 'user:chekh',
      }
    );

    expect(result.object.type).toBe('info-request');
    expect(result.object.title).toBe('Missing schema field docs');
    expect(result.object.thread).toBe('thread-abc');
    expect(result.object.question).toBe('Where is the schema field documented?');
    expect(result.object.status).toBe('open');
    expect(result.object.review_state).toBe('accepted');
    expect(result.object.detour_reason).toBe('Blocked on implementation');
    expect(result.object.needed_for).toEqual(['thread-abc']);
    expect(result.object.expected_answer).toEqual(['Link to docs']);
    expect(result.object.preliminary_answer).toBe('Maybe in README');

    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('info-request');

    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
  });

  it('sets review_state to proposed when created by an agent', async () => {
    const result = await createInfoRequest(
      { store, log, clock, idGen },
      {
        title: 'Agent info request',
        thread: 'thread-def',
        question: 'What is the validation rule?',
        detourReason: 'Need clarification',
        expectedAnswer: ['Rule description'],
        createdBy: 'agent:zorg',
      }
    );

    expect(result.object.review_state).toBe('proposed');
  });

  it('throws when detourReason is empty', async () => {
    await expect(
      createInfoRequest(
        { store, log, clock, idGen },
        {
          title: 'Invalid request',
          thread: 'thread-ghi',
          question: 'What?',
          detourReason: '   ',
          expectedAnswer: ['Something'],
          createdBy: 'user:chekh',
        }
      )
    ).rejects.toThrow('detour_reason is required');
  });

  it('throws when expectedAnswer is empty', async () => {
    await expect(
      createInfoRequest(
        { store, log, clock, idGen },
        {
          title: 'Invalid request',
          thread: 'thread-jkl',
          question: 'What?',
          detourReason: 'Need info',
          expectedAnswer: [],
          createdBy: 'user:chekh',
        }
      )
    ).rejects.toThrow('expected_answer must contain at least one item');
  });
});
