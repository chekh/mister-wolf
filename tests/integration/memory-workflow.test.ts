import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
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
import { rebuildMemoryIndex } from '../../src/app/use-cases/rebuild-memory-index.js';
import { FsProjectInitializer } from '../../src/adapters/fs/fs-project-initializer.js';
import { eventsPath, indexPath } from '../../src/adapters/fs/project-paths.js';

describe('Memory workflow', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-e2e-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('initializes, adds a lesson, rebuilds index, and searches', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    expect(existsSync(join(dir, '.wolf', 'memory', 'shared'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'memory', 'threads'))).toBe(true);

    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Avoid mutable shared state',
        body: 'Shared mutable state caused the router bug.',
        createdBy: 'user:test',
        tags: ['architecture'],
      }
    );

    expect(existsSync(join(dir, '.wolf', 'memory', 'shared', 'lessons', `${object.id}.md`))).toBe(true);

    const index = new SQLiteSearchIndex(indexPath(dir));
    await rebuildMemoryIndex({ store, index });

    const results = await searchMemory({ index }, { query: 'mutable shared state' });
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe(object.id);

    const eventLog = readFileSync(eventsPath(dir), 'utf-8');
    expect(eventLog).toContain('memory.added');
  });
});
