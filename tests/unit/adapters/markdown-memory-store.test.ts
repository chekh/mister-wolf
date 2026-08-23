import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import * as fsPromises from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import { objectPath } from '../../../src/adapters/fs/project-paths.js';
import yaml from 'js-yaml';

function makeObject(id: string, type = 'lesson'): MemoryObject {
  return {
    id,
    type: type as any,
    title: 'Test',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: [],
    superseded_by: null,
    body: 'Body text.',
  };
}

function legacyFrontmatter(id: string, status: string): string {
  const obj = makeObject(id, 'decision');
  obj.status = status as any;
  const { body, ...fm } = obj;
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`;
}

describe('MarkdownMemoryStore', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-memory-'));
    store = new MarkdownMemoryStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves and retrieves a memory object', async () => {
    const obj = makeObject('mem_20260629_test_a8f3');
    await store.save(obj);
    const loaded = await store.get('mem_20260629_test_a8f3');
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Test');
  });

  it('returns null for a missing object', async () => {
    const loaded = await store.get('mem_missing');
    expect(loaded).toBeNull();
  });

  it('returns null and reports a problem for unparsable file on get (invalid YAML)', async () => {
    const badPath = join(dir, '.wolf/memory/shared/lessons/mem_bad_yaml.md');
    mkdirSync(dirname(badPath), { recursive: true });
    writeFileSync(badPath, '---\n[not valid yaml\n---\n\nbody', 'utf-8');
    const problems: string[] = [];
    const s = new MarkdownMemoryStore(dir, (msg) => problems.push(msg));
    expect(await s.get('mem_bad_yaml')).toBeNull();
    expect(problems.some((m) => m.includes('mem_bad_yaml'))).toBe(true);
  });

  it('returns null and reports a problem for unparsable file on get (schema mismatch)', async () => {
    const badPath = join(dir, '.wolf/memory/shared/lessons/mem_bad_schema.md');
    mkdirSync(dirname(badPath), { recursive: true });
    writeFileSync(badPath, '---\nid: mem_bad_schema\ntype: lesson\n---\n\nbody', 'utf-8');
    const problems: string[] = [];
    const s = new MarkdownMemoryStore(dir, (msg) => problems.push(msg));
    expect(await s.get('mem_bad_schema')).toBeNull();
    expect(problems.some((m) => m.includes('mem_bad_schema'))).toBe(true);
  });

  it('saves into layout v2 (threads/<tid>/<subdir>) and reads it back', async () => {
    const obj = makeObject('mem_tb1', 'task-brief');
    obj.thread = 'mem_t1';
    (obj as any).executor = 'executor-lead';
    (obj as any).priority = 'high';
    await store.save(obj);
    const p = join(dir, '.wolf/memory/threads/mem_t1/tasks/mem_tb1.md');
    await expect(fsPromises.access(p)).resolves.toBeUndefined();
    expect((await store.get('mem_tb1'))?.id).toBe('mem_tb1');
  });

  it('lists from both legacy objects/ and new roots; new wins on id collision', async () => {
    const id = 'mem_coll1';
    mkdirSync(join(dir, '.wolf/memory/objects/decisions'), { recursive: true });
    writeFileSync(join(dir, '.wolf/memory/objects/decisions', `${id}.md`), legacyFrontmatter(id, 'active'), 'utf-8');
    mkdirSync(join(dir, '.wolf/memory/shared/decisions'), { recursive: true });
    writeFileSync(join(dir, '.wolf/memory/shared/decisions', `${id}.md`), legacyFrontmatter(id, 'superseded'), 'utf-8');
    const objs = await store.list();
    expect(objs.filter((o) => o.id === id)).toHaveLength(1);
    expect(objs.find((o) => o.id === id)?.status).toBe('superseded');
  });

  it('skips unparsable file without failing list and reports via onProblem', async () => {
    mkdirSync(join(dir, '.wolf/memory/shared/rules'), { recursive: true });
    writeFileSync(join(dir, '.wolf/memory/shared/rules/broken.md'), 'not frontmatter', 'utf-8');
    const problems: string[] = [];
    const s = new MarkdownMemoryStore(dir, (msg) => problems.push(msg));
    await s.save(makeObject('mem_ok1'));
    const objs = await s.list();
    expect(objs.map((o) => o.id)).toEqual(['mem_ok1']);
    expect(problems.some((m) => m.includes('broken.md'))).toBe(true);
  });

  it('filters stale objects', async () => {
    const fresh = makeObject('mem_fresh');
    // ponytail: dynamic date — hardcoded one rotted past the 30-day stale window
    fresh.updated_at = new Date().toISOString();
    const stale = makeObject('mem_stale');
    stale.updated_at = '2026-01-01T00:00:00Z';
    await store.save(fresh);
    await store.save(stale);
    const results = await store.list({ stale: true });
    expect(results.map((r) => r.id)).toEqual(['mem_stale']);
  });
});
