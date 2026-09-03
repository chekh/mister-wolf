import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendSnapshot, readSnapshots, snapshotsPath } from '../../../src/adapters/fs/effectiveness-snapshots.js';
import type { EffectivenessReport } from '../../../src/app/use-cases/effectiveness.js';

function report(activeRules: number): EffectivenessReport {
  return {
    rules: { activeRules, prevented: null, checked: null },
    tools: {
      toolCount: 0,
      totalUsage: 0,
      economy: { sufficient: false, toolRuns: 0, totalRuns: 0, medianTool: null, medianAll: null, savingsPct: null },
    },
    delivery: {
      deliveryEvents: 0,
      triggeredObjects: 0,
      activeRules: 0,
      silentRules: 0,
      enoughDeliveryData: false,
      silentShare: null,
    },
    noise: { totalObjects: 0, writeOnly: 0, share: null, documents: 0, archived: 0 },
    noiseStatus: 'NO_DATA',
    silentStatus: 'NO_DATA',
    routing: [],
  };
}

describe('M2: effectiveness-snapshots.jsonl (D6: append-only, полная копия отчёта)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-snapshots-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('append → read roundtrip: ts и полная копия отчёта возвращаются', () => {
    appendSnapshot(dir, report(3), '2026-09-03T10:00:00.000Z');
    const snaps = readSnapshots(dir);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.ts).toBe('2026-09-03T10:00:00.000Z');
    expect(snaps[0]!.report.rules.activeRules).toBe(3);
    expect(snaps[0]!.report.routing).toEqual([]);
  });

  it('вторая append → 2 записи в порядке записи (последний — свежий)', () => {
    appendSnapshot(dir, report(3), '2026-09-03T10:00:00.000Z');
    appendSnapshot(dir, report(4), '2026-09-03T11:00:00.000Z');
    const snaps = readSnapshots(dir);
    expect(snaps).toHaveLength(2);
    expect(snaps[1]!.ts).toBe('2026-09-03T11:00:00.000Z');
    expect(snaps[1]!.report.rules.activeRules).toBe(4);
  });

  it('битая строка пропускается; отсутствующий файл → []', () => {
    expect(readSnapshots(dir)).toEqual([]);
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
    writeFileSync(snapshotsPath(dir), '{битая строка\n' + JSON.stringify({ ts: 't', report: report(1) }) + '\n');
    const snaps = readSnapshots(dir);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.report.rules.activeRules).toBe(1);
  });
});
