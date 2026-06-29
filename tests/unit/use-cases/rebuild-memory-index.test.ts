import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { rebuildMemoryIndex } from '../../../src/app/use-cases/rebuild-memory-index.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath, indexPath } from '../../../src/adapters/fs/project-paths.js';

describe('rebuildMemoryIndex', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-rebuild-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('indexes existing memory objects for search', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const index = new SQLiteSearchIndex(indexPath(dir));

    await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Stale index behavior',
        body: 'Searching before rebuild should not return results.',
        createdBy: 'user:test',
        tags: ['index'],
      }
    );

    await rebuildMemoryIndex({ store, index });

    const results = await index.search('rebuild');
    expect(results).toHaveLength(1);
    expect(results[0].object.title).toBe('Stale index behavior');
  });
});
