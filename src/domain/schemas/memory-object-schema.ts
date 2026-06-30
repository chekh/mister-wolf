import { z } from 'zod';
import { MEMORY_TYPES } from '../memory-types.js';

export const MemoryObjectSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(MEMORY_TYPES),
    title: z.string().min(1),
    status: z.enum([
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
    ]),
    review_state: z.enum(['accepted', 'proposed', 'rejected']),
    confidence: z.enum(['low', 'medium', 'high']),
    importance: z.number().min(0).max(1),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    created_by: z.string().min(1),
    schema_version: z.number().int().positive().default(1),
    source: z.object({
      kind: z.enum(['manual', 'session', 'file', 'scan']),
      path: z.string().optional(),
      session_id: z.string().optional(),
    }),
    related: z
      .object({
        files: z.array(z.string()).default([]),
        docs: z.array(z.string()).default([]),
        decisions: z.array(z.string()).default([]),
      })
      .default({}),
    tags: z.array(z.string()).default([]),
    superseded_by: z.string().nullable().default(null),
    body: z.string().default(''),
  })
  .passthrough();

export type MemoryObject = z.infer<typeof MemoryObjectSchema>;
