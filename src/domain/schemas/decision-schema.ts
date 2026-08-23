import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

const decl = getDeclaration('decision');
export const DecisionSchema = buildTypeSchema(decl, {
  thread: z.string().optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;
