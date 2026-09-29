import * as fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import yaml from 'js-yaml';
import { DEPRECATED_TYPE_ALIASES, MEMORY_TYPES } from '../../domain/memory-types.js';
import { targetPathFor, memoryDir } from './project-paths.js';
import { writeFileAtomic } from './markdown-memory-store.js';
import { parseFrontmatter, walkMd } from './layout-migration.js';

/**
 * Миграция таксономии 2.13 (спека §8.2, P213): 26 старых типов → 7 + фасеты.
 * Преобразование идёт над СЫРЫМ frontmatter (yaml.load, без типовой zod-схемы) —
 * чужие поля сохраняются как есть (§8.2.2). Прецедент структуры: layout-migration.ts.
 */

/** Спека §5.2/§8.2.5: поглощаемые типы → статус thread. */
const ABSORBING_THREAD_STATUS: Readonly<Record<string, string>> = {
  blocker: 'blocked',
  'info-request': 'waiting_answer',
  'open-question': 'open',
};

/** «Завершённые» статусы причин: такой объект больше не меняет статус треда. */
const ABSORBED_DONE_STATUSES: ReadonlySet<string> = new Set(['archived', 'resolved', 'rejected', 'answered']);

/** Спека §5.5: старые каталоги, удаляемые после apply, если стали пусты (tasks/ — живой, НЕ входит). */
const OLD_TYPE_SUBDIRS: ReadonlySet<string> = new Set([
  'documents',
  'sessions',
  'councils',
  'escalations',
  'calls',
  'playbooks',
  'blockers',
]);

export interface TaxonomyMigrationEntry {
  id: string;
  oldType: string;
  newType: string;
  /** прописывается, только если в frontmatter нет своего (§8.2.2) */
  facet?: string;
  /** целевой статус треда, если эта запись (или её причина) меняет статус треда */
  threadStatusChange?: string;
  from: string;
  to: string;
}

export interface ThreadStatusChange {
  threadId: string;
  from: string;
  to: string;
  causeType: string;
  causeId: string;
}

export interface TaxonomyConflict {
  id: string;
  reason: string;
}

export interface TaxonomyMigrationReport {
  entries: TaxonomyMigrationEntry[];
  /** старый тип → количество мигрируемых объектов */
  summaryByType: Record<string, number>;
  conflicts: TaxonomyConflict[];
  unparsable: { path: string; error: string }[];
  /** активные call-injections: мигрируются как обычные note, но перестают доставляться пулом call (§5.4) */
  callInjections: TaxonomyMigrationEntry[];
  threadStatusChanges: ThreadStatusChange[];
}

interface ThreadFileInfo {
  id: string;
  status: string;
  /** путь относительно baseDir (threads/<tid>/WORK-THREAD.md) */
  path: string;
  statusChangeTo?: string;
}

interface TaxonomyScan {
  report: TaxonomyMigrationReport;
  threadFiles: Map<string, ThreadFileInfo>;
}

