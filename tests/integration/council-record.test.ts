// REL-231-A P04 (test-plan S10/S17): запись council-record на реальном временном
// store (integration-конвенция wolf: реальные адаптеры в tmp — прецедент
// face-operation-recovery.test.ts). Контракт зафиксирован L1 в брифе W1
// (design §4): note/facet/тег/канонический body, relations, идемпотентность
// request_key, recovery после сбоя между note и relations.
// Файл пишется ДО реализации src/app/use-cases/record-council.ts (W3): фон — RED
// по отсутствию модуля, не по синтаксису.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  recordCouncil,
  type CouncilRecordEnvelope,
  type RecordCouncilDeps,
  type RecordCouncilResult,
} from '../../src/app/use-cases/record-council.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../src/adapters/fs/memory-lock.js';
import { eventsPath, relationsPath, memoryDir } from '../../src/adapters/fs/project-paths.js';
import { buildAnalyticsReport } from '../../src/app/use-cases/build-analytics.js';

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

function questionDigest(taskId: string, payload: unknown): string {
  return createHash('sha256')
    .update(canonJson({ schema_version: 1, record_kind: 'question', task_id: taskId, payload }), 'utf8')
    .digest('hex');
}

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

function synthesisEnvelope(questionId: string, revision: string, opinionIds: string[]): CouncilRecordEnvelope {
  return {
    schema_version: 1,
    record_kind: 'synthesis',
    request_key: 'T-42-synthesis',
    task_id: TASK,
    question_id: questionId,
    question_revision: revision,
    payload: {
      outcome: 'ready',
      opinion_ids: opinionIds,
      accepted_claims: ['injection risk is low'],
      rejected_alternatives: [{ claim: 'rewrite parser', reason: 'out of budget' }],
      unresolved_dissent: [],
      required_validation: [],
      confidence: 'medium',
      actual_participants: ['security', 'performance'],
      missing_participants: [],
      cost_note: 'one round',
      isolation_limits: ['no production data'],
    },
  };
}

interface Ctx {
  dir: string;
  store: MarkdownMemoryStore;
  log: JsonlEventLog;
  relations: JsonlRelationLog;
  deps: RecordCouncilDeps;
}

let ctx: Ctx;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-council-rec-'));
  const store = new MarkdownMemoryStore(dir);
  const log = new JsonlEventLog(eventsPath(dir));
  const relations = new JsonlRelationLog(relationsPath(dir));
  ctx = {
    dir,
    store,
    log,
    relations,
    deps: { store, log, clock: new SystemClock(), idGen: new HashIdGenerator(), relations },
  };
});

afterEach(() => {
  rmSync(ctx.dir, { recursive: true, force: true });
});

function rec(envelope: CouncilRecordEnvelope) {
  return recordCouncil(ctx.deps, { envelope, createdBy: ACTOR });
}

/** Посев question: возвращает id note и ожидаемый дайджест содержимого вопроса. */
async function seedQuestion(): Promise<{ id: string; revision: string }> {
  const envelope = questionEnvelope();
  const revision = questionDigest(TASK, envelope.payload);
  const res = await rec(envelope);
  expect(res.created, 'фикстура: question должен записаться').toBe(true);
  return { id: res.memoryId, revision };
}

function addedEvents(memoryId: string) {
  return ctx.log
    .readAll()
    .then((all) => all.filter((e) => e.type === 'memory.added' && JSON.stringify(e.payload).includes(memoryId)));
}

