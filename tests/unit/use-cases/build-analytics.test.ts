import { describe, it, expect } from 'vitest';
import {
  buildAnalyticsReport,
  filterAnalytics,
  classifyLifecycle,
  resolveLifecycleThresholds,
  DEFAULT_LIFECYCLE_THRESHOLDS,
} from '../../../src/app/use-cases/build-analytics.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { RelationLog } from '../../../src/ports/relation-log.port.js';
import type { Relation } from '../../../src/domain/schemas/relation-schema.js';
import type { Clock } from '../../../src/ports/clock.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
import type { SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';

type Extra = Record<string, unknown>;

function mockStore(objects: Extra[]): MemoryStore {
  return {
    async list(filters) {
      return objects.filter(
        (o) => (!filters?.type || o.type === filters.type) && (!filters?.status || o.status === filters.status)
      ) as MemoryObject[];
    },
    async save() {
      throw new Error('not implemented');
    },
    async get() {
      return null;
    },
    async update() {
      throw new Error('not implemented');
    },
  };
}

function mockLog(events: MemoryEvent[]): EventLog {
  return {
    async readAll() {
      return events;
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}

function mockRelations(rels: Extra[]): RelationLog {
  return {
    async append() {
      throw new Error('not implemented');
    },
    async list(filters) {
      return rels.filter(
        (r) =>
          (!filters?.subject || r.subject === filters.subject) &&
          (!filters?.object || r.object === filters.object) &&
          (!filters?.predicate || r.predicate === filters.predicate)
      ) as Relation[];
    },
  };
}

const fixedClock: Clock = { now: () => new Date('2026-09-03T00:00:00Z') };

function deliveryEvent(name: string, ts: string): SignalEvent {
  return {
    ts,
    event: 'delivery',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'delivered',
    detail: { name },
  };
}

function complaintEvent(objectId: string, ts: string, about = 'quality', actor = 'user:cli'): SignalEvent {
  return {
    ts,
    event: 'complaint',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor },
    outcome: 'complaint',
    detail: { about, text: 'bad', object_id: objectId },
  };
}

function memEvent(
  type: MemoryEvent['type'],
  id: string,
  timestamp: string,
  payload: Extra = { memory_id: id },
  actor = 'user:cli'
): MemoryEvent {
  return { id: `ev-${type}-${id}-${timestamp}`, type, timestamp, actor, payload };
}

/** ISO-таймстамп «минута N» — лексикографическая сортировка = хронология. */
const T = (minute: number): string => new Date(Date.UTC(2026, 0, 1, 0, minute, 0)).toISOString();

function runSignal(opts: {
  agent?: string | null;
  model?: string | null;
  ts?: string;
  session?: string | null;
  weighted?: number;
  outcome?: string;
  durationMs?: number;
  experiment?: { id: string; arm: 'wolf' | 'baseline'; task_id?: string };
}): SignalEvent {
  return {
    ts: opts.ts ?? '2026-09-01T00:00:00Z',
    event: 'run',
    session_id: opts.session ?? null,
    gen_ai: { modelID: opts.model ?? null, agent: opts.agent ?? null },
    orchestration: { task: null, actor: 'user:cli' },
    ...(opts.weighted !== undefined ? { weighted: opts.weighted } : {}),
    ...(opts.outcome !== undefined ? { outcome: opts.outcome } : {}),
    ...(opts.durationMs !== undefined ? { duration_ms: opts.durationMs } : {}),
    ...(opts.experiment !== undefined ? { experiment: opts.experiment } : {}),
  };
}

function toolErrorEvent(
  toolName: string,
  errorClassId: string,
  ts = '2026-09-01T00:00:00Z',
  agent: string | null = null
): SignalEvent {
  return {
    ts,
    event: 'tool_error',
    session_id: null,
    gen_ai: { modelID: null, agent },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'error',
    tool_name: toolName,
    error_class_id: errorClassId,
    detail: { message: 'boom' },
  };
}

describe('classifyLifecycle (D7: newDays=14 / workhorseUses=3)', () => {
  const t = DEFAULT_LIFECYCLE_THRESHOLDS;

  it('границы: uses>=3 workhorse | 1..2 sleeper | 0 и age<=14 new | 0 и age>14 dead', () => {
    expect(classifyLifecycle(3, 0, t)).toBe('workhorse');
    expect(classifyLifecycle(5, 100, t)).toBe('workhorse');
    expect(classifyLifecycle(2, 0, t)).toBe('sleeper');
    expect(classifyLifecycle(1, 100, t)).toBe('sleeper');
    expect(classifyLifecycle(0, 14, t)).toBe('new');
    expect(classifyLifecycle(0, 15, t)).toBe('dead');
  });

  it('override-пороги двигают границы; resolveLifecycleThresholds мержит поверх дефолтов', () => {
    expect(classifyLifecycle(2, 0, { newDays: 14, workhorseUses: 2 })).toBe('workhorse');
    expect(classifyLifecycle(0, 7, { newDays: 7, workhorseUses: 3 })).toBe('new');
    expect(resolveLifecycleThresholds()).toEqual(DEFAULT_LIFECYCLE_THRESHOLDS);
    expect(resolveLifecycleThresholds({ workhorseUses: 5 })).toEqual({ newDays: 14, workhorseUses: 5 });
  });
});

describe('buildAnalyticsReport: memory ledger (Q1/Q2)', () => {
  const objects: Extra[] = [
    {
      id: 'r1',
      title: 'r1',
      type: 'rule',
      status: 'active',
      created_at: '2026-08-30T00:00:00Z',
      holdout_prevented: 3,
      holdout_checked: 5,
    },
    { id: 'l1', title: 'l1', type: 'lesson', status: 'active', created_at: '2026-08-30T00:00:00Z' },
    {
      id: 't1',
      title: 't1',
      type: 'tool',
      status: 'active',
      created_at: '2026-08-30T00:00:00Z',
      name: 'my-tool',
      last_used_at: '2026-09-01T00:00:00Z',
    },
    { id: 'o1', title: 'o1', type: 'decision', status: 'active', created_at: '2026-08-01T00:00:00Z' },
    { id: 'a1', title: 'a1', type: 'rule', status: 'archived', created_at: '2026-08-01T00:00:00Z' },
    { id: 'dr1', title: 'dr1', type: 'document-ref', status: 'active', created_at: '2026-08-30T00:00:00Z' },
  ];
  const events: MemoryEvent[] = [
    memEvent('memory.added', 'r1', '2026-08-30T00:00:01Z'),
    memEvent('memory.updated', 'r1', '2026-08-31T12:00:00Z'), // triggers r1 +1
    memEvent('memory.added', 'l1', '2026-08-30T00:00:01Z'),
  ];
  const signals: SignalEvent[] = [
    deliveryEvent('r1', '2026-08-31T10:00:00Z'),
    deliveryEvent('r1', '2026-09-01T06:00:00Z'),
    deliveryEvent('my-tool', '2026-08-31T08:00:00Z'), // tool-аттрибуция по ToolFields.name
    complaintEvent('r1', '2026-09-02T00:00:00Z'),
  ];

  it('rows: base без archived/document-ref; deliveries/triggers/complaints/holdout/last_used → lifecycle', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.thresholds).toEqual(DEFAULT_LIFECYCLE_THRESHOLDS);
    expect(report.generatedAt).toBe('2026-09-03T00:00:00.000Z');
    expect(report.memory.rows.map((r) => r.id)).toEqual(['r1', 'l1', 't1', 'o1']);

    const r1 = report.memory.rows[0]!;
    expect(r1).toMatchObject({
      id: 'r1',
      type: 'rule',
      title: 'r1',
      status: 'active',
      created_at: '2026-08-30T00:00:00Z',
      age_days: 4,
      deliveries: 2,
      triggers: 1,
      complaints: 1,
      holdout_prevented: 3,
      holdout_checked: 5,
      last_used: '2026-09-02T00:00:00Z',
      lifecycle: 'workhorse', // uses=3 >= 3
    });
    const l1 = report.memory.rows[1]!;
    expect(l1.lifecycle).toBe('new'); // uses=0, age 4 <= 14
    expect(l1.last_used).toBeNull();
    expect(l1.holdout_prevented).toBeNull();
    const t1 = report.memory.rows[2]!;
    expect(t1.lifecycle).toBe('sleeper'); // uses=1 (delivery по tool-name)
    expect(t1.last_used).toBe('2026-09-01T00:00:00Z'); // max(delivery ts, last_used_at)
    const o1 = report.memory.rows[3]!;
    expect(o1.age_days).toBe(33);
    expect(o1.lifecycle).toBe('dead');
  });

  it('garbage: dead/base/ratioPct + инвариант dead === числу dead-строк', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.memory.garbage).toEqual({ dead: 1, base: 4, ratioPct: 25 });
    expect(report.memory.garbage.dead).toBe(report.memory.rows.filter((r) => r.lifecycle === 'dead').length);
  });

  it('filterAnalytics: view-срезы, class/type-фильтр, top-лимит, view=all', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    const dead = filterAnalytics(report, { view: 'memory', class: 'dead' });
    if (dead.view !== 'memory') throw new Error('expected memory view');
    expect(dead.rows.map((r) => r.id)).toEqual(['o1']);
    expect(dead.garbage).toEqual({ dead: 1, base: 4, ratioPct: 25 });

    const typed = filterAnalytics(report, { view: 'memory', type: 'tool' });
    if (typed.view !== 'memory') throw new Error('expected memory view');
    expect(typed.rows.map((r) => r.id)).toEqual(['t1']);

    const top1 = filterAnalytics(report, { view: 'memory', top: 1 });
    if (top1.view !== 'memory') throw new Error('expected memory view');
    expect(top1.rows.map((r) => r.id)).toEqual(['r1']);

    const rules = filterAnalytics(report, { view: 'rules', silent: true });
    if (rules.view !== 'rules') throw new Error('expected rules view');
    expect(rules.rows).toEqual([]);

    const all = filterAnalytics(report, { view: 'all' });
    if (all.view !== 'all') throw new Error('expected all view');
    expect(all.report).toBe(report);
  });
});

