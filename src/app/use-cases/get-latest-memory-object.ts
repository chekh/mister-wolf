import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { UserFacingError } from '../../domain/errors.js';

/** `wolf get <id> --latest`: идёт по цепочке superseded_by до живого объекта.
 * Защита от циклов и битых ссылок — UserFacingError (одна строка в CLI). */
export async function getLatestMemoryObject(deps: { store: MemoryStore }, id: string): Promise<MemoryObject> {
  const visited = new Set<string>();
  let currentId = id;
  for (;;) {
    if (visited.has(currentId)) {
      throw new UserFacingError(`Supersede chain cycle detected at ${currentId} (starting from ${id})`);
    }
    visited.add(currentId);
    const obj = await deps.store.get(currentId);
    if (!obj) {
      throw new UserFacingError(
        currentId === id
          ? `Memory object not found: ${id}`
          : `Broken supersede chain: ${currentId} (superseded_by of ${[...visited].at(-2)}) not found`
      );
    }
    if (!obj.superseded_by) return obj;
    currentId = obj.superseded_by;
  }
}
