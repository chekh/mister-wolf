import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';

function makeEvent(id: string) {
  return {
    id,
    type: 'memory.added' as const,
    timestamp: '2026-06-29T12:00:00Z',
    actor: 'user:test',
    payload: { memory_id: 'mem_1' },
  };
}

describe('JsonlEventLog', () => {
  let dir: string;
  let log: JsonlEventLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-events-'));
    log = new JsonlEventLog(join(dir, 'events.jsonl'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends and reads events', async () => {
    await log.append(makeEvent('evt_1'));
    await log.append(makeEvent('evt_2'));
    const events = await log.readAll();
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt_1');
  });

  it('returns an empty array when the log does not exist', async () => {
    const freshLog = new JsonlEventLog(join(dir, 'missing.jsonl'));
    const events = await freshLog.readAll();
    expect(events).toEqual([]);
  });

  it('throws when a line is not valid JSON', async () => {
    const path = join(dir, 'bad.jsonl');
    writeFileSync(path, '{not json}\n', 'utf-8');
    const badLog = new JsonlEventLog(path);
    await expect(badLog.readAll()).rejects.toThrow('Invalid JSON at line 1');
  });

  it('throws when a line fails schema validation', async () => {
    const path = join(dir, 'invalid.jsonl');
    writeFileSync(path, JSON.stringify({ id: 'evt_x', type: 'unknown' }) + '\n', 'utf-8');
    const badLog = new JsonlEventLog(path);
    await expect(badLog.readAll()).rejects.toThrow('Event schema validation failed at line 1');
  });
});
