import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
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

  it('excludes brief files from the search index', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const index = new SQLiteSearchIndex(indexPath(dir));

    const briefDir = join(dir, '.wolf', 'memory', 'briefs');
    mkdirSync(briefDir, { recursive: true });
    writeFileSync(
      join(briefDir, 'agent-brief-latest.md'),
      '---\ntitle: Agent Brief\n---\n\nThis brief content must not be indexed.\n',
      'utf-8'
    );

    await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Indexed lesson',
        body: 'This memory object content should be searchable.',
        createdBy: 'user:test',
        tags: ['index'],
      }
    );

    await rebuildMemoryIndex({ store, index });

    const briefResults = await index.search('brief content must not be indexed');
    expect(briefResults).toHaveLength(0);

    const objectResults = await index.search('memory object content should be searchable');
    expect(objectResults).toHaveLength(1);
    expect(objectResults[0].object.title).toBe('Indexed lesson');
  });
});
