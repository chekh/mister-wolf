import Database from 'better-sqlite3';

export class SQLiteIndex {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        path TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gates (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        responded_at TEXT,
        type TEXT,
        payload TEXT
      );

      CREATE TABLE IF NOT EXISTS events_index (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        type TEXT NOT NULL,
        step_id TEXT,
        timestamp TEXT NOT NULL
      );
    `);
  }

  insertCase(data: {
    id: string;
    workflow_id: string;
    status: string;
    created_at: string;
    updated_at: string;
    path: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cases (id, workflow_id, status, created_at, updated_at, path)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(data.id, data.workflow_id, data.status, data.created_at, data.updated_at, data.path);
  }

  listCases(status?: string): Array<{ id: string; workflow_id: string; status: string }> {
    if (status) {
      return this.db.prepare('SELECT id, workflow_id, status FROM cases WHERE status = ?').all(status) as any;
    }
    return this.db.prepare('SELECT id, workflow_id, status FROM cases').all() as any;
  }

  insertGate(data: {
    id: string;
    case_id: string;
    step_id: string;
    status: string;
    requested_at: string;
    type?: string;
    payload?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO gates (id, case_id, step_id, status, requested_at, type, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.id,
      data.case_id,
      data.step_id,
      data.status,
      data.requested_at,
      data.type ?? null,
      data.payload ?? null
    );
  }

  updateGate(id: string, status: string, responded_at: string): void {
    this.db.prepare('UPDATE gates SET status = ?, responded_at = ? WHERE id = ?').run(status, responded_at, id);
  }

  listGates(caseId?: string): Array<{ id: string; case_id: string; step_id: string; status: string }> {
    if (caseId) {
      return this.db.prepare('SELECT id, case_id, step_id, status FROM gates WHERE case_id = ?').all(caseId) as any;
    }
    return this.db.prepare('SELECT id, case_id, step_id, status FROM gates').all() as any;
  }
}
