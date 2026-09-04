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

// Паттерн моков — build-analytics.test.ts (in-memory store/log/relations + fixedClock)

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

/** ISO-таймстамп «минута N» — лексикографическая сортировка = хронология. */
const T = (minute: number): string => new Date(Date.UTC(2026, 0, 1, 0, minute, 0)).toISOString();

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

function taskEvaluatedSignal(verdict: string, session: string | null, ts: string): SignalEvent {
  return {
    ts,
    event: 'task_evaluated',
    session_id: session,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'evaluated',
    detail: { verdict, scorer: 'human' },
  };
}

function coordEventSignal(
  kind: 'handoff' | 'review' | 'acceptance' | 'blocker' | 'escalation',
  from: string,
  to: string | undefined,
  refs: string[],
  ts: string
): SignalEvent {
  return {
    ts,
    event: 'coord_event',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: kind,
    detail: { kind, actor_from: from, ...(to !== undefined ? { actor_to: to } : {}), refs },
  };
}

const deps = (objects: Extra[] = [], events: MemoryEvent[] = []) => ({
  store: mockStore(objects),
  log: mockLog(events),
  relations: mockRelations([]),
  clock: fixedClock,
});

describe('P2 D4: memory lifecycle funnel', () => {
  const objects: Extra[] = ['m0', 'm1', 'm2', 'm3', 'm4'].map((id) => ({
    id,
    title: id,
    type: 'lesson',
    status: 'active',
    created_at: '2026-08-30T00:00:00Z',
  }));
  const signals: SignalEvent[] = [
    memoryStageSignal('retrieved', ['m1', 'm2'], T(1)),
    memoryStageSignal('retrieved', ['m2', 'm3'], T(2)), // 2 события, 3 уникальных id
    memoryStageSignal('injected', ['m1'], T(3)),
    memoryStageSignal('cited', ['m1'], T(4)),
    memoryStageSignal('applied', ['m2', 'm0'], T(5)),
    // малформы — не роняют и не считаются
    { ...memoryStageSignal('retrieved', ['x'], T(6)), detail: { stage: 'bogus', memory_ids: ['x'] } },
    { ...memoryStageSignal('retrieved', ['x'], T(7)), detail: { stage: 'cited', memory_ids: 'not-array' } },
    { ...memoryStageSignal('retrieved', ['x'], T(8)), detail: undefined },
  ];

  it('added = все объекты store; стадии = события + уникальные id; appliedUniqueIds отсортирован', async () => {
    const report = await buildAnalyticsReport(deps(objects), { signals, runLogText: null });
    expect(report.memory.funnel).toEqual({
      added: 5,
      retrieved: { events: 2, uniqueIds: 3 },
      injected: { events: 1, uniqueIds: 1 },
      cited: { events: 1, uniqueIds: 1 },
      applied: { events: 1, uniqueIds: 2 },
      appliedUniqueIds: ['m0', 'm2'],
    });
  });

  it('filterAnalytics memory включает funnel и attribution (аддитивно к rows/garbage)', async () => {
    const report = await buildAnalyticsReport(deps(objects), { signals, runLogText: null });
    const view = filterAnalytics(report, { view: 'memory' });
    if (view.view !== 'memory') throw new Error('expected memory view');
    expect(view.funnel).toBe(report.memory.funnel);
    expect(view.attribution).toBe(report.memory.attribution);
  });

  it('пустые сигналы → нулевая воронка без падений', async () => {
    const report = await buildAnalyticsReport(deps(objects), { signals: [], runLogText: null });
    expect(report.memory.funnel).toEqual({
      added: 5,
      retrieved: { events: 0, uniqueIds: 0 },
      injected: { events: 0, uniqueIds: 0 },
      cited: { events: 0, uniqueIds: 0 },
      applied: { events: 0, uniqueIds: 0 },
      appliedUniqueIds: [],
    });
  });
});

describe('P2 D4: attribution coverage', () => {
  it('инъекция до вердикта в той же сессии считается, чужая сессия — нет: 1/2 = 50%', async () => {
    const signals: SignalEvent[] = [
      memoryStageSignal('injected', ['m1'], T(1), 'sessionA'),
      taskEvaluatedSignal('accepted', 'sessionA', T(2)),
      taskEvaluatedSignal('accepted', 'sessionB', T(2)), // без инъекции в B
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.memory.attribution).toEqual({
      acceptedTotal: 2,
      acceptedWithInjection: 1,
      attributionCoveragePct: 50,
    });
  });

  it('инъекция ПОСЛЕ вердикта (та же сессия) не считается: 0/1 = 0%', async () => {
    const signals: SignalEvent[] = [
      taskEvaluatedSignal('accepted', 'sessionA', T(1)),
      memoryStageSignal('injected', ['m1'], T(2), 'sessionA'),
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.memory.attribution).toEqual({
      acceptedTotal: 1,
      acceptedWithInjection: 0,
      attributionCoveragePct: 0,
    });
  });

  it('пустые сигналы → null + no task_evaluated', async () => {
    const report = await buildAnalyticsReport(deps(), { signals: [], runLogText: null });
    expect(report.memory.attribution).toEqual({
      acceptedTotal: 0,
      acceptedWithInjection: 0,
      attributionCoveragePct: null,
      reason: 'no task_evaluated',
    });
  });

  it('task_evaluated есть, injected нет → null + no injected', async () => {
    const signals: SignalEvent[] = [
      taskEvaluatedSignal('accepted', 'sessionA', T(2)),
      memoryStageSignal('injected', ['m1'], T(1), null), // session_id null — не считается
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.memory.attribution.attributionCoveragePct).toBeNull();
    expect(report.memory.attribution.reason).toBe('no injected');
  });

  it('injected есть, но только rejected-вердикты → null + no accepted verdicts', async () => {
    const signals: SignalEvent[] = [
      memoryStageSignal('injected', ['m1'], T(1), 'sessionA'),
      taskEvaluatedSignal('rejected', 'sessionA', T(2)),
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.memory.attribution).toEqual({
      acceptedTotal: 0,
      acceptedWithInjection: 0,
      attributionCoveragePct: null,
      reason: 'no accepted verdicts',
    });
  });
});

