import { describe, it, expect } from 'vitest';
import { computeSnapshotDelta, flattenReportNumbers } from '../../../src/app/use-cases/snapshot-delta.js';
import type { EffectivenessReport } from '../../../src/app/use-cases/effectiveness.js';

function baseReport(): EffectivenessReport {
  return {
    rules: { activeRules: 3, prevented: 5, checked: 15 },
    tools: {
      toolCount: 2,
      totalUsage: 4,
      economy: { sufficient: true, toolRuns: 3, totalRuns: 8, medianTool: 6, medianAll: 15, savingsPct: 60 },
    },
    delivery: {
      deliveryEvents: 20,
      triggeredObjects: 2,
      activeRules: 3,
      silentRules: 1,
      enoughDeliveryData: true,
      silentShare: 33.3,
    },
    noise: { totalObjects: 10, writeOnly: 6, share: 60, documents: 2, archived: 0 },
    noiseStatus: 'BAD',
    silentStatus: 'BAD',
    routing: [
      { model: 'glm', tasks: 6, medianWeighted: 8.5 },
      { model: 'kimi', tasks: 2, medianWeighted: 150 },
    ],
    totals: {
      runs: 0,
      processFailures: 0,
      sumWeighted: 0,
      sumTokens: null,
      cacheHitRatio: null,
      avgDurationMs: null,
      costUsd: null,
      byModel: [],
    },
  };
}

function row(rows: ReturnType<typeof computeSnapshotDelta>, path: string) {
  return rows.find((r) => r.path === path);
}

describe('flattenReportNumbers (M2: явные пути полей отчёта)', () => {
  it('routing кладётся построчно по model-ключу (не индексу): routing.<model>.tasks / .medianWeighted', () => {
    const flat = flattenReportNumbers(baseReport());
    expect(flat.get('routing.glm.tasks')).toBe(6);
    expect(flat.get('routing.glm.medianWeighted')).toBe(8.5);
    expect(flat.get('routing.kimi.tasks')).toBe(2);
    expect(flat.get('routing.kimi.medianWeighted')).toBe(150);
  });

  it('null-поля пропущены: prevented/checked/share/medianTool/medianAll/savingsPct/medianWeighted', () => {
    const r = baseReport();
    r.rules.prevented = null;
    r.rules.checked = null;
    r.noise.share = null;
    r.tools.economy.medianTool = null;
    r.tools.economy.medianAll = null;
    r.tools.economy.savingsPct = null;
    r.routing[1]!.medianWeighted = null;
    const flat = flattenReportNumbers(r);
    expect(flat.has('rules.prevented')).toBe(false);
    expect(flat.has('rules.checked')).toBe(false);
    expect(flat.has('noise.share')).toBe(false);
    expect(flat.has('tools.economy.medianTool')).toBe(false);
    expect(flat.has('tools.economy.medianAll')).toBe(false);
    expect(flat.has('tools.economy.savingsPct')).toBe(false);
    expect(flat.has('routing.kimi.medianWeighted')).toBe(false);
    // не-null поля остаются
    expect(flat.get('rules.activeRules')).toBe(3);
    expect(flat.get('routing.kimi.tasks')).toBe(2);
  });
});

describe('computeSnapshotDelta (Q9: диф последнего снапшота с предыдущим)', () => {
  it('diff = curr − prev; неизменённые поля дают diff 0', () => {
    const prev = baseReport();
    const curr = baseReport();
    curr.rules.activeRules = 4;
    curr.noise.writeOnly = 5;
    const rows = computeSnapshotDelta(prev, curr);
    expect(row(rows, 'rules.activeRules')).toEqual({ path: 'rules.activeRules', prev: 3, curr: 4, diff: 1 });
    expect(row(rows, 'noise.writeOnly')).toEqual({ path: 'noise.writeOnly', prev: 6, curr: 5, diff: -1 });
    expect(row(rows, 'tools.toolCount')).toEqual({ path: 'tools.toolCount', prev: 2, curr: 2, diff: 0 });
  });

  it('новый routing-рядок → prev null, diff null; исчезнувший рядок → curr null, diff null', () => {
    const prev = baseReport();
    const curr = baseReport();
    curr.routing = [...curr.routing, { model: 'qwen', tasks: 3, medianWeighted: 7 }];
    curr.routing = curr.routing.filter((r) => r.model !== 'kimi');
    const rows = computeSnapshotDelta(prev, curr);
    expect(row(rows, 'routing.qwen.tasks')).toEqual({ path: 'routing.qwen.tasks', prev: null, curr: 3, diff: null });
    expect(row(rows, 'routing.kimi.tasks')).toEqual({ path: 'routing.kimi.tasks', prev: 2, curr: null, diff: null });
  });
});

describe('flattenReportNumbers + totals (M3)', () => {
  it('totals-пути попадают в дельту; null-поля (sumTokens/costUsd) пропущены', () => {
    const r = baseReport();
    (r as { totals?: unknown }).totals = {
      runs: 5,
      processFailures: 1,
      sumWeighted: 500,
      sumTokens: { input: 3000, output: 500, cache_read: 1500 },
      cacheHitRatio: 33.3,
      avgDurationMs: 2000,
      costUsd: null,
      byModel: [
        {
          model: 'm1',
          runs: 2,
          processFailures: 0,
          sumWeighted: 30,
          avgDurationMs: 2000,
          costUsd: 0.00299,
          costPerCompletedRun: 0.001495,
        },
      ],
    };
    const flat = flattenReportNumbers(r);
    expect(flat.get('totals.runs')).toBe(5);
    expect(flat.get('totals.sumTokens.cache_read')).toBe(1500);
    expect(flat.get('totals.byModel.m1.costPerCompletedRun')).toBeCloseTo(0.001495, 10);
    expect(flat.has('totals.costUsd')).toBe(false); // null — не попадает
  });
});
