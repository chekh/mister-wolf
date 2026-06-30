import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createArticle } from '../../../src/app/use-cases/create-article.js';
import { createInfoRequest } from '../../../src/app/use-cases/create-info-request.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';

describe('recordRelation integration', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let relations: JsonlRelationLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-rel-int-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    relations = new JsonlRelationLog(relationsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates answers relation when article references info request', async () => {
    const ireq = await createInfoRequest(
      { store, log, clock, idGen, relations },
      {
        title: 'Question',
        thread: 'thread_1',
        question: 'What?',
        detourReason: 'Reason',
        expectedAnswer: ['Answer'],
        createdBy: 'user:test',
      }
    );
    const article = await createArticle(
      { store, log, clock, idGen, relations },
      {
        title: 'Answer',
        thread: 'thread_1',
        summary: 'Summary',
        body: 'Body',
        answers: [ireq.object.id],
        createdBy: 'user:test',
      }
    );

    const relationList = await relations.list({ subject: article.object.id });
    expect(relationList.map((r) => r.predicate)).toContain('answers');
    expect(relationList.map((r) => r.object)).toContain(ireq.object.id);
  });
});
