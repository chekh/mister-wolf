import { MemoryObject } from '../domain/schemas/memory-object-schema.js';

export interface SearchResult {
  object: MemoryObject;
  score: number;
}

export interface SearchIndex {
  rebuild(objects: MemoryObject[]): Promise<void>;
  search(query: string, options?: { type?: string; includeSuperseded?: boolean }): Promise<SearchResult[]>;
}
