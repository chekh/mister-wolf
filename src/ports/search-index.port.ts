import { MemoryObject } from '../domain/schemas/memory-object-schema.js';

export interface SearchResult {
  object: MemoryObject;
  score: number;
}

export interface SearchOptions {
  type?: string;
  includeSuperseded?: boolean;
  tags?: string[];
  status?: string;
  confidence?: 'low' | 'medium' | 'high';
  minImportance?: number;
  maxImportance?: number;
  createdAfter?: string;
  createdBefore?: string;
  file_path?: string;
  limit?: number;
}

export interface SearchIndex {
  rebuild(objects: MemoryObject[]): Promise<void>;
  indexObject(object: MemoryObject): Promise<void>;
  removeObject(id: string): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
