// REL-231-A P04 (test-plan S09/S10/S17): доменная операция записи council-record.
// Контрактные тесты пишутся ДО реализации (TDD): src/app/use-cases/record-council.ts
// будет создан W3. Ожидаемый фон — RED по отсутствию модуля. Контракт зафиксирован
// L1 в брифе W1 (design §4 «Write-path поверх note»): строгая схема envelope,
// канонический JSON body, дайджест question_revision, идемпотентность request_key.
// Здесь — моки портов (прецедент tests/integration/build-councils-v2.test.ts).

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  recordCouncil,
  type CouncilRecordEnvelope,
  type RecordCouncilDeps,
} from '../../src/app/use-cases/record-council.js';
import type { MemoryStore, ListFilters } from '../../src/ports/memory-store.port.js';
import type { EventLog } from '../../src/ports/event-log.port.js';
import type { RelationLog } from '../../src/ports/relation-log.port.js';
import type { Clock } from '../../src/ports/clock.port.js';
import type { IdGenerator } from '../../src/ports/id-generator.port.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';
import type { MemoryEvent } from '../../src/domain/schemas/memory-event-schema.js';
import type { Relation } from '../../src/domain/schemas/relation-schema.js';

const ACTOR = 'agent:steward';
const TAG = 'wolf:council-record:v1';
const TASK = 'T-42';

