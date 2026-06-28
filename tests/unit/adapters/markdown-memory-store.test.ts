import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

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
});
