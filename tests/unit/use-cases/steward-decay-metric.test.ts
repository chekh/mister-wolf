import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { recordRelation } from '../../../src/app/use-cases/record-relation.js';
import { buildAnalyticsReport } from '../../../src/app/use-cases/build-analytics.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
import type { Clock } from '../../../src/ports/clock.port.js';

// 2.14 §7.4 (метрика Т5): затухание класса после агрегации — steward.aggregationDecay.
// События пишутся напрямую в event-log с рукописными timestamp (якорь/окна
// anchor±7д детерминированы); объекты создаются отдельным fixed-clock ВНЕ обоих
// окон (их собственные memory.added не попадают в счётчики), важны только теги.
describe('steward aggregationDecay (2.14 §7.4)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let relations: JsonlRelationLog;
  let idGen: HashIdGenerator;
  let evSeq: number;

  const t0 = '2026-09-20T12:00:00.000Z';
  const day = 86_400_000;
  const at = (offsetMs: number): string => new Date(Date.parse(t0) + offsetMs).toISOString();
  // объекты — 2026-10-05 (t0+15д: вне окон до/после), отчёт — 2026-10-06
  const objClock: Clock = { now: () => new Date('2026-10-05T00:00:00Z') };
  const reportClock: Clock = { now: () => new Date('2026-10-06T00:00:00Z') };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-decay-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    relations = new JsonlRelationLog(relationsPath(dir));
    idGen = new HashIdGenerator();
    evSeq = 0;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function addLesson(title: string, tags: string[], status?: string): Promise<string> {
    const { object } = await addMemoryObject(
      { store, log, clock: objClock, idGen },
      {
        type: 'lesson',
        title,
        body: 'b',
        createdBy: 'user:test',
        tags,
        ...(status !== undefined ? { extra: { status } } : {}),
      }
    );
    return object.id;
  }

  /** Рукописное memory.added с фиксированным ts — материал окон before/after. */
  async function seedAdded(memoryId: string, type: 'lesson' | 'complaint', ts: string, tags?: string[]): Promise<void> {
    await log.append({
      id: `ev-seed-${evSeq++}`,
      type: 'memory.added',
      timestamp: ts,
      actor: 'user:test',
      payload: { memory_id: memoryId, type, ...(tags !== undefined ? { tags } : {}) },
    } satisfies MemoryEvent);
  }

  async function seedAggregated(aggregateId: string, sourceIds: string[], ts: string): Promise<void> {
    await log.append({
      id: `ev-seed-${evSeq++}`,
      type: 'memory.aggregated',
      timestamp: ts,
      actor: 'user:test',
      payload: { aggregate_id: aggregateId, source_ids: sourceIds },
    } satisfies MemoryEvent);
  }

  /** База: 3 исходника deploy (t0−1д), complaint того же класса (t0−2д),
   * active-агрегат deploy с рёбрами aggregates ×3 и якорем t0. */
  async function seedBase(): Promise<{ aggId: string; srcIds: string[] }> {
    const srcIds = [
      await addLesson('Deploy pain 1', ['deploy']),
      await addLesson('Deploy pain 2', ['deploy']),
      await addLesson('Deploy pain 3', ['deploy']),
    ];
    for (const [i, src] of srcIds.entries()) {
      await seedAdded(src, 'lesson', at(-day + i * 1000), ['deploy']);
    }
    await seedAdded('mem_complaint_seed', 'complaint', at(-2 * day), ['deploy', 'other']);

    const aggId = await addLesson('Agg', ['deploy']);
    for (const src of srcIds) {
      await recordRelation({ relations, idGen }, new Date('2026-10-05T00:00:00Z'), aggId, 'aggregates', src, 'agent');
    }
    await seedAggregated(aggId, srcIds, t0);
    return { aggId, srcIds };
  }

  async function decay() {
    const report = await buildAnalyticsReport(
      { store, log, relations, clock: reportClock },
      { signals: [], runLogText: null }
    );
    return report.steward.aggregationDecay;
  }

  it('fresh aggregate: correct before, zeros after (§11.3)', async () => {
    const { aggId } = await seedBase();
    // урок того же класса через 8 дней — вне окна «после», не считается
    const late = await addLesson('Late deploy', ['deploy']);
    await seedAdded(late, 'lesson', at(8 * day), ['deploy']);

    await expect(decay()).resolves.toEqual([
      { aggregateId: aggId, sources: 3, lessonsBefore: 3, lessonsAfter: 0, complaintsBefore: 1, complaintsAfter: 0 },
    ]);
  });

  it('tag intersection: >=1 shared tag counts; unrelated/no-tags skip; lesson after anchor', async () => {
    const { aggId } = await seedBase();
    const related = await addLesson('Partial overlap', ['ci']);
    await seedAdded(related, 'lesson', at(-3 * day), ['ci', 'deploy']); // 1 общий тег — считается
    const alien = await addLesson('Alien', ['unrelated']);
    await seedAdded(alien, 'lesson', at(-day), ['unrelated']); // нет общих тегов — мимо
    await seedAdded('mem_complaint_notags', 'complaint', at(-day)); // без tags в payload — мимо
    const repeat = await addLesson('Repeat deploy', ['deploy']);
    await seedAdded(repeat, 'lesson', at(day), ['deploy']); // окно «после»

    await expect(decay()).resolves.toEqual([
      { aggregateId: aggId, sources: 3, lessonsBefore: 4, lessonsAfter: 1, complaintsBefore: 1, complaintsAfter: 0 },
    ]);
  });

  it('dose-completion: anchor = FIRST memory.aggregated, single window', async () => {
    const { aggId, srcIds } = await seedBase();
    await seedAggregated(aggId, srcIds, at(3_600_000)); // дозавершение через час — якорь остаётся t0
    const between = await addLesson('Between', ['deploy']);
    // t0+30м: после при anchor=t0, но ДО при ошибочном anchor=t0+1ч — различитель
    await seedAdded(between, 'lesson', at(1_800_000), ['deploy']);

    const rows = await decay();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ aggregateId: aggId, lessonsBefore: 3, lessonsAfter: 1 });
  });

  it('proposed without event / active lesson without event stay out of the table', async () => {
    const { aggId } = await seedBase();
    // proposed-агрегат с рёбрами, но без memory.aggregated (неприменённый)
    const proposed = await addLesson('Unapplied', ['deploy'], 'proposed');
    await recordRelation(
      { relations, idGen },
      new Date('2026-10-05T00:00:00Z'),
      proposed,
      'aggregates',
      'mem_src_ghost',
      'agent'
    );
    // active-урок без события агрегации — не агрегат
    await addLesson('Just a lesson', ['deploy']);

    const rows = await decay();
    expect(rows.map((r) => r.aggregateId)).toEqual([aggId]);
  });
});
