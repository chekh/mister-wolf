// src/app/use-cases/project-step.ts
// T6 (волна 2.19.0, REQ-03/07/11, ADR-3/4, design §«Проектный шаг»): тонкая
// композиция ОДНОГО проекта — sync → removals → посев → миграция → сверка.
// Семантика шагов живёт в самих шагах (ADR-3); здесь только порядок фаз,
// ввод подтверждения удалений (REQ-02/ADR-4) и сведение исходов в ProjectReport
// (контракт для оркестратора T7 и рендера T3). Пофазная фиксация: записи фаз
// атомарны внутри шагов, сбой фазы k не откатывает k-1 — повтор доводит до
// конца (NFR-02). Единственная мутация памяти — посев (REQ-07).
import { existsSync, readFileSync } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { basename, extname, join } from 'path';
import type { BaseSetRenderer, ModelContext } from '../../ports/base-set-renderer.port.js';
import type { UpdateMap } from '../../adapters/fs/update-map.js';
import { ensureCurrentSchema } from '../../adapters/fs/schema-guard.js';
import { writeFileAtomic } from '../../adapters/fs/markdown-memory-store.js';
import { loadSyncState, sha256, type SyncEntry } from '../../adapters/render/sync-state.js';
import { normalizeManaged, parseProtect } from '../../domain/protect-key.js';
import { syncBaseSet } from './sync-base-set.js';
import { seedBasePlaybooks, type SeedDeps, type SeedOutcome } from './seed-base-playbooks.js';
import {
  projectPath as mapEntryProjectPath,
  verifyAgainstMap,
  type SyncVerifyOutcome,
  type VerifyResult,
} from './verify-against-map.js';

/** Внешние зависимости шага: посев (SeedDeps без mode — режим задаёт шаг;
 * files — базовые имена шаблонов, прецедент сборки memory-init.ts:183-196) +
 * рендерер base-set. Контейнер собирает вызывающий слой (T7/Ф4), не шаг. */
export interface ProjectStepDeps extends Omit<SeedDeps, 'mode'> {
  renderer: BaseSetRenderer;
  /** Контекст моделей для sync-рендера (§4.5); дефолт 'omit' (прецедент sync). */
  models?: ModelContext | 'omit';
  /** Замер wall-time шага (NFR-03); дефолт Date.now. */
  now?: () => number;
}

/** Подтверждение REQ-02: проектные пути removed-целей, покрытые единым
 * списком. Шаг НЕ спрашивает второго подтверждения (ADR-4) — но и не
 * удаляет ничего без него (fail-safe: без opts.confirmedRemovals удалений нет,
 * оставшиеся removed-цели дают error сверки — план не доведён). */
export interface ProjectStepOpts {
  confirmedRemovals?: string[];
}

/** Итог шага по exit-модели design §«Exit-модель»: 0-подобный / требует
 * решения / error. Сам exit-код ставит CLI-слой (T7/T9), не шаг. */
export type ExitKind = 'done' | 'needs-decision' | 'error';

/** Локальная копия контента перед удалением/перезаписью (design §4.12, NFR-05):
 *  `.wolf/backup/upgrade/<YYYY-MM-DD>/<rel>`, при коллизии — `base-2.ext`,
 *  `base-3.ext` … (первый свободный, без перезаписи). Единственная реализация
 *  формата на волну: `--resolve` (T7) и `--yes` (T10) используют эту же функцию. */
export async function backupLocalFile(
  root: string,
  rel: string,
  content: string,
  now: Date
): Promise<{ path: string; created: boolean }> {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0')))
    .join('-');
  const relTarget = `.wolf/backup/upgrade/${date}/${rel}`;
  const ext = extname(relTarget);
  const stem = relTarget.slice(0, relTarget.length - ext.length);
  let path = relTarget;
  for (let n = 2; existsSync(join(root, path)); n++) path = `${stem}-${n}${ext}`;
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFileAtomic(join(root, path), content);
  return { path, created: path === relTarget };
}

