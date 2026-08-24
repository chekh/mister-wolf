import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

const decl = getDeclaration('info-request');
export const InfoRequestSchema = buildTypeSchema(decl, {
  thread: z.string().min(1),
  question: z.string().min(1),
  detour_reason: z.string().min(1),
  needed_for: z.array(z.string()).default([]),
  expected_answer: z.array(z.string()).min(1),
  preliminary_answer: z.string().default(''),
});
export type InfoRequest = z.infer<typeof InfoRequestSchema>;
