import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { searchMemory } from '../../../src/app/use-cases/search-memory.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { rebuildMemoryIndex } from '../../../src/app/use-cases/rebuild-memory-index.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath, indexPath } from '../../../src/adapters/fs/project-paths.js';

describe('searchMemory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-search-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns objects matching query', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const index = new SQLiteSearchIndex(indexPath(dir));

    await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Router reconnect failure mode',
        body: 'We found that reconnect fails when...',
        createdBy: 'user:test',
        tags: ['router'],
      }
    );

    await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Auth token rotation',
        body: 'Tokens rotate every hour.',
        createdBy: 'user:test',
      }
    );

    await rebuildMemoryIndex({ store, index });

    const results = await searchMemory({ index }, { query: 'reconnect' });
    expect(results).toHaveLength(1);
    expect(results[0].object.title).toBe('Router reconnect failure mode');
  });

  it('does not auto-rebuild index when searching', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const index = new SQLiteSearchIndex(indexPath(dir));

    await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Stale cache invalidation',
        body: 'Cache invalidation is hard.',
        createdBy: 'user:test',
      }
    );

    const results = await searchMemory({ index }, { query: 'cache' });
    expect(results).toHaveLength(0);
  });
});