describe('buildAnalyticsReport: tool ledger (Q3, D11)', () => {
  const objects: Extra[] = [
    {
      id: 'tb',
      type: 'tool',
      status: 'active',
      created_at: '2026-08-01T00:00:00Z',
      name: 'busy-tool',
      usage_count: 10,
    },
    {
      id: 'tc',
      type: 'tool',
      status: 'candidate',
      created_at: '2026-08-01T00:00:00Z',
      name: 'fetch-helper',
      usage_count: 3,
    },
    {
      id: 'ta',
      type: 'tool',
      status: 'candidate',
      created_at: '2026-08-01T00:00:00Z',
      name: 'almost-tool',
      usage_count: 2,
    },
  ];
  const runLog = [
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['webfetch'] }),
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['webfetch'] }),
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['webfetch'] }),
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['webfetch'] }),
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['busy-tool'] }), // script-имя — не native
  ].join('\n');
  const signals: SignalEvent[] = [
    toolErrorEvent('fetch-helper', 'http_error'),
    toolErrorEvent('fetch-helper', 'http_error'),
    toolErrorEvent('fetch-helper', 'timeout_error'),
    toolErrorEvent('mcp-fetch', 'http_error'),
  ];

  it('script первым, usageCount убыв.; candidate+порог → expose; native без регистрации → register; ошибки по классам', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: runLog }
    );
    expect(report.tools.map((r) => [r.name, r.origin, r.usageCount])).toEqual([
      ['busy-tool', 'script', 10],
      ['fetch-helper', 'script', 3],
      ['almost-tool', 'script', 2],
      ['webfetch', 'model-native', 4],
      ['mcp-fetch', 'model-native', 1],
    ]);
    const byName = new Map(report.tools.map((r) => [r.name, r]));
    expect(byName.get('busy-tool')!.promotion).toBeNull(); // active, не candidate
    expect(byName.get('busy-tool')!.errorCount).toBe(0);
    expect(byName.get('fetch-helper')!.promotion).toBe('expose-candidate'); // candidate && 3 >= 3
    expect(byName.get('fetch-helper')!.errorCount).toBe(3);
    expect(byName.get('fetch-helper')!.errorClasses).toEqual([
      { id: 'http_error', count: 2 },
      { id: 'timeout_error', count: 1 },
    ]);
    expect(byName.get('almost-tool')!.promotion).toBeNull(); // candidate, но 2 < 3
    const webfetch = byName.get('webfetch')!;
    expect(webfetch.id).toBeNull();
    expect(webfetch.status).toBeNull();
    expect(webfetch.lastUsedAt).toBeNull();
    expect(webfetch.promotion).toBe('register-candidate'); // 4 появлений >= 3
    expect(byName.get('mcp-fetch')!.promotion).toBeNull(); // 1 < 3
  });

  it('patternThreshold из input повышает планку promotion', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: runLog, patternThreshold: 5 }
    );
    const byName = new Map(report.tools.map((r) => [r.name, r]));
    expect(byName.get('fetch-helper')!.promotion).toBeNull(); // 3 < 5
    expect(byName.get('webfetch')!.promotion).toBeNull(); // 4 < 5
  });
});

