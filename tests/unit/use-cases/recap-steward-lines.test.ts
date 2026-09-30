import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateRecap, renderRecap } from '../../../src/app/use-cases/generate-recap.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { recordRelation } from '../../../src/app/use-cases/record-relation.js';

// 2.14 §7.2/§7.4: строки Стюарда в recap (неагрегированные/предложенные);
// фикстуры — прецедент recap-outcome-counter.test.ts
describe('generateRecap stewardAggregation', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let relations: JsonlRelationLog;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-recap-steward-'));
    store = new MarkdownMemoryStore(dir);
    relations = new JsonlRelationLog(relationsPath(dir));
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function mkDeps() {
    return { store, log: new JsonlEventLog(eventsPath(dir)), clock: new SystemClock(), idGen };
  }

  async function addLesson(title: string, createdBy = 'user:test', status?: 'proposed'): Promise<string> {
    const { object } = await addMemoryObject(mkDeps(), {
      type: 'lesson',
      title,
      body: 'lesson body',
      createdBy,
      ...(status ? { status } : {}),
    });
    return object.id;
  }

  it('3 active lessons без рёбер → строки неагрегированных; секция после Контура поправок, до Recent decisions', async () => {
    await addLesson('Lesson one');
    await addLesson('Lesson two');
    await addLesson('Lesson three');

    const report = await generateRecap({ store, relations });

    expect(report.stewardAggregation?.unaggregatedTotal).toBe(3);
    expect(report.stewardAggregation?.unaggregatedMature).toBe(3);
    const text = renderRecap(report);
    expect(text).toContain('неагрегированных уроков: 3 (зрелых: 3)');
    expect(text).toContain('opencode run --agent steward');
    // размещение: после Контура поправок, до Recent decisions (прецедент indexOf)
    expect(text.indexOf('## Стюард: агрегация')).toBeGreaterThan(text.indexOf('## Контур поправок'));
    expect(text.indexOf('## Стюард: агрегация')).toBeLessThan(text.indexOf('## Recent decisions'));
  });

  it('2 свежих урока → строки нет, секции нет', async () => {
    await addLesson('Fresh lesson one');
    await addLesson('Fresh lesson two');

    const report = await generateRecap({ store, relations });

    expect(report.stewardAggregation?.unaggregatedTotal).toBe(2);
    expect(report.stewardAggregation?.unaggregatedMature).toBe(0);
    const text = renderRecap(report);
    expect(text).not.toContain('неагрегированных уроков');
    expect(text).not.toContain('## Стюард: агрегация');
  });

  it('proposed-агрегат с ребром aggregates → предложенных агрегатов: 1; урок исключён, 2 свежих без рёбер не зрелы', async () => {
    const aggregated = await addLesson('Lesson to aggregate');
    await addLesson('Fresh bystander one');
    await addLesson('Fresh bystander two');
    // агрегат — proposed-урок от Стюарда (шаг 1 §7.3); ребро живое → исходник
    // исключён из неагрегированных
    const aggId = await addLesson('Aggregated: lesson cluster', 'agent:steward', 'proposed');
    await recordRelation({ relations, idGen }, new Date(), aggId, 'aggregates', aggregated, 'agent');

    const report = await generateRecap({ store, relations });

    expect(report.stewardAggregation?.proposedAggregates).toBe(1);
    expect(report.stewardAggregation?.unaggregatedTotal).toBe(2);
    expect(report.stewardAggregation?.unaggregatedMature).toBe(0);
    const text = renderRecap(report);
    expect(text).toContain('предложенных агрегатов: 1');
    expect(text).toContain('wolf aggregate apply <id> для подтверждения');
    expect(text).not.toContain('неагрегированных уроков');
  });

  it('relations не передан → stewardAggregation null, секции нет', async () => {
    await addLesson('Lesson one');

    const report = await generateRecap({ store });

    expect(report.stewardAggregation).toBeNull();
    expect(renderRecap(report)).not.toContain('Стюард: агрегация');
  });
});
