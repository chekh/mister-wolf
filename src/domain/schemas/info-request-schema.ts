import { z } from 'zod';
import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';

const decl = getDeclaration('info-request');
export const InfoRequestSchema = buildTypeSchema(decl);
export type InfoRequest = z.infer<typeof InfoRequestSchema>;