describe('buildAnalyticsReport: rule ranking (Q4)', () => {
  const objects: Extra[] = [
    {
      id: 'rule-c',
      title: 'rule-c',
      type: 'rule',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      holdout_prevented: 5,
    },
    {
      id: 'rule-a',
      title: 'rule-a',
      type: 'rule',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      holdout_prevented: 5,
    },
    {
      id: 'rule-b',
      title: 'rule-b',
      type: 'rule',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      holdout_prevented: 2,
    },
  ];
  // ЛОВУШКА silentRuleIds: нужно ≥20 delivery-событий и >30 сессий; молчит тот,
  // чья ПОСЛЕДНЯЯ доставка раньше первого run сессии, открывающей последние 30
  // (sessions[32-30] = s02 → граница T(2)). rule-c: последняя T(1) < T(2) → молчит;
  // rule-a: последняя T(29) → свежий; rule-b без доставок → не попадает в карту.
  const signals: SignalEvent[] = [];
  for (let i = 0; i < 32; i++) signals.push(runSignal({ session: `s${String(i).padStart(2, '0')}`, ts: T(i) }));
  signals.push(deliveryEvent('rule-c', T(0)), deliveryEvent('rule-c', T(1)));
  for (let i = 10; i <= 29; i++) signals.push(deliveryEvent('rule-a', T(i)));

  it('все статусы; prevented убыв., silent false первым, потом id; silent от silentRuleIds', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.rules.map((r) => r.id)).toEqual(['rule-a', 'rule-c', 'rule-b']);
    expect(report.rules.map((r) => r.silent)).toEqual([false, true, false]);
    expect(report.rules[0]).toMatchObject({ title: 'rule-a', status: 'active', prevented: 5, checked: null });
    expect(report.rules[2]!.prevented).toBe(2);
  });
});

