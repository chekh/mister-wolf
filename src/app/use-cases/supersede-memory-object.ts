import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { summarizeSession } from './summarize-session.js';
import { UserFacingError } from '../../domain/errors.js';

// ponytail: slug optional — legacy ids from cyrillic titles have empty slug
// (mem_YYYYMMDD__<hash>); hash is still mandatory, so 'mem_20260824__' stays invalid
const MEMORY_ID_RE = /^mem_\d{8}[a-z0-9_]*_[0-9a-f]{6}$/;

export async function supersedeMemoryObject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex; lock?: MemoryLock },
  oldId: string,
  newId: string,
  opts?: { internalFacePath?: boolean }
): Promise<void> {
  const run = async (): Promise<void> => {
    if (oldId === newId) {
      throw new UserFacingError(`Cannot supersede: old and new ids are the same: ${oldId}`);
    }
    for (const [label, id] of [
      ['old', oldId],
      ['replacement', newId],
    ] as const) {
      if (!MEMORY_ID_RE.test(id)) {
        throw new UserFacingError(`Malformed memory id (${label}): "${id}" (expected mem_YYYYMMDD_<slug>_<hash>)`);
      }
    }
    const now = deps.clock.now();
    const oldObject = await deps.store.get(oldId);
    if (!oldObject) throw new UserFacingError(`Memory object not found: ${oldId}`);
    // 2.17.1 REQ-04 (R05, design §7): generic supersede на face запрещён —
    // лицо гасится только шагом face-операции §3.3; внутренний вызов
    // (supersede_prev/supersede_legacy) помечен internalFacePath — прецедент
    // add-memory-object.ts. Legacy-head миграции есть note — идёт мимо guard.
    if (oldObject.type === 'face' && opts?.internalFacePath !== true) {
      throw new UserFacingError(
        'type "face" cannot be superseded generically: faces are versioned, use "wolf face" commands (new | restore | breakglass | recover)'
      );
    }
    const newObject = await deps.store.get(newId);
    if (!newObject) throw new UserFacingError(`Replacement memory object not found: ${newId}`);
    // T6 (спека 2.16 §10): supersede не создаёт цикл в цепочке superseded_by
    // (сегодня цикл ловится только при чтении — запись должна отказывать раньше)
    const seen = new Set<string>([oldId, newId]);
    let cursor: string | null = newObject.superseded_by ?? null;
    while (cursor !== null) {
      if (cursor === oldId) {
        throw new UserFacingError(`Supersede would create a cycle: ${oldId} -> ${newId} -> ${oldId}`);
      }
      if (seen.has(cursor)) break; // уже существующий цикл дальше не разматываем
      seen.add(cursor);
      const cur = await deps.store.get(cursor);
      cursor = cur?.superseded_by ?? null;
    }
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
