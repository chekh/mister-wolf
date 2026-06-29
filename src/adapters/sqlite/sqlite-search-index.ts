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
    const insertSearch = this.db.prepare(
      'INSERT INTO memory_search (memory_id, type, title, body, tags, status, review_state) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertMeta = this.db.prepare(
      'INSERT INTO memory_meta (memory_id, type, status, review_state, importance, created_at, confidence, created_by, updated_at, superseded_by, source, related, tags, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const rebuild = this.db.transaction(() => {
      this.db.exec('DELETE FROM memory_search; DELETE FROM memory_meta;');
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
        insertMeta.run(
          obj.id,
          obj.type,
          obj.status,
          obj.review_state,
          obj.importance,
          obj.created_at,
          obj.confidence,
          obj.created_by,
          obj.updated_at,
          obj.superseded_by,
          JSON.stringify(obj.source),
          JSON.stringify(obj.related),
          JSON.stringify(obj.tags),
          obj.schema_version
        );
      }
    });

    rebuild();
  }

  async search(query: string, options?: { type?: string; includeSuperseded?: boolean }): Promise<SearchResult[]> {
    let sql = `
      SELECT s.memory_id, s.type, s.title, s.body, s.status, s.review_state,
             m.confidence, m.importance, m.created_at, m.updated_at, m.created_by,
             m.schema_version, m.source, m.related, m.tags, m.superseded_by,
             rank
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
        confidence: row.confidence,
        importance: row.importance,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        schema_version: row.schema_version,
        source: JSON.parse(row.source),
        related: JSON.parse(row.related),
        tags: JSON.parse(row.tags),
        superseded_by: row.superseded_by,
      },
      score: row.rank,
    }));
  }
}
