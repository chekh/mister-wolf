import { describe, it, expect, afterAll } from 'vitest';
import { rmSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpProject } from './helpers.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../src/adapters/fs/project-paths.js';

// P300/2.14 §11.1: in-process (НЕ spawn-CLI) — коллизия в отдельном процессе
// недетерминирована по мс; фиксированный clock делает id детерминированным.
const fixedClock = { now: () => new Date('2026-09-30T12:00:00.000Z') };

function findMemoryFile(dir: string): string | null {
  const walk = (d: string): string | null => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (entry.name.endsWith('.md')) return full;
    }
    return null;
  };
  try {
    return walk(join(dir, '.wolf', 'memory'));
  } catch {
    return null;
  }
}

describe('add collision guard e2e (P300/2.14 §11.1)', () => {
  const cwd = tmpProject();
  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('полный живой путь: guard срабатывает, файл и лог не затронуты', async () => {
    const store = new MarkdownMemoryStore(cwd);
    const log = new JsonlEventLog(eventsPath(cwd));
    const deps = {
      store,
      log,
      clock: fixedClock,
      idGen: new HashIdGenerator(),
      lock: new FsMemoryLock(memoryDir(cwd)),
    };

    // (1) первый add — ок
    const { object } = await addMemoryObject(deps, {
      type: 'decision',
      title: 'Release 2.14 plan',
      body: 'plan body',
      createdBy: 'user:test',
    });
    expect(object.id).toMatch(/^mem_/);

    // (2) содержимое файла до второй попытки
    const file = findMemoryFile(cwd);
    expect(file).not.toBeNull();
    const before = readFileSync(file!, 'utf-8');

    // (3) второй add того же title → отказ с подсказкой
    let err: unknown;
    await addMemoryObject(deps, {
      type: 'decision',
      title: 'Release 2.14 plan',
      body: 'another body',
      createdBy: 'user:test',
    }).catch((e) => {
      err = e;
    });
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/already exists/);
    expect(msg).toContain('wolf edit');
    expect(msg).toContain('wolf supersede');
    expect(msg).toContain('--title');

    // (4) один объект
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(object.id);

    // (5) файл неизменен
    expect(readFileSync(file!, 'utf-8')).toBe(before);

    // (6) ровно один memory.added
    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
    expect(events[0].payload.memory_id).toBe(object.id);
  });
});
