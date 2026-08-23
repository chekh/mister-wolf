import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

const decl = getDeclaration('work-thread');
export const WorkThreadSchema = buildTypeSchema(decl, {
  goal: z.string().min(1),
  current_state: z.string().default(''),
  next_steps: z.array(z.string()).default([]),
});
export type WorkThread = z.infer<typeof WorkThreadSchema>;
