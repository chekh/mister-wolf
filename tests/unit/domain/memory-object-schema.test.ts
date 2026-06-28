import { describe, it, expect } from 'vitest';
import { MemoryObjectSchema } from '../../../src/domain/schemas/memory-object-schema.js';

describe('MemoryObjectSchema', () => {
  it('validates a minimal memory object', () => {
    const result = MemoryObjectSchema.safeParse({
      id: 'mem_20260629_router_reconnect_a8f3',
      type: 'lesson',
      title: 'Router reconnect failure mode',
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.82,
      created_at: '2026-06-29T14:00:00Z',
      updated_at: '2026-06-29T14:00:00Z',
      created_by: 'user:chekh',
      schema_version: 1,
      source: { kind: 'manual' },
      related: {},
      tags: ['router'],
      superseded_by: null,
      body: '# Router reconnect failure mode\n\nWe found...',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = MemoryObjectSchema.safeParse({
      id: 'mem_20260629_router_reconnect_a8f3',
      type: 'lesson',
    });
    expect(result.success).toBe(false);
  });
});
