import { describe, it, expect } from 'vitest';
import { buildTypeSchema } from '../../src/domain/type-schema-builder.js';
import { COUNCIL_OPINION_DECL } from '../../src/domain/memory-types.js';
import { buildAnalyticsReport } from '../../src/app/use-cases/build-analytics.js';
import type { MemoryStore } from '../../src/ports/memory-store.port.js';
import type { EventLog } from '../../src/ports/event-log.port.js';
import type { RelationLog } from '../../src/ports/relation-log.port.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';

// 2.18.0 REQ-01 (A9), test-plan S-01/S-02/S-07: council-opinion v2 —
// schema (buildTypeSchema по декларации из memory-types) + совместимость vote.

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

/** Минимальный валидный MemoryObject типа council-opinion (база + v2-поля). */
function opinion(extra: Extra = {}): Extra {
  return {
    id: 'op-x',
    title: 'opinion',
    type: 'council-opinion',
    status: 'accepted',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    created_by: 'agent:alpha',
    source: { kind: 'manual' },
    body: '',
    ...extra,
  };
}

describe('S-01: council-opinion v2 проходит валидацию схемы', () => {
  it('claims + evidence + confidence → success', () => {
    const schema = buildTypeSchema(COUNCIL_OPINION_DECL);
    const result = schema.safeParse(
      opinion({
        vote: 'yes',
        claims: ['Миграция схемы безопасна при поэтапном rollout'],
        evidence: [
          { memory_id: 'wolf:lesson:mem_20260901_migration_7dc05e', quote: 'миграция прошла без потерь' },
          { path: 'docs/concept/concept.md#1.3', note: 'действующий контракт' },
        ],
        assumptions: ['объём данных не вырастет вдвое'],
        confidence: 'high',
        risks: ['долгое время блокировки'],
        failure_conditions: ['конкурентная запись в момент переезда'],
        counterexamples: ['проект X потерял индексы при похожем переезде'],
      })
    );
    expect(result.success).toBe(true);
  });
});

describe('S-02: council-opinion без claims отклоняется схемой', () => {
  it('ошибка указывает на claims (required, min 1)', () => {
    const schema = buildTypeSchema(COUNCIL_OPINION_DECL);
    const result = schema.safeParse(opinion({ vote: 'yes' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'claims')).toBe(true);
    }
  });

  it('пустой массив claims тоже отклоняется (min 1)', () => {
    const schema = buildTypeSchema(COUNCIL_OPINION_DECL);
    const result = schema.safeParse(opinion({ claims: [] }));
    expect(result.success).toBe(false);
  });
});

describe('S-07: extractVote обратно совместим (legacy vote — первичное поле подсчёта)', () => {
  it('legacy мнение с vote и без новых полей → голос учтён через отчёт', async () => {
    const objects: Extra[] = [
      { id: 'q-open', title: 'q', type: 'council-question', status: 'open', created_at: '2026-08-25T00:00:00Z' },
      opinion({ id: 'op-legacy', vote: 'yes', created_at: '2026-08-25T01:00:00Z' }),
    ];
    const rels: Extra[] = [{ id: 'rel1', subject: 'op-legacy', predicate: 'answers', object: 'q-open' }];
    const report = await buildAnalyticsReport(
      {
        store: mockStore(objects),
        log: mockLog(),
        relations: mockRelations(rels),
        clock: { now: () => new Date('2026-09-03T00:00:00Z') },
      },
      { signals: [], runLogText: null, weeks: 2 }
    );
    expect(report.councils.votes).toEqual({ yes: 1 });
  });
});
