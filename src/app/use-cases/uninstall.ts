// REQ-03 (2.16.2): wolf uninstall — план + подтверждение (паттерн careful re-init:
// planInit/--yes), удаление только wolf-контента (design §C4, ADR-2, NFR-02).
// Primary источник — wolf-sync-state (свидетель рендера); fallback — штамп файла при
// отсутствующем/пустом state (легаси < 2.11.0). AGENTS.md/CLAUDE.md не удаляются никогда:
// marker-append может содержать чужой контент (F-04).
import { join } from 'path';
import { parseStamp } from '../../adapters/render/stamp.js';
import type { SyncStateFiles } from '../../adapters/render/sync-state.js';
import type { PlatformAdapter } from '../../ports/platform-adapter.port.js';

const STATE_REL = join('.opencode', 'wolf-sync-state.json');
const SCAN_ROOTS = [
  join('.opencode', 'agents'),
  join('.opencode', 'skills'),
  join('.opencode', 'command'),
  join('.opencode', 'plugins'),
];
const ROOT_DOCS = new Set(['AGENTS.md', 'CLAUDE.md']);

export interface UninstallDeps {
  baseDir: string;
  /** Записи wolf-sync-state; null — файла нет; 'broken' — битый JSON (F-11: без fallback). */
  syncStateFiles: () => SyncStateFiles | null | 'broken';
  readFile: (abs: string) => string | null;
  exists: (abs: string) => boolean;
  listFiles: (dir: string) => string[];
  /** Подкаталоги root (любая глубина), без самого root. */
  listDirs: (root: string) => string[];
  removeFile: (abs: string) => Promise<void>;
  removeDirIfEmpty: (abs: string) => Promise<boolean>;
  removeTree: (abs: string) => Promise<void>;
  adapters: PlatformAdapter[];
}

export interface UninstallEntry {
  target: string; // rel-путь от baseDir или 'config:<id>'
  kind: 'file' | 'purge' | 'skip' | 'config';
  detail?: string;
}

export interface UninstallPlan {
  entries: UninstallEntry[];
}

export interface UninstallResult {
  actions: string[];
  errors: string[];
  plan: UninstallPlan;
}

/** План read-only: что будет удалено; без yes ничего не пишется (dry-run по умолчанию). */
export async function planUninstall(deps: UninstallDeps): Promise<UninstallPlan> {
  const entries: UninstallEntry[] = [];
  const state = deps.syncStateFiles();
  const stateBroken = state === 'broken';
  const stateEmpty = stateBroken || state === null || Object.keys(state).length === 0;

  if (stateBroken) {
    // F-11: битый state не даёт права считать чужие файлы своими — fallback-скан не запускаем.
    entries.push({
      target: STATE_REL,
      kind: 'skip',
      detail: 'sync-state is unreadable (broken JSON) — stamp fallback disabled, remove manually after inspection',
    });
  } else if (stateEmpty) {
    // Fallback (F-03): легаси без state — штамп = wolf-owned.
    for (const root of SCAN_ROOTS) {
      for (const f of deps.listFiles(join(deps.baseDir, root))) {
        const raw = deps.readFile(f);
        if (raw !== null && parseStamp(raw) !== null) {
          entries.push({ target: rel(deps.baseDir, f), kind: 'file' });
        }
      }
    }
  } else {
    const recorded = new Set(Object.keys(state));
    for (const relPath of recorded) {
      if (ROOT_DOCS.has(relPath)) {
        entries.push({
          target: relPath,
          kind: 'skip',
          detail: 'kept by design (may contain user content) — remove the wolf block manually if unwanted',
        });
        continue;
      }
      const abs = join(deps.baseDir, relPath);
      if (!deps.exists(abs)) {
        // C-03: отсутствие файла — тоже отчётная строка, не тихий continue.
        entries.push({ target: relPath, kind: 'skip', detail: 'recorded in sync-state but missing on disk' });
        continue;
      }
      const raw = deps.readFile(abs);
      if (raw !== null && parseStamp(raw) === null) {
        entries.push({
          target: relPath,
          kind: 'skip',
          detail: 'file exists but has no wolf stamp — not removing (cross-check, ADR-2)',
        });
        continue;
      }
      entries.push({ target: relPath, kind: 'file' });
    }
    // C-04: штампованный, но не записанный в state — отчётная skip-строка (не удаляем).
    for (const root of SCAN_ROOTS) {
      for (const f of deps.listFiles(join(deps.baseDir, root))) {
        const relPath = rel(deps.baseDir, f);
        if (recorded.has(relPath)) continue;
        const raw = deps.readFile(f);
        if (raw !== null && parseStamp(raw) !== null) {
          entries.push({ target: relPath, kind: 'skip', detail: 'stamped but unrecorded — not in sync-state' });
        }
      }
    }
  }

  // Сам реестр штампов — тоже след Wolf (кроме случая broken: предупреждающая строка уже в плане).
  if (!stateBroken && deps.exists(join(deps.baseDir, STATE_REL))) {
    entries.push({ target: STATE_REL, kind: 'file' });
  }

  // Конфиги платформ, которые писал Wolf (OpenCode opencode.json, Claude Code .mcp.json).
  for (const adapter of deps.adapters) {
    if (typeof adapter.removeWolfKeys !== 'function' || !adapter.detect(deps.baseDir)) continue;
    const cfg = await adapter.readConfig(deps.baseDir).catch(() => null);
    if (cfg === null) {
      entries.push({
        target: `config:${adapter.id}`,
        kind: 'config',
        detail: 'no readable config file — will be skipped with reason',
      });
    } else {
      entries.push({
        target: `config:${adapter.id}`,
        kind: 'config',
        detail: 'wolf keys with our exact values will be removed',
      });
    }
  }

  // .wolf/ — не удаляем по умолчанию (память проекта); --purge стирает.
  if (deps.exists(join(deps.baseDir, '.wolf'))) {
    entries.push({ target: '.wolf', kind: 'skip', detail: 'project memory kept by default — pass --purge to erase' });
  }

  return { entries };
}

