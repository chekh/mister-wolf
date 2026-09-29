import { MemoryObject } from '../domain/schemas/memory-object-schema.js';

export interface ListFilters {
  type?: string;
  status?: string;
  stale?: boolean;
  /** P212 (2.13 §5.3б): постфильтр по frontmatter-facet (значение не валидируется) */
  facet?: string;
}

export interface MemoryStore {
  save(object: MemoryObject): Promise<void>;
  get(id: string): Promise<MemoryObject | null>;
  list(filters?: ListFilters): Promise<MemoryObject[]>;
  update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject>;
}
