import { mkdirSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { SearchIndex, SearchOptions, SearchResult } from '../../ports/search-index.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { SQLITE_SCHEMA } from './sqlite-schema.js';
import { runWithBusyRetry } from './busy-retry.js';

/** Колонки FTS-таблицы memory_search — единственный источник: SQLITE_SCHEMA. */
export const FTS_COLUMNS: ReadonlySet<string> = new Set(
  (SQLITE_SCHEMA.match(/fts5\(([^)]*)\)/)?.[1] ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
);

/** Слова = последовательности юникод-букв/цифр; всё остальное — разделитель. */
function tokenizeWords(input: string): string[] {
  return input.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Вариант D (report-2026-09-01-fts-query-analysis): честная токенизация +
 * конъюнкция префикс-термов; `field:value` — column-filter только для колонок
 * memory_search, неизвестное поле отбрасывается, значение ищется словами;
 * заглавный AND — implicit, заглавный OR — проброс FTS5-оператора;
 * NOT/NEAR — обычные слова (унарный NOT в FTS5 нелегален, см. отчёт).
 */
export function buildFtsQuery(query: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const segment of query.split(/\s+/)) {
    if (!segment) continue;
    if (segment === 'AND') continue; // неявный AND уже есть (join(' '))
    if (segment === 'OR') {
      // оператор валиден только между термами
      if (parts.length > 0 && parts[parts.length - 1] !== 'OR') parts.push('OR');
      continue;
    }
    const m = segment.match(/^([\p{L}_][\p{L}\p{N}_]*):(.*)$/u);
    // ponytail: имя неизвестного поля («steward:») отбрасываем — значение важнее
    const column = m ? m[1].toLowerCase() : null;
    const prefix = column && FTS_COLUMNS.has(column) ? `${column}:` : '';
    const words = tokenizeWords(m ? m[2] : segment);
    for (const w of words) {
      const term = `${prefix}"${w}"*`;
      if (!seen.has(term)) {
        seen.add(term);
        parts.push(term);
      }
    }
  }
  if (parts.length > 0 && parts[parts.length - 1] === 'OR') parts.pop();
  return parts.join(' ');
}

export class SQLiteSearchIndex implements SearchIndex {
  private db: Database.Database | null = null;

  constructor(private readonly dbPath: string) {}

  /**
   * A8 (lazy SQLite open): каталог + Database + DDL — при первом обращении;
   * read-only команды (конструктор контейнера) не открывают SQLite и не платят DDL.
   */
  private getDb(): Database.Database {
    if (!this.db) {
      mkdirSync(dirname(this.dbPath), { recursive: true });
      this.db = new Database(this.dbPath);
      this.db.pragma('busy_timeout = 5000');
      this.db.exec(SQLITE_SCHEMA);
      this.migrateFacetColumns();
    }
    return this.db;
  }

  /**
   * P212 (2.13 §5.3а): facet-колонки в БД старой схемы. memory_meta — обычная
   * таблица, хватает ALTER ADD COLUMN; FTS5 не поддерживает ALTER для
   * виртуальных таблиц — копируем в новую таблицу с facet (drop/rename),
   * данные сохраняются без пересборки индекса.
   */
  private migrateFacetColumns(): void {
    const db = this.db!;
    const hasFacet = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === 'facet');
    if (!hasFacet('memory_meta')) {
      db.exec('ALTER TABLE memory_meta ADD COLUMN facet TEXT');
    }
    if (!hasFacet('memory_search')) {
      db.exec(`CREATE VIRTUAL TABLE memory_search_new USING fts5(
        memory_id, type, title, body, tags, status, review_state, facet
      )`);
      db.exec(`INSERT INTO memory_search_new(memory_id, type, title, body, tags, status, review_state, facet)
        SELECT memory_id, type, title, body, tags, status, review_state, NULL FROM memory_search`);
      db.exec('DROP TABLE memory_search');
      db.exec('ALTER TABLE memory_search_new RENAME TO memory_search');
    }
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
      const rebuild = this.getDb().transaction(() => {
        this.getDb().exec('DELETE FROM memory_search; DELETE FROM memory_meta;');
        for (const obj of objects) {
          this.insertIntoIndex(obj);
        }
      });
      rebuild();
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) {
      return [];
    }

    // Колонки memory_search по порядку: memory_id, type, title, body, tags, status, review_state, facet.
    // title и tags весят заметно больше body; facet — фильтруемая колонка, вес дефолтный.
    const bm25Expr = 'bm25(memory_search, 1.0, 1.0, 8.0, 1.0, 4.0, 1.0, 1.0, 1.0)';

    let sql = `
      SELECT s.memory_id, s.type, s.title, s.body, s.status, s.review_state,
             m.confidence, m.importance, m.created_at, m.updated_at, m.created_by,
             m.schema_version, m.source, m.related, m.tags, m.superseded_by, m.facet,
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
    if (options.facet) {
      // P212 (2.13 §5.3б): фасет хранится в memory_meta (NULL у типов без фасета)
      sql += ` AND m.facet = ?`;
      params.push(options.facet);
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

    // A7: file_path-фильтр в SQL (до JS-маппинга); семантика эквивалентна
    // matchesFilePath: source.path === filePath ИЛИ related.files содержит
    // f === filePath / f.endsWith('/' + filePath). source/related всегда
    // валидный JSON (insertIntoIndex пишет JSON.stringify); отсутствующий
    // $.files → json_extract NULL → json_each(NULL) = 0 строк.
    const filePath = options.file_path;
    if (filePath) {
      sql += ` AND (json_extract(m.source, '$.path') = ?
        OR EXISTS (SELECT 1 FROM json_each(json_extract(m.related, '$.files')) fe
                   WHERE fe.value = ? OR substr(fe.value, -(length(?) + 1)) = '/' || ?))`;
      params.push(filePath, filePath, filePath, filePath);
    }

    sql += ` ORDER BY ${bm25Expr}`;

    // A7: LIMIT в SQL, когда нет file_path-фильтра (с фильтром семантика
    // «limit после фильтра» сохранена JS-slice'ом ниже).
    if (options.limit && !filePath) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    const rows = this.getDb()
      .prepare(sql)
      .all(...params) as any[];
    const results = rows.map((row) => this.rowToResult(row));

    if (options.limit && filePath) {
      return results.slice(0, options.limit);
    }
    return results;
  }

  /** Все живые объекты индекса без MATCH; для проверки свежести индекса (validate). */
  async searchAll(): Promise<SearchResult[]> {
    const rows = this.getDb()
      .prepare(
        `SELECT s.memory_id, s.type, s.title, s.body, s.status, s.review_state,
                m.confidence, m.importance, m.created_at, m.updated_at, m.created_by,
                m.schema_version, m.source, m.related, m.tags, m.superseded_by, m.facet
         FROM memory_search s
         JOIN memory_meta m ON s.memory_id = m.memory_id
         WHERE s.status NOT IN ('superseded', 'archived')`
      )
      .all() as any[];
    return rows.map((row) => this.rowToResult(row));
  }

  private rowToResult(row: any): SearchResult {
    return {
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
        // NULL → undefined: без фасета объект сравним с каноническим (toEqual)
        ...(row.facet != null ? { facet: row.facet } : {}),
      } as MemoryObject,
      score: this.computeScore(row.rank ?? 0, row.importance, row.confidence),
    };
  }

  private computeScore(rawRank: number, importance: number, confidence: string): number {
    const confidenceWeight = confidence === 'high' ? 1.2 : confidence === 'medium' ? 1.0 : 0.8;
    return -rawRank * (1 + importance) * confidenceWeight;
  }

  private removeFromIndex(id: string): void {
    this.getDb().prepare('DELETE FROM memory_search WHERE memory_id = ?').run(id);
    this.getDb().prepare('DELETE FROM memory_meta WHERE memory_id = ?').run(id);
  }

  private insertIntoIndex(object: MemoryObject): void {
    // P212 (2.13 §5.3а): facet пишется только у note (иначе NULL)
    const facet = typeof object.facet === 'string' ? object.facet : null;
    this.getDb()
      .prepare(
        'INSERT INTO memory_search (memory_id, type, title, body, tags, status, review_state, facet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        object.id,
        object.type,
        object.title,
        object.body,
        object.tags.join(','),
        object.status,
        object.review_state,
        facet
      );
    this.getDb()
      .prepare(
        'INSERT INTO memory_meta (memory_id, type, status, review_state, importance, created_at, confidence, created_by, updated_at, superseded_by, source, related, tags, schema_version, facet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
        object.schema_version,
        facet
      );
  }
}