/**
 * Без yes — ничего не пишет (NFR-02). С yes — удаляет по плану; ошибки отдельных
 * файлов попадают в errors, остальные продолжаются (частичный сбой, U-11).
 */
export async function executeUninstall(
  deps: UninstallDeps,
  plan: UninstallPlan,
  opts: { yes: boolean; purge: boolean }
): Promise<UninstallResult> {
  if (!opts.yes) return { actions: [], errors: [], plan };
  const actions: string[] = [];
  const errors: string[] = [];
  const fileTargets = plan.entries.filter((e) => e.kind === 'file');
  for (const e of fileTargets) {
    try {
      await deps.removeFile(join(deps.baseDir, e.target));
      actions.push(`${e.target} — removed`);
    } catch (err) {
      errors.push(`${e.target} — remove failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Пустые каталоги набора убираем снизу вверх; непустые (чужой контент) не трогаем.
  // Q-02: только когда реально удаляли wolf-файлы — пустые пользовательские каталоги не трогаем.
  if (fileTargets.length > 0) {
    for (const root of SCAN_ROOTS) {
      const abs = join(deps.baseDir, root);
      const dirs = deps.listDirs(abs);
      for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
        if (await deps.removeDirIfEmpty(d)) actions.push(`${rel(deps.baseDir, d)} — removed (empty)`);
      }
      if (await deps.removeDirIfEmpty(abs)) actions.push(`${root} — removed (empty)`);
    }
  }
  for (const e of plan.entries.filter((x) => x.kind === 'config')) {
    const id = e.target.slice('config:'.length);
    const adapter = deps.adapters.find((a) => a.id === id);
    if (!adapter?.removeWolfKeys) continue;
    try {
      const r = await adapter.removeWolfKeys(deps.baseDir);
      actions.push(
        `config ${id}: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.keys?.length ? ` [${r.keys.join(', ')}]` : ''}`
      );
    } catch (err) {
      errors.push(`config ${id} — failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (fileTargets.length === 0) {
    actions.push('nothing to remove — no wolf-managed files in .opencode');
  }
  const wolfKept = plan.entries.find((e) => e.target === '.wolf');
  if (opts.purge && deps.exists(join(deps.baseDir, '.wolf'))) {
    await deps.removeTree(join(deps.baseDir, '.wolf'));
    actions.push('.wolf — removed (--purge)');
  } else if (wolfKept && !opts.purge) {
    actions.push(`.wolf — kept (project memory; ${wolfKept.detail ?? ''})`);
  }
  actions.push('hint: to remove the global binary, run: npm uninstall -g mister-wolf');
  actions.push('note: AGENTS.md/CLAUDE.md wolf blocks are not removed — remove manually if unwanted');
  return { actions, errors, plan };
}

function rel(baseDir: string, abs: string): string {
  return abs.startsWith(baseDir + '/') ? abs.slice(baseDir.length + 1) : abs;
}
