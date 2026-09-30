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
import { ProjectsRegistry } from '../adapters/fs/projects-registry.js';
import { readSchemaVersionSync } from '../adapters/fs/schema-version.js';
import { wolfUserConfigDir } from '../adapters/fs/user-config.js';
import { existsSync } from 'fs';
import { join } from 'path';

/** Все декларации (core + project) из config.yaml; при ошибке загрузки — только core. */
function loadDeclarations(baseDir: string): readonly MemoryTypeDeclaration[] {
  try {
    return [...mergeTaxonomy(loadWolfConfigSync(baseDir)).types.values()];
  } catch {
    return CORE_TAXONOMY;
  }
}

/**
 * P331/2.14 §8.2: самолечение реестра — cwd с `.wolf/memory/` и без записи в
 * реестре получает её при любой команде, строящей контейнер (перенос клонированием:
 * реестр — локальный индекс, пересобирается сам). Sync + best-effort: ошибки
 * проглатываем — самолечение не должно ронять команду; изоляция тестов — env
 * (XDG/WOLF_SANDBOX в wolfUserConfigDir).
 */
function selfHealRegistry(baseDir: string): void {
  try {
    if (!existsSync(join(baseDir, '.wolf', 'memory'))) return;
    const version = readSchemaVersionSync(baseDir);
    if (version === null) return; // память без config.yaml — полу-инициализация, её подсветит doctor
    new ProjectsRegistry(wolfUserConfigDir()).registerIfAbsentSync(baseDir, version);
  } catch {
    // best-effort
  }
}

export function createCliContainer(baseDir: string) {
  selfHealRegistry(baseDir);
  const fs = new FsFileSystem();
  // P300/2.14 §5.2: log создаётся раньше store (точка ребейза для P331)
  const log = new JsonlEventLog(eventsPath(baseDir));
  return {
    store: new MarkdownMemoryStore(baseDir, undefined, log),
    log,
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