describe('P2 D5: coordination view', () => {
  it('counts: kind × actor_from, сорт count убыв. → kind → actorFrom', async () => {
    const signals: SignalEvent[] = [
      coordEventSignal('handoff', 'lead', 'w1', [], T(1)),
      coordEventSignal('handoff', 'lead', 'w2', [], T(2)),
      coordEventSignal('handoff', 'lead', 'w3', [], T(3)), // handoff/lead = 3
      coordEventSignal('review', 'lead', undefined, [], T(4)),
      coordEventSignal('review', 'lead', undefined, [], T(5)), // review/lead = 2
      coordEventSignal('blocker', 'worker', 'lead', [], T(6)),
      coordEventSignal('blocker', 'worker', 'lead', [], T(7)), // blocker/worker = 2
      coordEventSignal('handoff', 'worker', 'lead', [], T(8)), // handoff/worker = 1
    ];
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.coordination.counts).toEqual([
      { kind: 'handoff', actorFrom: 'lead', count: 3 },
      { kind: 'blocker', actorFrom: 'worker', count: 2 },
      { kind: 'review', actorFrom: 'lead', count: 2 },
      { kind: 'handoff', actorFrom: 'worker', count: 1 },
    ]);
  });

  it('recent: 25 событий → 20 свежих по ts убыв.; to null → null в паре', async () => {
    const signals: SignalEvent[] = [];
    for (let i = 0; i < 25; i++) {
      signals.push(coordEventSignal('handoff', `a${i}`, i % 2 === 0 ? 'lead' : undefined, [`ref${i}`], T(i)));
    }
    const report = await buildAnalyticsReport(deps(), { signals, runLogText: null });
    expect(report.coordination.recent).toHaveLength(20);
    expect(report.coordination.recent[0]).toEqual({
      ts: T(24),
      kind: 'handoff',
      from: 'a24',
      to: 'lead',
      refs: ['ref24'],
    });
    expect(report.coordination.recent[1]!.ts).toBe(T(23));
    expect(report.coordination.recent[19]!.ts).toBe(T(5)); // самые старые (T(0)..T(4)) отрезаны
    expect(report.coordination.recent[1]!.to).toBeNull(); // нечётный i — actor_to нет
  });

  it('blockers: ref с resolve → resolvedAt; без resolve / resolve РАНЬШЕ открытия → null; ранний blocker = openedAt', async () => {
    const signals: SignalEvent[] = [
      coordEventSignal('blocker', 'worker', 'lead', ['mem_x'], T(10)),
      coordEventSignal('blocker', 'worker', 'lead', ['mem_x'], T(6)), // дубль-открытие: earlier = T(6)
      coordEventSignal('blocker', 'worker', 'lead', ['mem_y'], T(7)),
      coordEventSignal('blocker', 'worker', 'lead', ['mem_z'], T(9)),
    ];
    const events: MemoryEvent[] = [
      { id: 'ev1', type: 'memory.resolved', timestamp: T(3), actor: 'user:cli', payload: { memory_id: 'mem_z' } }, // раньше открытия
      { id: 'ev2', type: 'memory.resolved', timestamp: T(12), actor: 'user:cli', payload: { memory_id: 'mem_x' } },
    ];
    const report = await buildAnalyticsReport(deps([], events), { signals, runLogText: null });
    expect(report.coordination.blockers).toEqual([
      { ref: 'mem_x', openedAt: T(6), resolvedAt: T(12) },
      { ref: 'mem_y', openedAt: T(7), resolvedAt: null },
      { ref: 'mem_z', openedAt: T(9), resolvedAt: null },
    ]);
  });

  it('filterAnalytics: view coordination отдаёт report.coordination', async () => {
    const report = await buildAnalyticsReport(deps(), {
      signals: [coordEventSignal('review', 'lead', undefined, [], T(1))],
      runLogText: null,
    });
    const view = filterAnalytics(report, { view: 'coordination' });
    if (view.view !== 'coordination') throw new Error('expected coordination view');
    expect(view.coordination).toBe(report.coordination);
  });
});
