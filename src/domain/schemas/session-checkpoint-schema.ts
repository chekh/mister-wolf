import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

const decl = getDeclaration('session-checkpoint');
export const SessionCheckpointSchema = buildTypeSchema(decl, {
  thread: z.string().min(1),
  captured_state: z.object({
    thread_current_state: z.string().default(''),
    related_ids: z.array(z.string()).default([]),
  }),
});
export type SessionCheckpoint = z.infer<typeof SessionCheckpointSchema>;
