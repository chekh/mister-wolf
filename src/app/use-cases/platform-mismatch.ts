// REQ-02 (2.16.2): детект несоответствия «установлено под v1, рантайм v2».
// installedSet — только по записям wolf-sync-state (свидетели рендера Wolf) с
// cross-check штампа; скан диска, включая сироты, зациклил бы ремонт (design §C2, F-02).
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseStamp } from '../../adapters/render/stamp.js';
import type { PlatformVersionInfo } from '../../ports/platform-adapter.port.js';

/** Выпуск, с которого шаблоны плагинов dual (v1+v2 в одном файле) — hotfix 2.14.1. */
export const DUAL_SINCE = '2.14.1';

export interface PlatformMismatch {
  platform: string;
  runtime: PlatformVersionInfo;
  installedSet: string;
  issue: string;
}

export interface MismatchDeps {
  baseDir: string;
  /** Уже вычисленная версия рантайма платформы (adapter.detectVersion). */
  runtime: () => PlatformVersionInfo;
  /** Толерантная загрузка sync-state; null — файла/свидетельства нет. */
  readSyncState: () => { files: Record<string, string> } | null;
  /** Прочитать файл проекта; null — нет/нечитаем. */
  readFile: (absPath: string) => string | null;
}

/** Сравнение semver-строк X.Y.Z; не-семвер → null. */
export function compareSemver(a: string, b: string): number | null {
  const pa = a.match(/^(\d+)\.(\d+)\.(\d+)$/);
  const pb = b.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!pa || !pb) return null;
  const [ma, na, ka] = [Number(pa[1]), Number(pa[2]), Number(pa[3])];
  const [mb, nb, kb] = [Number(pb[1]), Number(pb[2]), Number(pb[3])];
  if (ma !== mb) return ma < mb ? -1 : 1;
  if (na !== nb) return na < nb ? -1 : 1;
  if (ka !== kb) return ka < kb ? -1 : 1;
  return 0;
}

/**
 * Mismatch однонаправлен по конструкции (design ADR-1): dual-шаблоны работают в обоих
 * рантаймах; правило сравнения формы рендера и рантайма задействуется константой,
 * когда появится v2-only выпуск.
 */
export async function detectPlatformMismatch(deps: MismatchDeps): Promise<PlatformMismatch | null> {
  const rt = deps.runtime();
  if (rt.status !== 'v2') return null;
  const state = deps.readSyncState();
  if (state === null) return null; // без свидетельства рендера ничего не утверждаем
  const sets: string[] = [];
  for (const [rel] of Object.entries(state.files)) {
    if (!rel.startsWith('.opencode/plugins/')) continue;
    const raw = deps.readFile(join(deps.baseDir, rel));
    if (raw === null) continue;
    const stamp = parseStamp(raw);
    if (stamp === null) continue; // запись без штампа не наша (F-02 cross-check)
    sets.push(stamp.set);
  }
  if (sets.length === 0) return null;
  // Q-01: не-семверные штампы исключаем до reduce — порядок записей не влияет на результат.
  const parseable = sets.filter((s) => compareSemver(s, '0.0.0') !== null);
  if (parseable.length === 0) return null;
  const min = parseable.reduce((acc, s) => {
    const c = compareSemver(s, acc);
    return c !== null && c < 0 ? s : acc;
  }, parseable[0]);
  const cmp = compareSemver(min, DUAL_SINCE);
  if (cmp === null || cmp >= 0) return null;
  return {
    platform: 'opencode',
    runtime: rt,
    installedSet: min,
    issue: `opencode: installed under v1 (set ${min} < ${DUAL_SINCE}), runtime v2 — plugins are v1-only, run wolf doctor --repair`,
  };
}
