import { describe, it, expect } from 'vitest';
import { validateMemoryObject } from '../../../src/domain/policies/write-protocol.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeObject(partial: Partial<MemoryObject> = {}): MemoryObject {
  return {
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
    body: 'We found that...',
    ...partial,
  };
}

describe('validateMemoryObject', () => {
  it('accepts a useful lesson', () => {
    const result = validateMemoryObject(makeObject());
    expect(result.valid).toBe(true);
  });

  it('warns about empty body', () => {
    const result = validateMemoryObject(makeObject({ body: '' }));
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain('Body is empty; memory may not be useful.');
  });
});
