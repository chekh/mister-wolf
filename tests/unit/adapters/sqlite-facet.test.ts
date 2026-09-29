import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeObject(partial: Partial<MemoryObject> & Pick<MemoryObject, 'id' | 'title' | 'body'>): MemoryObject {
  return {
    type: 'note',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T15:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: [],
    superseded_by: null,
    ...partial,
  } as MemoryObject;
}

/** Схема до P212 — без facet-колонок (миграция при открытии должна её достроить). */
const OLD_SCHEMA = `
  CREATE VIRTUAL TABLE memory_search USING fts5(memory_id, type, title, body, tags, status, review_state);
  CREATE TABLE memory_meta (
    memory_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    review_state TEXT NOT NULL,
    importance REAL NOT NULL,
    created_at TEXT NOT NULL,
    confidence TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    superseded_by TEXT,
    source TEXT NOT NULL,
    related TEXT NOT NULL,
    tags TEXT NOT NULL,
    schema_version INTEGER NOT NULL
  );
`;

function columnsOf(dbPath: string, table: string): string[] {
  const db = new Database(dbPath);
  try {
    return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  } finally {
    db.close();
  }
}

describe('P212а: facet в SQLite-индексе', () => {
  let dir: string;
  let index: SQLiteSearchIndex;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-facet-'));
    index = new SQLiteSearchIndex(join(dir, 'index.sqlite'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('новая схема: facet есть в memory_meta и memory_search', async () => {
    await index.rebuild([makeObject({ id: 'mem_1', title: 'T', body: 'b', facet: 'howto' })]);
    expect(columnsOf(join(dir, 'index.sqlite'), 'memory_meta')).toContain('facet');
    expect(columnsOf(join(dir, 'index.sqlite'), 'memory_search')).toContain('facet');
  });

  it('миграция старой схемы при открытии: facet добавлен, данные сохранены', async () => {
    const dbPath = join(dir, 'index.sqlite');
    const raw = new Database(dbPath);
    raw.exec(OLD_SCHEMA);
    raw
      .prepare(
        "INSERT INTO memory_search (memory_id, type, title, body, tags, status, review_state) VALUES ('mem_old', 'note', 'Old', 'legacyterm', '', 'active', 'accepted')"
      )
      .run();
    raw
      .prepare(
        `INSERT INTO memory_meta (memory_id, type, status, review_state, importance, created_at, confidence, created_by, updated_at, superseded_by, source, related, tags, schema_version)
         VALUES ('mem_old', 'note', 'active', 'accepted', 0.5, '2026-01-01T00:00:00Z', 'medium', 'user:t', '2026-01-01T00:00:00Z', NULL, '{"kind":"manual"}', '{}', '[]', 1)`
      )
      .run();
    raw.close();

    // первое обращение открывает БД и мигрирует схему
    const results = await index.search('legacyterm');
    expect(results.map((r) => r.object.id)).toEqual(['mem_old']);
    expect(columnsOf(dbPath, 'memory_meta')).toContain('facet');
    expect(columnsOf(dbPath, 'memory_search')).toContain('facet');
    // старая строка без фасета фасет-фильтром не находится
    expect(await index.search('legacyterm', { facet: 'howto' })).toEqual([]);
  });

  it('search facet-фильтр: note howto + note pitfall → только вторая', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_howto', title: 'How', body: 'shared term', facet: 'howto' }),
      makeObject({ id: 'mem_pitfall', title: 'Pit', body: 'shared term', facet: 'pitfall' }),
    ]);
    const results = await index.search('shared', { facet: 'pitfall' });
    expect(results.map((r) => r.object.id)).toEqual(['mem_pitfall']);
    expect(results[0].object.facet).toBe('pitfall');
  });

  it('тип без фасета → NULL в колонке, объект реконструируется без facet', async () => {
    await index.rebuild([makeObject({ id: 'mem_lesson', type: 'lesson', title: 'L', body: 'shared term' })]);
    const results = await index.search('shared');
    expect(results[0].object.facet).toBeUndefined();
    expect(await index.search('shared', { facet: 'howto' })).toEqual([]);
  });
});
