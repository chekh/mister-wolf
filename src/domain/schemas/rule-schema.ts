import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

const decl = getDeclaration('rule');
export const RuleSchema = buildTypeSchema(decl, {
  scope: z.enum(['project', 'global']),
  applies_to: z.array(z.string()).default([]),
  trigger: z.string().default(''),
});
export type Rule = z.infer<typeof RuleSchema>;