function renderMd(fm: Record<string, unknown>, body: string): string {
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`;
}

/** Копия readIdFromDisk из layout-migration (там не экспортирован; конфликт-детект по прецеденту). */
function readIdFromDisk(absPath: string): string | null {
  try {
    const content = existsSync(absPath) ? readFileSync(absPath, 'utf-8') : '';
    const m = content.match(/^---[\s\S]*?\nid:\s*(\S+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function scanTaxonomy(baseDir: string): Promise<TaxonomyScan> {
  const mem = memoryDir(baseDir);
  const files = [
    ...(await walkMd(join(mem, 'threads'))),
    ...(await walkMd(join(mem, 'shared'))),
    ...(await walkMd(join(mem, 'objects'))),
  ];

  const entries: TaxonomyMigrationEntry[] = [];
  const conflicts: TaxonomyConflict[] = [];
  const unparsable: { path: string; error: string }[] = [];
  const callInjections: TaxonomyMigrationEntry[] = [];
  const threadFiles = new Map<string, ThreadFileInfo>();
  const absorbing = new Map<string, { type: string; id: string; status: string }[]>();
  const entryById = new Map<string, TaxonomyMigrationEntry>();
  const usedTargets = new Map<string, string>();

  for (const f of files) {
    const rel = relative(baseDir, f);
    let content: string;
    try {
      content = await fs.readFile(f, 'utf-8');
    } catch (err) {
      unparsable.push({ path: rel, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    const parsed = parseFrontmatter(content);
    if (!parsed || !parsed.fm || typeof parsed.fm !== 'object') {
      unparsable.push({ path: rel, error: 'unparsable frontmatter' });
      continue;
    }
    const fm = parsed.fm;
    const id = typeof fm.id === 'string' ? fm.id : '';
    const type = typeof fm.type === 'string' ? fm.type : '';
    const status = typeof fm.status === 'string' ? fm.status : '';
    if (!id || !type) {
      unparsable.push({ path: rel, error: 'missing id or type' });
      continue;
    }

    if (type === 'thread' || type === 'work-thread') {
      threadFiles.set(id, { id, status, path: rel });
      if (type === 'thread') continue; // уже новый тип — только кандидат на смену статуса
      // work-thread падает ниже: rename типа без переезда (§5.1)
    } else if ((MEMORY_TYPES as readonly string[]).includes(type)) {
      continue; // идемпотентность: признак «мигрировано» = type ∈ 7 новых
    } else if (type === 'task-brief') {
      continue; // §8.2.6: не трогается вообще
    } else if (!DEPRECATED_TYPE_ALIASES[type]) {
      continue; // неизвестный/project-тип — не трогаем
    }

    const spec = DEPRECATED_TYPE_ALIASES[type];
    let to: string;
    if (type === 'work-thread') {
      to = rel; // спецслучай: файл не двигается, меняется только поле type в frontmatter
    } else {
      try {
        to = relative(
          baseDir,
          targetPathFor(baseDir, {
            type: spec.target,
            id,
            thread: typeof fm.thread === 'string' ? fm.thread : undefined,
          })
        );
      } catch (err) {
        unparsable.push({
          path: rel,
          error: `cannot compute target: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
    }

    // конфликт целей (прецедент layout-migration): чужой id на целевом пути
    const owner = usedTargets.get(to);
    if (owner !== undefined && owner !== id) {
      conflicts.push({ id, reason: `target ${to} is taken by ${owner}` });
      continue;
    }
    usedTargets.set(to, id);
    if (to !== rel && existsSync(join(baseDir, to))) {
      const onDisk = readIdFromDisk(join(baseDir, to));
      if (onDisk !== null && onDisk !== id) {
        conflicts.push({ id, reason: `target ${to} already exists on disk (id ${onDisk})` });
        continue;
      }
    }

    const entry: TaxonomyMigrationEntry = { id, oldType: type, newType: spec.target, from: rel, to };
    if (spec.facet !== undefined && fm.facet === undefined) entry.facet = spec.facet;
    entries.push(entry);
    entryById.set(id, entry);
    if (type === 'call-injection' && status === 'active') callInjections.push(entry);

    const threadStatus = ABSORBING_THREAD_STATUS[type];
    if (threadStatus !== undefined && typeof fm.thread === 'string' && !ABSORBED_DONE_STATUSES.has(status)) {
      const list = absorbing.get(fm.thread) ?? [];
      list.push({ type, id, status: threadStatus });
      absorbing.set(fm.thread, list);
    }
  }

  // §8.2.5: статусы тредов — только active-треды с незавершёнными причинами одного вида;
  // каждый случай — строка отчёта, всё прочее — конфликт-строка, тред не трогается
  const threadStatusChanges: ThreadStatusChange[] = [];
  const conflictedThreads = new Set<string>();
  for (const [tid, causes] of absorbing) {
    const thread = threadFiles.get(tid);
    if (!thread) continue; // причина ссылается на несуществующий тред — мигрирует без смены статуса
    if (thread.status !== 'active') {
      conflictedThreads.add(tid);
      conflicts.push({
        id: tid,
        reason: `thread "${tid}" is "${thread.status}" (not active) but has active ${causes
          .map((c) => c.type)
          .join(' + ')} — not touched (spec 2.13 §8.2.5)`,
      });
      continue;
    }
    const distinct = new Set(causes.map((c) => c.status));
    if (distinct.size > 1) {
      conflictedThreads.add(tid);
      conflicts.push({
        id: tid,
        reason: `thread "${tid}" has multiple different absorbable statuses (${[...distinct].join(
          ', '
        )}) — not touched (spec 2.13 §8.2.5)`,
      });
      continue;
    }
    const to = [...distinct][0];
    thread.statusChangeTo = to;
    for (const c of causes) {
      threadStatusChanges.push({ threadId: tid, from: thread.status, to, causeType: c.type, causeId: c.id });
      const cause = entryById.get(c.id);
      if (cause) cause.threadStatusChange = to;
    }
    const threadEntry = entryById.get(tid);
    if (threadEntry) threadEntry.threadStatusChange = to;
  }

  // конфликтные треды не трогаем вообще — их work-thread rename убирается из плана
  const finalEntries = entries.filter((e) => !(e.oldType === 'work-thread' && conflictedThreads.has(e.id)));

  const summaryByType: Record<string, number> = {};
  for (const e of finalEntries) summaryByType[e.oldType] = (summaryByType[e.oldType] ?? 0) + 1;

  return {
    report: { entries: finalEntries, summaryByType, conflicts, unparsable, callInjections, threadStatusChanges },
    threadFiles,
  };
}

