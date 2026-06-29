import { describe, it, expect } from 'vitest';
import { MemoryEventSchema } from '../../../src/domain/schemas/memory-event-schema.js';

describe('MemoryEventSchema', () => {
  it('validates a memory.added event', () => {
    const result = MemoryEventSchema.safeParse({
      id: 'evt_20260629_120000_a8f3',
      type: 'memory.added',
      timestamp: '2026-06-29T12:00:00Z',
      actor: 'user:chekh',
      payload: { memory_id: 'mem_20260629_router_reconnect_a8f3' },
    });
    expect(result.success).toBe(true);
  });
});
