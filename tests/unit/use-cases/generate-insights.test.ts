import { describe, it, expect, beforeEach } from 'vitest';
import { generateInsights, ANALYSIS_TYPES } from '../../../src/app/use-cases/generate-insights.js';
import { MemoryStore } from '../../../src/ports/memory-store.port.js';
import { Clock } from '../../../src/ports/clock.port.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';

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

describe('generateInsights — debt signals', () => {
  it('marks active older than 30 days as stale, 29 days not, status stale always, archived/superseded never (D5)', async () => {
    const store = fakeStore([
      obj({ id: 'fresh', updated_at: isoDaysAgo(29) }),
      obj({ id: 'old', updated_at: isoDaysAgo(31) }),
      obj({ id: 'flagged', status: 'stale', updated_at: NOW.toISOString() }),
      obj({ id: 'gone', status: 'superseded', updated_at: isoDaysAgo(400) }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.stale.map((o) => o.id)).toEqual(['old', 'flagged']);
  });

  it('groups active decisions sharing a tag into one candidate; disjoint decisions yield none (D6)', async () => {
    const store = fakeStore([
      obj({ id: 'd1', type: 'decision', tags: ['auth'] }),
      obj({ id: 'd2', type: 'decision', tags: ['auth', 'api'] }),
      obj({ id: 'd3', type: 'decision', tags: ['ui'] }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.conflicts.candidates).toHaveLength(1);
    expect(report.conflicts.candidates[0].map((o) => o.id)).toEqual(['d1', 'd2']);
  });

  it('collects any-type conflicting-status objects into statusConflicting (D6)', async () => {
    const store = fakeStore([obj({ id: 'l1', type: 'lesson', status: 'conflicting' })]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.conflicts.statusConflicting.map((o) => o.id)).toEqual(['l1']);
    expect(report.conflicts.candidates).toHaveLength(0);
  });

  it('fills lowConfidenceActive, openBlockers and decisionsByStatus', async () => {
    const store = fakeStore([
      obj({ id: 'lc', confidence: 'low' }),
      obj({ id: 'bl', type: 'blocker' }),
      obj({ id: 'da', type: 'decision', status: 'active' }),
      obj({ id: 'ds', type: 'decision', status: 'superseded', superseded_by: 'da' }),
      obj({ id: 'dr', type: 'decision', status: 'rejected' }),
      obj({ id: 'lo', type: 'lesson', status: 'obsolete' }), // не decision — в decisionsByStatus не попадает
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.lowConfidenceActive.map((o) => o.id)).toEqual(['lc']);
    expect(report.openBlockers.map((o) => o.id)).toEqual(['bl']);
    expect(Object.keys(report.decisionsByStatus).sort()).toEqual(['active', 'obsolete', 'rejected', 'superseded']);
    expect(report.decisionsByStatus['superseded'].map((o) => o.id)).toEqual(['ds']);
    expect(report.supersededDecisions.map((o) => o.id)).toEqual(['ds']);
  });
});

describe('generateInsights — density and tallies', () => {
  it('buckets created_at into ISO weeks (Monday keys), classes counted independently, window is 8 weeks (D7)', async () => {
    const store = fakeStore([
      // NOW = среда 2026-08-26; понедельник текущей недели = 2026-08-24
      obj({ id: 'a', type: 'decision', created_at: '2026-08-25T10:00:00.000Z' }),
      obj({ id: 'b', type: 'lesson', created_at: '2026-08-24T10:00:00.000Z' }),
      obj({ id: 'c', type: 'observation', created_at: '2026-07-27T10:00:00.000Z' }), // прошлая неделя
      obj({ id: 'd', created_at: '2026-06-01T10:00:00.000Z' }), // вне окна 8 недель
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.density).toHaveLength(8);
    // индекс 7 — текущая неделя; окно стартует с понедельника 2026-07-06 (индекс 0)
    expect(report.density[7]).toEqual({ week: '2026-08-24', decisions: 1, lessons: 1, debug: 0, total: 2 });
    expect(report.density[3]).toEqual({ week: '2026-07-27', decisions: 0, lessons: 1, debug: 0, total: 1 });
    expect(report.density[6]).toEqual({ week: '2026-08-17', decisions: 0, lessons: 0, debug: 0, total: 0 });
    expect(report.density.find((b) => b.week === '2026-06-01')).toBeUndefined();
  });

  it('debug class counts any-type objects carrying DEBUG_TAGS (D-dev1)', async () => {
    const store = fakeStore([
      obj({ id: 'l', type: 'lesson', tags: ['debug'], created_at: '2026-08-25T10:00:00.000Z' }),
      obj({ id: 'd', type: 'decision', tags: ['solve'], created_at: '2026-08-25T11:00:00.000Z' }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.density[7]).toMatchObject({ debug: 2, total: 2 });
  });

  it('fills lessonsTopTags (top 5), statusTally and truthRoleTally', async () => {
    const store = fakeStore([
      obj({ type: 'lesson', tags: ['x', 'y'] }),
      obj({ type: 'observation', tags: ['x'] }),
      obj({ type: 'decision', tags: ['x'], truth_role: 'source_of_truth' }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.lessonsTopTags).toEqual([
      { tag: 'x', count: 2 },
      { tag: 'y', count: 1 },
    ]);
    expect(report.statusTally).toEqual([{ tag: 'active', count: 3 }]);
    expect(report.truthRoleTally).toEqual([
      { tag: 'accepted_knowledge', count: 2 },
      { tag: 'source_of_truth', count: 1 },
    ]);
  });
});

describe('generateInsights — read-only contract', () => {
  it('does not mutate the memory directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-insights-ro-'));
    try {
      const store = new MarkdownMemoryStore(dir);
      await store.save(obj({ id: 'ro-1', type: 'lesson', tags: ['debug'] }));
      const snapshot = (): Map<string, string> => {
        const out = new Map<string, string>();
        const walk = (p: string): void => {
          for (const entry of readdirSync(p, { withFileTypes: true })) {
            const full = join(p, entry.name);
            if (entry.isDirectory()) walk(full);
            else out.set(relative(dir, full), readFileSync(full, 'utf-8'));
          }
        };
        walk(dir);
        return out;
      };
      const before = snapshot();
      await generateInsights({ store, clock: fakeClock() }, { topic: 'debug' });
      expect(snapshot()).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