/** Канонический JSON (stable stringify): рекурсивная сортировка ключей, без пробелов. */
function canonJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) out[key] = walk(src[key]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

const sha256Hex = (value: unknown): string => createHash('sha256').update(canonJson(value), 'utf8').digest('hex');

/** Семантика 2: question_revision = sha256 от canonical JSON
 * {schema_version, record_kind:'question', task_id, payload} вопроса. */
function questionDigest(taskId: string, payload: unknown): string {
  return sha256Hex({ schema_version: 1, record_kind: 'question', task_id: taskId, payload });
}

// --- Фейки портов (структурно соответствуют портам; прецедент — build-councils-v2) ---

class FakeStore implements MemoryStore {
  saved: MemoryObject[] = [];
  async save(object: MemoryObject): Promise<void> {
    this.saved.push(JSON.parse(JSON.stringify(object)) as MemoryObject);
  }
  async get(id: string): Promise<MemoryObject | null> {
    return this.saved.find((o) => o.id === id) ?? null;
  }
  async list(filters?: ListFilters): Promise<MemoryObject[]> {
    return this.saved.filter(
      (o) =>
        (!filters?.type || o.type === filters.type) &&
        (!filters?.status || o.status === filters.status) &&
        (!filters?.facet || (o as { facet?: string }).facet === filters.facet)
    );
  }
  async update(): Promise<MemoryObject> {
    throw new Error('not implemented');
  }
}

class FakeLog implements EventLog {
  events: MemoryEvent[] = [];
  async append(event: MemoryEvent): Promise<void> {
    this.events.push(JSON.parse(JSON.stringify(event)) as MemoryEvent);
  }
  async readAll(): Promise<MemoryEvent[]> {
    return [...this.events];
  }
}

class FakeRelations implements RelationLog {
  appended: Relation[] = [];
  async append(relation: Relation): Promise<void> {
    this.appended.push(JSON.parse(JSON.stringify(relation)) as Relation);
  }
  async list(filters?: { subject?: string; object?: string; predicate?: string }): Promise<Relation[]> {
    return this.appended.filter(
      (r) =>
        (!filters?.subject || r.subject === filters.subject) &&
        (!filters?.object || r.object === filters.object) &&
        (!filters?.predicate || r.predicate === filters.predicate)
    );
  }
}

class FakeClock implements Clock {
  now(): Date {
    return new Date('2026-11-05T10:00:00.000Z');
  }
}

class FakeIdGen implements IdGenerator {
  private seq = 0;
  generateMemoryId(_date: Date, slug?: string): string {
    this.seq += 1;
    return `mem-${this.seq}-${(slug ?? 'id').replace(/[^a-z0-9]+/gi, '-').slice(0, 32)}`;
  }
  generateEventId(_date: Date): string {
    this.seq += 1;
    return `evt-${this.seq}`;
  }
}

interface Ctx {
  deps: RecordCouncilDeps;
  store: FakeStore;
  log: FakeLog;
  relations: FakeRelations;
}

function makeCtx(): Ctx {
  const store = new FakeStore();
  const log = new FakeLog();
  const relations = new FakeRelations();
  const deps: RecordCouncilDeps = {
    store,
    log,
    clock: new FakeClock(),
    idGen: new FakeIdGen(),
    relations,
  };
  return { deps, store, log, relations };
}

function write(deps: RecordCouncilDeps, envelope: CouncilRecordEnvelope) {
  return recordCouncil(deps, { envelope, createdBy: ACTOR });
}

/** Отказ валидации без побочных эффектов: ни записи, ни события, ни ребра. */
async function expectRejectedNoWrite(ctx: Ctx, envelope: unknown): Promise<void> {
  const before = [ctx.store.saved.length, ctx.log.events.length, ctx.relations.appended.length];
  await expect(write(ctx.deps, envelope as CouncilRecordEnvelope)).rejects.toThrow();
  expect([ctx.store.saved.length, ctx.log.events.length, ctx.relations.appended.length]).toEqual(before);
}

// --- Фикстуры envelope (валидные по контракту) ---

function questionEnvelope(): CouncilRecordEnvelope {
  return {
    schema_version: 1,
    record_kind: 'question',
    request_key: 'T-42-q1',
    task_id: TASK,
    payload: {
      question: 'Ship feature X in 2.31.0?',
      decision_owner: 'user:chekh',
      sources: [{ ref: 'docs/specs/x.md', revision: 'rev-1' }],
      lenses: ['security', 'performance'],
      budget: 'one round',
      constraints: ['no new dependencies'],
    },
  };
}

function opinionEnvelope(
  questionId: string,
  revision: string,
  opts: { key?: string; expert?: string } = {}
): CouncilRecordEnvelope {
  return {
    schema_version: 1,
    record_kind: 'opinion',
    request_key: opts.key ?? 'T-42-r1-security',
    task_id: TASK,
    question_id: questionId,
    question_revision: revision,
    payload: {
      expert_id: opts.expert ?? 'security',
      round: 1,
      claims: ['injection risk is low'],
      evidence: [{ memory_id: 'wolf:lesson:mem_1', quote: 'quote-1' }],
      assumptions: ['deployment unchanged'],
      confidence: 'high',
      risks: ['parser drift'],
      failure_conditions: ['encoding mismatch'],
      counterexamples: [],
      recommendation: 'ship',
    },
  };
}

function synthesisEnvelope(
  questionId: string,
  revision: string,
  opinionIds: string[],
  overrides: Record<string, unknown> = {}
): CouncilRecordEnvelope {
  return {
    schema_version: 1,
    record_kind: 'synthesis',
    request_key: 'T-42-synthesis',
    task_id: TASK,
    question_id: questionId,
    question_revision: revision,
    payload: Object.assign(
      {
        outcome: 'ready',
        opinion_ids: opinionIds,
        accepted_claims: ['injection risk is low'],
        rejected_alternatives: [{ claim: 'rewrite parser', reason: 'out of budget' }],
        unresolved_dissent: [],
        required_validation: [],
        confidence: 'medium',
        actual_participants: ['security'],
        missing_participants: [],
        cost_note: 'one round',
        isolation_limits: ['no production data'],
      },
      overrides
    ),
  };
}

// --- Посев фикстур ---

async function seedQuestion(ctx: Ctx): Promise<{ id: string; revision: string }> {
  const envelope = questionEnvelope();
  const revision = questionDigest(TASK, envelope.payload);
  const res = await write(ctx.deps, envelope);
  expect(res.created, 'фикстура: question должен записаться').toBe(true);
  return { id: res.memoryId, revision };
}

async function seedOpinion(
  ctx: Ctx,
  q: { id: string; revision: string },
  opts: { key?: string; expert?: string } = {}
): Promise<string> {
  const res = await write(ctx.deps, opinionEnvelope(q.id, q.revision, opts));
  expect(res.created, 'фикстура: opinion должен записаться').toBe(true);
  return res.memoryId;
}

// --- Тесты ---

describe('recordCouncil: валидные записи (note поверх store)', () => {
  it('question: note type=note facet=context, тег wolf:council-record:v1, body = canonical JSON envelope', async () => {
    const ctx = makeCtx();
    const envelope = questionEnvelope();
    const res = await write(ctx.deps, envelope);
    expect(res.created).toBe(true);
    expect(res.recovered).toBe(false);
    expect(res.memoryId).toBeTruthy();

    const note = await ctx.store.get(res.memoryId);
    expect(note, 'note сохранён в store').not.toBeNull();
    expect(note!.type).toBe('note');
    expect((note as { facet?: string } | null)!.facet).toBe('context');
    expect(note!.tags).toEqual([TAG]);
    expect(note!.body).toBe(canonJson(envelope));
    expect(note!.title).toBe(`[council] question: ${TASK}`);
    expect(note!.created_by).toBe(ACTOR);

    const added = ctx.log.events.filter((e) => e.type === 'memory.added');
    expect(added.some((e) => JSON.stringify(e.payload).includes(res.memoryId))).toBe(true);
  });

  it('question: created_by берётся только из input.createdBy, не из payload', async () => {
    const ctx = makeCtx();
    const envelope = questionEnvelope();
    envelope.payload.decision_owner = 'user:someone-else';
    const res = await write(ctx.deps, envelope);
    const note = await ctx.store.get(res.memoryId);
    expect(note!.created_by).toBe(ACTOR);
  });

  it('opinion: note + relation answers → question', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const res = await write(ctx.deps, opinionEnvelope(q.id, q.revision));
    expect(res.created).toBe(true);
    const note = await ctx.store.get(res.memoryId);
    expect(note!.title).toBe(`[council] opinion security r1: ${TASK}`);
    const edges = await ctx.relations.list({ subject: res.memoryId, predicate: 'answers' });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.object).toBe(q.id);
  });

  it('synthesis ready: note + based_on → question и каждое использованное opinion', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const op1 = await seedOpinion(ctx, q, { key: 'T-42-r1-security' });
    const op2 = await seedOpinion(ctx, q, { key: 'T-42-r1-perf', expert: 'performance' });
    const res = await write(ctx.deps, synthesisEnvelope(q.id, q.revision, [op1, op2]));
    expect(res.created).toBe(true);
    const note = await ctx.store.get(res.memoryId);
    expect(note!.title).toBe(`[council] synthesis ready: ${TASK}`);
    const basedOn = await ctx.relations.list({ subject: res.memoryId, predicate: 'based_on' });
    expect(basedOn.map((r) => r.object).sort()).toEqual([q.id, op1, op2].sort());
  });

  it('synthesis insufficient_evidence с объяснением и required_validation принимается', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const op = await seedOpinion(ctx, q);
    const res = await write(
      ctx.deps,
      synthesisEnvelope(q.id, q.revision, [op], {
        outcome: 'insufficient_evidence',
        accepted_claims: [],
        unresolved_dissent: ['performance data missing'],
        required_validation: ['rerun benchmark on prod-like data'],
      })
    );
    expect(res.created).toBe(true);
  });
});

