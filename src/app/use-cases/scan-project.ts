import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { ProjectScanner } from '../../ports/project-scanner.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';
import { governanceDefaults } from '../../domain/governance.js';
import { documentRefId, withTieBreak } from '../../adapters/fs/document-id.js';

export interface ScanProjectResult {
  object: MemoryObject;
  snapshot: ProjectSnapshot;
  documents: MemoryObject[];
}

/** Запись персистного кэша скана: сигнатура дерева + результат скана (P105). */
export type ScanSnapshotEntry = { sig: string } & ScanProjectResult;

/**
 * Персистный кэш скана (P105, спека A5). Реализация — см.
 * src/adapters/fs/scan-snapshot-cache.ts (`.wolf/cache/scan-snapshot.json`);
 * портовский тип структурно совместим с адаптером.
 */
export interface ScanSnapshotCache {
  read(): Promise<ScanSnapshotEntry | null>;
  write(entry: ScanSnapshotEntry): Promise<void>;
}

/**
 * Кэш скана по сигнатуре дерева (T013 → P105: кэш персистный). sig совпал →
 * результат из кэша без обхода дерева и побочных эффектов; не совпал →
 * полный scanProject (diff-before-save внутри) и перезапись кэша.
 * treeSignature отсутствует → всегда полный скан (обратная совместимость портов
 * в тестах); snapshotCache отсутствует → скан без кэширования.
 * Инвалидация — см. projectTreeSignature в heuristic-project-scanner.ts:
 * dir mtime (добавление/удаление/переименование файлов), package.json, .git/HEAD;
 * контентные правки существующих файлов НЕ инвалидируют (brief не зависит от
 * содержимого файлов).
 */
export async function scanProjectCached(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    scanner: ProjectScanner;
    index?: SearchIndex;
    lock?: MemoryLock;
    treeSignature?: (root: string) => Promise<string>;
    snapshotCache?: ScanSnapshotCache;
  },
  root: string
): Promise<ScanProjectResult> {
  if (!deps.treeSignature) return scanProject(deps, root);
  const sig = await deps.treeSignature(root);
  const cache = deps.snapshotCache;
  if (cache) {
    const hit = await cache.read();
    if (hit && hit.sig === sig) return { object: hit.object, snapshot: hit.snapshot, documents: hit.documents };
  }
  // P105: запись кэша — под lock скана (хук выполняется внутри run)
  const persist = cache
    ? async (result: ScanProjectResult): Promise<void> => cache.write({ ...result, sig })
    : undefined;
  return scanProject(deps, root, persist);
}

export async function scanProject(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    scanner: ProjectScanner;
    index?: SearchIndex;
    lock?: MemoryLock;
  },
  root: string,
  afterScan?: (result: ScanProjectResult) => Promise<void>
): Promise<ScanProjectResult> {
  const run = async (): Promise<ScanProjectResult> => {
    const snapshot = await deps.scanner.scan(root);
    const now = deps.clock.now();
    const actor = 'agent:mr-wolf';

    const object = await upsertScanObject(deps, snapshot, now, actor);
    const documents = await registerDocuments(deps, snapshot, now, actor);

    const result = { object, snapshot, documents };
    if (afterScan) await afterScan(result);
    return result;
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}

const SCAN_OBJECT_ID = 'project-scan-latest';

/**
 * Scan-объект project-scan-latest с diff-before-save (P105): title+body
 * (renderScanBody детерминирован) не изменились → ни save, ни event, ни index;
 * возвращается existing, updated_at не тикает.
 */
async function upsertScanObject(
  deps: {
    store: MemoryStore;
    log: EventLog;
    idGen: IdGenerator;
    index?: SearchIndex;
  },
  snapshot: ProjectSnapshot,
  now: Date,
  actor: string
): Promise<MemoryObject> {
  const title = `Project scan for ${snapshot.projectName}`;
  const body = renderScanBody(snapshot);
  const existing = await deps.store.get(SCAN_OBJECT_ID);
  if (existing && existing.title === title && existing.body === body) return existing;

  const defaults = governanceDefaults(actor);
  const object: MemoryObject = {
    id: SCAN_OBJECT_ID,
    type: 'context',
    title,
    body,
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.7,
    created_at: existing?.created_at ?? now.toISOString(),
    updated_at: now.toISOString(),
    created_by: actor,
    schema_version: 1,
    source: { kind: 'scan', path: snapshot.root },
    related: { files: [], docs: [], decisions: [] },
    tags: ['scan'],
    superseded_by: null,
    memory_class: defaults.memory_class,
    truth_role: defaults.truth_role,
    lifetime: defaults.lifetime,
  };
  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: existing ? 'memory.scan.updated' : 'memory.added',
    timestamp: now.toISOString(),
    actor,
    payload: { memory_id: object.id, type: object.type },
  });
  if (deps.index) {
    await deps.index.indexObject(object);
  }
  return object;
}

