import { describe, it, expect, beforeEach } from 'vitest';
import { generateInsights, ANALYSIS_TYPES } from '../../../src/app/use-cases/generate-insights.js';
import { MemoryStore } from '../../../src/ports/memory-store.port.js';
import { Clock } from '../../../src/ports/clock.port.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function fakeClock(): Clock {
  return { now: () => NOW };
}

function fakeStore(objects: MemoryObject[]): MemoryStore {
  return {
    save: async () => failReadOnly('save'),
    get: async () => failReadOnly('get'),
    list: async () => objects.map((o) => ({ ...o })),
    update: async () => failReadOnly('update'),
  };
}

function failReadOnly(method: string): never {
  throw new Error(`insights must be read-only; called ${method}`);
}

let seq = 0;

function obj(partial: Partial<MemoryObject>): MemoryObject {
  seq += 1;
  return {
    id: `test-${seq}`,
    type: 'observation',
    title: 'test object',
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.5,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    created_by: 'test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
    ...partial,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('generateInsights — scope, topic filter, simple aggregations', () => {
  it('matches topic by exact tag case-insensitively, by substring in title, by substring in body', async () => {
    const store = fakeStore([
      obj({ tags: ['Auth'] }),
      obj({ title: 'Fix AUTH flow' }),
      obj({ body: 'discussion about authentication internals' }),
      obj({ tags: ['unrelated'], title: 'other', body: 'nothing' }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, { topic: 'auth' });
    expect(report.scope).toEqual({ total: 4, matched: 3 });
  });

  it('without topic matches everything: matched equals total', async () => {
    const store = fakeStore([obj(), obj()]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.scope).toEqual({ total: 2, matched: 2 });
    expect(report.topic).toBeNull();
  });

  it('excludes archived from total and all sections (D2)', async () => {
    const store = fakeStore([obj({ tags: ['x'] }), obj({ tags: ['x'], status: 'archived' })]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.scope.total).toBe(1);
    expect(report.topTags).toEqual([{ tag: 'x', count: 1 }]);
  });

  it('computes topTags/topFiles/typeDistribution sorted desc, tie alphabetical, limit 10', async () => {
    const store = fakeStore([
      obj({ tags: ['b', 'a'], related: { files: ['f1.ts', 'f2.ts'], docs: [], decisions: [] } }),
      obj({ tags: ['a'], related: { files: ['f1.ts'], docs: [], decisions: [] } }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.topTags).toEqual([
      { tag: 'a', count: 2 },
      { tag: 'b', count: 1 },
    ]);
    expect(report.topFiles).toEqual([
      { file: 'f1.ts', count: 2 },
      { file: 'f2.ts', count: 1 },
    ]);
    expect(report.typeDistribution).toEqual([{ tag: 'observation', count: 2 }]);
  });

  it('throws on invalid analysisType listing all five allowed values (D4)', async () => {
    const store = fakeStore([]);
    await expect(
      generateInsights({ store, clock: fakeClock() }, { analysisType: 'nope' as (typeof ANALYSIS_TYPES)[number] })
    ).rejects.toThrow('Allowed: patterns, technical_debt, decisions, lessons, activity');
  });

  it('defaults analysisType to patterns and stamps generatedAt from injected clock', async () => {
    const store = fakeStore([]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.analysisType).toBe('patterns');
    expect(report.generatedAt).toBe(NOW.toISOString());
  });
});
