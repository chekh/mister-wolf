import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

const decl = getDeclaration('article');
export const ArticleSchema = buildTypeSchema(decl, {
  thread: z.string().min(1),
  summary: z.string().min(1),
  answers: z.array(z.string()).default([]),
  supports: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
});
export type Article = z.infer<typeof ArticleSchema>;
