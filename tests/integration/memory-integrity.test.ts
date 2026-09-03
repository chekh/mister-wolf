import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../src/app/use-cases/init-project-memory.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { supersedeMemoryObject } from '../../src/app/use-cases/supersede-memory-object.js';
import { runValidate } from '../../src/adapters/cli/commands/memory-validate.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { FsProjectInitializer } from '../../src/adapters/fs/fs-project-initializer.js';
import { eventsPath } from '../../src/adapters/fs/project-paths.js';
import { metricsLogPath } from '../../src/adapters/fs/session-metrics-log.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';

describe('memory integrity: mass write + pressure-integrity секции validate (Ф23 D3.1)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-integrity-'));
    await initProjectMemory(new FsProjectInitializer(), dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps() {
    return {
      store: new MarkdownMemoryStore(dir),
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
    };
  }

  it('(а) массовая запись ~50 объектов: все читаются, validate зелёный', async () => {
    const deps = makeDeps();
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const type = i % 2 === 0 ? 'lesson' : 'decision';
      const { object } = await addMemoryObject(deps, {
        type,
        title: `Объект №${i}`,
        body: `тело объекта ${i}`,
        createdBy: i % 5 === 0 ? 'agent:steward' : 'user:cli',
        tags: ['integrity'],
      });
      ids.push(object.id);
    }
    expect((await deps.store.list()).length).toBeGreaterThanOrEqual(50);
    for (const id of ids) {
      expect(await deps.store.get(id)).not.toBeNull();
    }
    const result = await runValidate(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toBe(0);
  });

  it('(б) supersede-цепочка: битый superseded_by → ошибка validate', async () => {
    const deps = makeDeps();
    const objs: MemoryObject[] = [];
    for (const title of ['A', 'B', 'C']) {
      const { object } = await addMemoryObject(deps, {
        type: 'lesson',
        title: `Урок ${title}`,
        body: `содержание ${title}`,
        createdBy: 'user:cli',
      });
      objs.push(object);
    }
    const [a, b, c] = objs;
    await supersedeMemoryObject(deps, a.id, b.id);
    await supersedeMemoryObject(deps, b.id, c.id);
    expect((await runValidate(dir)).ok).toBe(true);

    // порча: указатель в никуда
    await deps.store.update(a.id, { superseded_by: 'mem_20990101_ghost_deadbe' } as Partial<MemoryObject>);
    const broken = await runValidate(dir);
    expect(broken.ok).toBe(false);
    const section = broken.sections.find((s) => s.name === 'supersede');
    expect(section?.errors.length).toBeGreaterThan(0);
    expect(section?.errors[0]).toContain('non-existent id');
  });

  it('(б2) цикл A→B→A в цепочке supersede → ошибка validate', async () => {
    const deps = makeDeps();
    const objs: MemoryObject[] = [];
    for (const title of ['A', 'B']) {
      const { object } = await addMemoryObject(deps, {
        type: 'lesson',
        title: `Урок ${title}`,
        body: `содержание ${title}`,
        createdBy: 'user:cli',
      });
      objs.push(object);
    }
    const [a, b] = objs;
    await deps.store.update(a.id, { superseded_by: b.id } as Partial<MemoryObject>);
    await deps.store.update(b.id, { superseded_by: a.id } as Partial<MemoryObject>);
    const result = await runValidate(dir);
    expect(result.ok).toBe(false);
    const section = result.sections.find((s) => s.name === 'supersede');
    expect(section?.errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('(в) битая строка в session-metrics.jsonl → ошибка секции signal log', async () => {
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
    appendFileSync(metricsLogPath(dir), '{"event":"run","ok":1}\n{битая строка\n');
    const result = await runValidate(dir);
    expect(result.ok).toBe(false);
    const section = result.sections.find((s) => s.name === 'signal log');
    expect(section?.errors.length).toBeGreaterThan(0);
  });
});
