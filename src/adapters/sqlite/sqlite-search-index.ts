import { mkdirSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { SearchIndex, SearchOptions, SearchResult } from '../../ports/search-index.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { SQLITE_SCHEMA } from './sqlite-schema.js';
import { runWithBusyRetry } from './busy-retry.js';

export class SQLiteSearchIndex implements SearchIndex {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SQLITE_SCHEMA);
  }

  async indexObject(object: MemoryObject): Promise<void> {
    runWithBusyRetry(() => {
      this.removeFromIndex(object.id);
      this.insertIntoIndex(object);
    });
  }

  async removeObject(id: string): Promise<void> {
    runWithBusyRetry(() => this.removeFromIndex(id));
  }

  async rebuild(objects: MemoryObject[]): Promise<void> {
    runWithBusyRetry(() => {
      const rebuild = this.db.transaction(() => {
        this.db.exec('DELETE FROM memory_search; DELETE FROM memory_meta;');
        for (const obj of objects) {
          this.insertIntoIndex(obj);
        }
      });
      rebuild();
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const ftsQuery = this.buildFtsQuery(query);
    if (!ftsQuery) {
      return [];
    }

    // Колонки memory_search по порядку: memory_id, type, title, body, tags, status, review_state.
    // title и tags весят заметно больше body.
    const bm25Expr = 'bm25(memory_search, 1.0, 1.0, 8.0, 1.0, 4.0, 1.0, 1.0)';

    let sql = `
      SELECT s.memory_id, s.type, s.title, s.body, s.status, s.review_state,
             m.confidence, m.importance, m.created_at, m.updated_at, m.created_by,
             m.schema_version, m.source, m.related, m.tags, m.superseded_by,
             ${bm25Expr} AS rank
      FROM memory_search s
      JOIN memory_meta m ON s.memory_id = m.memory_id
      WHERE memory_search MATCH ?
    `;
    const params: (string | number)[] = [ftsQuery];

    if (!options.includeSuperseded) {
      // «Мёртвые» статусы не ищем; остальные живые (active/open/proposed/...)
      // находятся независимо от lifecycle конкретного типа.
      sql += ` AND s.status NOT IN ('superseded', 'archived')`;
    }
    if (options.type) {
      sql += ` AND s.type = ?`;
      params.push(options.type);
    }
    if (options.status) {
      sql += ` AND s.status = ?`;
      params.push(options.status);
    }
    if (options.confidence) {
      sql += ` AND m.confidence = ?`;
      params.push(options.confidence);
    }
    if (options.tags && options.tags.length > 0) {
      const tagList = options.tags.map((t) => t.replace(/'/g, "''")).join(',');
      sql += ` AND m.tags LIKE '%${tagList}%'`;
    }
    if (typeof options.minImportance === 'number') {
      sql += ` AND m.importance >= ?`;
      params.push(options.minImportance);
    }
    if (typeof options.maxImportance === 'number') {
      sql += ` AND m.importance <= ?`;
      params.push(options.maxImportance);
    }
    if (options.createdAfter) {
      sql += ` AND m.created_at >= ?`;
      params.push(options.createdAfter);
    }
    if (options.createdBefore) {
      sql += ` AND m.created_at <= ?`;
      params.push(options.createdBefore);
    }

    sql += ` ORDER BY ${bm25Expr}`;

    const rows = this.db.prepare(sql).all(...params) as any[];
    const results = rows.map((row) => ({
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
      } as MemoryObject,
      score: this.computeScore(row.rank, row.importance, row.confidence),
    }));

    const filtered = options.file_path
      ? results.filter((r) => this.matchesFilePath(r.object, options.file_path as string))
      : results;

    if (options.limit) {
      return filtered.slice(0, options.limit);
    }
    return filtered;
  }

  private buildFtsQuery(query: string): string {
    return query
      .split(/\s+/)
      .map((token) => token.replace(/["()*:^]/g, ''))
      .filter((token) => token.length > 0)
      .map((token) => `"${token}"*`)
      .join(' ');
  }

  private matchesFilePath(object: MemoryObject, filePath: string): boolean {
    if (object.source.path === filePath) {
      return true;
    }
    const files = object.related?.files ?? [];
    return files.some((f) => f === filePath || f.endsWith(`/${filePath}`));
  }

  private computeScore(rawRank: number, importance: number, confidence: string): number {
    const confidenceWeight = confidence === 'high' ? 1.2 : confidence === 'medium' ? 1.0 : 0.8;
    return -rawRank * (1 + importance) * confidenceWeight;
  }

  private removeFromIndex(id: string): void {
    this.db.prepare('DELETE FROM memory_search WHERE memory_id = ?').run(id);
    this.db.prepare('DELETE FROM memory_meta WHERE memory_id = ?').run(id);
  }

  private insertIntoIndex(object: MemoryObject): void {
    this.db
      .prepare(
        'INSERT INTO memory_search (memory_id, type, title, body, tags, status, review_state) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        object.id,
        object.type,
        object.title,
        object.body,
        object.tags.join(','),
        object.status,
        object.review_state
      );
    this.db
      .prepare(
        'INSERT INTO memory_meta (memory_id, type, status, review_state, importance, created_at, confidence, created_by, updated_at, superseded_by, source, related, tags, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        object.id,
        object.type,
        object.status,
        object.review_state,
        object.importance,
        object.created_at,
        object.confidence,
        object.created_by,
        object.updated_at,
        object.superseded_by,
        JSON.stringify(object.source),
        JSON.stringify(object.related),
        JSON.stringify(object.tags),
        object.schema_version
      );
  }
}
