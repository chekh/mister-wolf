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
      { store: mockStore(objects), log: mockLog(events), clock: fixedClock },
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
      { store: mockStore(objects), log: mockLog(events), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.memory.garbage).toEqual({ dead: 1, base: 4, ratioPct: 25 });
    expect(report.memory.garbage.dead).toBe(report.memory.rows.filter((r) => r.lifecycle === 'dead').length);
  });

  it('filterAnalytics: view-срезы, class/type-фильтр, top-лимит, view=all', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), clock: fixedClock },
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
      { store: mockStore(objects), log: mockLog([]), clock: fixedClock },
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
      { store: mockStore(objects), log: mockLog([]), clock: fixedClock },
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
      { store: mockStore(objects), log: mockLog([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.rules.map((r) => r.id)).toEqual(['rule-a', 'rule-c', 'rule-b']);
    expect(report.rules.map((r) => r.silent)).toEqual([false, true, false]);
    expect(report.rules[0]).toMatchObject({ title: 'rule-a', status: 'active', prevented: 5, checked: null });
    expect(report.rules[2]!.prevented).toBe(2);
  });
});
