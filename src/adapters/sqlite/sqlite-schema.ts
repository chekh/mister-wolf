export const SQLITE_SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(
    memory_id,
    type,
    title,
    body,
    tags,
    status,
    review_state,
    facet
  );

  CREATE TABLE IF NOT EXISTS memory_meta (
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
    schema_version INTEGER NOT NULL,
    facet TEXT
  );

  -- 3.2.0 T-05 (REQ-03, design §7): derived projection of the addressed
  -- signal queue (complaint/lesson/note, candidate envelopes excluded).
  -- title is a snapshot at indexing time: due/list read ONLY this table,
  -- body is never read (NFR-05: full body-scan forbidden).
  -- seq is the monotonic revision number.
  CREATE TABLE IF NOT EXISTS learning_signals (
    memory_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    revision TEXT NOT NULL,
    seq INTEGER NOT NULL,
    changed_at TEXT NOT NULL,
    disposition TEXT NOT NULL DEFAULT 'pending'
  );
  CREATE INDEX IF NOT EXISTS idx_learning_signals_seq ON learning_signals(seq);

  -- Processed-batch cursor (REQ-12): one row per DB — the DB is created per
  -- memory-root of a single project. Moves only by explicit ack, forward only.
  CREATE TABLE IF NOT EXISTS learning_cursor (
    id INTEGER PRIMARY KEY CHECK (id = 0),
    cursor INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO learning_cursor (id, cursor, updated_at) VALUES (0, 0, '');
`;
