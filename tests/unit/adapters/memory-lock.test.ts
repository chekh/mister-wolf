import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import {
  withMemoryLock,
  withJournalLockSync,
  JOURNAL_LOCK_DB_FILE,
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

// patch 3.4.x review (F2.1): журнальный лок — SQLite BEGIN IMMEDIATE в
// отдельной базе блокировки; кражи по возрасту больше нет, отказ — только по
// busy-тайм-ауту, освобождение — после fn (COMMIT/ROLLBACK + close).
describe('withJournalLockSync (REQ-333-2, ADR-340-1; patch 3.4.x review: SQLite BEGIN IMMEDIATE)', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-jlock-'));
    lockPath = join(dir, 'micro-note-delivery.lock.sqlite');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the fn result, creates the lock DB next to the journal and releases after fn', () => {
    let lockedInside = false;
    const result = withJournalLockSync(
      dir,
      () => {
        lockedInside = existsSync(lockPath); // база блокировки существует внутри секции
        return 41 + 1;
      },
      { maxWaitMs: 1000 }
    );
    expect(result).toBe(42);
    expect(lockedInside).toBe(true);
    // повторный вызов в том же потоке успешен: лок освобождён (COMMIT + close)
    expect(withJournalLockSync(dir, () => 'second', { maxWaitMs: 1000 })).toBe('second');
  });

  // Чужой активный владелец (открытая транзакция BEGIN IMMEDIATE): держатель
  // удерживает право записи НЕЗАВИСИМО от возраста; ожидающий получает
  // LockHeldError только по busy-тайм-ауту, чужую базу он не трогает.
  it('refuses with LockHeldError after the busy timeout while another holder keeps the transaction open', () => {
    const foreign = new Database(lockPath, { timeout: 1000 });
    try {
      foreign.exec('BEGIN IMMEDIATE');
      expect(() =>
        withJournalLockSync(
          dir,
          () => {
            throw new Error('should not reach');
          },
          { maxWaitMs: 300 }
        )
      ).toThrow(LockHeldError);
      // владелец не «украден»: его транзакция всё ещё открыта и права при нём
      expect(() => foreign.exec('SELECT 1')).not.toThrow();
    } finally {
      try {
        foreign.exec('ROLLBACK');
      } catch {
        /* уже закрыто */
      }
      foreign.close();
    }
    // после освобождения ожидание завершается успехом — никакой stale-задержки
    expect(withJournalLockSync(dir, () => 'acquired', { maxWaitMs: 1000 })).toBe('acquired');
  });

  // Живой владелец сохраняет право записи дольше ЛЮБОГО возраста: никакого
  // кражи по возрасту (старый протокол O_EXCL крал лок ≥ 30 с).
  it('never steals by age: the holder keeps the write right regardless of hold duration', () => {
    const foreign = new Database(lockPath, { timeout: 1000 });
    try {
      foreign.exec('BEGIN IMMEDIATE');
      // «возраст» секции не проверяется: нет ни таймера, ни кражи — только busy
      expect(() => withJournalLockSync(dir, () => null, { maxWaitMs: 200 })).toThrow(LockHeldError);
    } finally {
      try {
        foreign.exec('ROLLBACK');
      } catch {
        /* уже закрыто */
      }
      foreign.close();
    }
  });

  it('failing fn rolls back and releases the lock for the next acquirer', () => {
    expect(() =>
      withJournalLockSync(dir, () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(withJournalLockSync(dir, () => 'after-failure')).toBe('after-failure');
  });

  it('uses the journal lock DB name by default (next to the journal, outside .wolf/cache)', () => {
    withJournalLockSync(dir, () => null);
    expect(existsSync(lockPath)).toBe(true); // имя по умолчанию — micro-note-delivery.lock.sqlite
  });
});
