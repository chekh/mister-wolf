import { buildTypeSchema } from '../type-schema-builder.js';
import type { MemoryType, MemoryTypeDeclaration } from '../memory-types.js';
import { z } from 'zod';

// wave13-a: window-compat — тип удалён из core (карта §5.4 2.13); декларация
// захардкожена до смерти читателей в W2
const decl: MemoryTypeDeclaration = {
  name: 'session-checkpoint' as MemoryType,
  lifecycle: [
    'active',
    'open',
    'resolved',
    'stale',
    'conflicting',
    'superseded',
    'archived',
    'paused',
    'completed',
    'answered',
    'rejected',
    'obsolete',
    'proposed',
    'accepted',
  ],
  subdirThread: 'sessions',
  subdirShared: null,
};
export const SessionCheckpointSchema = buildTypeSchema(decl, {
  thread: z.string().min(1),
  captured_state: z.object({
    thread_current_state: z.string().default(''),
    related_ids: z.array(z.string()).default([]),
  }),
});
export type SessionCheckpoint = z.infer<typeof SessionCheckpointSchema>;
