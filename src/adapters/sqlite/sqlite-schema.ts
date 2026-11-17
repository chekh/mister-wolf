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

  -- 3.2.0 T-09 (REQ-09/REQ-11, design §10): micro-note attribution. One row per
  -- actual selection/delivery event (id + exact content revision); observations
  -- default to unknown and are only set from existing data. CREATE IF NOT
  -- EXISTS runs on every open — existing databases migrate lazily (same path
  -- as learning_signals).
  CREATE TABLE IF NOT EXISTS micro_note_deliveries (
    memory_id TEXT NOT NULL,
    revision TEXT NOT NULL,
    channel TEXT NOT NULL,
    kind TEXT NOT NULL,
    ts TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_micro_note_deliveries_id ON micro_note_deliveries(memory_id);

  -- S-27: contradiction → note temporarily out of delivery; BOTH evidences are
  -- kept verbatim, the original fact in memory is never touched. One open
  -- conflict per note (upsert by memory_id); resolution is an audit field.
  CREATE TABLE IF NOT EXISTS micro_note_suppressions (
    memory_id TEXT PRIMARY KEY,
    revision TEXT NOT NULL,
    reason TEXT NOT NULL,
    note_evidence TEXT NOT NULL,
    contradiction_evidence TEXT NOT NULL,
    suppressed_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT
  );

  CREATE TABLE IF NOT EXISTS micro_note_observations (
    memory_id TEXT PRIMARY KEY,
    revision TEXT NOT NULL,
    observed_use TEXT,
    observed_outcome TEXT NOT NULL DEFAULT 'unknown',
    updated_at TEXT NOT NULL
  );
`;
