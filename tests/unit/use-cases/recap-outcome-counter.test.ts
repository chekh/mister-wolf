import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateRecap, renderRecap } from '../../../src/app/use-cases/generate-recap.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import { recordRelation } from '../../../src/app/use-cases/record-relation.js';

// 2.14 §6.3: recap-счётчик «жалоб без исхода» (resolved complaint без ребра
// outcome/outcome_of); фикстуры — прецедент generate-recap.test.ts
describe('generateRecap complaintsWithoutOutcome', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let relations: JsonlRelationLog;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-recap-outcome-'));
    store = new MarkdownMemoryStore(dir);
    relations = new JsonlRelationLog(relationsPath(dir));
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function mkDeps() {
    return { store, log: new JsonlEventLog(eventsPath(dir)), clock: new SystemClock(), idGen };
  }

  async function addComplaint(title: string): Promise<string> {
    const { object } = await addMemoryObject(mkDeps(), {
      type: 'complaint',
      title,
      body: 'evidence text',
      createdBy: 'user:test',
      extra: { about: 'executor-lead', rule: 'rule pointer', evidence: 'evidence text', proposal: 'proposal text' },
    });
    return object.id;
  }

  it('resolved complaint without outcome edge → 1; renders section after info requests', async () => {
    const id = await addComplaint('Complaint about executor-lead: rule pointer');
    await transitionMemoryObject(mkDeps(), id, 'resolved', 'user:test');

    const report = await generateRecap({ store, relations });

    expect(report.complaintsWithoutOutcome).toBe(1);
    const text = renderRecap(report);
    expect(text).toContain('## Контур поправок');
    expect(text).toContain('жалоб без исхода: 1');
    // размещение: после Open info requests, до Recent decisions
    expect(text.indexOf('## Контур поправок')).toBeGreaterThan(text.indexOf('## Open info requests'));
    expect(text.indexOf('## Контур поправок')).toBeLessThan(text.indexOf('## Recent decisions'));
  });

  it('outcome_of edge (either side of the pair) zeroes the counter', async () => {
    const id = await addComplaint('Complaint about executor-lead: second');
    await transitionMemoryObject(mkDeps(), id, 'resolved', 'user:test');
    await recordRelation({ relations, idGen }, new Date(), 'mem_artifact', 'outcome_of', id, 'manual');

    const report = await generateRecap({ store, relations });

    expect(report.complaintsWithoutOutcome).toBe(0);
    expect(renderRecap(report)).toContain('жалоб без исхода: 0');
  });

  it('no relations passed → null, section omitted (existing call sites unchanged)', async () => {
    const report = await generateRecap({ store });

    expect(report.complaintsWithoutOutcome).toBeNull();
    expect(renderRecap(report)).not.toContain('Контур поправок');
  });

  it('open complaint is not counted (only resolved)', async () => {
    const id = await addComplaint('Complaint about executor-lead: third');
    await transitionMemoryObject(mkDeps(), id, 'resolved', 'user:test');
    await addComplaint('Complaint about executor-lead: fourth'); // остаётся open

    const report = await generateRecap({ store, relations });

    expect(report.complaintsWithoutOutcome).toBe(1);
  });
});
