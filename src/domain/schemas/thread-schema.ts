import { z } from 'zod';
import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';

const decl = getDeclaration('work-thread');
export const WorkThreadSchema = buildTypeSchema(decl);
export type WorkThread = z.infer<typeof WorkThreadSchema>;
