import { describe, it, expect } from 'vitest';
import { buildAnalyticsReport, extractClaims } from '../../src/app/use-cases/build-analytics.js';
import { classifyCouncilRecord } from '../../src/app/use-cases/council-normalizer.js';
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

// ---------------------------------------------------------------------------
// REL-231-A S12 (P05 / REQ-10 / NFR-02 / AC-A4): mixed reader — legacy-типы +
// alias-notes + envelope-notes (включая повреждённое тело) в одной аналитике.
// ---------------------------------------------------------------------------

const ENV_TAG = 'wolf:council-record:v1';

function note(id: string, extra: Extra = {}): Extra {
  return {
    id,
    title: id,
    type: 'note',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    created_by: 'agent:gamma',
    source: { kind: 'manual' },
    body: '',
    tags: [],
    ...extra,
  };
}

const mixedObjects: Extra[] = [
  // legacy-представления
  { id: 'q-leg', title: 'q-leg', type: 'council-question', status: 'open', created_at: '2026-08-25T00:00:00Z' },
  opinion('m-op-leg', { vote: 'за', created_at: '2026-08-25T01:00:00Z', created_by: 'agent:alpha' }),
  // alias-notes (мигрированные представления)
  note('q-alias', { alias_origin: 'council-question', status: 'open', created_at: '2026-08-25T02:00:00Z' }),
  note('m-op-alias', { alias_origin: 'council-opinion', created_by: 'agent:beta', created_at: '2026-08-25T03:00:00Z' }),
  // envelope-notes (canonical JSON envelope, дизайн §4)
  note('q-env', {
    status: 'open',
    tags: [ENV_TAG],
    facet: 'context',
    body: JSON.stringify({
      schema_version: 1,
      record_kind: 'question',
      request_key: 'rk-1',
      task_id: 'T-1',
      question_id: 'q-env',
      question_revision: '1',
      payload: { question: 'Выпустить 2.31.0?', decision_owner: 'lead' },
    }),
  }),
  note('m-op-env', {
    created_by: 'agent:orchestrator', // эксперт живёт в payload.expert_id
    created_at: '2026-09-01T01:00:00Z',
    tags: [ENV_TAG],
    facet: 'context',
    body: JSON.stringify({
      schema_version: 1,
      record_kind: 'opinion',
      request_key: 'rk-1',
      task_id: 'T-1',
      question_id: 'q-env',
      question_revision: '1',
      payload: { expert_id: 'agent:gamma', round: 1, claims: ['env-claim-1'], confidence: 'high' },
    }),
  }),
  note('m-syn-env', {
    created_at: '2026-09-01T02:00:00Z',
    tags: [ENV_TAG],
    facet: 'context',
    body: JSON.stringify({
      schema_version: 1,
      record_kind: 'synthesis',
      request_key: 'rk-1',
      task_id: 'T-1',
      question_id: 'q-env',
      question_revision: '1',
      payload: {
        outcome: 'ready',
        opinion_ids: ['m-op-env'],
        accepted_claims: ['env-claim-1'],
        unresolved_dissent: [],
        required_validation: [],
        confidence: 'medium',
        actual_participants: ['agent:gamma'],
        missing_participants: ['agent:delta'],
      },
    }),
  }),
  // повреждённое envelope-тело: тег есть, строгий parse не прошёл → kind:null, отчёт жив
  note('m-env-broken', {
    created_at: '2026-09-01T03:00:00Z',
    tags: [ENV_TAG],
    body: '{"schema_version":1,"record_kind":"opinion","request_key":"rk',
  }),
  // дубликат id q-leg в envelope-представлении → дедуп (legacy > envelope), один счёт
  note('q-leg', {
    created_at: '2026-09-01T04:00:00Z',
    tags: [ENV_TAG],
    body: JSON.stringify({
      schema_version: 1,
      record_kind: 'question',
      request_key: 'rk-2',
      task_id: 'T-2',
      payload: { question: 'dup?' },
    }),
  }),
];

const mixedRels: Extra[] = [
  { id: 'mr1', subject: 'm-op-leg', predicate: 'answers', object: 'q-leg' },
  { id: 'mr2', subject: 'm-op-alias', predicate: 'answers', object: 'q-alias' },
  { id: 'mr3', subject: 'm-op-env', predicate: 'answers', object: 'q-env' },
  { id: 'mr4', subject: 'm-syn-env', predicate: 'based_on', object: 'm-op-env' },
];

async function mixedReport() {
  return buildAnalyticsReport(
    {
      store: mockStore(mixedObjects),
      log: mockLog(),
      relations: mockRelations(mixedRels),
      clock: { now: () => new Date('2026-09-03T00:00:00Z') },
    },
    { signals: [], runLogText: null, weeks: 2 }
  );
}