describe('recordCouncil: строгая схема (unknown/extra отклоняются)', () => {
  it('неизвестная schema_version отклоняется без записи', async () => {
    const ctx = makeCtx();
    await expectRejectedNoWrite(ctx, { ...questionEnvelope(), schema_version: 2 });
  });

  it('лишнее поле верхнего уровня envelope отклоняется', async () => {
    const ctx = makeCtx();
    await expectRejectedNoWrite(ctx, { ...questionEnvelope(), provenance: 'cli' });
  });

  it('лишнее поле в payload отклоняется', async () => {
    const ctx = makeCtx();
    const e = questionEnvelope();
    await expectRejectedNoWrite(ctx, { ...e, payload: { ...e.payload, surprise: 1 } });
  });

  it('лишнее поле в sources[] отклоняется', async () => {
    const ctx = makeCtx();
    const e = questionEnvelope();
    (e.payload.sources![0] as unknown as Record<string, unknown>)['page'] = 7;
    await expectRejectedNoWrite(ctx, e);
  });

  it('лишнее поле в evidence[] (EvidenceRef) отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const e = opinionEnvelope(q.id, q.revision);
    (e.payload.evidence![0] as unknown as Record<string, unknown>)['line'] = 3;
    await expectRejectedNoWrite(ctx, e);
  });

  it('лишнее поле в rejected_alternatives[] отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const op = await seedOpinion(ctx, q);
    const e = synthesisEnvelope(q.id, q.revision, [op]);
    (e.payload.rejected_alternatives![0] as unknown as Record<string, unknown>)['weight'] = 0.5;
    await expectRejectedNoWrite(ctx, e);
  });
});

