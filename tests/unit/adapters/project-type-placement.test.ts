import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { loadWolfConfigSync } from '../../../src/adapters/fs/config-file.js';
import { mergeTaxonomy } from '../../../src/domain/taxonomy.js';

const CONFIG_YAML = `artifact_sources: []
memory_types:
  core: {}
  project:
    incident:
      lifecycle: [open, archived]
      subdir_thread: ~
      subdir_shared: incidents
`;

describe('project type placement (config.yaml → FS)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-projtype-'));
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), CONFIG_YAML);
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps() {
    const { types } = mergeTaxonomy(loadWolfConfigSync(dir));
    return {
      store,
      log,
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      declarations: [...types.values()],
    };
  }

  async function addIncident(title: string) {
    const { object } = await addMemoryObject(makeDeps(), {
      type: 'incident' as never,
      title,
      body: 'API 5xx spike.',
      createdBy: 'user:test',
    });
    return object;
  }

  it('addMemoryObject creates project-typed object under shared/<subdir>/', async () => {
    const object = await addIncident('Prod incident');

    const path = join(dir, '.wolf', 'memory', 'shared', 'incidents', `${object.id}.md`);
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    expect(match).not.toBeNull();
    const frontmatter = yaml.load(match![1]) as Record<string, unknown>;
    expect(frontmatter.type).toBe('incident');
    expect(frontmatter.status).toBe('open');
  });

  it('store.get() returns created project-typed object (read-back works)', async () => {
    const object = await addIncident('Prod incident');
    const readBack = await store.get(object.id);
    expect(readBack).not.toBeNull();
    expect(readBack!.type).toBe('incident');
    expect(readBack!.title).toBe('Prod incident');
  });

  it('store.list() sees project-typed objects', async () => {
    await addIncident('Prod incident');
    const objects = await store.list();
    expect(objects.some((o) => o.type === 'incident')).toBe(true);
  });

  it('store.scanProblems() does not flag project-typed object files (validate --fix safe)', async () => {
    await addIncident('Prod incident');
    const problems = await store.scanProblems();
    expect(problems).toEqual([]);
  });

  it('scanProblems still flags garbage-typed files not in taxonomy', async () => {
    const path = join(dir, '.wolf', 'memory', 'shared', 'notes', 'mem_garbage.md');
    mkdirSync(dirname(path), { recursive: true });
    const frontmatter = {
      id: 'mem_garbage',
      type: 'garbage',
      title: 'Garbage entry',
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-08-26T00:00:00Z',
      updated_at: '2026-08-26T00:00:00Z',
      created_by: 'user:test',
      source: { kind: 'manual' },
    };
    writeFileSync(path, `---\n${yaml.dump(frontmatter)}---\n\nbody`);
    const problems = await store.scanProblems();
    expect(problems.some((p) => p.path === path)).toBe(true);
  });

  it('addMemoryObject still throws for type missing from taxonomy (write gate intact)', async () => {
    await expect(
      addMemoryObject(makeDeps(), { type: 'nope' as never, title: 'X', createdBy: 'user:test' })
    ).rejects.toThrow(/No taxonomy declaration/);
  });

  it('transitionMemoryObject transitions project-typed object with declarations', async () => {
    const deps = makeDeps();
    const object = await addIncident('Prod incident');
    // incident lifecycle: [open, archived]
    await transitionMemoryObject(deps, object.id, 'archived', 'user:test');
    const updated = await store.get(object.id);
    expect(updated?.status).toBe('archived');
  });
});
