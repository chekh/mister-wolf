import { z } from 'zod';
import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';

const decl = getDeclaration('decision');
export const DecisionSchema = buildTypeSchema(decl);
export type Decision = z.infer<typeof DecisionSchema>;
