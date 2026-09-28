import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeObject(id: string, title = 'Test'): MemoryObject {
  return {
    id,
    type: 'lesson',
    title,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: [],
    superseded_by: null,
    body: 'Body text.',
  };
}

function toFileContent(obj: MemoryObject): string {
  const { body, ...fm } = obj;
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`;
}

/** Путь, куда store раскладывает lesson-объекты без thread. */
function sharedLessonPath(dir: string, id: string): string {
  return join(dir, '.wolf/memory/shared/lessons', `${id}.md`);
}

function writeExternal(path: string, obj: MemoryObject): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, toFileContent(obj), 'utf-8');
}

describe('MarkdownMemoryStore parse-кэш (T013)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-memcache-'));
    store = new MarkdownMemoryStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('сохранить 3 объекта → list() видит все', async () => {
    for (const id of ['mem_c1', 'mem_c2', 'mem_c3']) {
      await store.save(makeObject(id));
    }
    expect((await store.list()).map((o) => o.id).sort()).toEqual(['mem_c1', 'mem_c2', 'mem_c3']);
  });

  it('внешний новый файл → list() видит новый и старые', async () => {
    await store.save(makeObject('mem_c1'));
    expect(await store.list()); // прогрев кэша
    writeExternal(sharedLessonPath(dir, 'mem_c_ext'), makeObject('mem_c_ext'));
    const ids = (await store.list()).map((o) => o.id).sort();
    expect(ids).toEqual(['mem_c1', 'mem_c_ext']);
  });

  it('внешняя правка существующего файла → list() отдаёт обновлённое', async () => {
    await store.save(makeObject('mem_c1', 'Old title'));
    expect((await store.list()).find((o) => o.id === 'mem_c1')?.title).toBe('Old title'); // прогрев
    // другой размер гарантирует инвалидацию независимо от разрешения mtime
    writeExternal(sharedLessonPath(dir, 'mem_c1'), makeObject('mem_c1', 'New longer title'));
    expect((await store.list()).find((o) => o.id === 'mem_c1')?.title).toBe('New longer title');
  });

  it('внешнее удаление → list() не отдаёт', async () => {
    await store.save(makeObject('mem_c1', 'Keep'));
    await store.save(makeObject('mem_c2', 'Delete'));
    expect(await store.list()); // прогрев
    unlinkSync(sharedLessonPath(dir, 'mem_c2'));
    const ids = (await store.list()).map((o) => o.id);
    expect(ids).toEqual(['mem_c1']);
  });

  it('store.save → немедленный get/list видит новое', async () => {
    await store.save(makeObject('mem_c1', 'First version of title'));
    expect(await store.list()); // прогрев кэша старой версии
    const updated = makeObject('mem_c1', 'Second version of title, longer');
    await store.save(updated);
    expect((await store.get('mem_c1'))?.title).toBe('Second version of title, longer');
    expect((await store.list()).find((o) => o.id === 'mem_c1')?.title).toBe('Second version of title, longer');
  });
});
