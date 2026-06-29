import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export interface ListMemoryObjectsFilters {
  type?: string;
  status?: string;
}

export async function listMemoryObjects(
  store: MemoryStore,
  filters?: ListMemoryObjectsFilters
): Promise<MemoryObject[]> {
  return store.list(filters);
}
