import { buildTypeSchema } from '../type-schema-builder.js';
import type { MemoryType, MemoryTypeDeclaration } from '../memory-types.js';
import { z } from 'zod';

// wave13-a: window-compat — тип удалён из core (карта §5.4 2.13); декларация
// захардкожена до смерти читателей в W2
const decl: MemoryTypeDeclaration = {
  name: 'article' as MemoryType,
  lifecycle: ['proposed', 'accepted', 'stale', 'superseded', 'archived'],
  subdirThread: 'notes',
  subdirShared: 'notes',
};
export const ArticleSchema = buildTypeSchema(decl, {
  thread: z.string().min(1),
  summary: z.string().min(1),
  answers: z.array(z.string()).default([]),
  supports: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
});
export type Article = z.infer<typeof ArticleSchema>;
