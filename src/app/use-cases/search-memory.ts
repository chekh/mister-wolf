import { SearchIndex, SearchOptions, SearchResult } from '../../ports/search-index.port.js';

export interface SearchMemoryInput extends SearchOptions {
  query: string;
}

export async function searchMemory(deps: { index: SearchIndex }, input: SearchMemoryInput): Promise<SearchResult[]> {
  const { query, ...options } = input;
  return deps.index.search(query, options);
}