describe('buildAnalyticsReport: funnel (Q6)', () => {
  it('2 недели: writes/delivers/triggers + конверсии; пустая неделя → null-конверсии', async () => {
    const events: MemoryEvent[] = [
      memEvent('memory.added', 'm1', '2026-09-01T10:00:00Z'),
      memEvent('memory.added', 'm2', '2026-09-01T11:00:00Z'),
    ];
    const signals: SignalEvent[] = [
      deliveryEvent('r1', '2026-09-02T10:00:00Z'),
      deliveryEvent('r1', '2026-09-02T11:00:00Z'),
      deliveryEvent('r2', '2026-09-02T12:00:00Z'),
    ];
    const report = await buildAnalyticsReport(
      { store: mockStore([]), log: mockLog(events), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: null, weeks: 2 }
    );
    // текущий понедельник 2026-08-31 (ср. часы 2026-09-03 — четверг); бакеты от старой к новой
    expect(report.funnel).toHaveLength(2);
    expect(report.funnel[0]).toEqual({
      week: '2026-08-24',
      writes: 0,
      delivers: 0,
      triggers: 0,
      writeToDeliverPct: null,
      deliverToTriggerPct: null,
    });
    const w = report.funnel[1]!;
    expect(w.week).toBe('2026-08-31');
    expect(w.writes).toBe(2);
    expect(w.delivers).toBe(3);
    expect(w.triggers).toBe(2); // уникальные имена: r1, r2
    expect(w.writeToDeliverPct).toBe(150); // 3/2
    expect(w.deliverToTriggerPct).toBeCloseTo(66.6667, 3); // 2/3
  });
});

