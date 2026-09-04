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
    councils: {
      questions: { total: 2, inWindow: 1, open: 1 },
      opinions: { total: 5, perQuestionMin: 0, perQuestionAvg: 2.5, perQuestionMax: 5 },
      participation: [
        { agent: 'agent:y', opinions: 3 },
        { agent: 'agent:x', opinions: 2 },
      ],
      votes: { yes: 2, no: 1, timeout: 2 },
      synthesis: { questionsWithSynthesis: 1, sharePct: 50, medianHours: 25.3 },
      weeks: [{ week: '2026-09-01', questions: 1, opinions: 5, syntheses: 1 }],
      openQuestions: [
        { id: 'q-2', title: 't-q-2', daysOpen: 3, opinions: 0, votes: {} },
        { id: 'q-1', title: 't-q-1', daysOpen: 1, opinions: 5, votes: { yes: 2, no: 1, timeout: 2 } },
      ],
    },
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

/** Строки данных таблицы, стоящей ПОСЛЕ строки-метки (label: 'votes:' и т.п.);
 * в секции councils таблиц несколько — dataRows их бы склеил. */
function tableAfter(out: string, label: string): string[][] {
  const lines = out.split('\n');
  const start = lines.indexOf(label);
  if (start === -1) throw new Error(`label not found: ${label}`);
  const isBorder = (l: string): boolean => l.startsWith('┌') || l.startsWith('├') || l.startsWith('└');
  const block: string[] = [];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith('│') || isBorder(lines[i])); i++) {
    block.push(lines[i]);
  }
  return block
    .filter((l) => l.startsWith('│'))
    .slice(1) // первая │-строка — заголовки колонок
    .map((l) =>
      l
        .slice(1, -1)
        .split('│')
        .map((c) => c.trim())
    );
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

describe('analytics renderSection: councils (вопросы/мнения/голоса/синтезы)', () => {
  it('полный рендер: строки-метрики + четыре таблицы, votes отсортированы count убыв.', () => {
    const out = renderSection(fixtureReport(), { view: 'councils', top: 20 });
    expect(out.split('\n')[0]).toBe('== councils ==');
    expect(out).toContain('questions: total=2 inWindow=1 open=1');
    expect(out).toContain('opinions: total=5 per-question min/avg/max = 0/2.5/5');
    expect(out).toContain('synthesis: questions=1/2 (50.0%) median question->synthesis=25.3h');

    expect(tableAfter(out, 'participation:')).toEqual([
      ['agent:y', '3'],
      ['agent:x', '2'],
    ]);
    // count убыв., при равенстве — ключ по алфавиту: timeout=2, yes=2, no=1
    expect(tableAfter(out, 'votes:')).toEqual([
      ['timeout', '2'],
      ['yes', '2'],
      ['no', '1'],
    ]);
    expect(tableAfter(out, 'weeks:')).toEqual([['2026-09-01', '1', '5', '1']]);
    // порядок openQuestions — как в фикстуре (сортирует use-case); пустой votes → '-'
    expect(tableAfter(out, 'open questions:')).toEqual([
      ['q-2', '3', '0', '-'],
      ['q-1', '1', '5', 'timeout=2, yes=2, no=1'],
    ]);
  });

  it('пустой councils (0 вопросов): n/a в per-question и share, пустые таблицы не падают', () => {
    const report = fixtureReport();
    report.councils = {
      questions: { total: 0, inWindow: 0, open: 0 },
      opinions: { total: 0, perQuestionMin: null, perQuestionAvg: null, perQuestionMax: null },
      participation: [],
      votes: {},
      synthesis: { questionsWithSynthesis: 0, sharePct: null, medianHours: null },
      weeks: [],
      openQuestions: [],
    };
    const out = renderSection(report, { view: 'councils', top: 20 });
    expect(out).toContain('per-question min/avg/max = n/a/n/a/n/a');
    expect(out).toContain('synthesis: questions=0/0 (n/a) median question->synthesis=-');
    // пустые таблицы рендерятся рамками (renderTable не падает на [])
    expect(out).toContain('┌');
    expect(out).toContain('└');
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
