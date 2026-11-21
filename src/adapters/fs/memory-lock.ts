import { openSync, closeSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import type { MemoryLock } from '../../ports/memory-lock.port.js';

/**
 * patch 3.4.x review (F2.1): имя отдельной базы блокировки журнала — файл лежит
 * РЯДОМ с журналом (каталог `.wolf/memory`), ВНЕ кэша `.wolf/cache`
 * (rebuild и удаление index.sqlite лок не трогают).
 */
export const JOURNAL_LOCK_DB_FILE = 'micro-note-delivery.lock.sqlite';

/**
 * patch 3.4.x review (F2.1, REQ-333-2): журнальный лок — межпроцессная
 * блокировка SQLite `BEGIN IMMEDIATE` в отдельной базе блокировки проекта.
 * Право записи держится ОТКРЫТОЙ транзакцией на всю критическую секцию fn():
 * крах владельца ОС/SQLite освобождают при следующем открытии (rollback hot
 * journal) — НИКАКОЙ кражи по возрасту и никакого stale-таймера: живой
 * владелец сохраняет право записи независимо от возраста секции. Занятый лок
 * ждёт до busy-тайм-аута (LOCK_TIMING.MAX_WAIT_MS), затем SQLITE_BUSY →
 * LockHeldError. Режим журнала базы — по умолчанию (rollback), WAL не нужен:
 * база не хранит данных, только право записи.
 */
export function withJournalLockSync<T>(
  dir: string,
  fn: () => T,
  opts?: LockOpts,
  lockFileName: string = JOURNAL_LOCK_DB_FILE
): T {
  mkdirSync(dir, { recursive: true });
  const maxWaitMs = opts?.maxWaitMs ?? LOCK_TIMING.MAX_WAIT_MS;
  const path = lockPathFor(dir, lockFileName);
  const db = new Database(path, { timeout: maxWaitMs });
  try {
    try {
      db.exec('BEGIN IMMEDIATE');
    } catch (e) {
      // занято другим процессом дольше busy-тайм-аута (или нетерпимый сбой)
      if (isSqliteBusy(e)) throw new LockHeldError(path, null);
      throw e;
    }
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* транзакция уже откачена (например, краем fn) */
      }
      throw e;
    }
  } finally {
    db.close();
  }
}

/** SQLITE_BUSY — лок занят другим владельцем (единственная ожидаемая причина
 *  отказа BEGIN IMMEDIATE); остальное — нетерпимый сбой базы блокировки. */
function isSqliteBusy(e: unknown): boolean {
  return e instanceof Error && (e as Error & { code?: string }).code === 'SQLITE_BUSY';
}

export const LOCK_TIMING = {
  STALE_MS: 30_000,
  RETRY_MS: 100,
  MAX_WAIT_MS: 5_000,
} as const;

export interface LockOpts {
  maxWaitMs?: number;
  staleMs?: number;
}

export class LockHeldError extends Error {
  constructor(
    public readonly lockPath: string,
    public readonly holderPid: number | null
  ) {
    super(`Lock held: ${lockPath} (holder pid: ${holderPid})`);
    this.name = 'LockHeldError';
  }
}

export class FsMemoryLock implements MemoryLock {
  constructor(private dir: string) {}

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    return withMemoryLock(this.dir, fn);
  }
}

function lockPathFor(dir: string, lockFileName: string): string {
  return join(dir, lockFileName);
}

function parseLockFile(content: string): { pid: number; ts: number } {
  try {
    const data = JSON.parse(content);
    return { pid: Number(data.pid) || 0, ts: Number(data.ts) || 0 };
  } catch {
    return { pid: 0, ts: 0 };
  }
}

function isStale(ts: number, staleMs: number): boolean {
  return isNaN(ts) || ts === 0 || Date.now() - ts > staleMs;
}

function tryAcquire(path: string): boolean {
  try {
    const fd = openSync(path, 'wx');
    const payload = JSON.stringify({ pid: process.pid, ts: Date.now() });
    writeFileSync(fd, payload);
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function stealIfStale(path: string, staleMs: number): { stolen: boolean; holderPid: number | null } {
  try {
    const content = readFileSync(path, 'utf-8');
    const { pid, ts } = parseLockFile(content);
    if (!isStale(ts, staleMs)) return { stolen: false, holderPid: pid || null };
    // ponytail: race between two stealers is acceptable for local-first
    try {
      unlinkSync(path);
      return { stolen: true, holderPid: pid || null };
    } catch {
      return { stolen: false, holderPid: pid || null };
    }
  } catch {
    return { stolen: false, holderPid: null };
  }
}

export async function withMemoryLock<T>(
  dir: string,
  fn: () => Promise<T>,
  opts?: LockOpts,
  lockFileName: string = '.lock'
): Promise<T> {
  mkdirSync(dir, { recursive: true });
  const maxWaitMs = opts?.maxWaitMs ?? LOCK_TIMING.MAX_WAIT_MS;
  const staleMs = opts?.staleMs ?? LOCK_TIMING.STALE_MS;
  const retryMs = LOCK_TIMING.RETRY_MS;
  const path = lockPathFor(dir, lockFileName);

  const deadline = Date.now() + maxWaitMs;

  while (true) {
    if (tryAcquire(path)) {
      try {
        return await fn();
      } finally {
        try {
          unlinkSync(path);
        } catch {
          /* already gone */
        }
      }
    }

    const { stolen, holderPid } = stealIfStale(path, staleMs);
    if (!stolen) {
      if (Date.now() >= deadline) throw new LockHeldError(path, holderPid);
      await new Promise<void>((r) => setTimeout(r, retryMs));
    }
  }
}