describe('S12: mixed legacy+alias+envelope', () => {
  it('все три источника учтены по одному разу; дедуп и повреждённое тело не искажают счёт', async () => {
    const m = (await mixedReport()).councils;
    // 3 вопроса (q-leg + q-alias + q-env; dup-envelope q-leg и битая запись не считаются)
    expect(m.questions).toEqual({ total: 3, inWindow: 3, open: 3 });
    // 3 мнения (legacy + alias + envelope; m-env-broken не мнение)
    expect(m.opinions).toEqual({ total: 3, perQuestionMin: 1, perQuestionAvg: 1, perQuestionMax: 1 });
    // недели: dup-envelope не добавляет вопросов в 2026-08-31, битая запись нигде
    expect(m.weeks).toEqual([
      { week: '2026-08-24', questions: 2, opinions: 2, syntheses: 0 },
      { week: '2026-08-31', questions: 1, opinions: 1, syntheses: 1 },
    ]);
    // синтез m-syn-env связан через based_on → answers с вопросом q-env
    expect(m.synthesis.questionsWithSynthesis).toBe(1);
    expect(m.synthesis.medianHours).toBe(2);
  });

  it('AC-W5-3: alias/envelope мнения без голоса не TIMEOUT; legacy-голос учтён', async () => {
    const m = (await mixedReport()).councils;
    expect(m.votes).toEqual({ за: 1 }); // только m-op-leg; TIMEOUT-ключа нет
    const open = (await mixedReport()).councils.openQuestions;
    expect(open).toEqual([
      { id: 'q-leg', title: 'q-leg', daysOpen: 9, opinions: 1, votes: { за: 1 } },
      { id: 'q-alias', title: 'q-alias', daysOpen: 8, opinions: 1, votes: {} },
      { id: 'q-env', title: 'q-env', daysOpen: 2, opinions: 1, votes: {} },
    ]);
  });

  it('AC-W5-4: participation из expert_id + actual_participants; missing не создаёт мнений; расхождение видно', async () => {
    const m = (await mixedReport()).councils;
    // m-op-env считает эксперта agent:gamma, а не created_by agent:orchestrator;
    // actual_participants не теряются, missing agent:delta фиктивного мнения не даёт
    expect(m.participation).toEqual([
      { agent: 'agent:alpha', opinions: 1 },
      { agent: 'agent:beta', opinions: 1 },
      { agent: 'agent:gamma', opinions: 1 },
    ]);
    // «заявлено N участников — мнений M»: gamma+delta = 2, мнение одно
    expect(m.envelope_participation).toEqual([{ synthesis_id: 'm-syn-env', declared_participants: 2, opinions: 1 }]);
  });

  it('AC-W5-5: новые метрики конечны; envelope-claims читаются из payload', async () => {
    const m = (await mixedReport()).councils;
    expect(m.opinions_with_claims_count).toBe(1); // только m-op-env
    expect(m.audited_count).toBe(1);
    expect(m.structured_claims_count).toBe(1);
    expect(m.unresolved_dissent_total).toBe(0); // m-syn-env: payload.unresolved_dissent = []
    expect(Number.isFinite(m.opinions.perQuestionAvg)).toBe(true);
    expect(Number.isFinite(m.synthesis.sharePct ?? NaN)).toBe(true);
    expect(Number.isFinite(m.synthesis.medianHours ?? NaN)).toBe(true);
  });
});

describe('S12: classifyCouncilRecord (единая точка классификации, AC-W5-1)', () => {
  it('legacy по type; alias по note+alias_origin; envelope по тегу + строгий parse', () => {
    expect(classifyCouncilRecord({ ...note('x'), type: 'council-question' } as MemoryObject)).toEqual({
      kind: 'question',
      source: 'legacy',
    });
    expect(classifyCouncilRecord(note('a1', { alias_origin: 'council-opinion' }) as MemoryObject)).toEqual({
      kind: 'opinion',
      source: 'alias',
    });
    const env = classifyCouncilRecord(mixedObjects[5] as MemoryObject); // m-op-env
    expect(env).toMatchObject({ kind: 'opinion', source: 'envelope' });
    expect(env.envelope?.payload.expert_id).toBe('agent:gamma');
  });

  it('повреждённое тело → kind:null + corrupted, не краш; посторонняя note → null', () => {
    expect(classifyCouncilRecord(mixedObjects[7] as MemoryObject)).toEqual({
      kind: null,
      source: null,
      envelope: undefined,
      corrupted: true,
    });
    // валидный JSON, но не canonical envelope (schema_version≠1)
    expect(
      classifyCouncilRecord(note('b1', { tags: [ENV_TAG], body: '{"schema_version":2}' }) as MemoryObject)
    ).toMatchObject({
      kind: null,
      corrupted: true,
    });
    expect(classifyCouncilRecord(note('plain') as MemoryObject)).toEqual({ kind: null, source: null });
  });
});
