// REQ-02 (2.16.2): ремонт платформы «установлено под v1, рантайм v2» — перерендер
// штампованных файлов (syncBaseSet) + канонизация конфига (writeConfig).
// Гвард (F-01/F-10): без установки или без wolf-контента — честный skip, ноль записей.
import type { RenderOutcome } from '../../ports/base-set-renderer.port.js';
import type { PlatformWriteResult } from '../../ports/platform-adapter.port.js';

export interface RepairPlatformDeps {
  baseDir: string;
  /** Платформа детектится по маркерам (конфиг/.opencode). */
  detect: () => boolean;
  /** Записи wolf-sync-state; null — файла нет. */
  syncStateFiles: () => Record<string, string> | null;
  /** Строки несоответствия (detectPlatformMismatch) — для плана. */
  mismatch: () => Promise<string[]>;
  /** Штатный перерендер штампованных файлов (mutated-skip внутри). */
  syncBaseSet: () => Promise<{ outcomes: RenderOutcome[]; orphaned: string[] }>;
  writeConfig: () => Promise<PlatformWriteResult>;
}

export interface RepairPlatformReport {
  /** План/действия для dry-run (без записей). */
  plan: string[];
  /** Фактические действия (пусто в dry-run). */
  actions: string[];
  /** Штампованные файлы вне текущего набора (repair не трогает, F-02). */
  orphaned: string[];
  /** Рекомендация по orphaned. */
  orphanedNote: string;
  /** Причина skip или null. */
  skipped: string | null;
}

export async function repairPlatform(
  deps: RepairPlatformDeps,
  opts: { dryRun: boolean }
): Promise<RepairPlatformReport> {
  const empty: RepairPlatformReport = { plan: [], actions: [], orphaned: [], orphanedNote: '', skipped: null };
  if (!deps.detect()) return { ...empty, skipped: 'no opencode install' };
  const state = deps.syncStateFiles();
  if (state === null || Object.keys(state).length === 0) {
    return { ...empty, skipped: 'no wolf-managed content in .opencode' };
  }
  const mismatchLines = await deps.mismatch();
  const plan = [
    ...mismatchLines.map((m) => `mismatch: ${m}`),
    `syncBaseSet: re-render ${Object.keys(state).length} stamped file(s) under current templates`,
    'writeConfig: canonicalize mcp.wolf / default_agent / subagent_depth',
  ];
  if (opts.dryRun) return { ...empty, plan };
  const { outcomes, orphaned } = await deps.syncBaseSet();
  const actions = outcomes.map((o) => `${o.file} — ${o.action}${o.reason ? ` (${o.reason})` : ''}`);
  const wc = await deps.writeConfig();
  actions.push(`writeConfig: ${wc.action}${wc.reason ? ` (${wc.reason})` : ''}`);
  return {
    plan,
    actions,
    orphaned,
    orphanedNote:
      orphaned.length > 0
        ? 'orphaned stamped files are not touched by repair — remove manually or run wolf uninstall'
        : '',
    skipped: null,
  };
}
