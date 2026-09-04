import { buildEffectivenessReport, type EffectivenessReport, type EffectivenessThresholds } from './effectiveness.js';
import { buildAnalyticsReport, type AnalyticsReport, type LifecycleThresholds } from './build-analytics.js';
import { computeSnapshotDelta, type DeltaRow } from './snapshot-delta.js';
import type { SnapshotEntry } from '../../adapters/fs/effectiveness-snapshots.js';
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import type { PricingTable } from '../../domain/pricing.js';
import type { Clock } from '../../ports/clock.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { RelationLog } from '../../ports/relation-log.port.js';

/** Единый JSON-документ `wolf dashboard --json` (§6.1 спеки аналитики). */
export interface DashboardData {
  generatedAt: string;
  effectiveness: EffectivenessReport;
  analytics: AnalyticsReport;
  snapshot: { prevTs: string | null; delta: DeltaRow[] };
}

/**
 * Композиция дашборда: effectiveness + analytics + дельта к последнему снапшоту.
 * Чистая сборка данных — рендер отдельно (адаптер CLI). prevSnapshot null → delta [].
 */
export async function buildDashboard(
  deps: { store: MemoryStore; log: EventLog; relations: RelationLog; clock: Clock },
  input: {
    signals: SignalEvent[];
    runLogText: string | null;
    thresholds: EffectivenessThresholds;
    pricing?: PricingTable;
    analyticsThresholds?: Partial<LifecycleThresholds>;
    prevSnapshot: SnapshotEntry | null;
    /** D7: passthrough счётчиков readSignalLog в analytics.dataQuality. */
    signalLogStats?: { malformedLines: number; totalLines: number };
  }
): Promise<DashboardData> {
  const effectiveness = await buildEffectivenessReport(
    { store: deps.store, log: deps.log, relations: deps.relations },
    {
      signals: input.signals,
      runLogText: input.runLogText,
      thresholds: input.thresholds,
      ...(input.pricing !== undefined ? { pricing: input.pricing } : {}),
    }
  );
  const analytics = await buildAnalyticsReport(
    { store: deps.store, log: deps.log, relations: deps.relations, clock: deps.clock },
    {
      signals: input.signals,
      runLogText: input.runLogText,
      ...(input.analyticsThresholds !== undefined ? { thresholds: input.analyticsThresholds } : {}),
      ...(input.pricing !== undefined ? { pricing: input.pricing } : {}),
      ...(input.signalLogStats !== undefined ? { signalLogStats: input.signalLogStats } : {}),
    }
  );
  return {
    generatedAt: deps.clock.now().toISOString(),
    effectiveness,
    analytics,
    snapshot: {
      prevTs: input.prevSnapshot !== null ? input.prevSnapshot.ts : null,
      delta: input.prevSnapshot !== null ? computeSnapshotDelta(input.prevSnapshot.report, effectiveness) : [],
    },
  };
}
