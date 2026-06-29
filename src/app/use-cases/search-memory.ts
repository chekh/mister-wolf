import { SearchIndex, SearchResult } from '../../ports/search-index.port.js';

export interface SearchMemoryInput {
  query: string;
  type?: string;
  includeSuperseded?: boolean;
}

export async function searchMemory(deps: { index: SearchIndex }, input: SearchMemoryInput): Promise<SearchResult[]> {
  return deps.index.search(input.query, {
    type: input.type,
    includeSuperseded: input.includeSuperseded,
  });
}
