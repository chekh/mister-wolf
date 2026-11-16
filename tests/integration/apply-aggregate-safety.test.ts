import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addMemoryObject, type AddMemoryObjectInput } from '../../src/app/use-cases/add-memory-object.js';
import { recordRelation } from '../../src/app/use-cases/record-relation.js';
import { applyAggregate, type AggregateFaultPoint } from '../../src/app/use-cases/apply-aggregate.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../src/adapters/fs/jsonl-relation-log.js';
import { FsMemoryLock } from '../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir, relationsPath } from '../../src/adapters/fs/project-paths.js';
import type { MemoryEvent } from '../../src/domain/schemas/memory-event-schema.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';
import { UserFacingError } from '../../src/domain/errors.js';

// 3.2.0 REQ-10 (test-plan S-19/S-20): безопасный apply-aggregate.
// S-19 — дефектный набор (foreign type / worktree scope / self-link / missing
// source / face-источник как «историческая команда») → отказ ДО первой записи,
// snapshot: ни один объект не изменён, журнал не дописан.
// S-20 — fault injection по образцу face-operation-recovery (seam: ошибка
// ПОСЛЕ завершённого шага): частичный apply виден в журнале (op_step),
// повтор дозавершает; rejected-агрегат ничего не архивирует; archived-исходники
// остаются читаемыми evidence.

interface Ctx {
  dir: string;
  store: MarkdownMemoryStore;
  log: JsonlEventLog;
  relations: JsonlRelationLog;
  idGen: HashIdGenerator;
  lock: FsMemoryLock;
}

function makeCtx(): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-apply-agg-safe-'));
  return {
    dir,
    store: new MarkdownMemoryStore(dir),
    log: new JsonlEventLog(eventsPath(dir)),
    relations: new JsonlRelationLog(relationsPath(dir)),
    idGen: new HashIdGenerator(),
    lock: new FsMemoryLock(memoryDir(dir)),
  };
}

