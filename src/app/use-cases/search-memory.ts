import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex, SearchResult } from '../../ports/search-index.port.js';
import { rebuildMemoryIndex } from './rebuild-memory-index.js';

export interface SearchMemoryInput {
  query: string;
  type?: string;
  includeSuperseded?: boolean;
}

export async function searchMemory(
  deps: { store: MemoryStore; index: SearchIndex },
  input: string | SearchMemoryInput
): Promise<SearchResult[]> {
  await rebuildMemoryIndex(deps);
  const query = typeof input === 'string' ? input : input.query;
  const type = typeof input === 'string' ? undefined : input.type;
  const includeSuperseded = typeof input === 'string' ? undefined : input.includeSuperseded;
  return deps.index.search(query, {
    type,
    includeSuperseded,
  });
}

