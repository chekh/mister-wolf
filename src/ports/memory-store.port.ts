import { MemoryObject } from '../domain/schemas/memory-object-schema.js';

export interface MemoryStore {
  save(object: MemoryObject): Promise<void>;
  get(id: string): Promise<MemoryObject | null>;
  list(filters?: { type?: string; status?: string }): Promise<MemoryObject[]>;
  update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject>;
}
