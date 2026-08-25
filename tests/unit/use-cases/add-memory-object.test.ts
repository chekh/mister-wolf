import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('addMemoryObject', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-add-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves a lesson and appends an event', async () => {
    const result = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Router reconnect failure mode',
        body: 'We found...',
        createdBy: 'user:chekh',
        tags: ['router'],
      }
    );

    expect(result.object.id).toMatch(/^mem_/);
    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();

    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
  });

  it('creates typed object with extra fields validated by declaration', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'task-brief',
        title: 'Batch task',
        createdBy: 'user:test',
        extra: { executor: 'executor-lead', priority: 'high' },
      }
    );
    expect(object.executor).toBe('executor-lead');
    expect(object.priority).toBe('high');
  });

  it('rejects unknown extra field', async () => {
    await expect(
      addMemoryObject(
        { store, log, clock, idGen },
        { type: 'task-brief', title: 'Bad', createdBy: 'user:test', extra: { nonsense: 'x' } }
      )
    ).rejects.toThrow(/nonsense/);
  });

  it('rejects missing declared field at creation', async () => {
    await expect(
      addMemoryObject(
        { store, log, clock, idGen },
        { type: 'task-brief', title: 'No executor', createdBy: 'user:test' }
      )
    ).rejects.toThrow(/executor/i);
  });

  it('defaults status to the declaration lifecycle head for types without active', async () => {
    const cases = [
      ['council-opinion', 'proposed', { vote: 'A' }],
      ['synthesis', 'proposed', { recommendation: 'Ship it' }],
      ['escalation', 'open', { question: 'What broke?' }],
      ['decision-request', 'open', { question: 'Which option?' }],
      ['council-question', 'open', { question: 'Your take?' }],
    ] as const;
    for (const [type, expected, extra] of cases) {
      const { object } = await addMemoryObject(
        { store, log, clock, idGen },
        { type, title: `t-${type}`, createdBy: 'user:test', extra: { ...extra } }
      );
      expect(object.status).toBe(expected);
    }
  });

  it('creates question types in their semantic start status open', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'open-question', title: 'Which approach?', createdBy: 'user:test' }
    );
    expect(object.status).toBe('open');
  });

  it('decision still defaults to active', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'decision', title: 'Use SQLite', createdBy: 'user:test' }
    );
    expect(object.status).toBe('active');
  });

  it('explicit status still wins over the lifecycle default', async () => {
    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'council-opinion', title: 't-vote', createdBy: 'user:test', status: 'accepted', extra: { vote: 'A' } }
    );
    expect(object.status).toBe('accepted');
  });
});