describe('recordCouncil: обязательные ключи и границы значений', () => {
  it('пустой question отклоняется', async () => {
    const ctx = makeCtx();
    const e = questionEnvelope();
    e.payload.question = '';
    await expectRejectedNoWrite(ctx, e);
  });

  it('пустой decision_owner отклоняется', async () => {
    const ctx = makeCtx();
    const e = questionEnvelope();
    e.payload.decision_owner = '';
    await expectRejectedNoWrite(ctx, e);
  });

  it('пустой expert_id отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const e = opinionEnvelope(q.id, q.revision);
    e.payload.expert_id = '';
    await expectRejectedNoWrite(ctx, e);
  });

  it('пустой request_key отклоняется', async () => {
    const ctx = makeCtx();
    const e = questionEnvelope();
    e.request_key = '';
    await expectRejectedNoWrite(ctx, e);
  });

  it('пустой task_id отклоняется', async () => {
    const ctx = makeCtx();
    const e = questionEnvelope();
    e.task_id = '';
    await expectRejectedNoWrite(ctx, e);
  });

  it('claims=[] у opinion отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const e = opinionEnvelope(q.id, q.revision);
    e.payload.claims = [];
    await expectRejectedNoWrite(ctx, e);
  });

  it('claims с пустой строкой отклоняется (непустые строки)', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const e = opinionEnvelope(q.id, q.revision);
    e.payload.claims = ['valid claim', ''];
    await expectRejectedNoWrite(ctx, e);
  });

  it('round < 1 отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const e = opinionEnvelope(q.id, q.revision);
    e.payload.round = 0;
    await expectRejectedNoWrite(ctx, e);
  });

  it('opinion без question_id отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const e = opinionEnvelope(q.id, q.revision);
    await expectRejectedNoWrite(ctx, { ...e, question_id: undefined });
  });

  it('synthesis без question_id отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const e = synthesisEnvelope(q.id, q.revision, []);
    await expectRejectedNoWrite(ctx, { ...e, question_id: undefined });
  });

  it('outcome ready с пустыми accepted_claims отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const op = await seedOpinion(ctx, q);
    await expectRejectedNoWrite(ctx, synthesisEnvelope(q.id, q.revision, [op], { accepted_claims: [] }));
  });

  it('insufficient_evidence без объяснения (unresolved_dissent=[]) отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const op = await seedOpinion(ctx, q);
    await expectRejectedNoWrite(
      ctx,
      synthesisEnvelope(q.id, q.revision, [op], {
        outcome: 'insufficient_evidence',
        required_validation: ['check later'],
      })
    );
  });

  it('insufficient_evidence без required_validation отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const op = await seedOpinion(ctx, q);
    await expectRejectedNoWrite(
      ctx,
      synthesisEnvelope(q.id, q.revision, [op], {
        outcome: 'insufficient_evidence',
        unresolved_dissent: ['no perf data'],
      })
    );
  });

  it('пустые actual_participants отклоняются', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    const op = await seedOpinion(ctx, q);
    await expectRejectedNoWrite(ctx, synthesisEnvelope(q.id, q.revision, [op], { actual_participants: [] }));
  });

  it('превышение 256 KiB отклоняется без записи', async () => {
    const ctx = makeCtx();
    const e = questionEnvelope();
    e.payload.constraints = ['x'.repeat(270 * 1024)];
    await expectRejectedNoWrite(ctx, e);
  });
});

describe('recordCouncil: семантика question_revision и дублей', () => {
  it('несовпадение question_revision отклоняется без записи', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    await expectRejectedNoWrite(ctx, opinionEnvelope(q.id, 'deadbeef'));
  });

  it('dangling question_id (нет такого question note) отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    await expectRejectedNoWrite(ctx, opinionEnvelope('mem-does-not-exist', q.revision));
  });

  it('дубль expert_id+round на тот же question (иной request_key) отклоняется', async () => {
    const ctx = makeCtx();
    const q = await seedQuestion(ctx);
    await seedOpinion(ctx, q, { key: 'T-42-r1-security' });
    await expectRejectedNoWrite(ctx, opinionEnvelope(q.id, q.revision, { key: 'T-42-r1-security-again' }));
  });
});

describe('recordCouncil: идемпотентность и конфликт по request_key', () => {
  it('повтор того же request_key → тот же memory ID, created=false, без новых events/relations', async () => {
    const ctx = makeCtx();
    const envelope = questionEnvelope();
    const first = await write(ctx.deps, envelope);
    const eventsBefore = ctx.log.events.length;
    const relationsBefore = ctx.relations.appended.length;
    const second = await write(ctx.deps, envelope);
    expect(second.memoryId).toBe(first.memoryId);
    expect(second.created).toBe(false);
    expect(second.recovered).toBe(false);
    expect(ctx.store.saved).toHaveLength(1);
    expect(ctx.log.events).toHaveLength(eventsBefore);
    expect(ctx.relations.appended).toHaveLength(relationsBefore);
  });

  it('иной payload под тем же request_key → конфликт, без записи', async () => {
    const ctx = makeCtx();
    await write(ctx.deps, questionEnvelope());
    const conflicting = questionEnvelope();
    conflicting.payload.question = 'A materially different question';
    await expectRejectedNoWrite(ctx, conflicting);
    expect(ctx.store.saved).toHaveLength(1);
  });
});
