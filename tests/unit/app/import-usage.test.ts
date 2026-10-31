import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { importUsage } from '../../../src/app/use-cases/import-usage.js';
import { metricsLogPath, readSignalLog } from '../../../src/adapters/fs/session-metrics-log.js';
import { metricsDir } from '../../../src/adapters/fs/project-paths.js';

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const WINDOW = { sinceMs: 0, untilMs: 10_000_000 };

interface TurnRow {
  id: string;
  sessionId: string;
  created: number;
  completed?: number | null;
  retry?: number;
  tokens?: { input: number; output: number; cacheRead: number };
}

function sourceDb(turns: TurnRow[]): string {
  const path = join(tempDir('wolf-usage-src-'), 'opencode.db');
  const db = new Database(path);
  db.exec(`
    CREATE TABLE session_v2 (id TEXT PRIMARY KEY, parent_id TEXT, agent TEXT, model TEXT, time_created INTEGER, time_busy INTEGER);
    CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, time_updated INTEGER, data TEXT);
  `);
  const insertSession = db.prepare(
    'INSERT INTO session_v2 (id, parent_id, agent, model, time_created, time_busy) VALUES (?, NULL, ?, ?, 0, 1000)'
  );
  for (const id of new Set(turns.map((turn) => turn.sessionId))) {
    insertSession.run(id, 'executor-lead', JSON.stringify({ id: 'm1', providerID: 'p1' }));
  }
  const insertMessage = db.prepare(
    'INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES (?, ?, ?, 1, ?, ?, ?)'
  );
  for (const turn of turns) {
    const time: Record<string, unknown> = { created: turn.created };
    if (turn.completed !== null) time.completed = turn.completed ?? turn.created + 500;
    const data: Record<string, unknown> = {
      time,
      agent: 'executor-lead',
      model: { id: 'm1', providerID: 'p1' },
      finish: 'stop',
    };
    if (turn.retry !== undefined) data.retry = { attempt: turn.retry };
    if (turn.tokens) {
      data.tokens = { input: turn.tokens.input, output: turn.tokens.output, cache: { read: turn.tokens.cacheRead } };
    }
    insertMessage.run(turn.id, turn.sessionId, 'assistant', turn.created, turn.created, JSON.stringify(data));
  }
  db.close();
  return path;
}

const TWO_RUNS: TurnRow[] = [
  {
    id: 'msg_a',
    sessionId: 'ses_a',
    created: 1000,
    completed: 1500,
    retry: 1,
    tokens: { input: 10, output: 5, cacheRead: 2 },
  },
  { id: 'msg_b', sessionId: 'ses_b', created: 2000, completed: 2600, retry: 1 },
];

describe('importUsage', () => {
  it('appends completed turns as run events and is idempotent on repeat', () => {
    const baseDir = tempDir('wolf-usage-base-');
    const dbPath = sourceDb(TWO_RUNS);

    const first = importUsage(baseDir, { dbPath, ...WINDOW });
    expect(first.appended).toBe(2);
    expect(first.duplicate).toBe(0);
    expect(first.skippedIncomplete).toBe(0);

    const events = readSignalLog(baseDir).events.filter((event) => event.event === 'run');
    expect(events).toHaveLength(2);
    expect(events[0]?.event_id).toBeTruthy();
    expect(events[0]?.tokens).toEqual({ input: 10, output: 5, cache_read: 2 });
    expect(events[0]?.weighted).toBe(10 + 0.1 * 2 + 5 * 5);
    expect(first.runs).toHaveLength(2);
    expect(first.runs.map((run) => run.attempts)).toEqual([[1], [1]]);

    const contentAfterFirst = readFileSync(metricsLogPath(baseDir), 'utf-8');
    const second = importUsage(baseDir, { dbPath, ...WINDOW });
    expect(second.appended).toBe(0);
    expect(second.duplicate).toBe(2);
    expect(readFileSync(metricsLogPath(baseDir), 'utf-8')).toBe(contentAfterFirst);
    expect(second.runs).toHaveLength(2);
  });

  it('counts unfinished turns as skipped and writes nothing on dry run', () => {
    const baseDir = tempDir('wolf-usage-base-');
    const dbPath = sourceDb([
      { id: 'msg_done', sessionId: 'ses_a', created: 1000, completed: 1500 },
      { id: 'msg_unfinished', sessionId: 'ses_a', created: 2000, completed: null },
    ]);

    const dry = importUsage(baseDir, { dbPath, ...WINDOW, dryRun: true });
    expect(dry.appended).toBe(1);
    expect(dry.skippedIncomplete).toBe(1);
    expect(readSignalLog(baseDir).totalLines).toBe(0);

    const real = importUsage(baseDir, { dbPath, ...WINDOW });
    expect(real.appended).toBe(1);
    expect(real.skippedIncomplete).toBe(1);
    expect(readSignalLog(baseDir).totalLines).toBe(1);
  });

  it('applies the session task map and reports unknowns plus source limitations', () => {
    const baseDir = tempDir('wolf-usage-base-');
    const dbPath = sourceDb([{ id: 'msg_a', sessionId: 'ses_a', created: 1000, completed: 1500 }]);

    const result = importUsage(baseDir, { dbPath, ...WINDOW, taskMap: { ses_a: 'T-1' } });
    const event = readSignalLog(baseDir).events.find((item) => item.event === 'run');
    expect(event?.task_id).toBe('T-1');
    expect(result.runs[0]?.taskId).toBe('T-1');
    // retry в источнике отсутствует → attempt неизвестен, а не 0
    expect(result.runs[0]?.unknowns).toContain('attempt-unknown');
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('keeps v1 records and tolerates malformed lines', () => {
    const baseDir = tempDir('wolf-usage-base-');
    mkdirSync(metricsDir(baseDir), { recursive: true });
    const v1 = {
      ts: '2026-09-03T12:00:00.000Z',
      event: 'run',
      session_id: 's-v1',
      gen_ai: { modelID: 'legacy/model', agent: null },
      orchestration: { task: null, actor: 'user:cli' },
    };
    writeFileSync(metricsLogPath(baseDir), `${JSON.stringify(v1)}\nnot json\n`);

    const dbPath = sourceDb([{ id: 'msg_a', sessionId: 'ses_a', created: 1000, completed: 1500 }]);
    const result = importUsage(baseDir, { dbPath, ...WINDOW });

    expect(result.appended).toBe(1);
    const log = readSignalLog(baseDir);
    expect(log.malformedLines).toBe(1);
    expect(log.events.some((event) => event.session_id === 's-v1')).toBe(true);
    expect(readFileSync(metricsLogPath(baseDir), 'utf-8')).toContain(JSON.stringify(v1));
  });
});
