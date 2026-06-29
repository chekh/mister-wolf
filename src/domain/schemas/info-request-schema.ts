import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const InfoRequestSchema = MemoryObjectSchema.extend({
  type: z.literal('info-request'),
  thread: z.string().min(1),
  question: z.string().min(1),
  detour_reason: z.string().min(1),
  needed_for: z.array(z.string()).default([]),
  expected_answer: z.array(z.string()).min(1),
  preliminary_answer: z.string().default(''),
});

export type InfoRequest = z.infer<typeof InfoRequestSchema>;
