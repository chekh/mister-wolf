import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex, SearchResult } from '../../ports/search-index.port.js';

export interface SearchMemoryInput {
  query: string;
  type?: string;
  includeSuperseded?: boolean;
}

export async function searchMemory(
  deps: { store: MemoryStore; index: SearchIndex },
  input: SearchMemoryInput
): Promise<SearchResult[]> {
  return deps.index.search(input.query, {
    type: input.type,
    includeSuperseded: input.includeSuperseded,
  });
}
