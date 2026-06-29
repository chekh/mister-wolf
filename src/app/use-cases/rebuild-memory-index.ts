import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';

export async function rebuildMemoryIndex(deps: { store: MemoryStore; index: SearchIndex }): Promise<void> {
  const objects = await deps.store.list();
  await deps.index.rebuild(objects);
}
