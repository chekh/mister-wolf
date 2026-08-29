import { z } from 'zod';

export const RELATION_PREDICATES = [
  'answers',
  'answered_by',
  'supports',
  'supported_by',
  'based_on',
  'basis_for',
  'updates',
  'updated_by',
  'supersedes',
  'superseded_by',
  'blocks',
  'blocked_by',
  'resolves',
  'resolved_by',
  'related_to',
  'produced_by',
  'owner_skill',
  'skill_of',
  'complain',
  'complained_by',
] as const;

export const RelationSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.enum(RELATION_PREDICATES),
  object: z.string().min(1),
  created_at: z.string().datetime(),
  source: z.enum(['manual', 'agent', 'system']),
  confidence: z.enum(['low', 'medium', 'high']),
});

export type Relation = z.infer<typeof RelationSchema>;
export type RelationPredicate = (typeof RELATION_PREDICATES)[number];
