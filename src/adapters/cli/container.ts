import { MarkdownMemoryStore } from '../fs/markdown-memory-store.js';
import { JsonlEventLog } from '../fs/jsonl-event-log.js';
import { SQLiteSearchIndex } from '../fs/sqlite-search-index.js';
import { SystemClock } from '../fs/system-clock.js';
import { HashIdGenerator } from '../fs/hash-id-generator.js';
import { FsProjectInitializer } from '../fs/fs-project-initializer.js';
import { eventsPath, indexPath } from '../fs/project-paths.js';

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
