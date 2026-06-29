import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const ArticleSchema = MemoryObjectSchema.extend({
  type: z.literal('article'),
  status: z.enum(['proposed', 'accepted', 'stale', 'superseded', 'archived']),
  thread: z.string().min(1),
  summary: z.string().min(1),
  answers: z.array(z.string()).default([]),
  supports: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
});

export type Article = z.infer<typeof ArticleSchema>;
