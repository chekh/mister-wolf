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
  // 2.14 §6.2: исход жалобы (пара, прецедент complain/complained_by);
  // object — свободная строка (литералы rejected/deferred или mem-id артефакта)
  'outcome',
  'outcome_of',
] as const;

export const RelationSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.enum(RELATION_PREDICATES),
  object: z.string().min(1),
  created_at: z.string().datetime(),
  source: z.enum(['manual', 'agent', 'system']),
  confidence: z.enum(['low', 'medium', 'high']),
  // Компенсирующая запись relation remove (спека 2.13 §6.4): append-only,
  // рёбра с removed: true не читаются; откат = убрать запись.
  removed: z.boolean().optional(),
  removed_at: z.string().datetime().optional(),
});

export type Relation = z.infer<typeof RelationSchema>;
export type RelationPredicate = (typeof RELATION_PREDICATES)[number];
