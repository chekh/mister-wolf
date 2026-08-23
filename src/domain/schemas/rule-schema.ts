import { z } from 'zod';
import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';

const decl = getDeclaration('rule');
export const RuleSchema = buildTypeSchema(decl);
export type Rule = z.infer<typeof RuleSchema>;
