import { z } from 'zod';
import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';

const decl = getDeclaration('blocker');
export const BlockerSchema = buildTypeSchema(decl);
export type Blocker = z.infer<typeof BlockerSchema>;
