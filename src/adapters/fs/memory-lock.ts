import { openSync, closeSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { MemoryLock } from '../../ports/memory-lock.port.js';

/** Блокирующая пауза (ADR-340-1): ожидание журнального лока в синхронном
 *  контексте — event loop останавливается на retry-интервал, соседние
 *  асинхронные задачи того же процесса не вклиниваются в критическую секцию. */
function blockingSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Синхронный двойник withMemoryLock (REQ-333-2, ADR-340-1): тот же протокол
 * файлового лока (O_EXCL, содержимое {pid, ts}, retry 100 мс, maxWait 5 с,
 * кража по возрасту ≥ 30 с без liveness-проверки — container-safe), но для
 * синхронных критических секций журнала противоречий. Кража между двумя
 * «ворами» допустима (local-first), владелец определяется только по факту
 * файла. Ограничение: NFS/сетевые ФС не поддерживаются (O_EXCL-семантика).
 */
export function withJournalLockSync<T>(dir: string, fn: () => T, opts?: LockOpts, lockFileName: string = '.lock'): T {
  mkdirSync(dir, { recursive: true });
  const maxWaitMs = opts?.maxWaitMs ?? LOCK_TIMING.MAX_WAIT_MS;
  const staleMs = opts?.staleMs ?? LOCK_TIMING.STALE_MS;
  const retryMs = LOCK_TIMING.RETRY_MS;
  const path = lockPathFor(dir, lockFileName);

  const deadline = Date.now() + maxWaitMs;

  while (true) {
    if (tryAcquire(path)) {
      try {
        return fn();
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
      blockingSleep(retryMs);
    }
  }
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