/** Отчёт по проекту — вход рендера T3 и сводки парка T7. */
export interface ProjectReport {
  /** Имя (basename) и корень проекта. */
  name: string;
  root: string;
  /** Фазы 1-2: исходы sync; осиротевшие, ОСТАВШИЕСЯ после шага удалений
   * (дрейф без объявления); удалённые в этом проходе (подтверждённые).
   * `outcomes` включает факты защищённых removed-целей (`protected`): они не
   * удаляются и в `removed` не попадают. */
  sync: { outcomes: SyncVerifyOutcome[]; orphaned: string[]; removed: string[] };
  /** Фаза 3: исходы посева — единственная мутация памяти (REQ-07). */
  seed: SeedOutcome[];
  /** Фаза 4: ленивая миграция схемы (backup — внутри guard); refused —
   * отказ guard (например схема из будущего), ошибка передаётся как есть. */
  schema: { status: 'ok' | 'migrated' | 'refused'; error?: string };
  /** Фаза 5: строгая сверка с картой — каждый пункт со статусом (T5). */
  verify: VerifyResult;
  /** Перезаписи и удаления с бэкапом локального контента (правила 6′/7 §4.3,
   *  §4.12): путь файла и путь копии — вход дайджеста и `--json.projects[].backups`. */
  backups?: Array<{ file: string; backup: string }>;
  /** Замер шага (NFR-03), мс; минимум 1 — разрешение Date.now-обёртки. */
  wallMs: number;
  exitKind: ExitKind;
}

