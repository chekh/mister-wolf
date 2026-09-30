import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { UserFacingError } from '../../domain/errors.js';

export interface ApplyAggregateResult {
  /** Агрегат переведён proposed → active этим запуском. */
  activated: boolean;
  /** Исходники, архивированные этим запуском. */
  archived: string[];
  /** Исходники, уже archived или отсутствующие (пропущены, идемпотентность). */
  skipped: string[];
  /** Активаций/архиваций не было (агрегат active, все исходники погашены). */
  noop: boolean;
}

/**
 * 2.14 §7.3: подтверждение агрегата владельцем. Под lock: proposed → active,
 * исходники по рёбрам `aggregates` → archived, одно событие memory.aggregated.
 * FS не транзакционен: повторный apply дозавершает оставшиеся исходники
 * (уже archived → skipped); полный no-op — только когда агрегат active и
 * исходников к архивации нет, событие тогда не пишется (инвариант (ii) §9).
 * canTransition сознательно не проверяем: apply — governance этого пути
 * (proposed→active вне ALLOWED_TRANSITIONS), отказ — `transition <id> rejected`.
 */
export async function applyAggregate(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    relations: RelationLog;
    index?: SearchIndex;
    lock?: MemoryLock;
  },
  aggregateId: string,
  actor: string = 'system:wolf'
): Promise<ApplyAggregateResult> {
  const run = async (): Promise<ApplyAggregateResult> => {
    const agg = await deps.store.get(aggregateId);
    if (!agg) throw new UserFacingError(`Memory object not found: ${aggregateId}`);

    if (agg.status !== 'proposed' && agg.status !== 'active') {
      throw new UserFacingError(
        `Aggregate ${aggregateId} is ${agg.status}: apply expects a proposed or active aggregate; ` +
          `to refuse use "wolf transition ${aggregateId} rejected"`
      );
    }

    // исходники: уникальные object-строки рёбер aggregates от агрегата, порядок лога
    const rows = await deps.relations.list();
    const sourceIds: string[] = [];
    for (const r of rows) {
      if (r.predicate === 'aggregates' && r.subject === aggregateId && !sourceIds.includes(r.object)) {
        sourceIds.push(r.object);
      }
    }

    const activated = agg.status === 'proposed';
    const archived: string[] = [];
    const skipped: string[] = [];
    for (const id of sourceIds) {
      const obj = await deps.store.get(id);
      // отсутствующий исходник — сломанный кластер, apply не валится
      if (!obj || obj.status === 'archived') {
        skipped.push(id);
        continue;
      }
      const updated = await deps.store.update(id, { status: 'archived' });
      archived.push(id);
      if (deps.index) await deps.index.indexObject(updated);
    }

    if (!activated && archived.length === 0) {
      return { activated: false, archived, skipped, noop: true };
    }

    if (activated) {
      const updatedAgg = await deps.store.update(aggregateId, { status: 'active' });
      if (deps.index) await deps.index.indexObject(updatedAgg);
    }

    const now = deps.clock.now();
    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      type: 'memory.aggregated',
      timestamp: now.toISOString(),
      actor,
      payload: { aggregate_id: aggregateId, source_ids: sourceIds },
    });

    return { activated, archived, skipped, noop: false };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
