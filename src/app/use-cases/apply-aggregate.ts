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
 * Точки тестового seam'а (REQ-08/REQ-10, паттерн FaceFaultPoint): fault(point)
 * бросается ПОСЛЕ завершения указанного шага — данные шага на диске и в
 * журнале, следующий шаг не начат. Прод-код seam не передаёт.
 */
export type AggregateFaultPoint = 'archive_source' | 'activate' | 'aggregated';

/** Агрегация собирает уроки (2.14 §7.2 detectUnaggregatedLessons: кластер — lesson). */
const AGGREGATABLE_SOURCE_TYPES = new Set(['lesson']);
const WT_SCOPE_PREFIX = 'worktree:';

/**
 * 2.14 §7.3 + REQ-10: подтверждение агрегата владельцем. Под lock:
 * префлайт ВСЕГО набора источников до первой записи (инородный тип,
 * worktree-scope, self-link, отсутствующий источник → отказ целиком, без
 * частичного архивирования); затем proposed → active, исходники по рёбрам
 * `aggregates` → archived, пошаговый журнал memory.aggregate.op_step и
 * финальное memory.aggregated. FS не транзакционен: повторный apply
 * дозавершает по подтверждённому следу (уже archived → skipped; отсутствующий
 * при дозавершении — тоже skip: набор был цел на первом запуске, позже
 * пропавший исходник не блокирует завершение, объект читаем из skipped-
 * отчёта); полный no-op — только когда агрегат active и исходников к
 * архивации нет, событие тогда не пишется (инвариант (ii) §9).
 * canTransition сознательно не проверяем: apply — governance этого пути
 * (proposed→active вне ALLOWED_TRANSITIONS), отказ — `transition <id> rejected`
 * (rejected-агрегат ничего не архивирует — отказ до первой записи).
 * Архивация — смена статуса: исходные evidence (body/title/поля) остаются
 * читаемыми через store.get.
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
    fault?: (point: AggregateFaultPoint) => void;
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

    // Preflight REQ-10: весь набор проверен до первой записи запуска.
    const firstWritePending = agg.status === 'proposed';
    const objects = new Map<string, Awaited<ReturnType<typeof deps.store.get>>>();
    for (const id of sourceIds) objects.set(id, await deps.store.get(id));
    const skipped = new Set<string>();
    const problems: string[] = [];
    for (const id of sourceIds) {
      if (id === aggregateId) {
        problems.push(`- ${id}: self-link (aggregate references itself via "aggregates")`);
        continue;
      }
      const obj = objects.get(id);
      if (obj === null || obj === undefined) {
        // Первый запуск — набор обязан быть цел; дозавершение — не блокировать.
        if (firstWritePending) problems.push(`- ${id}: required source not found`);
        else skipped.add(id);
        continue;
      }
      if (obj.status === 'archived') {
        skipped.add(id);
        continue;
      }
      if (!AGGREGATABLE_SOURCE_TYPES.has(obj.type)) {
        problems.push(`- ${id}: source type "${obj.type}" is not aggregatable (expected lesson)`);
        continue;
      }
      const scope = (obj as { scope?: unknown }).scope;
      if (typeof scope === 'string' && scope.startsWith(WT_SCOPE_PREFIX)) {
        problems.push(`- ${id}: source scope "${scope}" is not deliverable to main; promote it first`);
      }
    }
    if (problems.length > 0) {
      throw new UserFacingError(
        `Aggregate ${aggregateId} failed preflight, nothing was written:\n` + problems.join('\n')
      );
    }

    const activated = agg.status === 'proposed';
    const archived: string[] = [];
    const stepEvent = async (step: string, sourceId?: string): Promise<void> => {
      const now = deps.clock.now();
      await deps.log.append({
        id: deps.idGen.generateEventId(now),
        type: 'memory.aggregate.op_step',
        timestamp: now.toISOString(),
        actor,
        payload:
          sourceId === undefined
            ? { aggregate_id: aggregateId, step }
            : { aggregate_id: aggregateId, step, source_id: sourceId },
      });
    };

    for (const id of sourceIds) {
      if (skipped.has(id)) continue;
      const obj = objects.get(id)!;
      const updated = await deps.store.update(id, { status: 'archived' });
      archived.push(id);
      if (deps.index) await deps.index.indexObject(updated);
      await stepEvent('archive_source', id);
      deps.fault?.('archive_source');
    }

    if (!activated && archived.length === 0) {
      // Noop по объектам — но след прогона обязан быть закрыт (NFR-06: частичные
      // исходы видимы): сбой между активацией и финальным событием (или старый
      // 3.1.2-прогон, оборванный там же) оставляет active-агрегат без
      // memory.aggregated. Повтор дозавершает по журналу: дописывает финал.
      const closed = (await deps.log.readAll()).some(
        (e) => e.type === 'memory.aggregated' && e.payload['aggregate_id'] === aggregateId
      );
      if (closed) {
        return { activated: false, archived, skipped: [...skipped], noop: true };
      }
    }

    if (activated) {
      const updatedAgg = await deps.store.update(aggregateId, { status: 'active' });
      if (deps.index) await deps.index.indexObject(updatedAgg);
      await stepEvent('activate');
      deps.fault?.('activate');
    }

    const now = deps.clock.now();
    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      type: 'memory.aggregated',
      timestamp: now.toISOString(),
      actor,
      payload: { aggregate_id: aggregateId, source_ids: sourceIds },
    });
    deps.fault?.('aggregated');

    return { activated, archived, skipped: [...skipped], noop: false };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
