import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export async function getMemoryObject(store: MemoryStore, id: string): Promise<MemoryObject | null> {
  return store.get(id);
}
