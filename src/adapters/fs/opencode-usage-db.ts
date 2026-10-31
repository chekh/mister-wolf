/**
 * A1.1: read-only чтение usage-источника OpenCode 2.2.5 (`session_message` /
 * `session_v2`). Только SELECT, никаких DDL/DML; окно ограничено индексом
 * session_message_time_created_idx. Контракт и маппинг:
 * docs/dev/2026-10-31-a1-1-measurements/design.md §«Источник», §«Маппинг».
 */
import { homedir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import type { UsageRun, UsageTurn } from '../../app/use-cases/usage-signal.js';

export const DEFAULT_USAGE_DB_PATH = join(homedir(), '.local', 'share', 'opencode', 'opencode.db');

export interface UsageSourceReading {
  runs: UsageRun[];
  turns: UsageTurn[];
}

interface MessageRow {
  id: string;
  session_id: string | null;
  seq: number | null;
  time_created: number | null;
  data: string | null;
}

interface SessionRow {
  id: string;
  parent_id: string | null;
  agent: string | null;
  model: string | null;
  time_created: number | null;
  time_busy: number | null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return record(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** `data` парсится в JS: json_extract по 13 GB-таблице дороже выборки. */
function mapTurn(row: MessageRow): UsageTurn {
  const data = parseJson(row.data);
  const time = record(data.time);
  const model = record(data.model);
  const tokens = record(data.tokens);
  const cache = record(tokens.cache);
  const retry = record(data.retry);

  const input = num(tokens.input);
  const output = num(tokens.output);
  const cacheRead = num(cache.read);
  const finish = data.finish;

  return {
    messageId: row.id,
    sessionId: row.session_id ?? '',
    seq: row.seq,
    createdMs: num(time.created) ?? row.time_created,
    completedMs: num(time.completed) ?? num(time.streamed),
    agent: str(data.agent),
    modelId: str(model.id),
    providerId: str(model.providerID),
    tokens: input !== null && output !== null && cacheRead !== null ? { input, output, cacheRead } : null,
    reasoning: num(tokens.reasoning),
    cacheWrite: num(cache.write),
    finish: finish === 'stop' || finish === 'tool-calls' || finish === 'error' ? finish : null,
    attempt: num(retry.attempt),
  };
}

function mapRun(row: SessionRow): UsageRun {
  const model = parseJson(row.model);
  const busy =
    row.time_busy !== null && row.time_created !== null && row.time_busy >= row.time_created
      ? row.time_busy - row.time_created
      : null;
  return {
    sessionId: row.id,
    parentSessionId: row.parent_id,
    agent: row.agent,
    modelId: str(model.id),
    providerId: str(model.providerID),
    createdMs: row.time_created,
    busyMs: busy,
  };
}

/** Читает только чтение. Окно по time_created turn'ов; ошибка источника → throw. */
export function readUsageSource(dbPath: string, opts: { sinceMs: number; untilMs: number }): UsageSourceReading {
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (error) {
    throw new Error(`cannot open usage database at ${dbPath}: ${(error as Error).message}`);
  }
  try {
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
        (row) => row.name
      )
    );
    const missing = ['session_message', 'session_v2'].filter((table) => !tables.has(table));
    if (missing.length > 0) {
      throw new Error(`usage database at ${dbPath} lacks ${missing.join(', ')} (OpenCode 2.2.5 schema expected)`);
    }

    const messages = db
      .prepare(
        `SELECT id, session_id, seq, time_created, data FROM session_message
         WHERE type = 'assistant' AND time_created >= ? AND time_created < ?
         ORDER BY time_created, id`
      )
      .all(opts.sinceMs, opts.untilMs) as MessageRow[];
    const turns = messages.map(mapTurn);

    const sessionIds = [...new Set(turns.map((turn) => turn.sessionId).filter((id) => id !== ''))];
    let runs: UsageRun[] = [];
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(', ');
      const rows = db
        .prepare(
          `SELECT id, parent_id, agent, model, time_created, time_busy FROM session_v2 WHERE id IN (${placeholders})`
        )
        .all(...sessionIds) as SessionRow[];
      runs = rows.map(mapRun);
    }
    return { runs, turns };
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('usage database at ')) throw error;
    throw new Error(`cannot read usage database at ${dbPath}: ${message}`);
  } finally {
    db.close();
  }
}
