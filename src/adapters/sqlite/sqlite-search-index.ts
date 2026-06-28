import Database from 'better-sqlite3';
import { SearchIndex, SearchResult } from '../../ports/search-index.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { SQLITE_SCHEMA } from './sqlite-schema.js';

export class SQLiteSearchIndex implements SearchIndex {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(SQLITE_SCHEMA);
  }

  async rebuild(objects: MemoryObject[]): Promise<void> {
    this.db.exec('DELETE FROM memory_search; DELETE FROM memory_meta;');

    const insertSearch = this.db.prepare(
      'INSERT INTO memory_search (memory_id, type, title, body, tags, status, review_state) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertMeta = this.db.prepare(
      'INSERT INTO memory_meta (memory_id, type, status, review_state, importance, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const rebuild = this.db.transaction(() => {
      for (const obj of objects) {
        insertSearch.run(
          obj.id,
          obj.type,
          obj.title,
          obj.body,
          obj.tags.join(','),
          obj.status,
          obj.review_state
        );
        insertMeta.run(obj.id, obj.type, obj.status, obj.review_state, obj.importance, obj.created_at);
      }
    });

    rebuild();
  }

  async search(query: string, options?: { type?: string; includeSuperseded?: boolean }): Promise<SearchResult[]> {
    let sql = `
      SELECT s.memory_id, s.type, s.title, s.body, s.tags, s.status, s.review_state,
             rank, m.importance, m.created_at
      FROM memory_search s
      JOIN memory_meta m ON s.memory_id = m.memory_id
      WHERE memory_search MATCH ?
    `;
    const params: (string | number)[] = [query];

    if (!options?.includeSuperseded) {
      sql += ` AND s.status = 'active'`;
    }
    if (options?.type) {
      sql += ` AND s.type = ?`;
      params.push(options.type);
    }

    sql += ` ORDER BY rank`;

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => ({
      object: {
        id: row.memory_id,
        type: row.type,
        title: row.title,
        body: row.body,
        status: row.status,
        review_state: row.review_state,
        confidence: 'medium',
        importance: row.importance,
        created_at: row.created_at,
        updated_at: row.created_at,
        created_by: 'unknown',
        schema_version: 1,
        source: { kind: 'manual' },
        related: { files: [], docs: [], decisions: [] },
        tags: row.tags ? row.tags.split(',') : [],
        superseded_by: null,
      },
      score: row.rank,
    }));
  }
}
