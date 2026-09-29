import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

// wave13-a: blocker поглощён note+facet pitfall (карта §5.4 2.13); схема
// валидирует форму note, спец-поля живут в passthrough
export const BlockerSchema = buildTypeSchema(getDeclaration('note'), {
  thread: z.string().optional(),
  impact: z.string().min(1),
  workaround: z.string().optional(),
});
export type Blocker = z.infer<typeof BlockerSchema>;
