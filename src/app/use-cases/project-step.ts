// src/app/use-cases/project-step.ts
// T6 (волна 2.19.0, REQ-03/07/11, ADR-3/4, design §«Проектный шаг»): тонкая
// композиция ОДНОГО проекта — sync → removals → посев → миграция → сверка.
// Семантика шагов живёт в самих шагах (ADR-3); здесь только порядок фаз,
// ввод подтверждения удалений (REQ-02/ADR-4) и сведение исходов в ProjectReport
// (контракт для оркестратора T7 и рендера T3). Пофазная фиксация: записи фаз
// атомарны внутри шагов, сбой фазы k не откатывает k-1 — повтор доводит до
// конца (NFR-02). Единственная мутация памяти — посев (REQ-07).
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import type { BaseSetRenderer, ModelContext } from '../../ports/base-set-renderer.port.js';
import type { UpdateMap } from '../../adapters/fs/update-map.js';
import { ensureCurrentSchema } from '../../adapters/fs/schema-guard.js';
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

/** Отчёт по проекту — вход рендера T3 и сводки парка T7. */
export interface ProjectReport {
  /** Имя (basename) и корень проекта. */
  name: string;
  root: string;
  /** Фазы 1-2: исходы sync; осиротевшие, ОСТАВШИЕСЯ после шага удалений
   * (дрейф без объявления); удалённые в этом проходе (подтверждённые). */
  sync: { outcomes: SyncVerifyOutcome[]; orphaned: string[]; removed: string[] };
  /** Фаза 3: исходы посева — единственная мутация памяти (REQ-07). */
  seed: SeedOutcome[];
  /** Фаза 4: ленивая миграция схемы (backup — внутри guard); refused —
   * отказ guard (например схема из будущего), ошибка передаётся как есть. */
  schema: { status: 'ok' | 'migrated' | 'refused'; error?: string };
  /** Фаза 5: строгая сверка с картой — каждый пункт со статусом (T5). */
  verify: VerifyResult;
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
  const removedTargets = new Set(map.files.filter((e) => e.category === 'removed').map((e) => mapEntryProjectPath(e)));
  const confirmed = new Set(opts.confirmedRemovals ?? []);
  const removed: string[] = [];
  for (const p of orphaned) {
    if (!removedTargets.has(p) || !confirmed.has(p)) continue;
    await unlink(join(root, p));
    removed.push(p);
  }
  // Контракт T5: removals = подтверждённо отсутствующие ПОСЛЕ шага — удалённые
  // теперь или отсутствовавшие ранее (идемпотентность повтора, NFR-02).
  const removals = [...removedTargets].filter((p) => confirmed.has(p) && !existsSync(join(root, p)));
  // Дрейф без объявления: оставшийся orphaned вне карты — факт для сверки
  // («файл вне карты» → conflict → «требует решения», design §«Сверка»).
  const drift: SyncVerifyOutcome[] = orphaned
    .filter((p) => !removedTargets.has(p))
    .map((p) => ({
      file: p,
      action: 'conflict',
      reason: 'orphaned after pass — stamped file outside the map, not declared removed (drift without declaration)',
    }));

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

  // 5. сверка: исходы всех фаз → статус каждого пункта карты.
  const verify = verifyAgainstMap(map, {
    syncOutcomes: [...syncOutcomes, ...drift],
    seedOutcomes,
    removals,
  });

  const errors = verify.summary.errors + (schema.status === 'refused' ? 1 : 0);
  const exitKind: ExitKind = errors > 0 ? 'error' : verify.summary.needsDecision > 0 ? 'needs-decision' : 'done';

  return {
    name: basename(root),
    root,
    sync: { outcomes: syncOutcomes, orphaned: orphaned.filter((p) => !removed.includes(p)), removed },
    seed: seedOutcomes,
    schema,
    verify,
    wallMs: Math.max(1, now() - startedAt),
    exitKind,
  };
}
