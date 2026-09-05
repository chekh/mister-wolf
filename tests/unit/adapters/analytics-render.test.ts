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
    processFailures: 0,
    processFailureRatePct: 0,
    weighted: 1,
    avgDurationMs: 100,
    costUsd: null,
    toolErrors: 0,
    complaintsBy: 0,
    complaintsAbout: 0,
    completedRuns: 1,
    accepted: 0,
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
      funnel: {
        added: 5,
        retrieved: { events: 2, uniqueIds: 3 },
        injected: { events: 1, uniqueIds: 2 },
        cited: { events: 1, uniqueIds: 1 },
        applied: { events: 1, uniqueIds: 2 },
        appliedUniqueIds: ['m-a', 'm-b'],
      },
      attribution: { acceptedTotal: 2, acceptedWithInjection: 1, attributionCoveragePct: 50 },
      roi: {
        rows: [
          {
            id: 'm-roi-a',
            associatedAccepted: 2,
            associatedApplied: 1,
            injectedTotal: 3,
            lastActivity: '2026-09-01T00:00:00Z',
          },
          { id: 'm-roi-b', associatedAccepted: 1, associatedApplied: 0, injectedTotal: 2, lastActivity: null },
        ],
      },
    },
    tools: [toolRow('tool-script', 'script'), toolRow('tool-native', 'model-native')],
    rules: [ruleRow('rule-silent', true), ruleRow('rule-loud', false)],
    weeklyActivity: [
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
    acceptance: { accepted: 0, costPerAcceptedTask: null },
    coverage: { scored: 1, runs: 3, scoredTaskRatePct: 100 / 3 },
    dataQuality: {
      validEventRatePct: 75,
      malformedLines: 1,
      duplicateEventRatePct: 50,
      unknownModelRatePct: 25,
      pricingCoveragePct: 100,
      completeTraceRatePct: null,
      completeTraceRateReason: 'span model planned P2',
    },
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
    coordination: {
      counts: [
        { kind: 'handoff', actorFrom: 'lead', count: 3 },
        { kind: 'review', actorFrom: 'lead', count: 2 },
      ],
      recent: [
        { ts: '2026-09-01T00:00:00Z', kind: 'handoff', from: 'lead', to: 'w1', refs: ['ref-1'] },
        { ts: '2026-08-31T00:00:00Z', kind: 'review', from: 'w1', to: null, refs: ['ref-2', 'ref-3'] },
      ],
      blockers: [{ ref: 'mem-blk', openedAt: '2026-09-01T00:00:00Z', resolvedAt: '2026-09-02T00:00:00Z' }],
    },
    campaign: {
      rows: [
        {
          campaign: 'camp-full',
          runs: 6,
          hasVerdicts: true,
          withMemory: {
            cohort: 'with_memory',
            n: 3,
            medianWeighted: 20,
            acceptedSharePct: 66.7,
            processFailureRatePct: 33.3,
            reason: null,
          },
          noMemory: {
            cohort: 'no_memory',
            n: 3,
            medianWeighted: 15,
            acceptedSharePct: 100,
            processFailureRatePct: 0,
            reason: null,
          },
        },
        {
          campaign: 'camp-small',
          runs: 5,
          hasVerdicts: false,
          withMemory: {
            cohort: 'with_memory',
            n: 2,
            medianWeighted: null,
            acceptedSharePct: null,
            processFailureRatePct: 0,
            reason: 'n<3: min 3 runs',
          },
          noMemory: {
            cohort: 'no_memory',
            n: 3,
            medianWeighted: 10,
            acceptedSharePct: null,
            processFailureRatePct: 0,
            reason: null,
          },
        },
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
    // 8 колонок — ledger-таблица (funnel ниже имеет 3 колонки: stage/events/unique_ids)
    const rows = dataRows(renderSection(report, { view: 'memory', class: 'dead', top: 20 })).filter(
      (r) => r.length === 8
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r[2]).toBe('dead');
    expect(rows.some((r) => ['sleeper', 'workhorse', 'new'].includes(r[2]))).toBe(false);
  });

  it('memory + type=decision: только этот type', () => {
    const rows = dataRows(renderSection(report, { view: 'memory', type: 'decision', top: 20 })).filter(
      (r) => r.length === 8
    );
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

describe('renderAllSections: coverage/dataQuality строки честности (D5/D7)', () => {
  it('coverage: partial при <100% и runs>0; dataQuality присутствует', () => {
    const report = fixtureReport(); // scored 1/3 → 33.3%
    const out = renderAllSections(report, { view: 'all' });
    expect(out).toContain('coverage: partial — scored 1/3 (33.3%)');
    expect(out).toContain('dataQuality: valid 75.0% (malformed lines: 1)');
    expect(out).toContain('duplicateEventRatePct: 50.0%');
    expect(out).toContain('unknownModelRatePct: 25.0%');
    expect(out).toContain('pricingCoveragePct: 100.0%');
    expect(out).toContain('completeTraceRatePct: n/a (span model planned P2)');
  });

  it('coverage-строка НЕ появляется при 100% и при runs=0; dataQuality при null → n/a', () => {
    const full = fixtureReport();
    full.coverage = { scored: 3, runs: 3, scoredTaskRatePct: 100 };
    expect(renderAllSections(full, { view: 'all' })).not.toContain('coverage: partial');

    const noRuns = fixtureReport();
    noRuns.coverage = { scored: 0, runs: 0, scoredTaskRatePct: null };
    noRuns.dataQuality = {
      validEventRatePct: null,
      malformedLines: 0,
      duplicateEventRatePct: null,
      unknownModelRatePct: null,
      pricingCoveragePct: null,
      completeTraceRatePct: null,
      completeTraceRateReason: 'span model planned P2',
    };
    const out = renderAllSections(noRuns, { view: 'all' });
    expect(out).not.toContain('coverage: partial');
    expect(out).toContain('dataQuality: n/a');
  });

  it('agents-таблица: колонки completed/accepted после pfail_%', () => {
    const out = renderSection(fixtureReport(), { view: 'agents', top: 20 });
    const headerRow = out.split('\n').find((l) => l.startsWith('│')) ?? '';
    const cols = headerRow
      .split('│')
      .map((c) => c.trim())
      .filter(Boolean);
    expect(cols).toEqual([
      'agent',
      'runs',
      'weighted',
      'avg_ms',
      'pfail_%',
      'completed',
      'accepted',
      'compl by/about',
      'prevented',
    ]);
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

describe('P2 D4/D5: memory funnel + attribution, coordination в текстовом рендере', () => {
  it('memory: воронка после garbage (added events=-) + строка атрибуции с процентом', () => {
    const out = renderSection(fixtureReport(), { view: 'memory', top: 20 });
    // funnel-таблица стоит сразу после garbage-строки фикстуры
    expect(tableAfter(out, 'garbage: dead/base = 2/5 = 40.0%')).toEqual([
      ['added', '-', '5'],
      ['retrieved', '2', '3'],
      ['injected', '1', '2'],
      ['cited', '1', '1'],
      ['applied', '1', '2'],
    ]);
    expect(out).toContain('attribution: accepted 1/2 (50.0%)');
  });

  it('memory: null-атрибуция → n/a (reason)', () => {
    const report = fixtureReport();
    report.memory.attribution = {
      acceptedTotal: 0,
      acceptedWithInjection: 0,
      attributionCoveragePct: null,
      reason: 'no injected',
    };
    const out = renderSection(report, { view: 'memory', top: 20 });
    expect(out).toContain('attribution: n/a (no injected)');
  });

  it('coordination: counts/recent/blockers; to null → from без стрелки и "-" в refs… from->to', () => {
    const out = renderSection(fixtureReport(), { view: 'coordination', top: 20 });
    expect(out.split('\n')[0]).toBe('== coordination ==');
    expect(tableAfter(out, 'counts:')).toEqual([
      ['handoff', 'lead', '3'],
      ['review', 'lead', '2'],
    ]);
    expect(tableAfter(out, 'recent:')).toEqual([
      ['2026-09-01T00:00:00Z', 'handoff', 'lead->w1', 'ref-1'],
      ['2026-08-31T00:00:00Z', 'review', 'w1', 'ref-2,ref-3'],
    ]);
    expect(tableAfter(out, 'blockers:')).toEqual([['mem-blk', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z']]);
  });

  it('renderAllSections: координация входит в полный вывод', () => {
    const out = renderAllSections(fixtureReport(), { view: 'all' });
    expect(out).toContain('== coordination ==');
    expect(out).toContain('attribution: accepted 1/2 (50.0%)');
  });
});

describe('P3 D2/D3/D4: campaign-витрина + memory ROI в текстовом рендере', () => {
  it('campaign: две строки на кампанию (когорты), n/a и честные note-причины', () => {
    const out = renderSection(fixtureReport(), { view: 'campaign', top: 20 });
    expect(out.split('\n')[0]).toBe('== campaign ==');
    const rows = dataRows(out);
    expect(rows).toHaveLength(4); // 2 кампании × 2 когорты
    expect(rows.filter((r) => r[0] === 'camp-full')).toHaveLength(2);
    expect(rows.find((r) => r[0] === 'camp-full' && r[1] === 'with_memory')).toEqual([
      'camp-full',
      'with_memory',
      '3',
      '20',
      '66.7',
      '33.3',
      '',
    ]);
    // малая когорта: метрики n/a + reason; нет вердиктов → note
    const small = rows.find((r) => r[0] === 'camp-small' && r[1] === 'with_memory');
    expect(small?.slice(3, 7)).toEqual(['n/a', 'n/a', '0.0', 'n<3: min 3 runs']);
    const noVerdicts = rows.find((r) => r[0] === 'camp-small' && r[1] === 'no_memory');
    expect(noVerdicts?.[4]).toBe('n/a');
    expect(noVerdicts?.[6]).toBe('no verdicts');
  });

  it('campaign: пустые rows → заголовок + no campaigns yet', () => {
    const report = fixtureReport();
    report.campaign.rows = [];
    const out = renderSection(report, { view: 'campaign', top: 20 });
    expect(out.split('\n')).toEqual(['== campaign ==', 'no campaigns yet']);
  });

  it('memory: ROI-блок после атрибуции — дисклеймер + таблица (сортировка по accepted)', () => {
    const out = renderSection(fixtureReport(), { view: 'memory', top: 20 });
    expect(out.indexOf('attribution: accepted 1/2 (50.0%)')).toBeLessThan(
      out.indexOf('memory ROI (correlational, not causal):')
    );
    expect(tableAfter(out, 'memory ROI (correlational, not causal):')).toEqual([
      ['m-roi-a', '2', '1', '3', '2026-09-01T00:00:00Z'],
      ['m-roi-b', '1', '0', '2', '-'],
    ]);
  });

  it('memory: пустой ROI → no data', () => {
    const report = fixtureReport();
    report.memory.roi.rows = [];
    const out = renderSection(report, { view: 'memory', top: 20 });
    expect(out).toContain('memory ROI (correlational, not causal): no data');
  });

  it('renderAllSections: секция campaign входит в полный вывод', () => {
    const out = renderAllSections(fixtureReport(), { view: 'all' });
    expect(out).toContain('== campaign ==');
    expect(out).not.toContain('no campaigns yet');
  });
});
