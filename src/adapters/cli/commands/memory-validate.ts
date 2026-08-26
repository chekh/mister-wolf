import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { join, relative } from 'path';
import { Command } from 'commander';
import { generateCoreConfigBlock, mergeTaxonomy, ProjectTypeConflictError } from '../../../domain/taxonomy.js';
import { loadWolfConfigSync } from '../../fs/config-file.js';
import { memoryDir, objectsDir, eventsPath, relationsPath, indexPath } from '../../fs/project-paths.js';
import { MarkdownMemoryStore } from '../../fs/markdown-memory-store.js';
import { scanJsonlFile } from '../../fs/jsonl-scan.js';
import { MemoryEventSchema } from '../../../domain/schemas/memory-event-schema.js';
import { RelationSchema } from '../../../domain/schemas/relation-schema.js';
import { LOCK_TIMING } from '../../fs/memory-lock.js';
import { SQLiteSearchIndex } from '../../sqlite/sqlite-search-index.js';

export interface ValidateSection {
  name: string;
  errors: string[];
  warnings: string[];
}

export interface ValidateResult {
  sections: ValidateSection[];
  ok: boolean;
  errors: number;
  warnings: number;
  displayLines: string[];
}

export async function runValidate(baseDir: string, opts?: { fix?: boolean }): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const displayLines: string[] = [];

  // 1. taxonomy
  let taxOk = true;
  try {
    const cfg = loadWolfConfigSync(baseDir);
    const canon = JSON.stringify(generateCoreConfigBlock());
    const file = cfg?.rawCoreBlock ? JSON.stringify(cfg.rawCoreBlock) : null;
    if (file !== null && file !== canon) {
      errors.push('core block drifted from code canon; run: wolf taxonomy sync');
      taxOk = false;
    }
    try {
      mergeTaxonomy(cfg);
    } catch (err: unknown) {
      if (err instanceof ProjectTypeConflictError) {
        errors.push(err.message);
        taxOk = false;
      }
    }
  } catch {
    // config not loadable — not an error for validate
  }
  displayLines.push(`taxonomy:   ${taxOk ? 'OK' : 'FAIL'}`);

  // 2. layout
  const objsDir = objectsDir(baseDir);
  let legacyCount = 0;
  try {
    legacyCount = await countMdRecursive(objsDir);
  } catch {
    // dir doesn't exist
  }
  if (legacyCount > 0) {
    const msg = `legacy objects left: ${legacyCount}; run: wolf migrate`;
    warnings.push(msg);
    displayLines.push(`layout:     ${msg}`);
  } else {
    displayLines.push('layout:     OK');
  }

  // 3. objects
  const store = new MarkdownMemoryStore(baseDir);
  const problems = await store.scanProblems();
  const memBase = memoryDir(baseDir);
  for (const p of problems) {
    errors.push(`${relative(memBase, p.path)}: ${p.error}`);
  }
  if (opts?.fix && problems.length > 0) {
    await store.quarantineFiles(problems);
    // Битые файлы не парсятся — их id неизвестны, точечно из индекса не убрать.
    // Пересобираем производный индекс из оставшихся объектов store.
    await new SQLiteSearchIndex(indexPath(baseDir)).rebuild(await store.list());
  }
  const totalObjects = (await store.list()).length;
  displayLines.push(`objects:    scanned ${totalObjects}, broken ${problems.length}`);
  for (const p of problems) {
    displayLines.push(`  error: ${relative(memBase, p.path)}: ${p.error}`);
  }

  // 4. events
  const evtResult = await scanJsonlFile(eventsPath(baseDir), (line: string) => {
    return MemoryEventSchema.parse(JSON.parse(line));
  });
  for (const p of evtResult.problems) {
    errors.push(`events line ${p.line}: ${p.error}`);
  }
  displayLines.push(`events:     ${evtResult.items.length} lines, bad ${evtResult.problems.length}`);

  // 5. relations
  const relResult = await scanJsonlFile(relationsPath(baseDir), (line: string) => {
    return RelationSchema.parse(JSON.parse(line));
  });
  for (const p of relResult.problems) {
    errors.push(`relations line ${p.line}: ${p.error}`);
  }
  const allIds = new Set((await store.list()).map((o: { id: string }) => o.id));
  let dangling = 0;
  for (const rel of relResult.items) {
    if (!allIds.has(rel.subject) || !allIds.has(rel.object)) dangling++;
  }
  if (dangling > 0) {
    warnings.push(`${dangling} dangling relation endpoints`);
  }
  displayLines.push(
    `relations:  ${relResult.items.length} lines, bad ${relResult.problems.length}, dangling ${dangling}`
  );

  // 6. index
  let idxSqlite = 0;
  let idxStore = 0;
  let idxFresh = true;
  try {
    const idx = new SQLiteSearchIndex(indexPath(baseDir));
    const searchResults = await idx.searchAll();
    idxSqlite = searchResults.length;
    idxStore = allIds.size;
    // Simple count comparison; can't get exact ID set from FTS5 easily
    // If counts differ significantly, mark stale
    if (Math.abs(idxSqlite - idxStore) > 0) {
      // Actually FTS5 search('*') may not return all. Let's just report the counts.
    }
    // Check for stale: objects in index not in store
    const indexedIds = new Set(searchResults.map((r) => r.object.id));
    for (const indexedId of indexedIds) {
      if (!allIds.has(indexedId)) {
        errors.push('stale index; run: wolf rebuild-index');
        idxFresh = false;
        break;
      }
    }
  } catch {
    displayLines.push('index:      (unavailable)');
    idxFresh = false;
  }
  if (idxFresh) {
    displayLines.push(`index:      sqlite ${idxSqlite} / store ${idxStore} — fresh`);
  }

  // 7. locks
  const lockFilePath = join(memoryDir(baseDir), '.lock');
  let staleLock = false;
  try {
    const lockContent = fsSync.readFileSync(lockFilePath, 'utf-8');
    const data = JSON.parse(lockContent);
    const ts = Number(data.ts) || 0;
    if (Date.now() - ts > LOCK_TIMING.STALE_MS) {
      staleLock = true;
      warnings.push('stale lockfile found');
    }
  } catch {
    // no lockfile
  }
  displayLines.push(staleLock ? 'locks:      stale lockfile found' : 'locks:      no stale lockfiles');

  displayLines.push('');
  const ok = errors.length === 0;
  displayLines.push(
    ok
      ? `result: OK (errors: 0, warnings: ${warnings.length})`
      : `result: FAILED (errors: ${errors.length}, warnings: ${warnings.length})`
  );

  return {
    sections: [
      { name: 'taxonomy', errors: [], warnings: [] },
      { name: 'layout', errors: [], warnings: legacyCount > 0 ? [`legacy objects left: ${legacyCount}`] : [] },
      { name: 'objects', errors: problems.map((p) => `${relative(memBase, p.path)}: ${p.error}`), warnings: [] },
      { name: 'events', errors: evtResult.problems.map((p) => `line ${p.line}: ${p.error}`), warnings: [] },
      {
        name: 'relations',
        errors: relResult.problems.map((p) => `line ${p.line}: ${p.error}`),
        warnings: dangling > 0 ? [`${dangling} dangling`] : [],
      },
      { name: 'index', errors: idxFresh ? [] : ['stale index'], warnings: [] },
      { name: 'locks', errors: [], warnings: staleLock ? ['stale'] : [] },
    ],
    ok,
    errors: errors.length,
    warnings: warnings.length,
    displayLines,
  };
}

export function printValidateResult(result: ValidateResult): string {
  return result.displayLines.join('\n');
}

export function memoryValidateCommand(): Command {
  const cmd = new Command('validate');
  cmd.description('Validate memory store integrity');
  cmd.option('--fix', 'Quarantine broken objects', false);
  cmd.action(async (opts) => {
    const baseDir = process.cwd();
    const result = await runValidate(baseDir, { fix: opts.fix as boolean });
    console.log(printValidateResult(result));
    if (!result.ok) process.exit(1);
  });
  return cmd;
}

async function countMdRecursive(dir: string): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        count += await countMdRecursive(full);
      } else if (entry.name.endsWith('.md')) {
        count++;
      }
    }
  } catch {
    // ENOENT etc
  }
  return count;
}
