import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import { objectPath } from '../../../src/adapters/fs/project-paths.js';

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

  it('throws when a file contains invalid YAML', async () => {
    const badPath = objectPath(dir, 'lesson', 'mem_bad_yaml');
    mkdirSync(dirname(badPath), { recursive: true });
    writeFileSync(badPath, '---\n[not valid yaml\n---\n\nbody', 'utf-8');
    await expect(store.get('mem_bad_yaml')).rejects.toThrow('Failed to parse memory file');
  });

  it('throws when frontmatter does not match the schema', async () => {
    const badPath = objectPath(dir, 'lesson', 'mem_bad_schema');
    mkdirSync(dirname(badPath), { recursive: true });
    writeFileSync(badPath, '---\nid: mem_bad_schema\ntype: lesson\n---\n\nbody', 'utf-8');
    await expect(store.get('mem_bad_schema')).rejects.toThrow('Failed to parse memory file');
  });

  it('filters stale objects', async () => {
    const fresh = makeObject('mem_fresh');
    const stale = makeObject('mem_stale');
    stale.updated_at = '2026-01-01T00:00:00Z';
    await store.save(fresh);
    await store.save(stale);
    const results = await store.list({ stale: true });
    expect(results.map((r) => r.id)).toEqual(['mem_stale']);
  });
});
