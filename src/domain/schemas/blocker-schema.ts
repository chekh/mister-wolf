import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const BlockerSchema = MemoryObjectSchema.extend({
  type: z.literal('blocker'),
  status: z.enum(['active', 'resolved', 'obsolete']),
  thread: z.string().optional(),
  impact: z.string().min(1),
  workaround: z.string().optional(),
  body: z.string().default(''),
});

export type Blocker = z.infer<typeof BlockerSchema>;