describe('buildAnalyticsReport: outliers (Q8)', () => {
  it('top-N по weighted; costUsd при pricing (2M input × 1.5 $/Mtok = 3$); без tokens → null', async () => {
    const big = JSON.stringify({
      ts: '2026-09-01T00:00:00Z',
      model: 'glm',
      agent: 'worker',
      title: 'big',
      weighted: 300,
      tokens: { input: 2_000_000, output: 0, cache_read: 0 },
      tools: ['webfetch'],
    });
    const mid = JSON.stringify({
      ts: '2026-09-01T01:00:00Z',
      model: 'kimi',
      agent: 'steward',
      title: 'mid',
      weighted: 200,
    });
    const small = JSON.stringify({
      ts: '2026-09-01T02:00:00Z',
      model: 'glm',
      agent: 'worker',
      title: 'small',
      weighted: 100,
    });
    const report = await buildAnalyticsReport(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations([]), clock: fixedClock },
      {
        signals: [],
        runLogText: [big, mid, small].join('\n'),
        topOutliers: 2,
        pricing: { glm: { input: 1.5, output: 2, cache_read: 0.1 } },
      }
    );
    expect(report.outliers).toHaveLength(2);
    expect(report.outliers[0]).toEqual({
      ts: '2026-09-01T00:00:00Z',
      model: 'glm',
      agent: 'worker',
      title: 'big',
      weighted: 300,
      costUsd: 3,
      tools: ['webfetch'],
    });
    expect(report.outliers[1]!.weighted).toBe(200);
    expect(report.outliers[1]!.costUsd).toBeNull(); // нет raw-токенов — стоимости нет
  });
});

describe('buildAnalyticsReport: agent ledger (Q11)', () => {
  it('объём/проблемы/достижения per-agent; строка из complaint-actor тоже существует', async () => {
    const objects: Extra[] = [
      {
        id: 'l1',
        type: 'lesson',
        status: 'active',
        created_at: '2026-08-01T00:00:00Z',
        created_by: 'agent:worker',
        holdout_prevented: 4,
      },
      { id: 'l2', type: 'lesson', status: 'active', created_at: '2026-08-01T00:00:00Z', created_by: 'agent:worker' },
    ];
    const signals: SignalEvent[] = [
      runSignal({ agent: 'worker', model: 'glm', weighted: 100, outcome: 'ok', durationMs: 60_000 }),
      runSignal({ agent: 'worker', model: 'glm', weighted: 50, outcome: 'exit_1', durationMs: 30_000 }),
      toolErrorEvent('bash', 'timeout_error', '2026-09-01T00:00:00Z', 'worker'),
      complaintEvent('x1', '2026-09-01T00:00:00Z', 'worker flooded logs', 'agent:steward'),
    ];
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.agents.map((a) => a.agent)).toEqual(['worker', 'steward']); // сортировка runs убыв.
    expect(report.agents[0]).toEqual({
      agent: 'worker',
      runs: 2,
      failures: 1,
      failureRatePct: 50,
      weighted: 150,
      avgDurationMs: 45_000,
      costUsd: null, // без pricing
      toolErrors: 1,
      complaintsBy: 0,
      complaintsAbout: 1, // about содержит 'worker'
      successes: 1,
      holdoutPrevented: 4, // lesson created_by agent:worker
    });
    const steward = report.agents[1]!;
    expect(steward.runs).toBe(0);
    expect(steward.failureRatePct).toBeNull();
    expect(steward.complaintsBy).toBe(1); // жалоба подана от agent:steward
    expect(steward.complaintsAbout).toBe(0);
    expect(steward.holdoutPrevented).toBeNull(); // ни одного holdout-поля у его объектов
  });
});

