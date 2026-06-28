import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeObject(id: string, title: string, body: string): MemoryObject {
  return {
    id,
    type: 'lesson',
    title,
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
    tags: ['router'],
    superseded_by: null,
    body,
  };
}

describe('SQLiteSearchIndex', () => {
  let dir: string;
  let index: SQLiteSearchIndex;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-idx-'));
    index = new SQLiteSearchIndex(join(dir, 'index.sqlite'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds object by body text', async () => {
    await index.rebuild([
      makeObject('mem_1', 'Router', 'reconnect failure mode'),
      makeObject('mem_2', 'Auth', 'token rotation'),
    ]);
    const results = await index.search('reconnect');
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe('mem_1');
  });
});
