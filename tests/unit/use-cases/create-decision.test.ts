import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDecision } from '../../../src/app/use-cases/create-decision.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createDecision', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-decision-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves an active decision with body and optional thread', async () => {
    const result = await createDecision(
      { store, log, clock, idGen },
      {
        title: 'Use SQLite FTS5 for search',
        body: 'SQLite FTS5 gives fast full-text search without an external service.',
        thread: 'thread-123',
        createdBy: 'user:chekh',
      }
    );

    expect(result.object.type).toBe('decision');
    expect(result.object.title).toBe('Use SQLite FTS5 for search');
    expect(result.object.body).toBe('SQLite FTS5 gives fast full-text search without an external service.');
    expect(result.object.status).toBe('active');
    expect(result.object.confidence).toBe('medium');
    expect(result.object.importance).toBe(0.7);
    expect(result.object.review_state).toBe('accepted');
    expect(result.object.thread).toBe('thread-123');

    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('decision');

    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
  });

  it('sets review_state to proposed when created by an agent', async () => {
    const result = await createDecision(
      { store, log, clock, idGen },
      {
        title: 'Agent-proposed decision',
        body: 'This decision was proposed by an agent.',
        createdBy: 'agent:zorg',
      }
    );

    expect(result.object.review_state).toBe('proposed');
    expect(result.object.created_by).toBe('agent:zorg');
  });
});
