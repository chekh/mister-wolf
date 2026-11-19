import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  withMemoryLock,
  withJournalLockSync,
  LOCK_TIMING,
  LockHeldError,
} from '../../../src/adapters/fs/memory-lock.js';
import { sleep } from './test-helpers.js';

describe('FsMemoryLock', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-lock-'));
    lockPath = join(dir, '.lock');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('second concurrent writer waits and then proceeds', async () => {
    const order: number[] = [];
    const p1 = withMemoryLock(dir, async () => {
      order.push(1);
      await sleep(200);
      order.push(2);
    });
    const p2 = withMemoryLock(dir, async () => {
      order.push(3);
    });
    await Promise.all([p1, p2]);
    // 3 must appear after 2 (second writer waits for first)
    expect(order).toEqual([1, 2, 3]);
  });

  it('throws LockHeldError when lock held beyond maxWait', async () => {
    // First holder takes 500ms
    const p1 = withMemoryLock(dir, async () => {
      await sleep(500);
    });
    // Second tries with maxWaitMs=300
    const p2 = withMemoryLock(
      dir,
      async () => {
        throw new Error('should not reach');
      },
      { maxWaitMs: 300 }
    );
    await expect(p2).rejects.toThrow(LockHeldError);
    await p1;
  });

  it('steals stale lockfile', async () => {
    // Write a stale lockfile manually
    const stale = { pid: 99999, ts: Date.now() - 60_000 };
    writeFileSync(lockPath, JSON.stringify(stale), 'utf-8');
    let called = false;
    await withMemoryLock(dir, async () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});

describe('withMemoryLock custom lock file name (для .wolf/migrate.lock)', () => {
  it('creates the named lock file inside dir during fn and removes it after', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-migratelock-'));
    try {
      let seenDuringFn = false;
      await withMemoryLock(
        dir,
        async () => {
          seenDuringFn = existsSync(join(dir, 'migrate.lock'));
        },
        undefined,
        'migrate.lock'
      );
      expect(seenDuringFn).toBe(true);
      expect(existsSync(join(dir, 'migrate.lock'))).toBe(false);
      expect(existsSync(join(dir, '.lock'))).toBe(false); // дефолтное имя не используется
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('withJournalLockSync (3.4.0 REQ-333-2, ADR-340-1)', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-jlock-'));
    lockPath = join(dir, 'micro-note-delivery.jsonl.lock');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Протокол как у withMemoryLock: O_EXCL-файл {pid, ts}, удаление после fn,
  // кастомное имя файла (журнальный лок живёт рядом с журналом).
  it('creates the named lock file with {pid, ts} during fn and removes it after', () => {
    let seenDuringFn: { pid: number; ts: number } | null = null;
    const result = withJournalLockSync(
      dir,
      () => {
        seenDuringFn = JSON.parse(readFileSync(lockPath, 'utf-8')) as { pid: number; ts: number };
        return 41 + 1;
      },
      undefined,
      'micro-note-delivery.jsonl.lock'
    );
    expect(result).toBe(42);
    expect(seenDuringFn!.pid).toBe(process.pid);
    expect(seenDuringFn!.ts).toBeGreaterThan(0);
    expect(existsSync(lockPath)).toBe(false);
  });

  // Свежий чужой лок: владелец определяется только по факту файла
  // (container-safe, без liveness-проверки) — maxWait → LockHeldError с pid.
  it('refuses with LockHeldError (holder pid) when a fresh foreign lockfile stays within maxWait', () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 999_999, ts: Date.now() }), 'utf-8');
    expect(() =>
      withJournalLockSync(
        dir,
        () => {
          throw new Error('should not reach');
        },
        { maxWaitMs: 300 },
        'micro-note-delivery.jsonl.lock'
      )
    ).toThrow(LockHeldError);
    // чужой файл не удалён (владелец отпускает сам)
    expect(existsSync(lockPath)).toBe(true);
  });

  // Кража по возрасту ≥ staleMs (зависший/убитый процесс не блокирует навсегда).
  it('steals a stale lockfile by age and proceeds', () => {
    writeFileSync(lockPath, JSON.stringify({ pid: 999_999, ts: Date.now() - 60_000 }), 'utf-8');
    let called = false;
    withJournalLockSync(
      dir,
      () => {
        called = true;
        return null;
      },
      { staleMs: 30_000 },
      'micro-note-delivery.jsonl.lock'
    );
    expect(called).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  // Ожидание — блокирующая пауза (Atomics.wait): критическая секция потока не
  // перекрывается с чужой; проверяем через наблюдаемое: лок освобождается
  // только после fn — повторный вызов в том же потоке после возврата успешен.
  it('releases the lock so a subsequent call acquires it again', () => {
    withJournalLockSync(dir, () => 'first', undefined, 'micro-note-delivery.jsonl.lock');
    expect(withJournalLockSync(dir, () => 'second', undefined, 'micro-note-delivery.jsonl.lock')).toBe('second');
    expect(existsSync(lockPath)).toBe(false);
  });
});
