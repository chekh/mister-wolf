import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const DecisionSchema = MemoryObjectSchema.extend({
  type: z.literal('decision'),
  status: z.enum(['active', 'superseded', 'rejected', 'obsolete']),
  thread: z.string().optional(),
  body: z.string().default(''),
});

export type Decision = z.infer<typeof DecisionSchema>;
