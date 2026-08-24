import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { withMemoryLock, LOCK_TIMING, LockHeldError } from '../../../src/adapters/fs/memory-lock.js';
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
