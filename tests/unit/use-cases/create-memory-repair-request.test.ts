import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createMemoryRepairRequest } from '../../../src/app/use-cases/create-memory-repair-request.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createMemoryRepairRequest', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-repair-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates info-request tagged solve/memory-repair with expected answer contract', async () => {
    const { object } = await createMemoryRepairRequest(
      { store, log, clock, idGen },
      {
        problem: 'agent keeps using deprecated get command',
        relevantIds: ['rule_old', 'rule_new'],
        createdBy: 'user:test',
      }
    );
    expect(object.type).toBe('info-request');
    expect(object.status).toBe('open');
    expect(object.tags).toEqual(expect.arrayContaining(['solve', 'memory-repair']));
    expect(object.question).toBe('agent keeps using deprecated get command');
    expect(object.detour_reason).toBe('Analyzing stale project memory would derail the active development session.');
    expect(object.expected_answer).toEqual([
      'Diagnosis',
      'Stale or conflicting memory objects',
      'Proposed rule or relation changes',
      'Compact call injection',
    ]);
    expect(object.needed_for).toContain('Create a durable memory correction');
    expect(object.thread).toBeUndefined();
  });

  it('threads the request when thread is given', async () => {
    const { object } = await createMemoryRepairRequest(
      { store, log, clock, idGen },
      { problem: 'p', relevantIds: [], createdBy: 'user:test', thread: 'mem_t1' }
    );
    expect(object.thread).toBe('mem_t1');
  });

  it('records related_to relations for each relevantId instead of dropping them', async () => {
    const appends: unknown[] = [];
    const relations = { append: async (r: unknown) => appends.push(r), list: async () => [] };
    const { object } = await createMemoryRepairRequest(
      { store, log, clock, idGen, relations },
      { problem: 'p', relevantIds: ['rule_old', 'rule_new'], createdBy: 'user:test' }
    );
    const edges = appends as { subject: string; predicate: string; object: string }[];
    expect(edges.filter((e) => e.subject === object.id && e.predicate === 'related_to' && e.object === 'rule_old')).toHaveLength(1);
    expect(edges.filter((e) => e.subject === object.id && e.predicate === 'related_to' && e.object === 'rule_new')).toHaveLength(1);
    // inverse edges recorded too
    expect(edges.filter((e) => e.subject === 'rule_old' && e.object === object.id)).toHaveLength(1);
    expect(edges.filter((e) => e.subject === 'rule_new' && e.object === object.id)).toHaveLength(1);
  });

  it('executes the write under the provided lock', async () => {
    let wraps = 0;
    const lock = { withLock: async <T>(fn: () => Promise<T>): Promise<T> => { wraps++; return fn(); } };
    await createMemoryRepairRequest(
      { store, log, clock, idGen, lock },
      { problem: 'p', relevantIds: [], createdBy: 'user:test' }
    );
    expect(wraps).toBe(1);
  });
});
