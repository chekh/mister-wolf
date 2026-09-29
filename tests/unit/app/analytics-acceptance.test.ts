import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readSignalLog, type SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';
import { buildAnalyticsReport, filterAnalytics } from '../../../src/app/use-cases/build-analytics.js';
import { parseRouterLog } from '../../../src/domain/router-log.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { RelationLog } from '../../../src/ports/relation-log.port.js';
import type { Clock } from '../../../src/ports/clock.port.js';

/**
 * T003 (спека §8): golden-корпус машинной приёмки. Строки session-metrics.jsonl
 * пишутся руками с заранее вычисленными ответами (см. комментарии-обоснования у expect),
 * затем readSignalLog → buildAnalyticsReport. Стиль моков — build-analytics.test.ts.
 */

function mockStore(): MemoryStore {
  return {
    async list() {
      return [];
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
function mockLog(): EventLog {
  return {
    async readAll() {
      return [];
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}
function mockRelations(): RelationLog {
  return {
    async append() {
      throw new Error('not implemented');
    },
    async list() {
      return [];
    },
  };
}

/** now = 2026-09-28T12:00:00Z → 72h-окно vitality от 2026-09-25T12:00:00Z. */
const NOW_ISO = '2026-09-28T12:00:00.000Z';
const fixedClock: Clock = { now: () => new Date(NOW_ISO) };

const dirs: string[] = [];
afterEach(() => {
  const dir = dirs.pop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Строка mcp_call для jsonl-корпуса. */
function mcpCall(line: {
  tool: string;
  ts: string;
  outcome?: 'ok' | 'error';
  durationMs?: number;
  sessionId?: string | null;
  detail?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    ts: line.ts,
    event: 'mcp_call',
    session_id: line.sessionId ?? null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: line.outcome ?? 'ok',
    tool_name: line.tool,
    ...(line.durationMs !== undefined ? { duration_ms: line.durationMs } : {}),
    detail: line.detail ?? {},
  });
}

/** Строка delivery для jsonl-корпуса. */
function delivery(name: string, ts: string, sessionId: string | null): string {
  return JSON.stringify({
    ts,
    event: 'delivery',
    session_id: sessionId,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'system:wolf' },
    outcome: 'delivered',
    detail: { name, mechanism: 'call' },
  });
}

describe('buildAnalyticsReport: acceptance view (T003 golden-корпус)', () => {
  it('ручной корпус → все метрики приёмки совпадают с вычисленными вручную числами', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-acceptance-'));
    dirs.push(dir);
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });

    const corpus = [
      // --- add ×6: 3 ok + 3 error, durations [10,20,30,40,50,200] ---
      // p50: idx=0.5×5=2.5 → 30+0.5×(40−30)=35; p90: idx=0.9×5=4.5 → 50+0.5×(200−50)=125
      mcpCall({ tool: 'add', ts: '2026-09-27T10:00:00Z', durationMs: 10, sessionId: 'cli-1' }),
      mcpCall({ tool: 'add', ts: '2026-09-27T10:00:01Z', durationMs: 20, sessionId: 'cli-1' }),
      mcpCall({
        tool: 'add',
        ts: '2026-09-27T10:00:02Z',
        outcome: 'error',
        durationMs: 30,
        sessionId: 'cli-1',
        detail: { error_class_id: 'schema-validation' },
      }),
      mcpCall({
        tool: 'add',
        ts: '2026-09-27T10:00:03Z',
        outcome: 'error',
        durationMs: 40,
        sessionId: 'cli-1',
        detail: { error_class_id: 'schema-validation' },
      }),
      mcpCall({
        tool: 'add',
        ts: '2026-09-27T10:00:04Z',
        outcome: 'error',
        durationMs: 50,
        sessionId: 'cli-1',
        detail: { error_class_id: 'timeout' },
      }),
      // старый (>72ч от now): в toolCalls входит, в vitality — нет
      mcpCall({ tool: 'add', ts: '2026-09-20T10:00:00Z', durationMs: 200 }),
      // --- get ×4: [15,25,35,45] → p50 idx=1.5 → 30; p90 idx=2.7 → 35+0.7×10=42 ---
      mcpCall({ tool: 'get', ts: '2026-09-20T11:00:00Z', durationMs: 15 }), // старый, вне vitality
      mcpCall({
        tool: 'get',
        ts: '2026-09-27T11:00:09Z',
        durationMs: 25,
        detail: { memory_id: 'mem_a' },
      }), // follow: search#1 +9c, id в результатах
      mcpCall({
        tool: 'get',
        ts: '2026-09-27T12:00:05Z',
        durationMs: 35,
        detail: { memory_id: 'mem_zzz' },
      }), // НЕ follow: id вне результатов search#2
      mcpCall({
        tool: 'get',
        ts: '2026-09-27T13:00:11Z',
        durationMs: 45,
        detail: { memory_id: 'mem_q' },
      }), // НЕ follow: Δt=11c > 10c у search#3
      // --- search ×3: 1 followed → followRatePct = (1/3)×100 ---
      mcpCall({
        tool: 'search',
        ts: '2026-09-27T11:00:00Z',
        durationMs: 100,
        detail: { memory_ids: ['mem_a', 'mem_b'] },
      }),
      mcpCall({ tool: 'search', ts: '2026-09-27T12:00:00Z', durationMs: 100, detail: { memory_ids: ['mem_c'] } }),
      mcpCall({ tool: 'search', ts: '2026-09-27T13:00:00Z', durationMs: 100, detail: { memory_ids: ['mem_q'] } }),
      // --- не-core тул: в toolCalls есть, в vitality нет ---
      mcpCall({ tool: 'analytics', ts: '2026-09-27T14:00:00Z', durationMs: 300 }),
      // --- delivery-серии ---
      // s1: mem_x ×3 подряд (гэпы 5c) → 1 burst, repeat-streak 3, unique 1
      delivery('mem_x', '2026-09-27T10:00:05Z', 's1'),
      delivery('mem_x', '2026-09-27T10:00:10Z', 's1'),
      delivery('mem_x', '2026-09-27T10:00:15Z', 's1'),
      // s2: пара (гэп 30c), затем гэп 61c → 2 burst'а ([y1,y2] streak 1 unique 2; [y1] streak 1 unique 1)
      delivery('mem_y1', '2026-09-27T10:05:00Z', 's2'),
      delivery('mem_y2', '2026-09-27T10:05:30Z', 's2'),
      delivery('mem_y1', '2026-09-27T10:06:31Z', 's2'),
      // s3: одна доставка → 1 burst streak 1 unique 1
      delivery('mem_z', '2026-09-27T10:10:00Z', 's3'),
      // без сессии (до T002): withoutSession 1, в burst'ы не входит
      delivery('mem_n', '2026-09-27T10:11:00Z', null),
    ];
    writeFileSync(join(dir, '.wolf', 'metrics', 'session-metrics.jsonl'), corpus.join('\n') + '\n', 'utf-8');

    // router.log: worker-implementer 8 hit + 2 miss (20%); executor-lead 0 hit + 5 miss (100%); 1 мусорная строка
    const routerLines: string[] = [];
    for (let i = 0; i < 8; i++)
      routerLines.push(
        `2026-09-27T09:00:0${i}.000Z agent-id=worker-implementer playbook=hit name=mem_pb_${i} variant=canonical injected=yes`
      );
    routerLines.push('2026-09-27T09:00:10.000Z agent-id=worker-implementer playbook=miss injected=no');
    routerLines.push('2026-09-27T09:00:11.000Z agent-id=worker-implementer playbook=miss injected=no');
    for (let i = 0; i < 5; i++)
      routerLines.push(`2026-09-27T09:01:0${i}.000Z agent-id=executor-lead playbook=miss injected=no`);
    routerLines.push('garbage line without kv structure');
    const parsedRouter = parseRouterLog(routerLines.join('\n'));

    const signalLog = readSignalLog(dir);
    expect(signalLog.malformedLines).toBe(0); // корпус валиден по схеме
    const report = await buildAnalyticsReport(
      { store: mockStore(), log: mockLog(), relations: mockRelations(), clock: fixedClock },
      {
        signals: signalLog.events,
        signalLogStats: { malformedLines: 2, totalLines: 40 }, // echo → acceptance.dataQuality
        runLogText: null,
        routerLog: {
          rows: parsedRouter.rows,
          lines: parsedRouter.rows.length + parsedRouter.malformedLines,
          malformedLines: parsedRouter.malformedLines,
        },
      }
    );

    const a = report.acceptance;
    // D4-часть блока: без run/task_evaluated-сигналов — нули
    expect(a.accepted).toBe(0);
    expect(a.costPerAcceptedTask).toBeNull();

    // router: 2 агента, сорт misses убыв. (executor-lead 5 > worker 2); miss-rate 5/5 и 2/10
    expect(a.router).toEqual({
      rows: [
        { agent: 'executor-lead', hits: 0, misses: 5, missRatePct: 100 },
        { agent: 'worker-implementer', hits: 8, misses: 2, missRatePct: 20 },
      ],
      lines: 16, // 15 валидных + 1 мусорная
      malformedLines: 1,
    });

    // toolCalls: сорт calls убыв.; add err 3/6=50%, p50=35/p90=125; get p50=30/p90≈42; search/analytics
    expect(a.toolCalls).toHaveLength(4);
    expect(a.toolCalls[0]).toEqual({ tool: 'add', calls: 6, errors: 3, errorRatePct: 50, p50Ms: 35, p90Ms: 125 });
    const getRow = a.toolCalls[1]!;
    expect(getRow.tool).toBe('get');
    expect(getRow.calls).toBe(4);
    expect(getRow.errors).toBe(0);
    expect(getRow.errorRatePct).toBe(0);
    expect(getRow.p50Ms).toBe(30); // idx=1.5 → 25+0.5×(35−25)
    expect(getRow.p90Ms).toBeCloseTo(42, 10); // idx=0.9×3=2.7 → 35+0.7×(45−35), float-шум
    expect(a.toolCalls[2]).toEqual({ tool: 'search', calls: 3, errors: 0, errorRatePct: 0, p50Ms: 100, p90Ms: 100 });
    expect(a.toolCalls[3]).toEqual({ tool: 'analytics', calls: 1, errors: 0, errorRatePct: 0, p50Ms: 300, p90Ms: 300 });

    // errorClasses: сорт count убыв. (schema-validation 2 > timeout 1)
    expect(a.errorClasses).toEqual([
      { id: 'schema-validation', count: 2 },
      { id: 'timeout', count: 1 },
    ]);

    // bursts: 4 burst'а (s1=1, s2=2, s3=1); deliveries 3+3+1=7; streaks [3,1,1,1]
    expect(a.bursts).toEqual({
      bursts: 4,
      deliveries: 7,
      avgDeliveriesPerBurst: 1.75, // 7/4
      maxRepeatStreak: 3, // s1: mem_x ×3 подряд
      repeatStreakLe2SharePct: 75, // 3 из 4 burst'ов со streak ≤ 2
      avgUniquePerBurst: 1.25, // (1+2+1+1)/4
      withoutSession: 1,
    });

    // searchFollow: 3 search, 1 followed (только search#1 → get mem_a за 9c)
    expect(a.searchFollow.searches).toBe(3);
    expect(a.searchFollow.followed).toBe(1);
    expect(a.searchFollow.followRatePct).toBeCloseTo(100 / 3, 10);

    // vitality: add×5 + get×3 + search×3 внутри 72ч (старые add/get и не-core analytics — нет)
    expect(a.vitality).toEqual({ coreCalls72h: 11 });

    // dataQuality — эхо signalLogStats
    expect(a.dataQuality).toEqual({ malformedLines: 2 });

    // view-фильтр: payload несёт тот же объект
    const view = filterAnalytics(report, { view: 'acceptance' });
    if (view.view !== 'acceptance') throw new Error('expected acceptance view');
    expect(view.acceptance).toBe(a);
  });

  it('P110: routerLog + skillInvocations → report.delivery заполнен', async () => {
    const router = parseRouterLog(
      '2026-09-27T09:00:00.000Z agent-id=worker playbook=hit name=mem_pb variant=canonical injected=yes ms=5 bytes=10\n' +
        '2026-09-27T09:00:01.000Z agent-id=worker playbook=hit name=mem_fb variant=fallback injected=yes ms=7 bytes=20'
    );
    const report = await buildAnalyticsReport(
      { store: mockStore(), log: mockLog(), relations: mockRelations(), clock: fixedClock },
      {
        signals: [JSON.parse(delivery('mem_x', '2026-09-27T10:00:00Z', 's1')) as SignalEvent],
        runLogText: null,
        routerLog: { rows: router.rows, lines: router.rows.length, malformedLines: 0 },
        skillInvocations: { rows: [{ ts: '2026-09-27T11:00:00Z', skill: 'ponytail', agent: null }], malformedLines: 1 },
      }
    );
    const d = report.delivery;
    // доставки без последующего get/search в сессии → applied 0
    expect(d.topDelivered).toEqual([{ name: 'mem_x', deliveries: 1, applied: 0, appliedPct: 0 }]);
    expect(d.underApplied).toEqual([]); // deliveries < 10 — порог подсветки не сработал
    expect(d.missRateByAgent).toEqual([{ agent: 'worker', fallbacks: 1, total: 2, missRatePct: 50 }]);
    expect(d.avgInjectionBytes).toEqual({ deliverySignals: null, routerLog: 15 }); // (10+20)/2
    expect(d.routerMs.p50).toBe(6); // [5,7]: idx 0.5 → 5+0.5×2
    expect(d.routerMs.p90).toBeCloseTo(6.8, 10); // idx 0.9 → 5+0.9×2, float-шум
    expect(d.routerMs.count).toBe(2);
    expect(d.skills).toEqual([{ skill: 'ponytail', count: 1 }]);
  });

  it('P110: пустые входы → пустая delivery-структура без исключений', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(), log: mockLog(), relations: mockRelations(), clock: fixedClock },
      { signals: [] as SignalEvent[], runLogText: null }
    );
    expect(report.delivery).toEqual({
      topDelivered: [],
      underApplied: [],
      missRateByAgent: [],
      avgInjectionBytes: { deliverySignals: null, routerLog: null },
      routerMs: { p50: null, p90: null, count: 0 },
      skills: [],
    });
  });

  it('пустые signals/routerLog → нули и null-метрики, отчёт не падает', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(), log: mockLog(), relations: mockRelations(), clock: fixedClock },
      { signals: [] as SignalEvent[], runLogText: null }
    );
    expect(report.acceptance).toEqual({
      accepted: 0,
      costPerAcceptedTask: null,
      router: { rows: [], lines: 0, malformedLines: 0 },
      toolCalls: [],
      errorClasses: [],
      bursts: {
        bursts: 0,
        deliveries: 0,
        avgDeliveriesPerBurst: null,
        maxRepeatStreak: null,
        repeatStreakLe2SharePct: null,
        avgUniquePerBurst: null,
        withoutSession: 0,
      },
      searchFollow: { searches: 0, followed: 0, followRatePct: null },
      vitality: { coreCalls72h: 0 },
      dataQuality: { malformedLines: 0 },
    });
  });
});
