import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../src/app/use-cases/init-project-memory.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { searchMemory } from '../../src/app/use-cases/search-memory.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { FsProjectInitializer } from '../../src/adapters/fs/fs-project-initializer.js';
import { eventsPath, indexPath } from '../../src/adapters/fs/project-paths.js';

describe('Incremental indexing', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-incr-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('indexes a new object immediately without rebuild-index', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);

    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const index = new SQLiteSearchIndex(indexPath(dir));

    const { object } = await addMemoryObject(
      { store, log, clock, idGen, index },
      {
        type: 'lesson',
        title: 'Incremental indexing works',
        body: 'New objects should be searchable right after add.',
        createdBy: 'user:test',
        tags: ['indexing'],
      }
    );

    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'lessons', `${object.id}.md`))).toBe(true);

    const results = await searchMemory({ index }, { query: 'searchable right after add' });
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe(object.id);
  });
});
