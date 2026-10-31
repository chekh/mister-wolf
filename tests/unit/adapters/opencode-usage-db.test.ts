import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { readUsageSource } from '../../../src/adapters/fs/opencode-usage-db.js';

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-usage-db-'));
  dirs.push(dir);
  return join(dir, 'opencode.db');
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

interface TurnRow {
  id: string;
  sessionId: string;
  created: number;
  data: Record<string, unknown>;
}

interface SessionRow {
  id: string;
  parentId?: string | null;
  model?: Record<string, unknown> | null;
  created?: number | null;
  busy?: number | null;
}

function buildDb(turns: TurnRow[], sessions: SessionRow[]): string {
  const path = tempPath();
  const db = new Database(path);
  db.exec(`
    CREATE TABLE session_v2 (id TEXT PRIMARY KEY, parent_id TEXT, agent TEXT, model TEXT, time_created INTEGER, time_busy INTEGER);
    CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, time_updated INTEGER, data TEXT);
  `);
  for (const session of sessions) {
    db.prepare(
      'INSERT INTO session_v2 (id, parent_id, agent, model, time_created, time_busy) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      session.id,
      session.parentId ?? null,
      'executor-lead',
      session.model === null ? null : JSON.stringify(session.model ?? { id: 'm1', providerID: 'p1' }),
      session.created ?? null,
      session.busy ?? null
    );
  }
  for (const turn of turns) {
    db.prepare(
      'INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(turn.id, turn.sessionId, 'assistant', 1, turn.created, turn.created, JSON.stringify(turn.data));
  }
  db.close();
  return path;
}

describe('readUsageSource', () => {
  it('reads the time window, maps tokens/attempt/finish and session metadata', () => {
    const path = buildDb(
      [
        {
          id: 'msg_a',
          sessionId: 'ses_a',
          created: 2000,
          data: {
            time: { created: 2000, completed: 2600 },
            agent: 'executor-lead',
            model: { id: 'ds-cp/deepseek-flash', providerID: 'company', variant: 'default' },
            tokens: { input: 10, output: 2, reasoning: 1, cache: { read: 5, write: 3 } },
            finish: 'stop',
            retry: { attempt: 2 },
          },
        },
        {
          id: 'msg_b',
          sessionId: 'ses_b',
          created: 3000,
          // streamed есть, completed нет → turn незавершён (design §Маппинг инвариант 5)
          data: { time: { created: 3000, streamed: 3200 } },
        },
      ],
      [
        { id: 'ses_a', parentId: 'ses_parent', created: 1000, busy: 4000 },
        { id: 'ses_b', created: 3500, busy: 3000 },
      ]
    );

    const reading = readUsageSource(path, { sinceMs: 1500, untilMs: 3500 });

    expect(reading.turns.map((turn) => turn.messageId)).toEqual(['msg_a', 'msg_b']);
    const [complete, unfinished] = reading.turns;
    expect(complete?.tokens).toEqual({ input: 10, output: 2, cacheRead: 5 });
    expect(complete?.reasoning).toBe(1);
    expect(complete?.cacheWrite).toBe(3);
    expect(complete?.completedMs).toBe(2600);
    expect(complete?.attempt).toBe(2);
    expect(complete?.finish).toBe('stop');
    expect(unfinished?.completedMs).toBeNull();
    expect(unfinished?.tokens).toBeNull();
    expect(unfinished?.attempt).toBeNull();
    expect(unfinished?.finish).toBeNull();

    const runA = reading.runs.find((run) => run.sessionId === 'ses_a');
    expect(runA).toMatchObject({
      parentSessionId: 'ses_parent',
      modelId: 'm1',
      providerId: 'p1',
      createdMs: 1000,
      busyMs: 3000,
    });
    // time_busy < time_created → busy неизвестен, не отрицательный
    expect(reading.runs.find((run) => run.sessionId === 'ses_b')?.busyMs).toBeNull();
  });

  it('applies the window to turn time_created', () => {
    const path = buildDb(
      [
        { id: 'old', sessionId: 'ses_a', created: 1000, data: { time: { created: 1000, completed: 1100 } } },
        { id: 'new', sessionId: 'ses_a', created: 5000, data: { time: { created: 5000, completed: 5100 } } },
      ],
      [{ id: 'ses_a' }]
    );
    expect(readUsageSource(path, { sinceMs: 2000, untilMs: 6000 }).turns.map((turn) => turn.messageId)).toEqual([
      'new',
    ]);
  });

  it('throws a diagnosable error for a missing file', () => {
    expect(() => readUsageSource(join(tempPath(), 'absent.db'), { sinceMs: 0, untilMs: 1 })).toThrow(
      /cannot open usage database/
    );
  });

  it('throws a diagnosable error for a database without the expected tables', () => {
    const path = tempPath();
    new Database(path).close();
    expect(() => readUsageSource(path, { sinceMs: 0, untilMs: 1 })).toThrow(/lacks session_message, session_v2/);
  });

  it('does not modify the source database file (NFR-03)', () => {
    const path = buildDb(
      [{ id: 'msg_a', sessionId: 'ses_a', created: 2000, data: { time: { created: 2000, completed: 2600 } } }],
      [{ id: 'ses_a' }]
    );
    const before = sha256(path);
    readUsageSource(path, { sinceMs: 0, untilMs: 10_000 });
    expect(sha256(path)).toBe(before);
  });
});
