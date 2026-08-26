import { MarkdownMemoryStore } from '../adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../adapters/fs/jsonl-event-log.js';
import { SQLiteSearchIndex } from '../adapters/sqlite/sqlite-search-index.js';
import { SystemClock } from '../adapters/fs/system-clock.js';
import { HashIdGenerator } from '../adapters/fs/hash-id-generator.js';
import { FsProjectInitializer } from '../adapters/fs/fs-project-initializer.js';
import { FsFileSystem } from '../adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../adapters/fs/heuristic-project-scanner.js';
import { eventsPath, indexPath, relationsPath, memoryDir } from '../adapters/fs/project-paths.js';
import { JsonlRelationLog } from '../adapters/fs/jsonl-relation-log.js';
import { FsMemoryLock } from '../adapters/fs/memory-lock.js';
import { loadWolfConfigSync } from '../adapters/fs/config-file.js';
import { mergeTaxonomy } from '../domain/taxonomy.js';
import { CORE_TAXONOMY, type MemoryTypeDeclaration } from '../domain/memory-types.js';

/** Все декларации (core + project) из config.yaml; при ошибке загрузки — только core. */
function loadDeclarations(baseDir: string): readonly MemoryTypeDeclaration[] {
  try {
    return [...mergeTaxonomy(loadWolfConfigSync(baseDir)).types.values()];
  } catch {
    return CORE_TAXONOMY;
  }
}

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
    lock: new FsMemoryLock(memoryDir(baseDir)),
    declarations: loadDeclarations(baseDir),
  };
}
