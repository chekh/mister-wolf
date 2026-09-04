import { describe, it, expect } from 'vitest';
import { buildDashboard } from '../../../src/app/use-cases/build-dashboard.js';
import {
  buildEffectivenessReport,
  DEFAULT_EFFECTIVENESS_THRESHOLDS,
} from '../../../src/app/use-cases/effectiveness.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { RelationLog } from '../../../src/ports/relation-log.port.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
import type { SnapshotEntry } from '../../../src/adapters/fs/effectiveness-snapshots.js';

type Extra = Record<string, unknown>;

function mockStore(objects: Extra[]): MemoryStore {
  return {
    async list(filters) {
      return objects.filter(
        (o) => (!filters?.type || o.type === filters.type) && (!filters?.status || o.status === filters.status)
      ) as never;
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

function mockRelations(): RelationLog {
  return {
    async list() {
      return [];
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}

const FIXED_TS = '2026-09-03T00:00:00.000Z';
const clock = { now: () => new Date(FIXED_TS) };

function objects(n: number): Extra[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `o${i + 1}`,
    title: `o${i + 1}`,
    type: 'decision',
    status: 'active',
  }));
}

function addedEvents(os: Extra[]): MemoryEvent[] {
  return os.map((o) => ({
    id: `ev-${o.id}`,
    type: 'memory.added',
    timestamp: FIXED_TS,
    actor: 'user:cli',
    payload: { memory_id: o.id as string },
  }));
}

describe('buildDashboard (композиция effectiveness + analytics + snapshot delta)', () => {
  it('prevSnapshot null -> snapshot: prevTs null, delta []', async () => {
    const data = await buildDashboard(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations(), clock },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS, prevSnapshot: null }
    );
    expect(data.snapshot).toEqual({ prevTs: null, delta: [] });
    expect(data.generatedAt).toBe(FIXED_TS);
    expect(data.effectiveness).toBeDefined();
    expect(data.analytics).toBeDefined();
    // без signalLogStats (D7) → dataQuality n/a
    expect(data.analytics.dataQuality).toEqual({
      validEventRatePct: null,
      malformedLines: 0,
      duplicateEventRatePct: null,
      unknownModelRatePct: null,
      pricingCoveragePct: null,
      completeTraceRatePct: null,
      completeTraceRateReason: 'span model planned P2',
    });
  });

  it('signalLogStats passthrough -> analytics.dataQuality (D7)', async () => {
    const data = await buildDashboard(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations(), clock },
      {
        signals: [],
        runLogText: null,
        thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS,
        prevSnapshot: null,
        signalLogStats: { malformedLines: 1, totalLines: 4 },
      }
    );
    expect(data.analytics.dataQuality).toEqual({
      validEventRatePct: 75,
      malformedLines: 1,
      duplicateEventRatePct: null,
      unknownModelRatePct: null,
      pricingCoveragePct: null,
      completeTraceRatePct: null,
      completeTraceRateReason: 'span model planned P2',
    });
  });

  it('prevSnapshot с другим отчётом -> delta содержит изменившийся path', async () => {
    // prev: 3 write-only решения; curr: 2 -> числовые поля блоков расходятся
    const prevObjects = objects(3);
    const prevReport = await buildEffectivenessReport(
      { store: mockStore(prevObjects), log: mockLog(addedEvents(prevObjects)), relations: mockRelations() },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS }
    );
    const prevSnapshot: SnapshotEntry = { ts: '2026-09-01T00:00:00.000Z', report: prevReport };

    const currObjects = objects(2);
    const data = await buildDashboard(
      { store: mockStore(currObjects), log: mockLog(addedEvents(currObjects)), relations: mockRelations(), clock },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS, prevSnapshot }
    );
    expect(data.snapshot.prevTs).toBe('2026-09-01T00:00:00.000Z');
    expect(data.snapshot.delta.length).toBeGreaterThan(0);
    expect(data.snapshot.delta.some((r) => r.diff !== null && r.diff !== 0)).toBe(true);
  });
});
