import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { recordRelation } from '../../../src/app/use-cases/record-relation.js';
import { applyAggregate } from '../../../src/app/use-cases/apply-aggregate.js';
import { UserFacingError } from '../../../src/domain/errors.js';

// 2.14 §7.3: applyAggregate — активация proposed-агрегата, архивация
// исходников, событие memory.aggregated, идемпотентность/дозавершение.
describe('applyAggregate', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let relations: JsonlRelationLog;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-apply-agg-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    relations = new JsonlRelationLog(relationsPath(dir));
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function mkDeps() {
    return { store, log, relations, idGen, clock: new SystemClock() };
  }

  async function addLesson(title: string, createdBy: string = 'user:test'): Promise<string> {
    const { object } = await addMemoryObject(mkDeps(), {
      type: 'lesson',
      title,
      body: 'body text',
      createdBy,
      extra: { trigger_keywords: ['deploy'] },
    });
    return object.id;
  }

  async function addProposedAggregate(sourceIds: string[]): Promise<string> {
    const { object } = await addMemoryObject(mkDeps(), {
      type: 'lesson',
      title: 'Aggregated deploy lessons',
      body: '## Было …',
      createdBy: 'agent:steward',
      extra: { status: 'proposed', trigger_keywords: ['deploy'] },
    });
    for (const src of sourceIds) {
      await recordRelation({ relations, idGen }, new Date(), object.id, 'aggregates', src, 'agent');
    }
    return object.id;
  }

  async function aggregatedEvents() {
    return (await log.readAll()).filter((e) => e.type === 'memory.aggregated');
  }

  it('happy path: proposed → active, sources archived, one memory.aggregated event', async () => {
    const srcIds = [await addLesson('L1'), await addLesson('L2'), await addLesson('L3')];
    const aggId = await addProposedAggregate(srcIds);

    const result = await applyAggregate(mkDeps(), aggId, 'user:test');

    expect(result).toEqual({ activated: true, archived: srcIds, skipped: [], noop: false });
    expect((await store.get(aggId))?.status).toBe('active');
    for (const src of srcIds) {
      expect((await store.get(src))?.status).toBe('archived');
    }
    const events = await aggregatedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe('user:test');
    expect(events[0].payload).toEqual({ aggregate_id: aggId, source_ids: srcIds });
  });

  it('idempotency: repeat apply on fully applied aggregate is a no-op without new events', async () => {
    const srcIds = [await addLesson('L1'), await addLesson('L2'), await addLesson('L3')];
    const aggId = await addProposedAggregate(srcIds);
    await applyAggregate(mkDeps(), aggId);

    const result = await applyAggregate(mkDeps(), aggId);

    expect(result).toEqual({ activated: false, archived: [], skipped: srcIds, noop: true });
    expect(await aggregatedEvents()).toHaveLength(1);
    expect((await store.get(aggId))?.status).toBe('active');
  });

  it('dose-completion: source resurrected to active is re-archived, aggregate stays active', async () => {
    const srcIds = [await addLesson('L1'), await addLesson('L2'), await addLesson('L3')];
    const aggId = await addProposedAggregate(srcIds);
    await applyAggregate(mkDeps(), aggId);
    // симуляция частичного сбоя: один исходник вновь active
    await store.update(srcIds[1], { status: 'active' });

    const result = await applyAggregate(mkDeps(), aggId);

    expect(result).toEqual({ activated: false, archived: [srcIds[1]], skipped: [srcIds[0], srcIds[2]], noop: false });
    expect((await store.get(srcIds[1]))?.status).toBe('archived');
    expect((await store.get(aggId))?.status).toBe('active');
    // по одному событию на «рабочий» запуск
    expect(await aggregatedEvents()).toHaveLength(2);
  });

  it('not found → UserFacingError', async () => {
    await expect(applyAggregate(mkDeps(), 'mem_missing')).rejects.toThrow(UserFacingError);
    await expect(applyAggregate(mkDeps(), 'mem_missing')).rejects.toThrow('Memory object not found: mem_missing');
  });

  it('rejected aggregate → UserFacingError (refusal goes through transition, not apply)', async () => {
    const aggId = await addProposedAggregate([await addLesson('L1')]);
    await store.update(aggId, { status: 'rejected' });

    await expect(applyAggregate(mkDeps(), aggId)).rejects.toThrow(UserFacingError);
    await expect(applyAggregate(mkDeps(), aggId)).rejects.toThrow(/rejected.*transition mem_\S+ rejected|transition/);
  });

  it('aggregate without sources: activates with empty source_ids event', async () => {
    const aggId = await addProposedAggregate([]);

    const result = await applyAggregate(mkDeps(), aggId);

    expect(result).toEqual({ activated: true, archived: [], skipped: [], noop: false });
    expect((await store.get(aggId))?.status).toBe('active');
    const events = await aggregatedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ aggregate_id: aggId, source_ids: [] });
  });
});