async function registerDocuments(
  deps: {
    store: MemoryStore;
    log: EventLog;
    idGen: IdGenerator;
    index?: SearchIndex;
  },
  snapshot: ProjectSnapshot,
  now: Date,
  actor: string
): Promise<MemoryObject[]> {
  const results: MemoryObject[] = [];
  const defaults = governanceDefaults(actor);
  // Канон id document-ref (спека 2.1.0 §2.1 F9): существующие ищем по source.path
  // (один list), занятость id — Set всех id памяти (второй list, без фильтра).
  const existingByPath = new Map<string, MemoryObject>();
  for (const ref of await deps.store.list({ type: 'document-ref' })) {
    if (ref.source?.path) existingByPath.set(ref.source.path, ref);
  }
  const takenIds = new Set((await deps.store.list()).map((o) => o.id));
  for (const doc of snapshot.docs) {
    const existing = existingByPath.get(doc.path);
    const createdAt = existing?.created_at ?? now.toISOString();
    // P105 diff-before-save: title/path/created_at не изменились → ни save, ни
    // event, ни index; возвращается existing, updated_at не тикает.
    if (
      existing &&
      existing.title === doc.title &&
      existing.source?.path === doc.path &&
      existing.created_at === createdAt
    ) {
      results.push(existing);
      continue;
    }
    // Скан не мигрирует (§2.1): у существующего объекта id сохраняется как есть
    // (даже легаси doc_*); канонический id — только для новых объектов.
    const id = existing ? existing.id : withTieBreak(documentRefId(doc.path, now.toISOString()), takenIds);
    takenIds.add(id);
    const object: MemoryObject = {
      id,
      type: 'document-ref',
      title: doc.title,
      body: `Registered project document: ${doc.path}`,
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.6,
      created_at: createdAt,
      updated_at: now.toISOString(),
      created_by: existing?.created_by ?? actor,
      schema_version: 1,
      source: { kind: 'scan', path: doc.path },
      related: { files: [], docs: [doc.path], decisions: [] },
      tags: ['document'],
      superseded_by: null,
      memory_class: defaults.memory_class,
      truth_role: defaults.truth_role,
      lifetime: defaults.lifetime,
    };
    await deps.store.save(object);
    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      type: existing ? 'memory.scan.updated' : 'memory.added',
      timestamp: now.toISOString(),
      actor,
      payload: { memory_id: object.id, type: object.type },
    });
    if (deps.index) {
      await deps.index.indexObject(object);
    }
    results.push(object);
  }
  return results;
}

export function renderScanBody(snapshot: ProjectSnapshot): string {
  const optionalLine = (label: string, value: string | undefined) => (value ? `- ${label}: ${value}\n` : '');

  const list = (items: string[]) => (items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none');

  const fileRows = snapshot.files.map((file) => `| ${file.path} | ${file.extension ?? ''} | ${file.size} |`).join('\n');

  return `# Project Scan: ${snapshot.projectName}\n\n## Repository\n\n- Root: ${snapshot.root}\n- Project name: ${snapshot.projectName}\n${optionalLine('Branch', snapshot.branch)}${optionalLine('Commit', snapshot.commit)}## Summary\n\n### Languages\n\n${list(snapshot.summary.languages)}\n\n### Entry points\n\n${list(snapshot.summary.entryPoints)}\n\n### Config files\n\n${list(snapshot.summary.configFiles)}\n\n### Dependencies\n\n${list(snapshot.summary.dependencies)}\n\n### Top-level directories\n\n${list(snapshot.summary.topLevelDirectories)}\n\n### File count\n\n- ${snapshot.summary.fileCount}\n\n## Files\n\n| Path | Extension | Size |\n|---|---|---|\n${fileRows}\n`;
}