describe('buildAnalyticsReport: steward view (Q12)', () => {
  it('мутации по видам/неделям, жалобная воронка, SLA, рецидив, churn, авто-доля', async () => {
    const objects: Extra[] = [
      { id: 'b1', type: 'blocker', status: 'resolved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'c1', type: 'rule', status: 'active', created_at: '2026-08-01T00:00:00Z', dispatch_ages: 4 },
    ];
    const events: MemoryEvent[] = [
      memEvent('memory.added', 'zz', '2026-09-01T00:00:00Z'), // не мутация
      memEvent('memory.scan.updated', 'zz', '2026-09-01T00:01:00Z'), // не мутация
      memEvent('memory.updated', 'd1', '2026-09-01T00:05:00Z', { memory_id: 'd1' }, 'system:wolf'),
      memEvent('memory.updated', 'd1', '2026-09-01T00:06:00Z', { memory_id: 'd1' }, 'user:cli'),
      memEvent('memory.updated', 't9', '2026-09-01T00:07:00Z', { memory_id: 't9', kind: 'tool.used' }, 'system:wolf'),
      memEvent('memory.updated', 'c1', '2026-09-01T00:15:00Z'), // между двумя жалобами c1
      memEvent('memory.resolved', 'b1', '2026-09-01T02:00:00Z'),
      memEvent('memory.transitioned', 'q1', '2026-09-01T03:00:00Z', { memory_id: 'q1', to: 'rejected' }),
    ];
    const signals: SignalEvent[] = [
      complaintEvent('b1', '2026-09-01T00:00:00Z'),
      complaintEvent('c1', '2026-09-01T00:10:00Z'),
      complaintEvent('c1', '2026-09-01T00:20:00Z'),
    ];
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: null, weeks: 2 }
    );
    const st = report.steward;
    // мутации: update ×3 (d1 ×2 + c1), resolve ×1, transition ×1, tool-mutation ×1, supersede 0
    expect(st.mutations).toEqual([
      { kind: 'update', count: 3 },
      { kind: 'supersede', count: 0 },
      { kind: 'resolve', count: 1 },
      { kind: 'transition', count: 1 },
      { kind: 'tool-mutation', count: 1 },
    ]);
    expect(st.mutationsByWeek).toEqual([
      { week: '2026-08-24', total: 0 },
      { week: '2026-08-31', total: 6 },
    ]);
    // жалобы: 3 подано; b1 resolved через 2ч после первой жалобы → lifetime 2; q1 rejected
    expect(st.complaintFunnel).toEqual({ filed: 3, resolved: 1, rejected: 1, avgLifetimeHours: 2, slaEscalations: 1 });
    expect(st.recidivismCount).toBe(1); // c1: 2 жалобы + update между ними
    expect(st.churnIds).toEqual(['d1']); // d1: 2 мутации за окно
    expect(st.autoMutationSharePct).toBeCloseTo(33.3333, 3); // 2 из 6 мутаций от system:wolf
  });
});

