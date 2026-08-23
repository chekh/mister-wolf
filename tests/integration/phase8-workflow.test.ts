import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { applyLayoutMigration } from '../../src/adapters/fs/layout-migration.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { rebuildMemoryIndex } from '../../src/app/use-cases/rebuild-memory-index.js';
import { searchMemory } from '../../src/app/use-cases/search-memory.js';
import { objectsDir, indexPath } from '../../src/adapters/fs/project-paths.js';

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
});
