import { buildTypeSchema } from '../type-schema-builder.js';
import type { MemoryType, MemoryTypeDeclaration } from '../memory-types.js';
import { z } from 'zod';

// wave13-a: window-compat — тип удалён из core (карта §5.4 2.13); декларация
// захардкожена до смерти читателей в W2
const decl: MemoryTypeDeclaration = {
  name: 'info-request' as MemoryType,
  lifecycle: ['open', 'answered', 'rejected', 'obsolete', 'archived'],
  subdirThread: 'notes',
  subdirShared: 'notes',
};
export const InfoRequestSchema = buildTypeSchema(decl, {
  thread: z.string().min(1),
  question: z.string().min(1),
  detour_reason: z.string().min(1),
  needed_for: z.array(z.string()).default([]),
  expected_answer: z.array(z.string()).min(1),
  preliminary_answer: z.string().default(''),
});
export type InfoRequest = z.infer<typeof InfoRequestSchema>;
