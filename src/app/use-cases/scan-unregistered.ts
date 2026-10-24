import { readdir, realpath, stat } from 'fs/promises';
import type { Dirent } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/** Кандидат: живая память `<dir>/.wolf/memory` вне реестра. */
interface Candidate {
  dir: string;
  lastActivityMs: number;
}

export interface ScanUnregisteredDeps {
  /** Пути из реестра (projects.yaml); сверка по realpath (прецедент T4 dedupeByRealpath), несуществующие пропускаются мягко. */
  registeredPaths: string[];
  /** Корень скана; по умолчанию домашний каталог. */
  root?: string;
  /** Максимальная глубина обхода (уровни каталогов ниже root). */
  maxDepth?: number;
  /** Мягкий бюджет скана, мс: при превышении вернуть найденное к моменту остановки. */
  budgetMs?: number;
  /** Инжект часов (бюджет тестируем без fake timers). */
  now?: () => number;
}

export type ScanResult = { found: number; top: string[]; hint: string } | null;

const HINT_TAIL =
  'projects with wolf memory outside the registry; running any wolf command in a project registers it (self-healing)';

/**
 * Ограниченный read-only скан живых памятей вне реестра (REQ-09):
 * обход root BFS на глубину maxDepth, «живая» = `<dir>/.wolf/memory`.
 * Read-only (readdir/stat/realpath); мутаций и автозаписи в реестр нет.
 * null — ничего не найдено или root недоступен (R09.2: это не ошибка).
 */
export async function scanUnregistered(deps: ScanUnregisteredDeps): Promise<ScanResult> {
  const root = deps.root ?? homedir();
  const maxDepth = deps.maxDepth ?? 4;
  const budgetMs = deps.budgetMs ?? 5000;
  const now = deps.now ?? Date.now;

  const registered = new Set<string>();
  for (const path of deps.registeredPaths) {
    try {
      registered.add(await realpath(path));
    } catch {
      // несуществующий registered-путь realpath не резолвится — пропускаем мягко
    }
  }

  const startedAt = now();
  const candidates: Candidate[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

  for (let i = 0; i < queue.length; i++) {
    const { dir, depth } = queue[i];
    if (now() - startedAt > budgetMs) break; // мягкая остановка: вернуть найденное к моменту превышения

    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // недоступный каталог (права/ошибки) — не ошибка скана (R09.2)
    }

    const memoryStat = await stat(join(dir, '.wolf', 'memory')).catch(() => null);
    if (memoryStat) {
      let real = dir;
      try {
        real = await realpath(dir);
      } catch {
        // dir только что прочитан readdir'ом; на всякий случай падаем назад на сам путь
      }
      if (!registered.has(real)) {
        let lastActivityMs = memoryStat.mtimeMs; // fallback — mtime .wolf/memory
        const eventsStat = await stat(join(dir, '.wolf', 'events.jsonl')).catch(() => null);
        if (eventsStat) lastActivityMs = eventsStat.mtimeMs;
        candidates.push({ dir, lastActivityMs });
      }
    }

    if (depth >= maxDepth) continue;
    for (const entry of entries) {
      // без спуска в symlink'и (циклы) и в .wolf/node_modules — проектов там нет, бюджет дороже
      if (!entry.isDirectory() || entry.name === '.wolf' || entry.name === 'node_modules') continue;
      queue.push({ dir: join(dir, entry.name), depth: depth + 1 });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.lastActivityMs - a.lastActivityMs); // самый свежий первым
  return {
    found: candidates.length,
    top: candidates.slice(0, 5).map((c) => c.dir),
    hint: `found ${candidates.length} ${HINT_TAIL}`,
  };
}
