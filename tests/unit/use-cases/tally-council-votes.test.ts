import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { tallyCouncilVotes } from '../../../src/app/use-cases/tally-council-votes.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { relationsPath, objectsDir } from '../../../src/adapters/fs/project-paths.js';

describe('tallyCouncilVotes', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let relations: JsonlRelationLog;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-tally-'));
    mkdirSync(objectsDir(dir), { recursive: true });
    store = new MarkdownMemoryStore(dir);
    relations = new JsonlRelationLog(relationsPath(dir));
    idGen = new HashIdGenerator();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function saveOpinion(id: string, voter: string, vote: string, body?: string) {
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
      body: body ?? '',
      memory_class: 'working',
      truth_role: 'proposed_knowledge',
      lifetime: 'short_term',
      vote,
    };
    await store.save(obj);
  }

  async function addRelation(subject: string, object: string) {
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

  it('counts votes from opinion objects and enforces quorum', async () => {
    await saveOpinion('op1', 'agent:A', 'A');
    await saveOpinion('op2', 'agent:B', 'A');
    await saveOpinion('op3', 'agent:C', 'B');
    await addRelation('op1', 'q1');
    await addRelation('op2', 'q1');
    await addRelation('op3', 'q1');

    const r = await tallyCouncilVotes({ store, relations }, { questionId: 'q1', quorum: 3, consensusThreshold: 0.66 });
    expect(r.tallies).toEqual({ A: 2, B: 1 });
    expect(r.quorumMet).toBe(true);
    expect(r.winner).toBe('A');
  });

  it('TIMEOUT vote can fail quorum', async () => {
    await saveOpinion('op4', 'agent:D', 'TIMEOUT');
    await addRelation('op4', 'q2');

    const r = await tallyCouncilVotes({ store, relations }, { questionId: 'q2', quorum: 2, consensusThreshold: 0.5 });
    expect(r.votes[0].vote).toBe('TIMEOUT');
    expect(r.quorumMet).toBe(false);
    expect(r.winner).toBeNull();
  });
});
