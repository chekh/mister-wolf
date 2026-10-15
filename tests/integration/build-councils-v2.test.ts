import { describe, it, expect } from 'vitest';
import { buildAnalyticsReport, extractClaims } from '../../src/app/use-cases/build-analytics.js';
import type { MemoryStore } from '../../src/ports/memory-store.port.js';
import type { EventLog } from '../../src/ports/event-log.port.js';
import type { RelationLog } from '../../src/ports/relation-log.port.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';

// 2.18.0 REQ-01 (A9), test-plan S-06/S-03: buildCouncils на смешанном наборе
// legacy+v2 — прежняя статистика сохраняется, новые метрики (audited_count,
// unresolved_dissent_total) присутствуют и не NaN.

type Extra = Record<string, unknown>;

function mockStore(objects: Extra[]): MemoryStore {
  return {
    async list(filters) {
      return objects.filter(
        (o) => (!filters?.type || o.type === filters.type) && (!filters?.status || o.status === filters.status)
      ) as MemoryObject[];
    },
    async save() {
      throw new Error('not implemented');
    },
    async get() {
      return null;
    },
    async update() {
      throw new Error('not implemented');
    },
  };
}

function mockLog(): EventLog {
  return {
    async readAll() {
      return [];
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}

function mockRelations(rels: Extra[]): RelationLog {
  return {
    async append() {
      throw new Error('not implemented');
    },
    async list(filters) {
      return rels.filter((r) => !filters?.predicate || r.predicate === filters.predicate) as never;
    },
  };
}

function opinion(id: string, extra: Extra = {}): Extra {
  return {
    id,
    title: id,
    type: 'council-opinion',
    status: 'accepted',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-09-01T01:00:00Z',
    updated_at: '2026-09-01T01:00:00Z',
    created_by: 'agent:alpha',
    source: { kind: 'manual' },
    body: '',
    ...extra,
  };
}

// Неделя clock (2026-09-03, чт): текущий понедельник 2026-08-31; weeks:2 → бакеты 2026-08-24 / 2026-08-31
const objects: Extra[] = [
  { id: 'q-open', title: 'q-open', type: 'council-question', status: 'open', created_at: '2026-08-25T00:00:00Z' },
  { id: 'q-done', title: 'q-done', type: 'council-question', status: 'answered', created_at: '2026-09-01T00:00:00Z' },
  // 2 legacy мнения: только vote, без v2-полей
  opinion('op-legacy-1', { vote: 'за', created_at: '2026-08-25T01:00:00Z', created_by: 'agent:alpha' }),
  opinion('op-legacy-2', { vote: 'нет', created_by: 'agent:beta' }),
  // 2 v2 мнения: claims + v2-поля
  opinion('op-v2-1', {
    vote: 'за',
    created_at: '2026-09-01T02:00:00Z',
    claims: ['claim-1'],
    evidence: [{ memory_id: 'wolf:lesson:mem_x', quote: 'q' }],
    assumptions: ['a'],
    confidence: 'high',
    risks: ['r'],
    failure_conditions: ['f'],
    counterexamples: ['c'],
  }),
  opinion('op-v2-2', {
    created_at: '2026-09-01T03:00:00Z',
    created_by: 'agent:beta',
    claims: ['claim-2', 'claim-3'],
    confidence: 'low',
  }),
  // 1 v2 синтез
  {
    id: 'syn-v2',
    title: 'syn-v2',
    type: 'synthesis',
    status: 'accepted',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.5,
    created_at: '2026-09-01T06:00:00Z',
    updated_at: '2026-09-01T06:00:00Z',
    created_by: 'agent:alpha',
    source: { kind: 'manual' },
    body: '',
    accepted_claims: ['claim-1'],
    rejected_alternatives: [{ claim: 'wait', reason: 'сроки' }],
    unresolved_dissent: ['нагрузка не оценена'],
    required_validation: ['bench'],
  },
];

const rels: Extra[] = [
  { id: 'rel1', subject: 'op-legacy-1', predicate: 'answers', object: 'q-open' },
  { id: 'rel2', subject: 'op-legacy-2', predicate: 'answers', object: 'q-done' },
  { id: 'rel3', subject: 'op-v2-1', predicate: 'answers', object: 'q-done' },
  { id: 'rel4', subject: 'op-v2-2', predicate: 'answers', object: 'q-done' },
  { id: 'rel5', subject: 'syn-v2', predicate: 'based_on', object: 'op-legacy-2' },
];

async function report() {
  return buildAnalyticsReport(
    {
      store: mockStore(objects),
      log: mockLog(),
      relations: mockRelations(rels),
      clock: { now: () => new Date('2026-09-03T00:00:00Z') },
    },
    { signals: [], runLogText: null, weeks: 2 }
  );
}

describe('S-06: buildCouncils mixed legacy+v2', () => {
  it('прежняя статистика сохраняется: questions/opinions/votes/weeks', async () => {
    const c = (await report()).councils;
    expect(c.questions).toEqual({ total: 2, inWindow: 2, open: 1 });
    expect(c.opinions).toEqual({ total: 4, perQuestionMin: 1, perQuestionAvg: 2, perQuestionMax: 3 });
    // op-v2-2 без vote и без body VOTE: → TIMEOUT (прецедент extractVote)
    expect(c.votes).toEqual({ за: 2, нет: 1, TIMEOUT: 1 });
    expect(c.weeks).toEqual([
      { week: '2026-08-24', questions: 1, opinions: 1, syntheses: 0 },
      { week: '2026-08-31', questions: 1, opinions: 3, syntheses: 1 },
    ]);
  });

  it('новые поля присутствуют и не NaN: opinions_with_claims_count=2, audited_count=2, unresolved_dissent_total=1', async () => {
    const c = (await report()).councils;
    expect(c.opinions_with_claims_count).toBe(2);
    expect(c.audited_count).toBe(2); // только op-v2-1 и op-v2-2 несут claims
    expect(c.unresolved_dissent_total).toBe(1); // syn-v2: 1 пункт
    expect(Number.isFinite(c.opinions_with_claims_count)).toBe(true);
    expect(Number.isFinite(c.audited_count)).toBe(true);
    expect(Number.isFinite(c.unresolved_dissent_total)).toBe(true);
  });
});

describe('S-03 (NFR-01): extractClaims для legacy мнения', () => {
  it('без поля claims → [] и без падения', () => {
    const legacy = opinion('op-legacy-x', { vote: 'yes' }) as MemoryObject;
    expect(extractClaims(legacy)).toEqual([]);
  });

  it('v2 мнение → claims читаются', () => {
    const v2 = opinion('op-v2-x', { claims: ['claim-a', 'claim-b'] }) as MemoryObject;
    expect(extractClaims(v2)).toEqual(['claim-a', 'claim-b']);
  });
});
