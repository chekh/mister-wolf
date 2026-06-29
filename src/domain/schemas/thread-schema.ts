import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const WorkThreadSchema = MemoryObjectSchema.extend({
  type: z.literal('work-thread'),
  goal: z.string().min(1),
  current_state: z.string().default(''),
  next_steps: z.array(z.string()).default([]),
});

export type WorkThread = z.infer<typeof WorkThreadSchema>;
