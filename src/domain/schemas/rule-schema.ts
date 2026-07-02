import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const RuleSchema = MemoryObjectSchema.extend({
  type: z.literal('rule'),
  status: z.enum(['active', 'superseded', 'obsolete']),
  scope: z.enum(['project', 'global']),
  applies_to: z.array(z.string()).default([]),
  trigger: z.string().default(''),
});

export type Rule = z.infer<typeof RuleSchema>;
