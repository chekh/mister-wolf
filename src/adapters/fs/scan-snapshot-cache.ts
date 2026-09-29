import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';
import { cacheDir } from './project-paths.js';
import { writeFileAtomic } from './markdown-memory-store.js';

/** Формат персистного кэша скана (P105/спека A5): {sig, snapshot, object, documents}. */
export interface ScanSnapshotEntry {
  sig: string;
  object: MemoryObject;
  snapshot: ProjectSnapshot;
  documents: MemoryObject[];
}

/**
 * Персистный snapshot-кэш скана: `.wolf/cache/scan-snapshot.json`.
 * Замена module-level кэша T013 (бесполезен в одноразовом CLI-процессе).
 * Read-контракт: отсутствующий/битый файл → null (штатный полный скан), без throw.
 */
export class FsScanSnapshotCache {
  constructor(private readonly filePath: string) {}

  async read(): Promise<ScanSnapshotEntry | null> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf-8')) as Partial<ScanSnapshotEntry>;
      if (typeof parsed.sig !== 'string' || !parsed.object || !parsed.snapshot || !Array.isArray(parsed.documents)) {
        return null;
      }
      return parsed as ScanSnapshotEntry;
    } catch {
      return null;
    }
  }

  async write(entry: ScanSnapshotEntry): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await writeFileAtomic(this.filePath, JSON.stringify(entry));
  }
}

/** Кэш для проекта с корнем baseDir (файл `.wolf/cache/scan-snapshot.json`). */
export function openScanSnapshotCache(baseDir: string): FsScanSnapshotCache {
  return new FsScanSnapshotCache(join(cacheDir(baseDir), 'scan-snapshot.json'));
}
