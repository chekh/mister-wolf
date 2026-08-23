import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { applyLayoutMigration } from '../../src/adapters/fs/layout-migration.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { rebuildMemoryIndex } from '../../src/app/use-cases/rebuild-memory-index.js';
import { searchMemory } from '../../src/app/use-cases/search-memory.js';
import {
  objectsDir,
  indexPath,
  eventsPath,
  relationsPath,
  sharedDir,
  memoryDir,
  quarantineDir,
} from '../../src/adapters/fs/project-paths.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { createWorkThread } from '../../src/app/use-cases/create-work-thread.js';
import { recordRelation } from '../../src/app/use-cases/record-relation.js';
import { tallyCouncilVotes } from '../../src/app/use-cases/tally-council-votes.js';
import { createSynthesis } from '../../src/app/use-cases/create-synthesis.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { runValidate } from '../../src/adapters/cli/commands/memory-validate.js';

function legacyMd(id: string, overrides: Record<string, any>): string {
  const base = {
    id,
    type: 'decision',
    title: `AlphaTitle ${id}`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    ...overrides,
  };
  const { body, ...fm } = base;
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body ?? 'Body text.'}`;
}

describe('phase8 workflow', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-phase8-'));
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'memory', 'events.jsonl'), '');
    writeFileSync(join(dir, '.wolf', 'memory', 'relations.jsonl'), '');

    const objs = objectsDir(dir);
    // lesson
    mkdirSync(join(objs, 'lessons'), { recursive: true });
    writeFileSync(
      join(objs, 'lessons', 'les_1.md'),
      legacyMd('les_1', { type: 'lesson', title: 'AlphaTitle lesson one' })
    );
    // decision without thread
    mkdirSync(join(objs, 'decisions'), { recursive: true });
    writeFileSync(
      join(objs, 'decisions', 'dec_1.md'),
      legacyMd('dec_1', { type: 'decision', title: 'AlphaTitle decide things' })
    );
    // work-thread
    mkdirSync(join(objs, 'threads'), { recursive: true });
    writeFileSync(
      join(objs, 'threads', 'wt_1.md'),
      legacyMd('wt_1', {
        type: 'work-thread',
        title: 'AlphaTitle the main thread',
        goal: 'test',
        current_state: '',
        next_steps: [],
      })
    );
    // document with source.path
    mkdirSync(join(objs, 'documents'), { recursive: true });
    writeFileSync(
      join(objs, 'documents', 'doc_1.md'),
      legacyMd('doc_1', {
        type: 'document',
        title: 'AlphaTitle important doc',
        source: { kind: 'file', path: 'src/foo.ts' },
      })
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('migrates legacy objects and everything stays readable/searchable', async () => {
    // 1) migrate
    const report = await applyLayoutMigration(dir);
    expect(report.total).toBe(4);
    expect(report.conflicts).toHaveLength(0);

    // 2) store sees all 4 with correct types
    const store = new MarkdownMemoryStore(dir);
    const objs = await store.list();
    expect(objs).toHaveLength(4);
    expect(objs.find((o) => o.id === 'doc_1')?.type).toBe('document-ref');
    expect(objs.find((o) => o.id === 'wt_1')?.type).toBe('work-thread');
    expect(objs.find((o) => o.id === 'dec_1')?.type).toBe('decision');
    expect(objs.find((o) => o.id === 'les_1')?.type).toBe('lesson');

    // 3) rebuild index + search
    const index = new SQLiteSearchIndex(indexPath(dir));
    await rebuildMemoryIndex({ store, index });
    const results = await searchMemory({ index }, { query: 'AlphaTitle' });
    expect(results.length).toBeGreaterThanOrEqual(1);

    // 4) idempotent
    const { applyLayoutMigration: al } = await import('../../src/adapters/fs/layout-migration.js');
    const second = await al(dir);
    expect(second.total).toBe(0);
  });

  it('orchestration flow: thread -> task-brief(extra) -> report -> answers relation', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const rels = new JsonlRelationLog(relationsPath(dir));

    const thread = await createWorkThread(
      { store, log, clock, idGen },
      { title: 'Orch thread', goal: 'test orchestration', createdBy: 'user:test' }
    );

    const brief = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'task-brief',
        title: 'Do thing',
        createdBy: 'user:test',
        extra: { executor: 'agent:X', priority: 'high' },
      }
    );
    expect(brief.object.executor).toBe('agent:X');
    expect(brief.object.priority).toBe('high');

    const report = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'report', title: 'Done thing', body: 'All good', createdBy: 'agent:X' }
    );

    await recordRelation({ relations: rels, idGen }, clock.now(), brief.object.id, 'answers', thread.object.id);

    const storedBrief = await store.get(brief.object.id);
    expect(storedBrief?.type).toBe('task-brief');
    expect((storedBrief as any).executor).toBe('agent:X');

    const storedReport = await store.get(report.object.id);
    expect(storedReport?.type).toBe('report');

    const answerRels = await rels.list({ subject: brief.object.id, predicate: 'answers' });
    expect(answerRels).toHaveLength(1);
    expect(answerRels[0].object).toBe(thread.object.id);
  });

  it('council flow: question -> 2 opinions -> tally -> synthesis', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const rels = new JsonlRelationLog(relationsPath(dir));

    const q = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'council-question',
        title: 'Should we?',
        body: 'Decide now',
        createdBy: 'user:test',
        status: 'open',
        extra: { question: 'Should we proceed?' },
      }
    );

    const op1 = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'council-opinion', title: 'Op A', createdBy: 'agent:A', status: 'proposed', extra: { vote: 'yes' } }
    );
    const op2 = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'council-opinion', title: 'Op B', createdBy: 'agent:B', status: 'proposed', extra: { vote: 'yes' } }
    );

    const now = clock.now();
    await recordRelation({ relations: rels, idGen }, now, op1.object.id, 'answers', q.object.id);
    await recordRelation({ relations: rels, idGen }, now, op2.object.id, 'answers', q.object.id);

    const tally = await tallyCouncilVotes(
      { store, relations: rels },
      { questionId: q.object.id, quorum: 2, consensusThreshold: 0.5 }
    );
    expect(tally.quorumMet).toBe(true);
    expect(tally.winner).toBe('yes');

    const { object: synth, relatedOpinions } = await createSynthesis(
      { store, log, clock, idGen, relations: rels },
      { questionId: q.object.id, recommendation: 'Proceed with plan', createdBy: 'user:test' }
    );
    expect(synth.type).toBe('synthesis');
    expect(synth.status).toBe('proposed');
    expect(relatedOpinions).toHaveLength(2);

    const basedOn = await rels.list({ subject: synth.id, predicate: 'based_on' });
    expect(basedOn).toHaveLength(2);
  });

  it('validate reports problems and --fix quarantines them', async () => {
    // Ensure a valid object exists
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'decision', title: 'Good decision', body: 'yes', createdBy: 'user:test' }
    );

    // Create a broken .md in shared/rules/
    const rulesDir = join(sharedDir(dir), 'rules');
    mkdirSync(rulesDir, { recursive: true });
    const brokenPath = join(rulesDir, 'broken_rule.md');
    writeFileSync(brokenPath, 'this is not valid frontmatter\n', 'utf-8');

    // Add a bad line to relations.jsonl
    const relsPath = relationsPath(dir);
    const goodRel = JSON.stringify({
      id: idGen.generateEventId(clock.now()),
      subject: 'fake_subject',
      predicate: 'answers',
      object: 'fake_object',
      created_at: clock.now().toISOString(),
      source: 'agent',
      confidence: 'high',
    });
    writeFileSync(relsPath, `${goodRel}\n{broken json line}\n`, 'utf-8');

    // First validate: should find problems
    const result1 = await runValidate(dir);
    expect(result1.ok).toBe(false);
    expect(result1.errors).toBeGreaterThan(0);
    // The broken object should be reported
    expect(result1.displayLines.some((l) => l.includes('broken'))).toBe(true);

    // The broken file should still be there (no --fix)
    expect(existsSync(brokenPath)).toBe(true);

    // Now validate with --fix
    const result2 = await runValidate(dir, { fix: true });
    // Broken object should be quarantined
    expect(existsSync(brokenPath)).toBe(false);
    const qDir = quarantineDir(dir);
    // Check quarantine has a file
    expect(existsSync(qDir)).toBe(true);
    // meta.json should exist
    const metaFiles = findFiles(qDir, '.meta.json');
    expect(metaFiles.length).toBeGreaterThan(0);

    // Re-validate: objects should have 0 broken now
    const result3 = await runValidate(dir);
    // Objects broken count should be 0 now
    const objLine = result3.displayLines.find((l) => l.startsWith('objects:'))!;
    expect(objLine).toContain('broken 0');
    // But relations bad line still exists (quarantine only fixes objects)
    const relLine = result3.displayLines.find((l) => l.startsWith('relations:'))!;
    expect(relLine).toContain('bad 1');
  });
});

function findFiles(dir: string, suffix: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(suffix)) results.push(full);
    }
  }
  try {
    walk(dir);
  } catch {
    /* */
  }
  return results;
}
