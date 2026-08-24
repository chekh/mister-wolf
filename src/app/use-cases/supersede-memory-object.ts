import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { summarizeSession } from './summarize-session.js';

const MEMORY_ID_RE = /^mem_\d{8}_[a-z0-9_]+_[0-9a-f]{6}$/;

export async function supersedeMemoryObject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex; lock?: MemoryLock },
  oldId: string,
  newId: string
): Promise<void> {
  const run = async (): Promise<void> => {
    if (oldId === newId) {
      throw new Error(`Cannot supersede: old and new ids are the same: ${oldId}`);
    }
    for (const [label, id] of [
      ['old', oldId],
      ['replacement', newId],
    ] as const) {
      if (!MEMORY_ID_RE.test(id)) {
        throw new Error(`Malformed memory id (${label}): "${id}" (expected mem_YYYYMMDD_<slug>_<hash>)`);
      }
    }
    const now = deps.clock.now();
    const oldObject = await deps.store.get(oldId);
    if (!oldObject) throw new Error(`Memory object not found: ${oldId}`);
    const newObject = await deps.store.get(newId);
    if (!newObject) throw new Error(`Replacement memory object not found: ${newId}`);
    const updated = await deps.store.update(oldId, { status: 'superseded', superseded_by: newId });
    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      type: 'memory.superseded',
      timestamp: now.toISOString(),
      actor: 'system:wolf',
      payload: { old_id: oldId, new_id: newId },
    });
    if (deps.index) {
      await deps.index.indexObject(updated);
    }
    await summarizeSession({ ...deps, lock: undefined }, { createdBy: 'system:wolf' }).catch((err) => {
      console.error('Session summary failed:', err);
    });
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
