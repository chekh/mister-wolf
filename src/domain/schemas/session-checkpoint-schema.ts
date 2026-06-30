import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const SessionCheckpointSchema = MemoryObjectSchema.extend({
  type: z.literal('session-checkpoint'),
  thread: z.string().min(1),
  captured_state: z.object({
    thread_current_state: z.string().default(''),
    related_ids: z.array(z.string()).default([]),
  }),
});

export type SessionCheckpoint = z.infer<typeof SessionCheckpointSchema>;
