import { describe, it, expect } from 'vitest';
import { sparkline, renderTable, trendSparklineLines } from '../../../src/adapters/cli/commands/dashboard.js';
import type { SnapshotEntry } from '../../../src/adapters/fs/effectiveness-snapshots.js';
import type { EffectivenessReport } from '../../../src/app/use-cases/effectiveness.js';

describe('dashboard render helpers (D8: console unicode)', () => {
  it('sparkline: [] -> empty string, all zeros -> flat bars, proportional otherwise', () => {
    expect(sparkline([])).toBe('');
    expect(sparkline([0, 0])).toBe('▁▁');
    expect(sparkline([1, 2, 4, 8])).toBe('▁▂▄█');
    expect(sparkline([5])).toBe('█');
  });

  it('renderTable: unicode frame and column separator', () => {
    const out = renderTable(
      ['a', 'b'],
      [
        ['1', '2'],
        ['3', '4'],
      ]
    );
    expect(out).toContain('│');
    expect(out).toContain('┌');
    expect(out).toContain('└');
  });
});

/** Минимальный снапшот: trendSparklineLines нужны только noise.share / silentShare / totals. */
function snap(share: number, silent: number, weighted: number): SnapshotEntry {
  const report = {
    delivery: { silentShare: silent },
    noise: { share },
    totals: { sumWeighted: weighted },
  } as unknown as EffectivenessReport;
  return { ts: '2026-09-04T00:00:00Z', report };
}

describe('trendSparklineLines: n/a при <2 снапшотах, спарклайн при ≥2', () => {
  it('[] и [snap]: все три строки заканчиваются на n/a (need ≥2 snapshots)', () => {
    for (const snaps of [[], [snap(10, 20, 1)]]) {
      const lines = trendSparklineLines(snaps);
      expect(lines).toHaveLength(3);
      for (const l of lines) expect(l.endsWith('n/a (need ≥2 snapshots)')).toBe(true);
    }
  });

  it('два снапшота: строки содержат символы спарклайна', () => {
    const lines = trendSparklineLines([snap(10, 50, 1), snap(20, 100, 2)]);
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l).toMatch(/[▁▂▃▄▅▆▇█]{2}/);
    expect(lines[0]).toMatch(/^noise\.share: /);
    expect(lines[1]).toMatch(/^silentShare: /);
    expect(lines[2]).toMatch(/^totals\.sumWeighted: /);
  });
});
