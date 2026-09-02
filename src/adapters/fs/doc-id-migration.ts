import * as fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import yaml from 'js-yaml';
import { memoryDir, relationsPath, targetPathFor } from './project-paths.js';
import { writeFileAtomic } from './markdown-memory-store.js';
import { parseFrontmatter, walkMd } from './layout-migration.js';
import { documentRefId, isCanonicalDocumentId, withTieBreak } from './document-id.js';
import { rebuildMemoryIndex } from '../../app/use-cases/rebuild-memory-index.js';
import { createCliContainer } from '../../bootstrap/container.js';

export interface DocIdMigrationEntry {
  id: string;
  newId: string;
  from: string;
  to: string;
  action: 'rename' | 'conflict';
}

export interface DocIdMigrationReport {
  entries: DocIdMigrationEntry[];
  conflicts: DocIdMigrationEntry[];
  problems: { path: string; error: string }[];
  renamed: number; // 0 при dry-run
  refsRewritten: number; // 0 при dry-run
}

/**
 * Однократная миграция id document-ref на канон §2.1 (спека 2.1.0 §2.6):
 * 1. найти объекты с id вне канона (frontmatter.type === 'document-ref');
 * 2. вычислить новый id = withTieBreak(documentRefId(source.path, created_at), takenIds),
 *    где takenIds — id ВСЕХ объектов памяти (коллизии → суффикс -2, -3, …);
 * 3. переименовать файл (targetPathFor) и заменить id в frontmatter;
 * 4. переписать все ссылки на старый id во всех .md памяти (кроме briefs/quarantine)
 *    и в relations.jsonl — по границе id (lookahead `(?![A-Za-z0-9_-])`),
 *    иначе doc_X порвётся при существующем doc_X2;
 * 5. rebuild-index;
 * 6. отчёт: переименовано / ссылок переписано / коллизии.
 * НЕ трогает: events.jsonl (исторический лог), .wolf/memory/briefs, quarantine.
 */
export async function planDocIdMigration(baseDir: string): Promise<DocIdMigrationReport> {
  const memDir = memoryDir(baseDir);
  const files = existsSync(memDir) ? await walkMd(memDir) : [];
  const problems: DocIdMigrationReport['problems'] = [];

  // проход 1: собрать id ВСЕХ объектов (занятые для tie-break) + распарсить кандидатов
  const takenIds = new Set<string>();
  const parsed: { rel: string; fm: Record<string, any> }[] = [];
  for (const f of files) {
    const rel = relative(baseDir, f);
    if (isExcluded(rel)) continue; // briefs/quarantine не трогаем
    let content: string;
    try {
      content = await fs.readFile(f, 'utf-8');
    } catch (err) {
      problems.push({ path: rel, error: String(err) });
      continue;
    }
    const p = parseFrontmatter(content);
    if (!p) continue; // не объект памяти (нет frontmatter) — не субъект миграции
    if (typeof p.fm.id === 'string') takenIds.add(p.fm.id);
    parsed.push({ rel, fm: p.fm });
  }

  // проход 2: вычислить newId для кандидатов вне канона
  const entries: DocIdMigrationEntry[] = [];
  const conflicts: DocIdMigrationEntry[] = [];
  for (const { rel, fm } of parsed) {
    if (fm.type !== 'document-ref' || isCanonicalDocumentId(fm.id)) continue;
    const sourcePath: string | undefined = fm.source?.path;
    if (!sourcePath) {
      problems.push({ path: rel, error: `document-ref ${fm.id} без source.path — миграция невозможна` });
      continue;
    }
    const newId = withTieBreak(documentRefId(sourcePath, fm.created_at), takenIds);
    takenIds.add(newId); // накапливаем новые id — защита от коллизий внутри одного прогона
    const to = relative(baseDir, targetPathFor(baseDir, { type: 'document-ref', id: newId, thread: fm.thread }));
    // конфликт: файл по пути to уже существует на диске и его id != newId
    let action: DocIdMigrationEntry['action'] = 'rename';
    if (existsSync(join(baseDir, to)) && readIdFromDisk(join(baseDir, to)) !== newId) {
      action = 'conflict';
    }
    const entry: DocIdMigrationEntry = { id: fm.id, newId, from: rel, to, action };
    entries.push(entry);
    if (action === 'conflict') conflicts.push(entry);
  }

  return { entries, conflicts, problems, renamed: 0, refsRewritten: 0 };
}

