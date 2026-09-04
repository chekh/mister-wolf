import { describe, it, expect } from 'vitest';
import { renderSection, renderAllSections, analyticsCommand } from '../../../src/adapters/cli/commands/analytics.js';
import type {
  AnalyticsReport,
  MemoryLedgerRow,
  ToolLedgerRow,
  RuleRankingRow,
  AgentLedgerRow,
  LifecycleClass,
} from '../../../src/app/use-cases/build-analytics.js';

/** Минимальный fixture-отчёт: по 2+ варианта на каждое фильтруемое поле. */
function fixtureReport(): AnalyticsReport {
  const memRow = (id: string, type: string, lifecycle: LifecycleClass): MemoryLedgerRow => ({
    id,
    type,
    title: `t-${id}`,
    status: 'active',
    created_at: '2026-08-01T00:00:00Z',
    age_days: 30,
    deliveries: 1,
    triggers: 1,
    complaints: 0,
    holdout_prevented: null,
    holdout_checked: null,
    last_used: null,
    lifecycle,
  });
  const toolRow = (name: string, origin: 'script' | 'model-native'): ToolLedgerRow => ({
    name,
    origin,
    id: null,
    status: 'active',
    usageCount: 1,
    lastUsedAt: null,
    errorCount: 0,
    errorClasses: [],
    promotion: null,
  });
  const ruleRow = (id: string, silent: boolean): RuleRankingRow => ({
    id,
    title: `t-${id}`,
    status: 'active',
    prevented: 0,
    checked: null,
    silent,
  });
  const agentRow = (agent: string): AgentLedgerRow => ({
    agent,
    runs: 1,
    failures: 0,
    failureRatePct: 0,
    weighted: 1,
    avgDurationMs: 100,
    costUsd: null,
    toolErrors: 0,
    complaintsBy: 0,
    complaintsAbout: 0,
    successes: 1,
    holdoutPrevented: null,
  });
  return {
    generatedAt: '2026-09-04T00:00:00Z',
    thresholds: { newDays: 14, workhorseUses: 3 },
    memory: {
      rows: [
        memRow('mem-dead-1', 'decision', 'dead'),
        memRow('mem-dead-2', 'lesson', 'dead'),
        memRow('mem-sleeper-1', 'decision', 'sleeper'),
        memRow('mem-workhorse-1', 'lesson', 'workhorse'),
        memRow('mem-new-1', 'decision', 'new'),
      ],
      garbage: { dead: 2, base: 5, ratioPct: 40 },
    },
    tools: [toolRow('tool-script', 'script'), toolRow('tool-native', 'model-native')],
    rules: [ruleRow('rule-silent', true), ruleRow('rule-loud', false)],
    funnel: [
      {
        week: '2026-W36',
        writes: 1,
        delivers: 1,
        triggers: 1,
        writeToDeliverPct: 100,
        deliverToTriggerPct: 100,
      },
    ],
    outliers: [],
    agents: [agentRow('x'), agentRow('y')],
    steward: {
      mutations: [],
      mutationsByWeek: [],
      complaintFunnel: { filed: 0, resolved: 0, rejected: 0, avgLifetimeHours: null, slaEscalations: 0 },
      recidivismCount: 0,
      churnIds: [],
      autoMutationSharePct: null,
    },
    readiness: { totalRuns: 0, withArm: 0, withArmPct: null, byArm: [], byExperiment: [] },
  };
}

/** Строки данных Unicode-таблицы: строки вида `│ a │ b │` → [[a, b], …];
 * заголовки секции/колонок и служебные строки (garbage:, mutations:) отбрасываются. */
function dataRows(out: string): string[][] {
  const cells = out
    .split('\n')
    .filter((l) => l.startsWith('│') && l.endsWith('│'))
    .map((l) =>
      l
        .slice(1, -1)
        .split('│')
        .map((c) => c.trim())
    );
  return cells.slice(1); // первая │-строка — заголовки колонок
}

describe('analytics renderSection: фильтры текстового вывода (дефект потери class/type/origin/agent/silent)', () => {
  const report = fixtureReport();

  it('memory + class=dead: только lifecycle dead, нет sleeper/workhorse/new', () => {
    const rows = dataRows(renderSection(report, { view: 'memory', class: 'dead', top: 20 }));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r[2]).toBe('dead');
    expect(rows.some((r) => ['sleeper', 'workhorse', 'new'].includes(r[2]))).toBe(false);
  });

  it('memory + type=decision: только этот type', () => {
    const rows = dataRows(renderSection(report, { view: 'memory', type: 'decision', top: 20 }));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r[1]).toBe('decision');
    expect(rows.some((r) => r[0] === 'mem-dead-2')).toBe(false); // lesson
  });

  it('tools + origin=script: только origin script', () => {
    const rows = dataRows(renderSection(report, { view: 'tools', origin: 'script', top: 20 }));
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('tool-script');
  });

  it('rules + silent=true: только молчащие', () => {
    const rows = dataRows(renderSection(report, { view: 'rules', silent: true, top: 20 }));
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('rule-silent');
    expect(rows[0][3]).toBe('yes');
  });

  it('agents + agent=x: только этот агент', () => {
    const rows = dataRows(renderSection(report, { view: 'agents', agent: 'x', top: 20 }));
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('x');
  });

  it('renderAllSections + class-фильтр: секция memory внутри all отфильтрована (нет sleeper-строк)', () => {
    const out = renderAllSections(report, { view: 'all', class: 'dead' });
    const lines = out.split('\n');
    const start = lines.indexOf('== memory ==');
    const end = lines.indexOf('== tools ==');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const memoryBlock = lines.slice(start, end);
    expect(memoryBlock.some((l) => l.includes('sleeper') || l.includes('workhorse') || l.includes('new'))).toBe(false);
    expect(memoryBlock.some((l) => l.includes('mem-dead-1'))).toBe(true);
  });
});

describe('analyticsCommand: числовые опции парсятся base-10 (commander radix-ловушка)', () => {
  it('parseArg получает дефолт как previous — дефолт НЕ должен становиться radix', () => {
    const cmd = analyticsCommand();
    const weeks = cmd.options.find((o) => o.long === '--weeks');
    const top = cmd.options.find((o) => o.long === '--top');
    expect(weeks).toBeDefined();
    expect(top).toBeDefined();
    // до фикса: parseInt('8', 8) → NaN (пустая воронка), parseInt('10', 8) → 8 (октально),
    // parseInt('20', 20) → 40
    expect(weeks!.parseArg('8', 8)).toBe(8);
    expect(weeks!.parseArg('10', 8)).toBe(10);
    expect(top!.parseArg('20', 20)).toBe(20);
    expect(top!.parseArg('21', 20)).toBe(21);
  });
});