describe('REQ-10 S-19/S-20: безопасный apply-aggregate (integration)', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  function deps(fault?: (point: AggregateFaultPoint) => void) {
    return {
      store: ctx.store,
      log: ctx.log,
      relations: ctx.relations,
      idGen: ctx.idGen,
      clock: new SystemClock(),
      lock: ctx.lock,
      ...(fault ? { fault } : {}),
    };
  }

  async function addObject(input: Partial<AddMemoryObjectInput> & { title: string }): Promise<string> {
    const { object } = await addMemoryObject(deps(), {
      type: 'lesson',
      body: 'body text',
      createdBy: 'user:test',
      ...input,
    } as AddMemoryObjectInput);
    return object.id;
  }

  async function addProposedAggregate(sourceIds: string[]): Promise<string> {
    const aggId = await addObject({
      type: 'lesson',
      title: 'Aggregated deploy lessons',
      createdBy: 'agent:steward',
      extra: { status: 'proposed', trigger_keywords: ['deploy'] },
    });
    for (const src of sourceIds) {
      await recordRelation(
        { relations: ctx.relations, idGen: ctx.idGen },
        new Date(),
        aggId,
        'aggregates',
        src,
        'agent'
      );
    }
    return aggId;
  }

  /** Полный raw-объект произвольного типа — посев сломанного/чужеродного состояния. */
  async function saveRaw(input: {
    type: string;
    title: string;
    status?: string;
    scope?: string;
    fields?: Record<string, unknown>;
  }): Promise<string> {
    const now = new Date().toISOString();
    const id = ctx.idGen.generateMemoryId(new Date(now), input.title);
    await ctx.store.save({
      id,
      type: input.type,
      title: input.title,
      body: 'raw seeded body',
      status: input.status ?? 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: now,
      updated_at: now,
      created_by: 'user:test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      memory_class: 'working',
      truth_role: 'accepted_knowledge',
      lifetime: 'long_term',
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.fields ?? {}),
    } as never);
    return id;
  }

  /** Рекурсивный поиск файла объекта `<id>.md` под .wolf/memory (layout v2/legacy). */
  function objectFilePath(id: string): string {
    const root = join(ctx.dir, '.wolf', 'memory');
    const stack = [root];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const e of readdirSync(cur, { withFileTypes: true })) {
        const full = join(cur, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.name === `${id}.md`) return full;
      }
    }
    throw new Error(`object file for ${id} not found under ${root}`);
  }

  /** Snapshot состояния: статусы всех объектов + длина журнала. */
  async function snapshot(): Promise<{ statuses: Map<string, string | undefined>; logLength: number }> {
    const objects = await ctx.store.list();
    const statuses = new Map(objects.map((o: MemoryObject) => [o.id, o.status]));
    return { statuses, logLength: (await ctx.log.readAll()).length };
  }

  function expectUnchanged(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
    expect(after.logLength).toBe(before.logLength);
    expect(after.statuses.size).toBe(before.statuses.size);
    for (const [id, status] of before.statuses) {
      expect(after.statuses.get(id), `status of ${id} changed`).toBe(status);
    }
  }

  async function opSteps(aggregateId: string): Promise<MemoryEvent[]> {
    return (await ctx.log.readAll()).filter(
      (e) => e.type === 'memory.aggregate.op_step' && e.payload['aggregate_id'] === aggregateId
    );
  }

  async function aggregatedEvents(): Promise<MemoryEvent[]> {
    return (await ctx.log.readAll()).filter((e) => e.type === 'memory.aggregated');
  }

  describe('S-19: дефектный набор → отказ до первой записи (snapshot)', () => {
    it('foreign type: источник note → отказ целиком, ничего не записано', async () => {
      const good = await addObject({ title: 'L1' });
      const note = await addObject({ type: 'note', facet: 'context', title: 'not a lesson' });
      const aggId = await addProposedAggregate([good, note]);

      const before = await snapshot();
      await expect(applyAggregate(deps(), aggId, 'user:owner')).rejects.toThrow(UserFacingError);
      await expect(applyAggregate(deps(), aggId, 'user:owner')).rejects.toThrow(
        /source type "note" is not aggregatable/
      );

      expectUnchanged(before, await snapshot());
      expect(await aggregatedEvents()).toHaveLength(0);
      expect(await opSteps(aggId)).toHaveLength(0);
    });

    it('историческая face-команда — не скрытый обход: face-источник = инородный тип → отказ', async () => {
      const good = await addObject({ title: 'L1' });
      const face = await saveRaw({
        type: 'face',
        title: 'Face: skill:demo',
        fields: { owner_skill: 'skill:demo', version: '1', reason: 'seed', initiator: 'steward' },
      });
      const aggId = await addProposedAggregate([good, face]);

      const before = await snapshot();
      await expect(applyAggregate(deps(), aggId, 'user:owner')).rejects.toThrow(
        /source type "face" is not aggregatable/
      );

      expectUnchanged(before, await snapshot());
      expect((await ctx.store.get(face))!.status).toBe('active'); // face не тронут
    });

    it('недопустимый scope: worktree-scoped источник → отказ', async () => {
      const good = await addObject({ title: 'L1' });
      const scoped = await saveRaw({ type: 'lesson', title: 'WT lesson', scope: 'worktree:feat-x' });
      const aggId = await addProposedAggregate([good, scoped]);

      const before = await snapshot();
      await expect(applyAggregate(deps(), aggId, 'user:owner')).rejects.toThrow(
        /scope "worktree:feat-x" is not deliverable to main/
      );

      expectUnchanged(before, await snapshot());
    });

    it('self-link: агрегат ссылается сам на себя → отказ', async () => {
      const aggId = await addProposedAggregate([]);
      await recordRelation(
        { relations: ctx.relations, idGen: ctx.idGen },
        new Date(),
        aggId,
        'aggregates',
        aggId,
        'agent'
      );

      const before = await snapshot();
      await expect(applyAggregate(deps(), aggId, 'user:owner')).rejects.toThrow(/self-link/);

      expectUnchanged(before, await snapshot());
      expect(await opSteps(aggId)).toHaveLength(0);
    });

    it('missing source: ребро на несуществующий объект → отказ', async () => {
      const good = await addObject({ title: 'L1' });
      const aggId = await addProposedAggregate([good, 'mem_ghost_000']);

      const before = await snapshot();
      await expect(applyAggregate(deps(), aggId, 'user:owner')).rejects.toThrow(
        /mem_ghost_000.*required source not found/s
      );

      expectUnchanged(before, await snapshot());
    });

    it('несколько дефектов сразу — перечислены все (не первая найденная)', async () => {
      const good = await addObject({ title: 'L1' });
      const scoped = await saveRaw({ type: 'lesson', title: 'WT', scope: 'worktree:w1' });
      const note = await addObject({ type: 'note', facet: 'context', title: 'not a lesson' });
      const aggId = await addProposedAggregate([good, scoped, note, 'mem_ghost_001']);

      const before = await snapshot();
      const err = await applyAggregate(deps(), aggId).catch((e: unknown) => e as Error);
      expect(err).toBeInstanceOf(UserFacingError);
      expect(err.message).toMatch(/worktree:w1/);
      expect(err.message).toMatch(/"note" is not aggregatable/);
      expect(err.message).toMatch(/mem_ghost_001/);

      expectUnchanged(before, await snapshot());
    });
  });

  describe('S-20: fault injection — дозавершение по журналу, rejected, evidence', () => {
    function failAfter(point: AggregateFaultPoint): (p: AggregateFaultPoint) => void {
      return (p) => {
        if (p === point) throw new Error(`injected fault at ${p}`);
      };
    }

    it('сбой после первой архивации: журнал подтверждает частичность, повтор дозавершает', async () => {
      const srcIds = [
        await addObject({ title: 'L1' }),
        await addObject({ title: 'L2' }),
        await addObject({ title: 'L3' }),
      ];
      const aggId = await addProposedAggregate(srcIds);

      await expect(applyAggregate(deps(failAfter('archive_source')), aggId, 'user:owner')).rejects.toThrow(
        /injected fault at archive_source/
      );

      // частичный apply подтверждён журналом: один archive_source, memory.aggregated нет
      const steps = await opSteps(aggId);
      expect(steps.map((e) => [e.payload['step'], e.payload['source_id']])).toEqual([['archive_source', srcIds[0]]]);
      expect(await aggregatedEvents()).toHaveLength(0);
      // частичное состояние: первый archived, агрегат ещё proposed
      expect((await ctx.store.get(srcIds[0]))!.status).toBe('archived');
      expect((await ctx.store.get(srcIds[1]))!.status).toBe('active');
      expect((await ctx.store.get(aggId))!.status).toBe('proposed');

      // повтор без сбоя: дозавершает остаток по подтверждённому следу
      const result = await applyAggregate(deps(), aggId, 'user:owner');
      expect(result).toEqual({ activated: true, archived: [srcIds[1], srcIds[2]], skipped: [srcIds[0]], noop: false });
      expect((await ctx.store.get(aggId))!.status).toBe('active');
      for (const id of srcIds) expect((await ctx.store.get(id))!.status).toBe('archived');

      const stepsAfter = await opSteps(aggId);
      expect(stepsAfter.map((e) => e.payload['step'])).toEqual([
        'archive_source',
        'archive_source',
        'archive_source',
        'activate',
      ]);
      expect(await aggregatedEvents()).toHaveLength(1); // одно завершение — одно финальное событие
    });

    it('сбой на activate: агрегат active, финального события нет; повтор дозаписывает финал, не повторяя архивацию', async () => {
      const srcIds = [await addObject({ title: 'L1' }), await addObject({ title: 'L2' })];
      const aggId = await addProposedAggregate(srcIds);
      await expect(applyAggregate(deps(failAfter('activate')), aggId)).rejects.toThrow(/injected fault at activate/);

      // шаг activate завершён ДО сбоя (seam: ошибка после шага): агрегат active
      expect((await ctx.store.get(aggId))!.status).toBe('active');
      for (const id of srcIds) expect((await ctx.store.get(id))!.status).toBe('archived');
      const steps = await opSteps(aggId);
      expect(steps.map((e) => e.payload['step'])).toEqual(['archive_source', 'archive_source', 'activate']);
      expect(await aggregatedEvents()).toHaveLength(0); // след не закрыт

      // повтор: объектных записей не нужно, но незакрытый след дозавершается по журналу
      const result = await applyAggregate(deps(), aggId);
      expect(result).toEqual({ activated: false, archived: [], skipped: srcIds, noop: false });
      expect(await aggregatedEvents()).toHaveLength(1);
      expect(await opSteps(aggId)).toHaveLength(3); // шаги не повторялись
      // идемпотентность: следующий повтор — чистый noop
      const again = await applyAggregate(deps(), aggId);
      expect(again).toEqual({ activated: false, archived: [], skipped: srcIds, noop: true });
      expect(await aggregatedEvents()).toHaveLength(1);
    });

    it('rejected candidate: ничего не архивировано (snapshot до/после идентичен)', async () => {
      const srcIds = [await addObject({ title: 'L1' }), await addObject({ title: 'L2' })];
      const aggId = await addProposedAggregate(srcIds);
      await ctx.store.update(aggId, { status: 'rejected' });

      const before = await snapshot();
      await expect(applyAggregate(deps(), aggId)).rejects.toThrow(UserFacingError);
      await expect(applyAggregate(deps(), aggId)).rejects.toThrow(/rejected.*transition/);

      expectUnchanged(before, await snapshot());
      for (const id of srcIds) expect((await ctx.store.get(id))!.status).toBe('active');
      expect(await opSteps(aggId)).toHaveLength(0);
      expect(await aggregatedEvents()).toHaveLength(0);
    });

    it('исходные evidence остаются доступны после архивации', async () => {
      const srcIds = [await addObject({ title: 'Deploy lesson', body: 'unique evidence body' })];
      const aggId = await addProposedAggregate(srcIds);
      await applyAggregate(deps(), aggId);

      const archived = await ctx.store.get(srcIds[0]);
      expect(archived).not.toBeNull();
      expect(archived!.status).toBe('archived');
      expect(archived!.title).toBe('Deploy lesson');
      expect(archived!.body).toBe('unique evidence body');
    });

    it('missing source при дозавершении не блокирует: skip, не отказ (набор был цел на первом запуске)', async () => {
      const srcIds = [await addObject({ title: 'L1' }), await addObject({ title: 'L2' })];
      const aggId = await addProposedAggregate(srcIds);
      // честный полный apply → агрегат active, след закрыт
      await applyAggregate(deps(), aggId);
      // исходник «воскрешён», затем его файл исчез (сломанный кластер после apply)
      await ctx.store.update(srcIds[1], { status: 'active' });
      rmSync(objectFilePath(srcIds[1]));

      const result = await applyAggregate(deps(), aggId);
      expect(result).toEqual({ activated: false, archived: [], skipped: [srcIds[0], srcIds[1]], noop: true });
      expect(await aggregatedEvents()).toHaveLength(1);
    });
  });
});
