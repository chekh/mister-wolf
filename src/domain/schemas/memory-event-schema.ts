import { z } from 'zod';

export const MemoryEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['memory.added', 'memory.updated', 'memory.superseded', 'memory.resolved', 'memory.transitioned']),
  timestamp: z.string().datetime(),
  actor: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

export type MemoryEvent = z.infer<typeof MemoryEventSchema>;
