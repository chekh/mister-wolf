import { MarkdownMemoryStore } from '../adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../adapters/fs/jsonl-event-log.js';
import { SQLiteSearchIndex } from '../adapters/sqlite/sqlite-search-index.js';
import { SystemClock } from '../adapters/fs/system-clock.js';
import { HashIdGenerator } from '../adapters/fs/hash-id-generator.js';
import { FsProjectInitializer } from '../adapters/fs/fs-project-initializer.js';
import { FsFileSystem } from '../adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../adapters/fs/heuristic-project-scanner.js';
import { eventsPath, indexPath, relationsPath } from '../adapters/fs/project-paths.js';
import { JsonlRelationLog } from '../adapters/fs/jsonl-relation-log.js';

export function createCliContainer(baseDir: string) {
  const fs = new FsFileSystem();
  return {
    store: new MarkdownMemoryStore(baseDir),
    log: new JsonlEventLog(eventsPath(baseDir)),
    index: new SQLiteSearchIndex(indexPath(baseDir)),
    relations: new JsonlRelationLog(relationsPath(baseDir)),
    clock: new SystemClock(),
    idGen: new HashIdGenerator(),
    initializer: new FsProjectInitializer(),
    fs,
    scanner: new HeuristicProjectScanner(fs),
  };
}
