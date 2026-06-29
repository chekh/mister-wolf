export const SQLITE_SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(
    memory_id,
    type,
    title,
    body,
    tags,
    status,
    review_state
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
    schema_version INTEGER NOT NULL
  );
`;
