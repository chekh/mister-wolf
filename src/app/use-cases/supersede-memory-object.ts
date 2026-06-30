import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';

export async function supersedeMemoryObject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex },
  oldId: string,
  newId: string
): Promise<void> {
  const now = deps.clock.now();
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
}
