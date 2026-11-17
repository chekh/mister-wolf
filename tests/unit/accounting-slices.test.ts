import { describe, it, expect } from 'vitest';
import { buildCallSlices, uniqueCallKey } from '../../src/app/use-cases/accounting-slices.js';
import type { SignalEvent } from '../../src/adapters/fs/session-metrics-log.js';
import type { PricingTable } from '../../src/domain/pricing.js';

// 3.2.0 T-09 (test-plan S-21/S-22, REQ-11): срезы по уникальным вызовам.
// S-21: сумма по уникальным вызовам; steward/council — срезы тех же вызовов,
// второй раз к сумме не прибавляются. S-22: нет usage/rate → unknown с причиной,
// не 0 и не долларовая «экономика».

function runEvent(overrides: Partial<SignalEvent> & { id: string }): SignalEvent {
  const { id, ...rest } = overrides;
  return {
    ts: '2026-11-17T10:00:00.000Z',
    event: 'run',
    schema_version: 2,
    session_id: `sess-${id}`,
    run_id: `run-${id}`,
    event_id: `evt-${id}`,
    gen_ai: { modelID: 'test/glm-x', agent: rest.agent ?? null },
    orchestration: { task: null, actor: rest.agent ? `agent:${rest.agent}` : 'opencode:unknown' },
    ...rest,
  } as SignalEvent;
}

const PRICING: PricingTable = { 'test/glm-x': { input: 1, output: 2, cache_read: 0.1 } };

describe('buildCallSlices (S-21: unique calls, purpose slices not added twice)', () => {
  it('counts each unique call once; slices are subsets of the same calls', () => {
    const calls = [
      runEvent({ id: 'l0a', tokens: { input: 10, output: 1, cache_read: 0 } }), // L0 lead
      runEvent({ id: 'l0b', tokens: { input: 10, output: 1, cache_read: 0 } }), // L0 lead
      runEvent({ id: 'l1', agent: 'wolf-developer', tokens: { input: 10, output: 1, cache_read: 0 } }), // L1
      runEvent({ id: 'st', agent: 'wolf-steward', tokens: { input: 10, output: 1, cache_read: 0 } }), // steward
      runEvent({ id: 'co', session_id: 'sess-council', tokens: { input: 10, output: 1, cache_read: 0 } }), // council
    ];
    const councilSessions = new Set(['sess-council']);
    const slices = buildCallSlices(calls, { pricing: PRICING, councilSessions });

    expect(slices.total_unique_calls).toBe(5);
    expect(slices.learning.calls).toBe(1);
    expect(slices.council.calls).toBe(1);
    // slices are subsets: they are never summed into the total
    expect(slices.learning.calls + slices.council.calls).toBeLessThan(slices.total_unique_calls);
    // the totals cover all five unique calls exactly once
    expect(slices.cost.priced_calls).toBe(5);
    expect(slices.cost.basis).toBe('priced');
  });

  it('duplicate event_id (same call reported twice) is counted once', () => {
    const original = runEvent({ id: 'st', agent: 'wolf-steward' });
    const duplicate = { ...original, weighted: 999 } as SignalEvent; // same event_id, re-imported
    const slices = buildCallSlices([original, duplicate], { pricing: PRICING });
    expect(slices.total_unique_calls).toBe(1);
    expect(slices.weighted).toBe(0); // weighted only from the first copy, not 999
    expect(slices.learning.calls).toBe(1);
  });

  it('slice metrics carry only their own calls (steward tokens not in council slice)', () => {
    const steward = runEvent({
      id: 'st',
      agent: 'wolf-steward',
      tokens: { input: 100, output: 10, cache_read: 0 },
      weighted: 150,
    });
    const council = runEvent({
      id: 'co',
      session_id: 'sess-c',
      tokens: { input: 50, output: 5, cache_read: 0 },
      weighted: 60,
    });
    const slices = buildCallSlices([steward, council], { pricing: PRICING, councilSessions: new Set(['sess-c']) });
    expect(slices.learning.tokens).toEqual({ input: 100, output: 10, cache_read: 0 });
    expect(slices.council.tokens).toEqual({ input: 50, output: 5, cache_read: 0 });
    expect(slices.tokens).toEqual({ input: 150, output: 15, cache_read: 0 });
    // each slice's cost is part of the total, not additive to it
    expect(slices.learning.cost_usd).toBeCloseTo((100 * 1 + 10 * 2) / 1e6, 12);
    expect(slices.council.cost_usd).toBeCloseTo((50 * 1 + 5 * 2) / 1e6, 12);
  });

  it('empty signal set → zero calls, unknown basis, no invented cost', () => {
    const slices = buildCallSlices([], {});
    expect(slices.total_unique_calls).toBe(0);
    expect(slices.cost.basis).toBe('unknown');
    expect(slices.cost.total_usd).toBeNull();
  });

  it('uniqueCallKey is stable and deterministic', () => {
    const ev = runEvent({ id: 'x' });
    expect(uniqueCallKey(ev)).toBe('evt-x');
    const noId = { ...ev, event_id: undefined } as SignalEvent;
    expect(uniqueCallKey(noId)).toBe('run-x|2026-11-17T10:00:00.000Z|');
  });
});

describe('buildCallSlices (S-22: unknown cost is unknown, not 0 and not savings)', () => {
  it('no pricing table → basis unknown, total null, reason recorded', () => {
    const calls = [runEvent({ id: 'a', tokens: { input: 10, output: 1, cache_read: 0 } })];
    const slices = buildCallSlices(calls, {});
    expect(slices.cost.basis).toBe('unknown');
    expect(slices.cost.total_usd).toBeNull();
    expect(slices.cost.unknown_calls).toBe(1);
    expect(slices.cost.reasons.some((r) => r.includes('no pricing table'))).toBe(true);
  });

  it('unknown model → no price selectable, still unknown', () => {
    const calls = [
      runEvent({ id: 'a', gen_ai: { modelID: null, agent: null }, tokens: { input: 10, output: 1, cache_read: 0 } }),
    ];
    const slices = buildCallSlices(calls, { pricing: PRICING });
    expect(slices.cost.basis).toBe('unknown');
    expect(slices.cost.total_usd).toBeNull();
    expect(slices.cost.reasons.some((r) => r.includes('model unknown'))).toBe(true);
  });

  it('no usage tokens → unknown with usage reason; tokens stay null, not zeros', () => {
    const calls = [runEvent({ id: 'a' })];
    const slices = buildCallSlices(calls, { pricing: PRICING });
    expect(slices.cost.basis).toBe('unknown');
    expect(slices.cost.total_usd).toBeNull();
    expect(slices.tokens).toBeNull();
    expect(slices.cost.reasons.some((r) => r.includes('usage missing'))).toBe(true);
  });

  it('partial pricing → basis partial with reasons; total covers only priced calls', () => {
    const priced = runEvent({ id: 'p', tokens: { input: 1000, output: 100, cache_read: 0 } });
    const unknown = runEvent({ id: 'u' });
    const slices = buildCallSlices([priced, unknown], { pricing: PRICING });
    expect(slices.cost.basis).toBe('partial');
    expect(slices.cost.priced_calls).toBe(1);
    expect(slices.cost.unknown_calls).toBe(1);
    expect(slices.cost.total_usd).toBeCloseTo((1000 * 1 + 100 * 2) / 1e6, 12);
    expect(slices.cost.reasons.some((r) => r.includes('usage missing'))).toBe(true);
  });
});
