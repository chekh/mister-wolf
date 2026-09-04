// tests/unit/adapters/cli/coord.test.ts
// P2 D3: `wolf coord` — roundtrip события coord_event в сигнальный лог.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { coordCommand } from '../../../../src/adapters/cli/commands/coord.js';
import { readSignals } from '../../../../src/adapters/fs/session-metrics-log.js';

describe('P2 D3: `wolf coord` — roundtrip в сигнальный лог', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-coord-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('каждый kind (все 5) roundtrip: outcome=kind, actor_from/to, refs из --ref, note', async () => {
    const kinds = ['handoff', 'review', 'acceptance', 'blocker', 'escalation'] as const;
    for (const kind of kinds) {
      await coordCommand(dir)
        .exitOverride()
        .parseAsync(['--kind', kind, '--from', 'worker:impl', '--to', 'lead', '--ref', 'r1, r2', '--note', 'n'], {
          from: 'user',
        });
    }
    const events = readSignals(dir).filter((e) => e.event === 'coord_event');
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.outcome)).toEqual([...kinds]);
    for (const ev of events) {
      expect(ev.detail).toEqual({
        kind: ev.outcome,
        actor_from: 'worker:impl',
        actor_to: 'lead',
        refs: ['r1', 'r2'], // --ref парсится в массив (запятая + trim)
        note: 'n',
      });
      expect(ev.session_id).toBeNull();
    }
  });

  it('минимальная форма: без --to/--ref/--note — дефолты (refs=[], actor_from из resolveCreatedBy)', async () => {
    await coordCommand(dir).exitOverride().parseAsync(['--kind', 'blocker'], { from: 'user' });
    const [ev] = readSignals(dir);
    expect(ev.detail).toEqual({ kind: 'blocker', actor_from: 'user:cli', refs: [] });
    expect('actor_to' in (ev.detail ?? {})).toBe(false);
    expect('note' in (ev.detail ?? {})).toBe(false);
  });

  it('без --kind — commander-ошибка (mandatory), exit != 0', async () => {
    await expect(coordCommand(dir).exitOverride().parseAsync(['--from', 'a'], { from: 'user' })).rejects.toThrow(
      /required option '--kind <kind>' not specified/i
    );
    expect(readSignals(dir)).toHaveLength(0);
  });

  it('невалидный kind — commander-ошибка со списком допустимых', async () => {
    await expect(coordCommand(dir).exitOverride().parseAsync(['--kind', 'merged'], { from: 'user' })).rejects.toThrow(
      /is invalid\. allowed choices are handoff, review, acceptance, blocker, escalation/i
    );
  });
});