export async function runProjectStep(
  deps: ProjectStepDeps,
  root: string,
  map: UpdateMap,
  opts: ProjectStepOpts = {}
): Promise<ProjectReport> {
  const now = deps.now ?? Date.now;
  const startedAt = now();

  // 1. sync: перезапись / skip-mutated / identical; orphaned — вход шага удалений.
  const { outcomes: syncOutcomes, orphaned } = await syncBaseSet(deps.renderer, root, deps.models ?? 'omit');

  // 2. removals: удаляется только объявленное картой И подтверждённое списком
  // REQ-02 (второго подтверждения нет — ADR-4). Прочий orphaned не трогаем.
  // Защищённая цель не удаляется никогда (REQ-05, правило 2 §4.3): она остаётся
  // `protected` с подсказкой, как снять защиту (`--resolve <путь>=keep` снимает
  // ключ, после чего файл снова попадает в список удалений — матрица §4.8).
  const removedTargets = new Set(map.files.filter((e) => e.category === 'removed').map((e) => mapEntryProjectPath(e)));
  const confirmed = new Set(opts.confirmedRemovals ?? []);
  const removed: string[] = [];
  const removalBackups: Array<{ file: string; backup: string }> = [];
  const heldRemovals: SyncVerifyOutcome[] = [];
  for (const p of orphaned) {
    if (!removedTargets.has(p) || !confirmed.has(p)) continue;
    const abs = join(root, p);
    if (!existsSync(abs)) continue; // исчез между сканом и удалением — удалять нечего
    const current = readFileSync(abs, 'utf-8');
    const protect = parseProtect(current);
    if (protect.held) {
      heldRemovals.push({
        file: p,
        action: 'skipped',
        protected: true,
        protect: protect.value ?? protect.raw ?? '',
        reason: `declared removed but held by protect — unprotect to allow removal: wolf upgrade --resolve ${p}=keep`,
      });
      continue;
    }
    // NFR-05: у removed-цели эталона нет — локальный контент всегда сначала в бэкап.
    removalBackups.push({ file: p, backup: (await backupLocalFile(root, p, current, new Date(now()))).path });
    await unlink(abs);
    removed.push(p);
  }
  // Контракт T5: removals = подтверждённо отсутствующие ПОСЛЕ шага — удалённые
  // теперь или отсутствовавшие ранее (идемпотентность повтора, NFR-02).
  const removals = [...removedTargets].filter((p) => confirmed.has(p) && !existsSync(join(root, p)));
  // Дрейф без объявления: оставшийся orphaned вне карты — факт для сверки.
  // До генерации conflict проверяются protect и kept (§4.3, §4.6): защищённая
  // вариация и принятый локальный контент — не решения, а свои коды.
  const witness = loadSyncState(root);
  const drift: SyncVerifyOutcome[] = orphaned
    .filter((p) => !removedTargets.has(p))
    .map((p) => orphanOutcome(root, p, witness.files[p]));

  // 3. посев — только недостающие лица (mode задаёт шаг) и только шаблоны,
  // объявленные картой с seed:true; deprecated-шаблоны не сеются (REQ-11).
  const seedTemplates = new Set(map.faces.filter((f) => f.seed).map((f) => basename(f.template)));
  const seedFiles = new Map([...deps.files].filter(([file]) => seedTemplates.has(file)));
  const seedOutcomes = await seedBasePlaybooks({ ...deps, files: seedFiles, mode: 'seed-missing-only' });

  // 4. миграция: отказ guard'а (например схема из будущего) — в отчёт как есть,
  // не крах шага; эффекты фаз 1-3 стабильны.
  let schema: ProjectReport['schema'] = { status: 'ok' };
  try {
    schema = { status: await ensureCurrentSchema(root) };
  } catch (err) {
    schema = { status: 'refused', error: err instanceof Error ? err.message : String(err) };
  }

  // 5. сверка: исходы всех фаз → статус каждого пункта карты. Факты
  // защищённых removed-целей идут тем же кодом `protected` (не error/removed).
  const verify = verifyAgainstMap(map, {
    syncOutcomes: [...syncOutcomes, ...drift, ...heldRemovals],
    seedOutcomes,
    removals,
  });

  const errors = verify.summary.errors + (schema.status === 'refused' ? 1 : 0);
  const exitKind: ExitKind = errors > 0 ? 'error' : verify.summary.needsDecision > 0 ? 'needs-decision' : 'done';

  const backups = [
    ...syncOutcomes
      .filter((o): o is SyncVerifyOutcome & { backup: string } => typeof o.backup === 'string')
      .map((o) => ({ file: o.file, backup: o.backup })),
    ...removalBackups,
  ];

  return {
    name: basename(root),
    root,
    sync: {
      outcomes: [...syncOutcomes, ...heldRemovals],
      orphaned: orphaned.filter((p) => !removed.includes(p)),
      removed,
    },
    seed: seedOutcomes,
    schema,
    verify,
    backups,
    wallMs: Math.max(1, now() - startedAt),
    exitKind,
  };
}

/** Исход orphan для сверки: protect (§4.3) → protected; свидетель origin:'keep' → kept;
 *  иначе — конфликт дрейфа без объявления (путь печатается именем, REQ-01). */
function orphanOutcome(root: string, rel: string, entry: string | SyncEntry | undefined): SyncVerifyOutcome {
  const abs = join(root, rel);
  const current = existsSync(abs) ? readFileSync(abs, 'utf-8') : '';
  const protect = parseProtect(current);
  if (protect.held) {
    return {
      file: rel,
      action: 'skipped',
      protected: true,
      protect: protect.value ?? protect.raw ?? '',
      reason: 'orphaned but held by protect — sanctioned local variation',
    };
  }
  const hash = typeof entry === 'string' ? entry : entry?.hash;
  if (entry && typeof entry !== 'string' && entry.origin === 'keep' && hash === sha256(normalizeManaged(current))) {
    return {
      file: rel,
      action: 'skipped',
      kept: true,
      reason: `orphaned but locally accepted (keep) at ${entry.base}`,
    };
  }
  return {
    file: rel,
    action: 'conflict',
    reason: 'orphaned after pass — stamped file outside the map, not declared removed (drift without declaration)',
  };
}