export async function applyDocIdMigration(baseDir: string): Promise<DocIdMigrationReport> {
  const report = await planDocIdMigration(baseDir);
  const renames = report.entries.filter((e) => e.action === 'rename');
  const memDir = memoryDir(baseDir);

  // 3. переименовать файлы + заменить id в frontmatter
  for (const e of renames) {
    const absFrom = join(baseDir, e.from);
    const absTo = join(baseDir, e.to);
    const parsed = parseFrontmatter(await fs.readFile(absFrom, 'utf-8'));
    if (!parsed) continue;
    parsed.fm.id = e.newId;
    const newContent = `---\n${yaml.dump(parsed.fm).trimEnd()}\n---\n\n${parsed.body}`;
    await fs.mkdir(dirname(absTo), { recursive: true });
    await writeFileAtomic(absTo, newContent);
    if (absFrom !== absTo) await fs.unlink(absFrom);
  }
  report.renamed = renames.length;

  // 4. переписать ссылки oldId → newId по всем .md памяти и relations.jsonl.
  // Замена идемпотентна: уже переименованные файлы содержат newId, oldId там не матчится.
  // Длинные id заменяем первыми — защита от вложенных вхождений.
  const pairs = renames.map((e) => ({ oldId: e.id, newId: e.newId })).sort((a, b) => b.oldId.length - a.oldId.length);
  const rewrite = (text: string): { text: string; count: number } => {
    let count = 0;
    for (const { oldId, newId } of pairs) {
      text = text.replace(idBoundaryRe(oldId), () => {
        count++;
        return newId;
      });
    }
    return { text, count };
  };

  let refs = 0;
  for (const f of await walkMd(memDir)) {
    if (isExcluded(relative(baseDir, f))) continue;
    const content = await fs.readFile(f, 'utf-8');
    const { text, count } = rewrite(content);
    if (count > 0) await writeFileAtomic(f, text);
    refs += count;
  }
  const rel = relationsPath(baseDir); // отсутствует — пропустить
  if (existsSync(rel)) {
    const content = await fs.readFile(rel, 'utf-8');
    const { text, count } = rewrite(content);
    if (count > 0) await writeFileAtomic(rel, text);
    refs += count;
  }
  report.refsRewritten = refs;

  // 5. перестроить поисковый индекс (как memory-rebuild-index.ts, но напрямую)
  const { store, index } = createCliContainer(baseDir);
  await rebuildMemoryIndex({ store, index });

  return report;
}

/** briefs/ и quarantine/ — служебные/битые зоны, миграция их не трогает (§2.6). */
function isExcluded(relToBase: string): boolean {
  const relToMemory = relToBase.replace(/^\.wolf[/\\]memory[/\\]/, '');
  return (
    relToMemory.startsWith('briefs/') ||
    relToMemory.startsWith('briefs\\') ||
    relToMemory.startsWith('quarantine/') ||
    relToMemory.startsWith('quarantine\\')
  );
}

/** Граница id: заменяем oldId, только если дальше НЕ идёт [A-Za-z0-9_-] (не порвёт doc_X2). */
function idBoundaryRe(id: string): RegExp {
  return new RegExp(escapeRegExp(id) + '(?![A-Za-z0-9_-])', 'g');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Быстрое чтение id из frontmatter без полного парса — для детекции конфликтов. */
function readIdFromDisk(absPath: string): string | null {
  try {
    const m = readFileSync(absPath, 'utf-8').match(/^---[\s\S]*?\nid:\s*(\S+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