describe('buildAnalyticsReport: councils', () => {
  // Неделя fixedClock (2026-09-03, чт): текущий понедельник 2026-08-31; weeks:2 → бакеты 2026-08-24 / 2026-08-31
  const objects: Extra[] = [
    { id: 'q-open', title: 'q-open', type: 'council-question', status: 'open', created_at: '2026-08-25T00:00:00Z' },
    {
      id: 'q-done',
      title: 'q-done',
      type: 'council-question',
      status: 'answered',
      created_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 'op1',
      title: 'op1',
      type: 'council-opinion',
      status: 'accepted',
      created_at: '2026-08-25T01:00:00Z',
      created_by: 'agent:alpha',
      vote: 'за',
    },
    {
      id: 'op2',
      title: 'op2',
      type: 'council-opinion',
      status: 'accepted',
      created_at: '2026-09-01T01:00:00Z',
      created_by: 'agent:beta',
      vote: 'нет',
    },
    {
      // без поля vote → fallback на body-парсер extractVote
      id: 'op3',
      title: 'op3',
      type: 'council-opinion',
      status: 'accepted',
      created_at: '2026-09-01T02:00:00Z',
      created_by: 'agent:alpha',
      body: 'VOTE: за\nобоснование',
    },
    { id: 'syn1', title: 'syn1', type: 'synthesis', status: 'accepted', created_at: '2026-09-01T06:00:00Z' },
  ];
  const rels: Extra[] = [
    { id: 'rel1', subject: 'op1', predicate: 'answers', object: 'q-open' },
    { id: 'rel2', subject: 'op2', predicate: 'answers', object: 'q-done' },
    { id: 'rel3', subject: 'op3', predicate: 'answers', object: 'q-done' },
    { id: 'rel4', subject: 'ghost', predicate: 'answers', object: 'q-open' }, // субъекта нет в store → пропуск
    { id: 'rel5', subject: 'syn1', predicate: 'based_on', object: 'op2' },
    { id: 'rel6', subject: 'syn1', predicate: 'based_on', object: 'op3' },
  ];

  it('questions/opinions/participation/votes/synthesis/weeks/openQuestions; fallback-голос из body', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), relations: mockRelations(rels), clock: fixedClock },
      { signals: [], runLogText: null, weeks: 2 }
    );
    const c = report.councils;
    expect(c.questions).toEqual({ total: 2, inWindow: 2, open: 1 });
    expect(c.opinions).toEqual({ total: 3, perQuestionMin: 1, perQuestionAvg: 1.5, perQuestionMax: 2 }); // q-open 1, q-done 2
    expect(c.participation).toEqual([
      { agent: 'agent:alpha', opinions: 2 },
      { agent: 'agent:beta', opinions: 1 },
    ]);
    expect(c.votes).toEqual({ за: 2, нет: 1 }); // op3 — fallback 'за' из body
    expect(c.synthesis).toEqual({ questionsWithSynthesis: 1, sharePct: 50, medianHours: 6 }); // syn1 06:00 − q-done 00:00
    expect(c.weeks).toEqual([
      { week: '2026-08-24', questions: 1, opinions: 1, syntheses: 0 },
      { week: '2026-08-31', questions: 1, opinions: 2, syntheses: 1 },
    ]);
    expect(c.openQuestions).toEqual([{ id: 'q-open', title: 'q-open', daysOpen: 9, opinions: 1, votes: { за: 1 } }]);

    const view = filterAnalytics(report, { view: 'councils' });
    if (view.view !== 'councils') throw new Error('expected councils view');
    expect(view.councils).toBe(c);
  });

  it('пустая память → нули/null/пустые коллекции без падений', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations([]), clock: fixedClock },
      { signals: [], runLogText: null, weeks: 2 }
    );
    expect(report.councils).toEqual({
      questions: { total: 0, inWindow: 0, open: 0 },
      opinions: { total: 0, perQuestionMin: null, perQuestionAvg: null, perQuestionMax: null },
      participation: [],
      votes: {},
      synthesis: { questionsWithSynthesis: 0, sharePct: null, medianHours: null },
      weeks: [
        { week: '2026-08-24', questions: 0, opinions: 0, syntheses: 0 },
        { week: '2026-08-31', questions: 0, opinions: 0, syntheses: 0 },
      ],
      openQuestions: [],
    });
  });
});

describe('buildAnalyticsReport: experiment readiness (Q10)', () => {
  it('доля прогонов с arm; выборки по группам и экспериментам', async () => {
    const signals: SignalEvent[] = [
      runSignal({ agent: 'w', outcome: 'ok', experiment: { id: 'e1', arm: 'wolf' } }),
      runSignal({ agent: 'w', outcome: 'ok', experiment: { id: 'e1', arm: 'wolf' } }),
      runSignal({ agent: 'w', outcome: 'ok', experiment: { id: 'e2', arm: 'baseline' } }),
      runSignal({ agent: 'w', outcome: 'ok' }),
    ];
    const report = await buildAnalyticsReport(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.readiness).toEqual({
      totalRuns: 4,
      withArm: 3,
      withArmPct: 75,
      byArm: [
        { arm: 'baseline', runs: 1 },
        { arm: 'wolf', runs: 2 },
      ], // сорт по имени arm
      byExperiment: [
        { experiment: 'e1', runs: 2 },
        { experiment: 'e2', runs: 1 },
      ], // сорт runs убыв.
    });
  });
});
