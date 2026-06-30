import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';

export async function resolveBlocker(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  id: string
): Promise<void> {
  const existing = await deps.store.get(id);
  if (!existing) throw new Error(`Memory object not found: ${id}`);

  const now = deps.clock.now();
  await deps.store.update(id, { status: 'resolved' });

  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.resolved',
    timestamp: now.toISOString(),
    actor: 'system:wolf',
    payload: { memory_id: id },
  });
}
