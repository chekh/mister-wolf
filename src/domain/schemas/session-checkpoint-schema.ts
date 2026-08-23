import { z } from 'zod';
import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';

const base = buildTypeSchema(getDeclaration('session-checkpoint'));
export const SessionCheckpointSchema = base.extend({
  captured_state: z.object({
    thread_current_state: z.string().default(''),
    related_ids: z.array(z.string()).default([]),
  }),
});
export type SessionCheckpoint = z.infer<typeof SessionCheckpointSchema>;
