import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

// wave13-a: session-checkpoint поглощён note+facet history (карта §5.4 2.13);
// схема валидирует форму note, спец-поля живут в passthrough
export const SessionCheckpointSchema = buildTypeSchema(getDeclaration('note'), {
  thread: z.string().min(1),
  captured_state: z.object({
    thread_current_state: z.string().default(''),
    related_ids: z.array(z.string()).default([]),
  }),
});
export type SessionCheckpoint = z.infer<typeof SessionCheckpointSchema>;
