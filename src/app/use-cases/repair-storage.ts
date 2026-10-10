import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';

export interface RepairReport {
  reindexed: number;
  eventsAppended: number;
  danglingEvents: number;
  /** Человекочитаемый план (dry-run) / лог (apply). */
  actions: string[];
}

export interface RepairDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  /** Сырые непустые строки events.jsonl; не передан — events-часть пропускается. */
  readEventLines?: () => Promise<string[]>;
  lock?: MemoryLock;
}

interface ParsedEvent {
  type?: string;
  payload?: { memory_id?: string };
}

/** WP4 (спека 2.16 §7). Стратегия источников (фиксация планом волны 2.16):
 * markdown — истина объектов; events.jsonl — истина журнала (append-only,
 * недостающие memory.added дозаписываются из markdown); индекс — производный
 * (rebuild). Восстановление идемпотентно; битые строки журнала пропускаются. */
export async function repairStorage(deps: RepairDeps, opts: { dryRun: boolean }): Promise<RepairReport> {
  const run = async (): Promise<RepairReport> => {
    const actions: string[] = [];
    const objects = await deps.store.list();
    const byId = new Map(objects.map((o) => [o.id, o]));

    // 1. Индекс — производный: полный rebuild (идемпотентен).
    let reindexed = 0;
    if (deps.index) {
      actions.push(`index: rebuild from ${objects.length} markdown object(s)`);
      if (!opts.dryRun) await deps.index.rebuild(objects);
      reindexed = objects.length;
    }

    // 2. Журнал — истина: каждой markdown-записи соответствует memory.added.
    let eventsAppended = 0;
    let danglingEvents = 0;
    const lines = deps.readEventLines ? await deps.readEventLines() : [];
    const logged = new Set<string>();
    for (const line of lines) {
      try {
        const e = JSON.parse(line) as ParsedEvent;
        const id = e.payload?.memory_id;
        if (typeof id !== 'string') continue;
        if (e.type === 'memory.added') logged.add(id);
        if (!byId.has(id)) danglingEvents += 1;
      } catch {
        // битая строка журнала — пропускаем; идемпотентный дозапуск завершает восстановление
      }
    }
    if (danglingEvents > 0) {
      actions.push(
        `events: ${danglingEvents} dangling event(s) reference missing objects — warning only (journal is append-only truth)`
      );
    }
    const missing = objects.filter((o) => !logged.has(o.id));
    if (missing.length > 0) {
      actions.push(`events: backfill ${missing.length} missing memory.added event(s) from markdown`);
      if (!opts.dryRun) {
        for (const o of missing) {
          await deps.log.append({
            id: deps.idGen.generateEventId(new Date(o.created_at)),
            type: 'memory.added',
            timestamp: o.created_at,
            actor: o.created_by,
            payload: { memory_id: o.id, type: o.type, ...(o.tags.length > 0 ? { tags: o.tags } : {}) },
          });
        }
      }
      eventsAppended = missing.length;
    }

    // rebuild-строка в actions присутствует при каждом запуске с index (идемпотентная
    // рутина), поэтому критерий «нечего чинить» — отсутствие дозаписей журнала
    if (eventsAppended === 0) actions.push('storage is consistent — nothing to repair');
    return { reindexed, eventsAppended, danglingEvents, actions };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
