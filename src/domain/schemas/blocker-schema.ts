import { buildTypeSchema } from '../type-schema-builder.js';
import type { MemoryType, MemoryTypeDeclaration } from '../memory-types.js';
import { z } from 'zod';

// wave13-a: window-compat — тип удалён из core (карта §5.4 2.13); декларация
// захардкожена до смерти читателей в W2
const decl: MemoryTypeDeclaration = {
  name: 'blocker' as MemoryType,
  lifecycle: ['active', 'resolved', 'obsolete'],
  subdirThread: 'blockers',
  subdirShared: 'blockers',
};
export const BlockerSchema = buildTypeSchema(decl, {
  thread: z.string().optional(),
  impact: z.string().min(1),
  workaround: z.string().optional(),
});
export type Blocker = z.infer<typeof BlockerSchema>;