describe('recordCouncil: integration на реальном временном store', () => {
  it('question → note: type=note, facet=context, тег wolf:council-record:v1, body = canonical JSON envelope', async () => {
    const envelope = questionEnvelope();
    const res = await rec(envelope);
    expect(res.created).toBe(true);
    expect(res.recovered).toBe(false);

    const note = await ctx.store.get(res.memoryId);
    expect(note, 'note читается из store').not.toBeNull();
    expect(note!.type).toBe('note');
    expect((note as { facet?: string } | null)!.facet).toBe('context');
    expect(note!.tags).toEqual([TAG]);
    expect(note!.body).toBe(canonJson(envelope));
    expect(note!.title).toBe(`[council] question: ${TASK}`);
    expect(note!.created_by).toBe(ACTOR);

    expect(await addedEvents(res.memoryId)).toHaveLength(1);
  });

  it('opinion → note + relation answers → question', async () => {
    const q = await seedQuestion();
    const op = await rec(opinionEnvelope(q.id, q.revision));
    expect(op.created).toBe(true);

    const edges = await ctx.relations.list({ subject: op.memoryId, predicate: 'answers' });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.object).toBe(q.id);
  });

  it('synthesis → note + relations based_on → question и каждое использованное opinion', async () => {
    const q = await seedQuestion();
    const op1 = await rec(opinionEnvelope(q.id, q.revision, { key: 'T-42-r1-security' }));
    const op2 = await rec(opinionEnvelope(q.id, q.revision, { key: 'T-42-r1-perf', expert: 'performance' }));

    const syn = await rec(synthesisEnvelope(q.id, q.revision, [op1.memoryId, op2.memoryId]));
    expect(syn.created).toBe(true);

    const basedOn = await ctx.relations.list({ subject: syn.memoryId, predicate: 'based_on' });
    expect(basedOn.map((r) => r.object).sort()).toEqual([q.id, op1.memoryId, op2.memoryId].sort());
  });

  it('идемпотентность: повтор того же request_key → тот же memory ID, без новых events/relations', async () => {
    const q = await seedQuestion();
    const envelope = opinionEnvelope(q.id, q.revision);
    const first = await rec(envelope);
    expect(first.created).toBe(true);

    const eventsBefore = (await ctx.log.readAll()).length;
    const relationsBefore = (await ctx.relations.list()).length;

    const second = await rec(envelope);
    expect(second.memoryId).toBe(first.memoryId);
    expect(second.created).toBe(false);
    expect(second.recovered).toBe(false);

    expect(await ctx.log.readAll()).toHaveLength(eventsBefore);
    expect(await ctx.relations.list()).toHaveLength(relationsBefore);
  });

  it('иной payload под тем же request_key → конфликт: ошибка и ничего не записано', async () => {
    const q = await seedQuestion();
    await rec(opinionEnvelope(q.id, q.revision));

    const conflicting = opinionEnvelope(q.id, q.revision);
    conflicting.payload.claims = ['a materially different claim'];

    const eventsBefore = (await ctx.log.readAll()).length;
    const relationsBefore = (await ctx.relations.list()).length;
    const notesBefore = (await ctx.store.list({ type: 'note' })).length;

    await expect(rec(conflicting)).rejects.toThrow();

    expect((await ctx.store.list({ type: 'note' })).length).toBe(notesBefore);
    expect(await ctx.log.readAll()).toHaveLength(eventsBefore);
    expect(await ctx.relations.list()).toHaveLength(relationsBefore);
  });

  it('fault injection: сбой после note (до relations) → повтор того же request_key восстанавливает relations без дублей', async () => {
    const q = await seedQuestion();
    const envelope = opinionEnvelope(q.id, q.revision);

    // Первый заход: note пишется, первый же relations.append падает —
    // сбой строго после note, до рёбер (seam как в face-operation-recovery).
    const failingDeps: RecordCouncilDeps = {
      ...ctx.deps,
      relations: {
        async append() {
          throw new Error('injected fault: relation log unavailable');
        },
        async list(filters) {
          return ctx.relations.list(filters);
        },
      },
    };
    await expect(recordCouncil(failingDeps, { envelope, createdBy: ACTOR })).rejects.toThrow();

    // Состояние после сбоя: note по ключу есть, рёбер нет.
    const notes = (await ctx.store.list({ type: 'note' })).filter(
      (n) => JSON.parse(n.body).request_key === envelope.request_key
    );
    expect(notes).toHaveLength(1);
    const noteId = notes[0]!.id;
    expect(await ctx.relations.list({ subject: noteId })).toHaveLength(0);

    // Повтор того же request_key штатными deps → recovered: рёбра дописаны, дублей нет.
    const retry = await rec(envelope);
    expect(retry.memoryId).toBe(noteId);
    expect(retry.created).toBe(false);
    expect(retry.recovered).toBe(true);

    const answers = await ctx.relations.list({ subject: noteId, predicate: 'answers' });
    expect(answers).toHaveLength(1);
    expect(answers[0]!.object).toBe(q.id);
    // Нет повторного memory-added события и дублей рёбер.
    expect(await addedEvents(noteId)).toHaveLength(1);
    expect(await ctx.relations.list({ predicate: 'answers' })).toHaveLength(1);
  });

  it('W8/F3: записанный question имеет status "open" и попадает в analytics openQuestions', async () => {
    const envelope = questionEnvelope();
    const res = await rec(envelope);
    const note = await ctx.store.get(res.memoryId);
    expect(note!.status).toBe('open');
    // статус — поле note, canonical body (и дайджест) не меняются
    expect(note!.body).toBe(canonJson(envelope));

    const report = await buildAnalyticsReport(
      { store: ctx.store, log: ctx.log, relations: ctx.relations, clock: { now: () => new Date() } },
      { signals: [], runLogText: null }
    );
    expect(report.councils.openQuestions.map((q) => q.id)).toEqual([res.memoryId]);
    expect(report.councils.questions.open).toBe(1);
  });

  it('W8/F4: конкурентные одинаковые recordCouncil (реальный FsMemoryLock) — один note, один memory.added, created ровно у одного', async () => {
    const lock = new FsMemoryLock(memoryDir(ctx.dir)); // тот же каталог, что у контейнера проды
    const envelope = questionEnvelope();
    const both = await Promise.allSettled([
      recordCouncil({ ...ctx.deps, lock }, { envelope, createdBy: ACTOR }),
      recordCouncil({ ...ctx.deps, lock }, { envelope, createdBy: ACTOR }),
    ]);
    expect(both.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const results = both.map((r) => (r as PromiseFulfilledResult<RecordCouncilResult>).value);
    expect(results[1]!.memoryId).toBe(results[0]!.memoryId);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    const notes = (await ctx.store.list({ type: 'note' })).filter((n) => n.tags.includes(TAG));
    expect(notes).toHaveLength(1);
    expect(await addedEvents(results[0]!.memoryId)).toHaveLength(1);
  });

  it('W8/F4: fault на append второго ребра синтеза → повтор request_key → recovered, полный набор рёбер без дублей', async () => {
    const q = await seedQuestion();
    const op1 = await rec(opinionEnvelope(q.id, q.revision, { key: 'T-42-r1-security' }));
    const op2 = await rec(opinionEnvelope(q.id, q.revision, { key: 'T-42-r1-perf', expert: 'performance' }));
    const envelope = synthesisEnvelope(q.id, q.revision, [op1.memoryId, op2.memoryId]);

    // первое ребро (based_on + обратное = 2 append) проходит; первый append
    // ВТОРОГО ребра падает — сбой посреди multi-edge набора
    let appended = 0;
    const failingDeps: RecordCouncilDeps = {
      ...ctx.deps,
      relations: {
        async append(rel) {
          appended += 1;
          if (appended > 2) throw new Error('injected fault: append of the second edge');
          return ctx.relations.append(rel);
        },
        async list(filters) {
          return ctx.relations.list(filters);
        },
      },
    };
    await expect(recordCouncil(failingDeps, { envelope, createdBy: ACTOR })).rejects.toThrow();

    // после сбоя: note по ключу есть, дописано ровно первое ребро (к question)
    const notes = (await ctx.store.list({ type: 'note' })).filter(
      (n) => JSON.parse(n.body).request_key === envelope.request_key
    );
    expect(notes).toHaveLength(1);
    const synId = notes[0]!.id;
    expect((await ctx.relations.list({ subject: synId, predicate: 'based_on' })).map((r) => r.object)).toEqual([q.id]);

    // повтор того же request_key штатными deps → recovered, полный набор, без дублей
    const retry = await rec(envelope);
    expect(retry.memoryId).toBe(synId);
    expect(retry.created).toBe(false);
    expect(retry.recovered).toBe(true);

    const basedOn = (await ctx.relations.list({ subject: synId, predicate: 'based_on' })).map((r) => r.object);
    expect([...basedOn].sort()).toEqual([q.id, op1.memoryId, op2.memoryId].sort());
    expect(await ctx.relations.list({ predicate: 'based_on' })).toHaveLength(3);
    expect(await ctx.relations.list({ predicate: 'basis_for' })).toHaveLength(3);
    expect(await addedEvents(synId)).toHaveLength(1);
  });
});
