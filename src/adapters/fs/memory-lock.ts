import { openSync, closeSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { MemoryLock } from '../../ports/memory-lock.port.js';

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

function lockPathFor(dir: string): string {
  return join(dir, '.lock');
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

export async function withMemoryLock<T>(dir: string, fn: () => Promise<T>, opts?: LockOpts): Promise<T> {
  mkdirSync(dir, { recursive: true });
  const maxWaitMs = opts?.maxWaitMs ?? LOCK_TIMING.MAX_WAIT_MS;
  const staleMs = opts?.staleMs ?? LOCK_TIMING.STALE_MS;
  const retryMs = LOCK_TIMING.RETRY_MS;
  const path = lockPathFor(dir);

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
