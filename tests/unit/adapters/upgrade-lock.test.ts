import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { UpgradeLock, LOCK_TTL_MS } from '../../../src/adapters/fs/upgrade-lock.js';

let dir: string;
let nowMs: number;
const clock = (): number => nowMs;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-upgrade-lock-'));
  nowMs = 1_000_000;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('UpgradeLock', () => {
  it('acquires when no lock exists and writes a timestamp file', () => {
    expect(new UpgradeLock(clock, dir).acquire('wolf-upgrade')).toBe(true);
    const file = join(dir, 'wolf-upgrade.lock');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe(String(nowMs));
  });

  it('throws "upgrade already running" while a live lock is held by another holder', () => {
    new UpgradeLock(clock, dir).acquire('wolf-upgrade');
    nowMs += LOCK_TTL_MS - 1; // ещё жив
    expect(() => new UpgradeLock(clock, dir).acquire('wolf-upgrade')).toThrow('upgrade already running');
  });

  it('takes over a stale lock (age ≥ TTL) by rewriting the timestamp', () => {
    new UpgradeLock(clock, dir).acquire('wolf-upgrade');
    nowMs += LOCK_TTL_MS; // протух
    expect(new UpgradeLock(clock, dir).acquire('wolf-upgrade')).toBe(true);
    expect(readFileSync(join(dir, 'wolf-upgrade.lock'), 'utf-8')).toBe(String(nowMs));
  });

  it('takes over a corrupt lock file (unparsable timestamp)', () => {
    writeFileSync(join(dir, 'wolf-upgrade.lock'), 'garbage');
    expect(new UpgradeLock(clock, dir).acquire('wolf-upgrade')).toBe(true);
    expect(readFileSync(join(dir, 'wolf-upgrade.lock'), 'utf-8')).toBe(String(nowMs));
  });

  it('re-acquire by the same holder is idempotent (no error)', () => {
    const lock = new UpgradeLock(clock, dir);
    expect(lock.acquire('wolf-upgrade')).toBe(true);
    expect(lock.acquire('wolf-upgrade')).toBe(true);
  });

  it('release removes the lock file; releasing an absent lock is a no-op', () => {
    const lock = new UpgradeLock(clock, dir);
    lock.acquire('wolf-upgrade');
    lock.release('wolf-upgrade');
    expect(existsSync(join(dir, 'wolf-upgrade.lock'))).toBe(false);
    expect(() => lock.release('wolf-upgrade')).not.toThrow();
  });

  it('default lock path is under os.tmpdir()', () => {
    const id = `wolf-upgrade-test-${randomUUID()}`;
    const lock = new UpgradeLock(clock); // дефолтный каталог — os.tmpdir()
    try {
      expect(lock.acquire(id)).toBe(true);
      expect(existsSync(join(tmpdir(), `${id}.lock`))).toBe(true);
    } finally {
      lock.release(id);
    }
  });
});