export async function planTaxonomyMigration(baseDir: string): Promise<TaxonomyMigrationReport> {
  return (await scanTaxonomy(baseDir)).report;
}

export async function applyTaxonomyMigration(baseDir: string): Promise<TaxonomyMigrationReport> {
  const { report, threadFiles } = await scanTaxonomy(baseDir);

  for (const e of report.entries) {
    const absFrom = join(baseDir, e.from);
    const absTo = join(baseDir, e.to);
    let content: string;
    try {
      content = await fs.readFile(absFrom, 'utf-8');
    } catch {
      continue; // файл исчез между plan и apply — не трогаем
    }
    const parsed = parseFrontmatter(content);
    if (!parsed || !parsed.fm || typeof parsed.fm !== 'object') continue;
    const fm = parsed.fm;
    fm.type = e.newType;
    if (e.facet !== undefined && fm.facet === undefined) fm.facet = e.facet;
    if (e.oldType === 'work-thread' && e.threadStatusChange !== undefined) fm.status = e.threadStatusChange;
    await fs.mkdir(dirname(absTo), { recursive: true });
    await writeFileAtomic(absTo, renderMd(fm, parsed.body));
    if (absFrom !== absTo) {
      await fs.unlink(absFrom).catch(() => undefined);
    }
  }

  // смена статуса тредов, чей файл уже type thread (без entry)
  const renamedThreadIds = new Set(report.entries.filter((e) => e.oldType === 'work-thread').map((e) => e.id));
  for (const t of threadFiles.values()) {
    if (t.statusChangeTo === undefined || renamedThreadIds.has(t.id)) continue;
    const abs = join(baseDir, t.path);
    const content = await fs.readFile(abs, 'utf-8').catch(() => null);
    if (content === null) continue;
    const parsed = parseFrontmatter(content);
    if (!parsed || !parsed.fm || typeof parsed.fm !== 'object') continue;
    parsed.fm.status = t.statusChangeTo;
    await writeFileAtomic(abs, renderMd(parsed.fm, parsed.body));
  }

  // §5.5: пустые старые каталоги удаляются после успешного apply
  await pruneEmptyOldDirs(memoryDir(baseDir));
  return report;
}

async function pruneEmptyOldDirs(root: string): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = join(root, e.name);
    await pruneEmptyOldDirs(full);
    if (OLD_TYPE_SUBDIRS.has(e.name) && (await isEmptyRecursive(full))) {
      await fs.rm(full, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function isEmptyRecursive(dir: string): Promise<boolean> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (!e.isDirectory()) return false;
    if (!(await isEmptyRecursive(join(dir, e.name)))) return false;
  }
  return true;
}
