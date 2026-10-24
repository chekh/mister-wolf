// tests/helpers/park-snapshot.ts
// T6 (волна 2.19.0, test-plan §«Слепки»): слепок состояния проекта до/после
// прохода — инварианты NFR-01/02 (идемпотентность: «0 новых объектов,
// 0 перезаписей»), R03.2 (живое лицо не переверсионировано), R07.2 (изменения
// памяти исчерпываются посевом), R11.1 (файлы вне карты не изменены).
// Владелец хелпера — T6; потребители — T6 (project-step), T7/T13 (парк).
//
// Слепок фиксирует три среза проекта:
// - files: sha256 всех стабильных файлов (волатильные зоны исключены);
// - objects: id объекта памяти → sha256 его файла (.md с frontmatter-id
//   в .wolf/memory — реверсия объекта = новый id, правка файла = другой sha);
// - baseSet: состав целей base-set (.opencode/** + AGENTS.md).
import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

export interface ParkSnapshot {
  /** rel-путь (posix) → sha256 файла; волатильное исключено (см. SKIP_PREFIXES). */
  files: Record<string, string>;
  /** id объекта памяти → sha256 его файла; только .md с frontmatter-id в .wolf/memory. */
  objects: Record<string, string>;
  /** Отсортированные rel-пути целей base-set: .opencode/** + AGENTS.md. */
  baseSet: string[];
}

/** Волатильное/нерелевантное для проверяемых эффектов прохода: VCS,
 * зависимости, кэш индекса, метрики, thinking, транзитные lock-файлы. */
const SKIP_PREFIXES = ['.git/', 'node_modules/', '.wolf/cache/', '.wolf/metrics/', '.wolf/thinking/'];
const SKIP_SUFFIX = '.lock';

function sha256File(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

function* walk(root: string, rel = ''): Generator<string> {
  const absDir = rel === '' ? root : join(root, rel);
  for (const entry of readdirSync(absDir)) {
    const relPath = rel === '' ? entry : `${rel}/${entry}`;
    if (SKIP_PREFIXES.some((p) => `${relPath}/`.startsWith(p))) continue;
    const abs = join(root, relPath);
    if (statSync(abs).isDirectory()) yield* walk(root, relPath);
    else yield relPath;
  }
}

/** id из frontmatter объекта памяти; null — файл не объект (нет id). */
function frontmatterId(abs: string): string | null {
  const m = readFileSync(abs, 'utf-8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const id = m[1]!.match(/^id:\s*(\S+)\s*$/m);
  return id ? id[1]! : null;
}

/** Слепок проекта: все файлы, объекты памяти и состав base-set. */
export function takeParkSnapshot(projectRoot: string): ParkSnapshot {
  const files: Record<string, string> = {};
  const objects: Record<string, string> = {};
  const baseSet: string[] = [];
  for (const rel of walk(projectRoot)) {
    if (rel.endsWith(SKIP_SUFFIX)) continue;
    const abs = join(projectRoot, rel);
    files[rel] = sha256File(abs);
    if (rel.startsWith('.wolf/memory/') && rel.endsWith('.md')) {
      const id = frontmatterId(abs);
      if (id) objects[id] = files[rel]!;
    }
    if (rel === 'AGENTS.md' || rel.startsWith('.opencode/')) baseSet.push(rel);
  }
  return { files, objects, baseSet: baseSet.sort() };
}

export interface ParkSnapshotDiff {
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
  addedObjects: string[];
  removedObjects: string[];
  changedObjects: string[];
  baseSetAdded: string[];
  baseSetRemoved: string[];
}

/** Diff двух слепков: добавлено/удалено/изменено по файлам и объектам,
 * состав base-set. Пустой diff (кроме baseSet*) = «0 новых объектов,
 * 0 перезаписей» повторного прогона. */
export function diffParkSnapshots(before: ParkSnapshot, after: ParkSnapshot): ParkSnapshotDiff {
  const diffKeys = (a: Record<string, string>, b: Record<string, string>) => ({
    added: Object.keys(b).filter((k) => !(k in a)),
    removed: Object.keys(a).filter((k) => !(k in b)),
    changed: Object.keys(b).filter((k) => k in a && a[k] !== b[k]),
  });
  const f = diffKeys(before.files, after.files);
  const o = diffKeys(before.objects, after.objects);
  return {
    addedFiles: f.added,
    removedFiles: f.removed,
    changedFiles: f.changed,
    addedObjects: o.added,
    removedObjects: o.removed,
    changedObjects: o.changed,
    baseSetAdded: after.baseSet.filter((p) => !before.baseSet.includes(p)),
    baseSetRemoved: before.baseSet.filter((p) => !after.baseSet.includes(p)),
  };
}
