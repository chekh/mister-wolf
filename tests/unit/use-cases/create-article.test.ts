import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createArticle } from '../../../src/app/use-cases/create-article.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createArticle', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-article-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves a proposed article linked to a thread and info-request', async () => {
    const result = await createArticle(
      { store, log, clock, idGen },
      {
        title: 'Article answering info request',
        thread: 'thread-abc',
        summary: 'Summary of the article',
        body: 'Detailed article body',
        answers: ['info-request-123'],
        supports: [],
        evidence: ['doc-1'],
        createdBy: 'user:chekh',
      }
    );

    expect(result.object.type).toBe('article');
    expect(result.object.title).toBe('Article answering info request');
    expect(result.object.thread).toBe('thread-abc');
    expect(result.object.summary).toBe('Summary of the article');
    expect(result.object.body).toBe('Detailed article body');
    expect(result.object.status).toBe('proposed');
    expect(result.object.review_state).toBe('accepted');
    expect(result.object.answers).toEqual(['info-request-123']);
    expect(result.object.evidence).toEqual(['doc-1']);

    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('article');

    const events = await log.readAll();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('memory.added');
    expect(events[0].payload.memory_id).toBe(result.object.id);
    expect(events[1].type).toBe('memory.added');
    expect(events[1].payload.type).toBe('session-summary');
  });

  it('sets review_state to proposed when created by an agent', async () => {
    const result = await createArticle(
      { store, log, clock, idGen },
      {
        title: 'Agent article',
        thread: 'thread-def',
        summary: 'Agent summary',
        body: 'Agent body',
        createdBy: 'agent:zorg',
      }
    );

    expect(result.object.review_state).toBe('proposed');
    expect(result.object.status).toBe('proposed');
  });
});
