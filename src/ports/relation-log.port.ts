import { Relation } from '../domain/schemas/relation-schema.js';

export interface RelationLog {
  append(relation: Relation): Promise<void>;
  list(filters?: { subject?: string; object?: string; predicate?: string }): Promise<Relation[]>;
}
