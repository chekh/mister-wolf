import { describe, it, expect } from 'vitest';
import {
  sparkline,
  renderTable,
  trendSparklineLines,
  renderLedgers,
  renderTrends,
} from '../../../src/adapters/cli/commands/dashboard.js';
import type { SnapshotEntry } from '../../../src/adapters/fs/effectiveness-snapshots.js';
import type { EffectivenessReport } from '../../../src/app/use-cases/effectiveness.js';
import type { DashboardData } from '../../../src/app/use-cases/build-dashboard.js';

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

/** Минимальный DashboardData: пустые ledgers + councils-блок (1 открытый вопрос, 8 недель). */
function dashboardFixture(): DashboardData {
  return {
    analytics: {
      memory: { rows: [], garbage: {} },
      tools: [],
      rules: [],
      weeklyActivity: [],
      outliers: [],
      agents: [],
      steward: { mutationsByWeek: [] },
      readiness: { totalRuns: 0, withArm: 0 },
      councils: {
        openQuestions: [
          { id: 'mem_open_1', title: 'как хранить советы?', daysOpen: 12, opinions: 3, votes: { за: 2, нет: 1 } },
        ],
        weeks: [
          { week: '2026-W31', questions: 0, opinions: 0, syntheses: 0 },
          { week: '2026-W32', questions: 1, opinions: 2, syntheses: 0 },
          { week: '2026-W33', questions: 2, opinions: 4, syntheses: 1 },
        ],
      },
    },
    effectiveness: { totals: { sumTokens: null } },
  } as unknown as DashboardData;
}

describe('councils в дашборде: ledgers-таблица открытых вопросов + trends-спарклайны', () => {
  it('renderLedgers: таблица с заголовком open council и строкой вопроса с голосами', () => {
    const out = renderLedgers(dashboardFixture());
    expect(out).toContain('open council');
    expect(out).toContain('mem_open_1');
    expect(out).toContain('12');
    expect(out).toContain('3');
    expect(out).toContain('за=2, нет=1');
  });

  it('renderTrends: строки council questions/opinions per week со спарклайном', () => {
    const out = renderTrends('/nonexistent-wolf-dashboard-test', dashboardFixture());
    const lines = out.split('\n');
    const questions = lines.find((l) => l.startsWith('council questions/week:'));
    const opinions = lines.find((l) => l.startsWith('council opinions/week:'));
    expect(questions).toMatch(/: [▁▂▃▄▅▆▇█]{3}$/);
    expect(opinions).toMatch(/: [▁▂▃▄▅▆▇█]{3}$/);
  });
});
