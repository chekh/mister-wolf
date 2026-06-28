import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
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
});
