import { z } from 'zod';
import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';

const decl = getDeclaration('article');
export const ArticleSchema = buildTypeSchema(decl);
export type Article = z.infer<typeof ArticleSchema>;
