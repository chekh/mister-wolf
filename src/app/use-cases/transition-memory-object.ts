import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryStatus, getDeclaration } from '../../domain/memory-types.js';
import { canTransition } from '../../domain/governance.js';
import { summarizeSession } from './summarize-session.js';

const TERMINAL_STATUSES = ['archived', 'completed', 'accepted', 'resolved', 'obsolete'];

export async function transitionMemoryObject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex; lock?: MemoryLock },
  id: string,
  newStatus: MemoryStatus,
  actor: string = 'system:wolf'
): Promise<void> {
  const run = async (): Promise<void> => {
    const existing = await deps.store.get(id);
    if (!existing) throw new Error(`Memory object not found: ${id}`);

    const decl = getDeclaration(existing.type);
    if (!decl.lifecycle.includes(newStatus)) {
      throw new Error(
        `Status "${newStatus}" is not in lifecycle of type "${existing.type}" (allowed: ${decl.lifecycle.join(', ')})`
      );
    }

    if (!canTransition(existing.status, newStatus)) {
      throw new Error(`Invalid transition from ${existing.status} to ${newStatus}`);
    }

    const now = deps.clock.now();
    const updated = await deps.store.update(id, { status: newStatus });
    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      type: 'memory.transitioned',
      timestamp: now.toISOString(),
      actor,
      payload: { memory_id: id, from: existing.status, to: newStatus },
    });
    if (deps.index) {
      await deps.index.indexObject(updated);
    }
    if (TERMINAL_STATUSES.includes(newStatus)) {
      await summarizeSession({ ...deps, lock: undefined }, { createdBy: actor }).catch((err) => {
        console.error('Session summary failed:', err);
      });
    }
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
