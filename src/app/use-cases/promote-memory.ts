import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { UserFacingError } from '../../domain/errors.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export const MAIN_SCOPE = 'main';

export interface PromoteResult {
  promoted: number;
  scopeFrom: string;
}

/** WP3 §6.2 (спека 2.16): шаг finishing-a-development-branch — scoped-объекты
 * ворктрии становятся main. Автоудаления нет (P3): только перевод scope. */
export async function promoteWorktreeMemory(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    lock?: MemoryLock;
  },
  worktree: string
): Promise<PromoteResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(worktree)) {
    throw new UserFacingError(`Invalid worktree name: "${worktree}" (see: git worktree list)`);
  }
  const scopeFrom = `worktree:${worktree}`;
  const run = async (): Promise<PromoteResult> => {
    const objects = (await deps.store.list()).filter((o) => (o as { scope?: string }).scope === scopeFrom);
    const now = deps.clock.now();
    let promoted = 0;
    for (const o of objects) {
      await deps.store.update(o.id, { scope: MAIN_SCOPE } as unknown as Partial<MemoryObject>);
      await deps.log.append({
        id: deps.idGen.generateEventId(now),
        type: 'memory.scope_promoted',
        timestamp: now.toISOString(),
        actor: 'system:wolf',
        payload: { memory_id: o.id, from: scopeFrom, to: MAIN_SCOPE },
      });
      if (deps.index) await deps.index.indexObject({ ...o, scope: MAIN_SCOPE } as never);
      promoted += 1;
    }
    return { promoted, scopeFrom };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
