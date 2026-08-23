import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { recordRelation } from './record-relation.js';
import { summarizeSession } from './summarize-session.js';

export async function resolveBlocker(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
    lock?: MemoryLock;
  },
  id: string,
  resolvedBy?: string
): Promise<void> {
  const run = async (): Promise<void> => {
    const existing = await deps.store.get(id);
    if (!existing) throw new Error(`Memory object not found: ${id}`);
    if (existing.type !== 'blocker') throw new Error(`Memory object is not a blocker: ${id}`);

    const now = deps.clock.now();
    const updated = await deps.store.update(id, { status: 'resolved' });

    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      type: 'memory.resolved',
      timestamp: now.toISOString(),
      actor: 'system:wolf',
      payload: { memory_id: id },
    });
    if (deps.index) {
      await deps.index.indexObject(updated);
    }
    if (deps.relations && resolvedBy) {
      await recordRelation(deps, now, resolvedBy, 'resolves', id);
    }
    await summarizeSession({ ...deps, lock: undefined }, { createdBy: 'system:wolf' }).catch((err) => {
      console.error('Session summary failed:', err);
    });
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
