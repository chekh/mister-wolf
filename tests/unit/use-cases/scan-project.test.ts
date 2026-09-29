import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanProject } from '../../../src/app/use-cases/scan-project.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { documentRefId, isCanonicalDocumentId } from '../../../src/adapters/fs/document-id.js';
import { governanceDefaults } from '../../../src/domain/governance.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { Clock } from '../../../src/ports/clock.port.js';

const FIXED_ISO = '2026-09-02T10:00:00.000Z';
const fixedClock: Clock = { now: () => new Date(FIXED_ISO) };

/** Минимальный валидный MemoryObject для посева чужого/легаси объекта в store. */
function seedObject(overrides: Partial<MemoryObject> & Pick<MemoryObject, 'id' | 'type'>): MemoryObject {
  const defaults = governanceDefaults('user:seed');
  return {
    title: 'seed',
    body: 'seed body',
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.5,
    created_at: FIXED_ISO,
    updated_at: FIXED_ISO,
    created_by: 'user:seed',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    memory_class: defaults.memory_class,
    truth_role: defaults.truth_role,
    lifetime: defaults.lifetime,
    ...overrides,
  };
}

describe('scanProject', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'wolf-scan-'));
    mkdirSync(join(projectDir, 'src'), { recursive: true });
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'demo-project', version: '1.0.0' }));
    writeFileSync(join(projectDir, 'src', 'index.ts'), 'console.log("hello");');
    writeFileSync(join(projectDir, 'docs', 'guide.md'), '# Guide\n\nContent.');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('saves a project scan memory object and appends an event', async () => {
    const store = new MarkdownMemoryStore(projectDir);
    const log = new JsonlEventLog(eventsPath(projectDir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());

    const result = await scanProject({ store, log, clock, idGen, scanner }, projectDir);

    expect(result.object.id).toBe('project-scan-latest');
    expect(result.object.type).toBe('context');
    expect(result.object.review_state).toBe('accepted');
    expect(result.object.title).toBe('Project scan for demo-project');
    expect(result.object.body).toContain('## Repository');

    const loaded = await store.get('project-scan-latest');
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('context');

    const events = await log.readAll();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('memory.added');
    expect(events[0].payload).toMatchObject({
      memory_id: 'project-scan-latest',
      type: 'context',
    });
    expect(events[1].payload).toMatchObject({ type: 'document-ref' });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].type).toBe('document-ref');
    expect(result.documents[0].source.path).toBe('docs/guide.md');
    // канон id §2.1: mem_<день>_doc_<slug>_<hash8>
    expect(isCanonicalDocumentId(result.documents[0].id)).toBe(true);
    expect(result.documents[0].id).toContain('_doc_guide_');
    const loadedDoc = await store.get(result.documents[0].id);
    expect(loadedDoc?.type).toBe('document-ref');
  });

  it('повторный скан неизменного дерева: 0 save, 0 событий, 0 индексаций (P105 diff-before-save)', async () => {
    const store = new MarkdownMemoryStore(projectDir);
    const log = new JsonlEventLog(eventsPath(projectDir));
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());
    const index = new (class {
      indexed: unknown[] = [];
      // ponytail: минимальный фейк SearchIndex — scan-project использует только indexObject
      async indexObject(o: unknown): Promise<void> {
        this.indexed.push(o);
      }
      async rebuild(): Promise<void> {}
      async removeObject(): Promise<void> {}
      async search(): Promise<never[]> {
        return [];
      }
    })();

    let saves = 0;
    let events = 0;
    const countedStore: MarkdownMemoryStore = Object.create(store);
    countedStore.save = async (o: MemoryObject) => {
      saves++;
      return store.save(o);
    };
    const countedLog: JsonlEventLog = Object.create(log);
    countedLog.append = async (e: never) => {
      events++;
      return log.append(e);
    };

    const deps = { store: countedStore, log: countedLog, clock: new SystemClock(), idGen, scanner, index };
    const first = await scanProject(deps, projectDir);
    const firstEvents = (await log.readAll()).length;
    const firstScan = await store.get('project-scan-latest');
    const firstDoc = await store.get(first.documents[0].id);
    expect(firstEvents).toBe(2);
    expect(index.indexed).toHaveLength(2);
    saves = 0;
    events = 0;
    index.indexed.length = 0;

    const second = await scanProject(deps, projectDir);

    expect(saves).toBe(0);
    expect(events).toBe(0);
    expect(index.indexed).toHaveLength(0);
    expect(await log.readAll()).toHaveLength(firstEvents);
    // updated_at не тикает на no-op
    expect((await store.get('project-scan-latest'))?.updated_at).toBe(firstScan?.updated_at);
    expect((await store.get(second.documents[0].id))?.updated_at).toBe(firstDoc?.updated_at);
    expect(second.object.id).toBe('project-scan-latest');
    expect(second.documents[0].id).toBe(first.documents[0].id);
  });

  it('изменение title у doc-ref (existing рассинхронизирован) → пишется save+event memory.scan.updated', async () => {
    const store = new MarkdownMemoryStore(projectDir);
    const log = new JsonlEventLog(eventsPath(projectDir));
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());

    const first = await scanProject({ store, log, clock: fixedClock, idGen, scanner }, projectDir);
    const docId = first.documents[0].id;
    const eventsBefore = (await log.readAll()).length;
    // ручное редактирование title в store → следующий скан видит diff
    const stored = await store.get(docId);
    await store.save({ ...stored!, title: 'Renamed by hand' });

    const second = await scanProject({ store, log, clock: fixedClock, idGen, scanner }, projectDir);

    expect(second.documents[0].id).toBe(docId);
    expect(second.documents[0].title).not.toBe('Renamed by hand');
    const evts = await log.readAll();
    expect(evts).toHaveLength(eventsBefore + 1);
    expect(evts[evts.length - 1].type).toBe('memory.scan.updated');
    expect(evts[evts.length - 1].payload).toMatchObject({ memory_id: docId, type: 'document-ref' });
  });

  it('scan-объект изменился (другой projectName) → пишется save+event', async () => {
    const store = new MarkdownMemoryStore(projectDir);
    const log = new JsonlEventLog(eventsPath(projectDir));
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());

    await scanProject({ store, log, clock: fixedClock, idGen, scanner }, projectDir);
    const eventsBefore = (await log.readAll()).length;
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'renamed-project', version: '1.0.0' }));

    const second = await scanProject({ store, log, clock: fixedClock, idGen, scanner }, projectDir);

    expect(second.object.title).toBe('Project scan for renamed-project');
    const evts = await log.readAll();
    expect(evts).toHaveLength(eventsBefore + 1); // только scan-объект; doc-ref не изменился
    expect(evts[evts.length - 1].type).toBe('memory.scan.updated');
    expect(evts[evts.length - 1].payload).toMatchObject({ memory_id: 'project-scan-latest', type: 'context' });
  });

  it('повторный скан: легаси doc_* id и created_at/created_by сохраняются (§2.1: скан не мигрирует)', async () => {
    const store = new MarkdownMemoryStore(projectDir);
    const log = new JsonlEventLog(eventsPath(projectDir));
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());

    await store.save(
      seedObject({
        id: 'doc_docs_guide_md',
        type: 'document-ref',
        title: 'Guide',
        source: { kind: 'scan', path: 'docs/guide.md' },
        created_at: '2020-01-01T00:00:00.000Z',
        created_by: 'user:legacy',
      })
    );

    const result = await scanProject({ store, log, clock: fixedClock, idGen, scanner }, projectDir);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('doc_docs_guide_md');
    expect(result.documents[0].created_at).toBe('2020-01-01T00:00:00.000Z');
    expect(result.documents[0].created_by).toBe('user:legacy');
  });

  it('коллизия slug: разные пути с одинаковым basename → разный hash8 разводит id', async () => {
    mkdirSync(join(projectDir, 'specs'), { recursive: true });
    writeFileSync(join(projectDir, 'specs', 'guide.md'), '# Specs Guide\n');
    const store = new MarkdownMemoryStore(projectDir);
    const log = new JsonlEventLog(eventsPath(projectDir));
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());

    const result = await scanProject({ store, log, clock: fixedClock, idGen, scanner }, projectDir);

    expect(result.documents).toHaveLength(2);
    const ids = result.documents.map((d) => d.id);
    expect(new Set(ids).size).toBe(2);
    for (const doc of result.documents) {
      expect(isCanonicalDocumentId(doc.id)).toBe(true);
      expect(doc.id).toContain('_doc_guide_');
    }
  });

  it('занятость id: канонический id занят другим объектом → tie-break -2 (§2.1)', async () => {
    const store = new MarkdownMemoryStore(projectDir);
    const log = new JsonlEventLog(eventsPath(projectDir));
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());

    const expected = documentRefId('docs/guide.md', FIXED_ISO);
    await store.save(seedObject({ id: expected, type: 'decision', title: 'Squatter' }));

    const result = await scanProject({ store, log, clock: fixedClock, idGen, scanner }, projectDir);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe(`${expected}-2`);
    expect(isCanonicalDocumentId(result.documents[0].id)).toBe(true);
  });
});
