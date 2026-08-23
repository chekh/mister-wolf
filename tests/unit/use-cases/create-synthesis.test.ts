import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createSynthesis } from '../../../src/app/use-cases/create-synthesis.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath, relationsPath, objectsDir } from '../../../src/adapters/fs/project-paths.js';

describe('createSynthesis', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;
  let relations: JsonlRelationLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-synth-'));
    mkdirSync(objectsDir(dir), { recursive: true });
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
    relations = new JsonlRelationLog(relationsPath(dir));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function saveOpinion(id: string, voter: string, vote: string) {
    const obj: any = {
      id,
      type: 'council-opinion',
      title: `Opinion ${id}`,
      status: 'proposed',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:00:00Z',
      created_by: voter,
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      body: '',
      memory_class: 'working',
      truth_role: 'proposed_knowledge',
      lifetime: 'short_term',
      vote,
    };
    await store.save(obj);
  }

  async function addAnswerRelation(subject: string, object: string) {
    await relations.append({
      id: idGen.generateEventId(new Date()),
      subject,
      predicate: 'answers',
      object,
      created_at: '2026-08-23T00:00:00Z',
      source: 'agent',
      confidence: 'high',
    });
  }

  it('creates synthesis with proposed status and based_on relations', async () => {
    await saveOpinion('op1', 'agent:A', 'A');
    await saveOpinion('op2', 'agent:B', 'B');
    await addAnswerRelation('op1', 'q1');
    await addAnswerRelation('op2', 'q1');

    const { object: synth, relatedOpinions } = await createSynthesis(
      { store, log, clock, idGen, relations },
      { questionId: 'q1', recommendation: 'Go with A', createdBy: 'user:test' }
    );

    expect(synth.type).toBe('synthesis');
    expect(synth.status).toBe('proposed');
    expect(synth.recommendation).toBe('Go with A');
    expect(relatedOpinions).toEqual(['op1', 'op2']);

    const basedOn = await relations.list({ subject: synth.id, predicate: 'based_on' });
    expect(basedOn).toHaveLength(2);
    expect(basedOn.map((r) => r.object).sort()).toEqual(['op1', 'op2']);
  });
});
