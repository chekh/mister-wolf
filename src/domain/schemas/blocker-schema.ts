import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';
import { z } from 'zod';

const decl = getDeclaration('blocker');
export const BlockerSchema = buildTypeSchema(decl, {
  thread: z.string().optional(),
  impact: z.string().min(1),
  workaround: z.string().optional(),
});
export type Blocker = z.infer<typeof BlockerSchema>;
