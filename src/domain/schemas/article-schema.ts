import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

// wave13-a: article поглощён note+facet context (карта §5.4 2.13); схема
// валидирует форму note, спец-поля живут в passthrough
export const ArticleSchema = buildTypeSchema(getDeclaration('note'), {
  thread: z.string().min(1),
  summary: z.string().min(1),
  answers: z.array(z.string()).default([]),
  supports: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
});
export type Article = z.infer<typeof ArticleSchema>;
