import { MarkdownMemoryStore } from '../adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../adapters/fs/jsonl-event-log.js';
import { SQLiteSearchIndex } from '../adapters/sqlite/sqlite-search-index.js';
import { SystemClock } from '../adapters/fs/system-clock.js';
import { HashIdGenerator } from '../adapters/fs/hash-id-generator.js';
import { FsProjectInitializer } from '../adapters/fs/fs-project-initializer.js';
import { eventsPath, indexPath } from '../adapters/fs/project-paths.js';

export function createCliContainer(baseDir: string) {
  return {
    store: new MarkdownMemoryStore(baseDir),
    log: new JsonlEventLog(eventsPath(baseDir)),
    index: new SQLiteSearchIndex(indexPath(baseDir)),
    clock: new SystemClock(),
    idGen: new HashIdGenerator(),
    initializer: new FsProjectInitializer(),
  };
}
