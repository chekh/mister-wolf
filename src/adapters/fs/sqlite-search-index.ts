import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { SearchIndex, SearchResult } from '../../ports/search-index.port.js';

export class SQLiteSearchIndex implements SearchIndex {
  constructor(private path: string) {}

  async rebuild(_objects: MemoryObject[]): Promise<void> {}

  async search(_query: string, _options?: { type?: string; includeSuperseded?: boolean }): Promise<SearchResult[]> {
    return [];
  }
}
