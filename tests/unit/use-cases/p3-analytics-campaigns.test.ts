import { describe, it, expect } from 'vitest';
import { buildAnalyticsReport, filterAnalytics } from '../../../src/app/use-cases/build-analytics.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { RelationLog } from '../../../src/ports/relation-log.port.js';
import type { Relation } from '../../../src/domain/schemas/relation-schema.js';
import type { Clock } from '../../../src/ports/clock.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
import type { SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';

// Паттерн моков — p2-analytics-lifecycle.test.ts (in-memory store/log/relations + fixedClock)

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

const fixedClock: Clock = { now: () => new Date('2026-09-04T00:00:00Z') };

/** ISO-таймстамп «минута N» — лексикографическая сортировка = хронология. */
const T = (minute: number): string => new Date(Date.UTC(2026, 0, 1, 0, minute, 0)).toISOString();

const deps = () => ({
  store: mockStore([]),
  log: mockLog([]),
  relations: mockRelations([]),
  clock: fixedClock,
});

function runSignal(opts: {
  session?: string | null;
  campaign?: string;
  weighted?: number;
  outcome?: string;
  ts?: string;
}): SignalEvent {
  return {
    ts: opts.ts ?? T(0),
    event: 'run',
    session_id: opts.session ?? null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    ...(opts.weighted !== undefined ? { weighted: opts.weighted } : {}),
    ...(opts.outcome !== undefined ? { outcome: opts.outcome } : {}),
    ...(opts.campaign !== undefined ? { campaign_id: opts.campaign } : {}),
  };
}

function memoryStageSignal(
  stage: 'retrieved' | 'injected' | 'cited' | 'applied',
  memoryIds: string[],
  ts: string,
  session: string | null = null
): SignalEvent {
  return {
    ts,
    event: 'memory_stage',
    session_id: session,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: stage,
    detail: { stage, memory_ids: memoryIds },
  };
}

function taskEvaluatedSignal(verdict: string, session: string | null, ts: string, campaign?: string): SignalEvent {
  return {
    ts,
    event: 'task_evaluated',
    session_id: session,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'evaluated',
    detail: { verdict, scorer: 'human', ...(campaign !== undefined ? { campaign_id: campaign } : {}) },
  };
}

describe('P3 D2: campaign view', () => {
  it('двухкогортная кампания: медианы weighted, accepted-доли, pfail; runs=6, hasVerdicts=true', async () => {
    const signals: SignalEvent[] = [
      // injected-память в сессиях s1..s3 → раны этих сессий = with_memory
      memoryStageSignal('injected', ['m1'], T(1), 's1'),
      memoryStageSignal('injected', ['m1'], T(1), 's2'),
      memoryStageSignal('injected', ['m1'], T(1), 's3'),
      runSignal({ session: 's1', campaign: 'eval-01', weighted: 10, outcome: 'ok' }),
      runSignal({ session: 's2', campaign: 'eval-01', weighted: 20, outcome: 'exit_1' }),
      runSignal({ session: 's3', campaign: 'eval-01', weighted: 30, outcome: 'ok' }),
      runSignal({ session: 's4', campaign: 'eval-01', weighted: 5, outcome: 'ok' }),
      runSignal({ session: 's5', campaign: 'eval-01', weighted: 15, outcome: 'ok' }),
      runSignal({ session: 's6', campaign: 'eval-01', weighted: 25, outcome: 'ok' }),
      // вердикты кампании: 2 accepted + 1 rejected в with-сессиях, 1 accepted в no-сессии
      taskEvaluatedSignal('accepted', 's1', T(10), 'eval-01'),
      taskEvaluatedSignal('accepted', 's2', T(10), 'eval-01'),
      taskEvaluatedSignal('rejected', 's3', T(10), 'eval-01'),
      taskEvaluatedSignal('accepted', 's4', T(10), 'eval-01'),
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.campaign.rows).toHaveLength(1);
    const row = report.campaign.rows[0]!;
    expect(row.campaign).toBe('eval-01');
    expect(row.runs).toBe(6);
    expect(row.hasVerdicts).toBe(true);
    // with_memory: n=3, медиана (10,20,30) = 20; 2/3 accepted; 1/3 pfail (exit_1)
    expect(row.withMemory.cohort).toBe('with_memory');
    expect(row.withMemory.n).toBe(3);
    expect(row.withMemory.medianWeighted).toBe(20);
    expect(row.withMemory.acceptedSharePct).toBeCloseTo(66.6667, 3);
    expect(row.withMemory.processFailureRatePct).toBeCloseTo(33.3333, 3);
    expect(row.withMemory.reason).toBeNull();
    // no_memory: n=3, медиана (5,15,25) = 15; 1/1 accepted; 0 pfail
    expect(row.noMemory.cohort).toBe('no_memory');
    expect(row.noMemory.n).toBe(3);
    expect(row.noMemory.medianWeighted).toBe(15);
    expect(row.noMemory.acceptedSharePct).toBe(100);
    expect(row.noMemory.processFailureRatePct).toBe(0);
    expect(row.noMemory.reason).toBeNull();
  });

  it('когорта n<3: medianWeighted null + reason, acceptedSharePct по вердиктам считается; n=0 → no runs', async () => {
    const signals: SignalEvent[] = [
      runSignal({ session: 't1', campaign: 'small', weighted: 1, outcome: 'ok' }),
      runSignal({ session: 't2', campaign: 'small', weighted: 2, outcome: 'ok' }),
      taskEvaluatedSignal('accepted', 't1', T(10), 'small'),
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    const row = report.campaign.rows[0]!;
    expect(row.noMemory).toEqual({
      cohort: 'no_memory',
      n: 2,
      medianWeighted: null,
      acceptedSharePct: 100,
      processFailureRatePct: 0,
      reason: 'n<3: min 3 runs',
    });
    expect(row.withMemory).toEqual({
      cohort: 'with_memory',
      n: 0,
      medianWeighted: null,
      acceptedSharePct: null,
      processFailureRatePct: null,
      reason: 'no runs',
    });
  });

  it('кампания без вердиктов: hasVerdicts=false, acceptedSharePct null у обеих когорт (reason остаётся про n)', async () => {
    const signals: SignalEvent[] = [
      runSignal({ session: 'u1', campaign: 'nov', weighted: 10, outcome: 'ok' }),
      runSignal({ session: 'u2', campaign: 'nov', weighted: 20, outcome: 'ok' }),
      runSignal({ session: 'u3', campaign: 'nov', weighted: 30, outcome: 'ok' }),
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    const row = report.campaign.rows[0]!;
    expect(row.hasVerdicts).toBe(false);
    expect(row.withMemory.acceptedSharePct).toBeNull();
    expect(row.noMemory.acceptedSharePct).toBeNull();
    // раны в когорте есть (n=3) — метрики ранов живут, reason null
    expect(row.noMemory.medianWeighted).toBe(20);
    expect(row.noMemory.reason).toBeNull();
  });

  it('run с session_id null → no_memory; run без campaign_id не попадает ни в одну кампанию', async () => {
    const signals: SignalEvent[] = [
      runSignal({ session: null, campaign: 'c-null', weighted: 7, outcome: 'ok' }),
      runSignal({ session: 'free', weighted: 100, outcome: 'ok' }), // без campaign_id
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.campaign.rows).toHaveLength(1);
    const row = report.campaign.rows[0]!;
    expect(row.campaign).toBe('c-null');
    expect(row.runs).toBe(1);
    expect(row.noMemory.n).toBe(1);
    expect(row.withMemory.n).toBe(0);
  });

  it('сортировка кампаний: runs убыв., при равенстве campaign по алфавиту', async () => {
    const run = (c: string, s: string): SignalEvent =>
      runSignal({ session: s, campaign: c, weighted: 1, outcome: 'ok' });
    const signals: SignalEvent[] = [
      run('bbb', 'x1'),
      run('bbb', 'x2'),
      run('bbb', 'x3'),
      run('bbb', 'x4'),
      run('aaa', 'x5'),
      run('aaa', 'x6'),
      run('aaa', 'x7'),
      run('aaa', 'x8'),
      run('ccc', 'x9'),
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.campaign.rows.map((r) => [r.campaign, r.runs])).toEqual([
      ['aaa', 4],
      ['bbb', 4],
      ['ccc', 1],
    ]);
  });
});

describe('P3 D3: per-memory ROI', () => {
  it('associatedAccepted: инъекция не позже вердикта считается, после — нет; applied/injectedTotal/lastActivity', async () => {
    const signals: SignalEvent[] = [
      memoryStageSignal('injected', ['mem-x'], T(1), 'r1'),
      taskEvaluatedSignal('accepted', 'r1', T(2)), // после инъекции → считается
      taskEvaluatedSignal('accepted', 'r2', T(1)), // ДО инъекции в r2 → не считается
      memoryStageSignal('injected', ['mem-x'], T(2), 'r2'),
      memoryStageSignal('applied', ['mem-x'], T(3)),
      memoryStageSignal('injected', ['mem-y'], T(4), 'r3'), // 0 accepted → ниже в сортировке
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.memory.roi.rows).toEqual([
      { id: 'mem-x', associatedAccepted: 1, associatedApplied: 1, injectedTotal: 2, lastActivity: T(3) },
      { id: 'mem-y', associatedAccepted: 0, associatedApplied: 0, injectedTotal: 1, lastActivity: T(4) },
    ]);
  });

  it('filterAnalytics: view memory отдаёт roi, view campaign отдаёт campaign', async () => {
    const signals: SignalEvent[] = [
      memoryStageSignal('injected', ['mem-x'], T(1), 'f1'),
      runSignal({ session: 'f1', campaign: 'fc', weighted: 1, outcome: 'ok' }),
      taskEvaluatedSignal('accepted', 'f1', T(2), 'fc'),
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    const mem = filterAnalytics(report, { view: 'memory' });
    if (mem.view !== 'memory') throw new Error('expected memory view');
    expect(mem.roi).toBe(report.memory.roi);
    const camp = filterAnalytics(report, { view: 'campaign' });
    if (camp.view !== 'campaign') throw new Error('expected campaign view');
    expect(camp.campaign).toBe(report.campaign);
  });
});

describe('P3 D2/D3: пустые сигналы', () => {
  it('campaign.rows = [], roi.rows = [], без падений', async () => {
    const report = await buildAnalyticsReport(deps(), { signals: [], runLogText: null });
    expect(report.campaign).toEqual({ rows: [] });
    expect(report.memory.roi).toEqual({ rows: [] });
  });
});
