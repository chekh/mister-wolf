import { z } from 'zod';

export const MemoryObjectSchema = z
  .object({
    id: z.string().min(1),
    // type не enum: project-типы из config.yaml не входят в core MEMORY_TYPES.
    // Членство в таксономии проверяется при записи (addMemoryObject → getDeclaration)
    // и при чтении (markdown-memory-store: schemas.has(type)).
    type: z.string(),
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
      'candidate',
      'deprecated',
    ]),
    // Ф26: review_required — decay-очередь пересмотра Стюарда (спека §6):
    // значение review_state, lifecycle-статус объекта не меняется.
    review_state: z.enum(['accepted', 'proposed', 'rejected', 'review_required']),
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
      .default({ files: [], docs: [], decisions: [] }),
    tags: z.array(z.string()).default([]),
    superseded_by: z.string().nullable().default(null),
    body: z.string().default(''),
    memory_class: z.enum(['working', 'canonical']).default('working'),
    truth_role: z.enum(['proposed_knowledge', 'accepted_knowledge', 'source_of_truth']).default('accepted_knowledge'),
    lifetime: z.enum(['long_term', 'short_term', 'session']).default('long_term'),
  })
  .passthrough();

export type MemoryObject = z.infer<typeof MemoryObjectSchema>;
