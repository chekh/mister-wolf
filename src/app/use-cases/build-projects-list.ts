import { readdir, stat } from 'fs/promises';
import { basename, join } from 'path';
import { ProjectsRegistry } from '../../adapters/fs/projects-registry.js';
import { eventsPath, memoryDir } from '../../adapters/fs/project-paths.js';
import { renderTable } from '../../adapters/cli/commands/table-render.js';

/** Окно «активен» в сводке (дни). Константа в коде — YAGNI (открытый вопрос спеки §14). */
const ACTIVE_WINDOW_DAYS = 7;

export interface ProjectsListRow {
  name: string;
  path: string;
  schemaVersion: number | null;
  /** mtime events.jsonl; null — лога нет (активности не было). */
  lastActivity: Date | null;
  /** Рекурсивный размер .wolf/memory/ (байты); null — путь отсутствует. */
  memoryBytes: number | null;
  /** Путь из реестра не существует (строка `missing`). */
  missing: boolean;
}

export interface ProjectsListDeps {
  registry: Pick<ProjectsRegistry, 'list'>;
}

/** Рекурсивный размер каталога (байты); несуществующий — 0. */
async function dirSize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else {
      try {
        total += (await stat(full)).size;
      } catch {
        // файл исчез между readdir и stat — не считаем
      }
    }
  }
  return total;
}

/** Байты → компактная строка: `512 B`, `2.0 KB`, `1.5 MB` (детерминизм e2e). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}

/**
 * `wolf projects` (спека 2.14 §8.1): реестр — «телефонная книга» путей; все поля
 * статистики вычисляются на лету (mtime events.jsonl, рекурсивный размер
 * .wolf/memory/), схема реестра не расширяется.
 */
export async function buildProjectsList(deps: ProjectsListDeps): Promise<ProjectsListRow[]> {
  const rows: ProjectsListRow[] = [];
  for (const p of await deps.registry.list()) {
    const base = { name: basename(p.path), path: p.path, schemaVersion: p.schema_version ?? null };
    let alive = true;
    try {
      await stat(p.path);
    } catch {
      alive = false;
    }
    if (!alive) {
      rows.push({ ...base, lastActivity: null, memoryBytes: null, missing: true });
      continue;
    }
    let lastActivity: Date | null = null;
    try {
      lastActivity = new Date((await stat(eventsPath(p.path))).mtimeMs);
    } catch {
      // events.jsonl нет — активности не было
    }
    rows.push({ ...base, lastActivity, memoryBytes: await dirSize(memoryDir(p.path)), missing: false });
  }
  // сортировка по активности: свежие сверху, без лога — ниже, missing — в конец
  const rank = (r: ProjectsListRow): number => (r.missing ? -2 : r.lastActivity ? r.lastActivity.getTime() : -1);
  return rows.sort((a, b) => rank(b) - rank(a));
}

export interface ProjectsListRender {
  table: string;
  summary: string;
}

/** Таблица + сводка (§8.1): `проектов N | активны за 7д: K | суммарный размер памяти`. */
export function renderProjectsList(rows: ProjectsListRow[], now: Date): ProjectsListRender {
  const table = renderTable(
    ['имя', 'путь', 'версия схемы', 'последняя активность', 'размер памяти'],
    rows.map((r) => [
      r.name,
      r.path,
      r.missing || r.schemaVersion === null ? '—' : `v${r.schemaVersion}`,
      r.missing ? 'missing' : r.lastActivity ? r.lastActivity.toISOString().slice(0, 10) : '—',
      r.missing || r.memoryBytes === null ? '—' : formatBytes(r.memoryBytes),
    ])
  );
  const cutoff = now.getTime() - ACTIVE_WINDOW_DAYS * 86_400_000;
  const alive = rows.filter((r) => !r.missing);
  const active = alive.filter((r) => r.lastActivity && r.lastActivity.getTime() >= cutoff).length;
  const totalBytes = alive.reduce((s, r) => s + (r.memoryBytes ?? 0), 0);
  const summary = `проектов ${rows.length} | активны за ${ACTIVE_WINDOW_DAYS}д: ${active} | суммарный размер памяти: ${formatBytes(totalBytes)}`;
  return { table, summary };
}
