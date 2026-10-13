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

describe('face/proposal события (волна 2.17, design §События журнала)', () => {
  const base = { id: 'evt_20261013_000000_0001', timestamp: '2026-10-13T00:00:00Z', actor: 'user:test' };

  it('новые enum-значения валидируются с payload по design', () => {
    expect(
      MemoryEventSchema.safeParse({
        ...base,
        type: 'memory.face.versioned',
        payload: { owner_skill: 'agent:x', from: null, new: 'mem_1', initiator: 'steward', reason: 'r' },
      }).success
    ).toBe(true);
    expect(
      MemoryEventSchema.safeParse({
        ...base,
        type: 'memory.face.breakglass',
        payload: { owner_skill: 'agent:x', from: 'mem_0', new: 'mem_1', initiator: 'breakglass', reason: 'r' },
      }).success
    ).toBe(true);
    expect(
      MemoryEventSchema.safeParse({
        ...base,
        type: 'memory.face.denied',
        payload: { owner_skill: 'agent:x', actor: 'agent:rouge', command: 'face new' },
      }).success
    ).toBe(true);
    expect(
      MemoryEventSchema.safeParse({
        ...base,
        type: 'memory.proposal.delivered',
        payload: { id: 'mem_p1', addressee: 'agent:steward' },
      }).success
    ).toBe(true);
  });

  it('отсутствие обязательного ключа payload — отказ', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['memory.face.versioned', { owner_skill: 'a', from: null, new: 'b', initiator: 'steward' }],
      ['memory.face.breakglass', { owner_skill: 'a', from: null, new: 'b', initiator: 'breakglass' }],
      ['memory.face.denied', { owner_skill: 'a', actor: 'agent:x' }],
      ['memory.proposal.delivered', { id: 'mem_p1' }],
    ];
    for (const [type, payload] of cases) {
      const r = MemoryEventSchema.safeParse({ ...base, type, payload });
      expect(r.success, type).toBe(false);
    }
  });

  it('существующие типы событий без payload-требований не затронуты', () => {
    expect(MemoryEventSchema.safeParse({ ...base, type: 'memory.added' }).success).toBe(true);
  });
});
