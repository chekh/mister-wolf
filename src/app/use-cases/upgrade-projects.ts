// src/app/use-cases/upgrade-projects.ts
// T7 (волна 2.19.0, REQ-01/02/05/06/09, design §«Фазы», §«Список подтверждения»,
// §«Exit-модель», §«Гварды прохода», §«Вайрфреймы»): оркестратор прохода парка
// — планы из реестра + карты, одно подтверждение списка (ADR-4: покрывает и
// удаления), изоляция сбоев per-project (REQ-06), парковые счётчики (REQ-05),
// exit 0/1/2, скан незарегистрированных после сводного отчёта (REQ-09).
// Без CLI-обвязки: hidden-команда, npm-фаза, re-exec, banner и печать
// подтверждения — T8 (Ф5); use-case детерминирован для тестов exit-модели:
// катастрофы (lock занят, реестр/карта нечитаемы) — результат с exitCode 1,
// не throw; caller печатает report и выходит с exitCode.
import { readFileSync, realpathSync } from 'fs';
import { basename, join } from 'path';
import { dedupeByRealpath, type RegisteredProject } from '../../adapters/fs/projects-registry.js';
import { resolveMemoryRoot } from '../../adapters/fs/memory-root.js';
import { loadSyncState } from '../../adapters/render/sync-state.js';
import { parseStamp } from '../../adapters/render/stamp.js';
import { compareVersions, type UpdateMap } from '../../adapters/fs/update-map.js';
import type { Counter, Marker, ReportNode } from '../../adapters/cli/report-renderer.js';
import { runProjectStep, type ProjectReport, type ProjectStepDeps } from './project-step.js';
import { projectPath } from './verify-against-map.js';
import { scanUnregistered } from './scan-unregistered.js';

/** id lock'а параллельного upgrade (T4 UpgradeLock, design «Гварды прохода»). */
const LOCK_ID = 'wolf-upgrade';

const SECTION_TITLE = 'wolf upgrade — projects';

export interface UpgradeProjectsDeps {
  /** Реестр проектов; listStrict различает «пусто» и «нечитаем» (T4). */
  registry: { listStrict(): Promise<RegisteredProject[]> };
  /** Карта установленного релиза (T1), один раз на проход. */
  loadMap: () => UpdateMap;
  /** Проектный шаг (T6); мок в юнит-контуре, дефолт — runProjectStep. */
  runStep?: typeof runProjectStep;
  /** Фабрика проектных deps: адаптеры памяти привязаны к корню проекта
   * (store/log/lock — per-project), один набор на весь парк невозможен.
   * Собирает вызывающий слой (T8-контейнер), не проход. */
  makeStepDeps: (root: string) => ProjectStepDeps;
  /** Lock параллельного upgrade (T4); отсутствует — проход без lock. */
  upgradeLock?: { acquire(id: string): boolean; release(id: string): void };
  /** Скан незарегистрированных (REQ-09, T12); отсутствует — скан не выполняется
   * (изоляция юнит-контура: дефолт скана — домашний каталог). */
  scan?: typeof scanUnregistered;
}

export interface UpgradeProjectsOpts {
  /** --yes: применить список без вопросов (REQ-02). */
  yes?: boolean;
  /** TTY-режим caller'а: подтверждение возможно только в TTY. */
  tty?: boolean;
  /** Интерактивное подтверждение списка; вызывается при tty && !yes.
   * Аргумент — plans-секция (список+категории REQ-02): caller показывает её
   * ДО вопроса (design «Фазы»: список+категории → подтверждение). */
  confirm?: (plans: ReportNode) => boolean | Promise<boolean>;
  /** Дефолт часов шагов (NFR-03), если фабрика шага не задала свои. */
  now?: () => number;
}

export interface UpgradeRunResult {
  exitCode: 0 | 1 | 2;
  report: ReportNode;
  counters: Counter[];
}

/** Статус проекта в проходе (REQ-05, палитра T3). */
type OutcomeStatus = 'updated' | 'up-to-date' | 'needs-decision' | 'error';
/** Статус плана: показан, пропущен (гварды прохода). */
type PlanStatus = 'worktree' | 'pinned' | 'missing';

interface ProjectPlan {
  name: string;
  /** realpath (несуществующий путь — как есть в реестре). */
  path: string;
  status: PlanStatus | null;
  /** Справочный состав (REQ-02): max set= по штампам свидетеля рендера. */
  composition: string | null;
  /** Минимальный set= — свидетель неоднородности штампов. */
  stampFloor: string | null;
}

interface StepOutcome {
  plan: ProjectPlan;
  status: OutcomeStatus;
  report?: ProjectReport;
  error?: string;
}

const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const line = (marker: Marker, text: string, dim = false): ReportNode => ({ kind: 'line', marker, text, dim });

/** Катастрофы прохода (lock занят, реестр/карта нечитаемы) — результат, не
 * throw: exit 1 + error-строка; проекты не тронуты (контракт lead). */
function guardFailure(message: string): UpgradeRunResult {
  return {
    exitCode: 1,
    report: {
      kind: 'section',
      title: SECTION_TITLE,
      children: [line('error', message), line('error', 'Failed')],
    },
    counters: [],
  };
}

export async function runUpgradeProjects(
  deps: UpgradeProjectsDeps,
  opts: UpgradeProjectsOpts = {}
): Promise<UpgradeRunResult> {
  const lock = deps.upgradeLock;
  if (lock) {
    try {
      lock.acquire(LOCK_ID);
    } catch (err) {
      // чужой живой lock: не снимаем (release удалил бы файл владельца)
      return guardFailure(msg(err));
    }
  }
  try {
    return await runPass(deps, opts);
  } finally {
    lock?.release(LOCK_ID);
  }
}

async function runPass(deps: UpgradeProjectsDeps, opts: UpgradeProjectsOpts): Promise<UpgradeRunResult> {
  let registered: RegisteredProject[];
  try {
    registered = await deps.registry.listStrict();
  } catch (err) {
    return guardFailure(`failed to read the projects registry: ${msg(err)}`);
  }
  if (registered.length === 0) {
    return {
      exitCode: 0,
      report: {
        kind: 'section',
        title: SECTION_TITLE,
        children: [
          line('info', 'no projects in the registry — run wolf init in a project to register it'),
          line('ok', 'Done: no projects'),
        ],
      },
      counters: [],
    };
  }

  let map: UpdateMap;
  try {
    map = deps.loadMap();
  } catch (err) {
    return guardFailure(`failed to load the update map: ${msg(err)}`);
  }

  // Планы: realpath → статусы worktree/pinned/missing; дедуп по realpath —
  // дубль отмечается в отчёте, второй записи прохода нет (design «Гварды»).
  const { unique, duplicates } = dedupeByRealpath(registered);
  const plans = unique.map(planOf);
  const active = plans.filter((p) => p.status === null);

  // Подтверждение списка (REQ-02): --yes — без вопросов; TTY — confirm;
  // не-TTY/без confirm — проход пропущен (не ошибка, exit 0).
  let proceed = opts.yes === true;
  let declinedByUser = false;
  if (!proceed && opts.tty && opts.confirm) {
    // планы передаются аргументом — список показывается ДО вопроса (REQ-02)
    proceed = await opts.confirm(plansSection(plans, registered.length, duplicates, map));
    declinedByUser = !proceed;
  }
  if (!proceed) {
    const finalText = declinedByUser ? 'Cancelled — no changes' : 'Cancelled: --yes is required';
    return {
      exitCode: 0,
      report: {
        kind: 'section',
        title: SECTION_TITLE,
        children: [plansSection(plans, registered.length, duplicates, map), line('info', finalText, true)],
      },
      counters: [],
    };
  }

  // Подтверждение списка покрывает и удаления (ADR-4): removed-цели карты —
  // подтверждённые, второго вопроса шаг не задаёт.
  const confirmedRemovals = map.files.filter((f) => f.category === 'removed').map(projectPath);
  const runStep = deps.runStep ?? runProjectStep;
  const outcomes: StepOutcome[] = [];
  for (const plan of active) {
    try {
      const report = await runStep(withNow(deps.makeStepDeps(plan.path), opts.now), plan.path, map, {
        confirmedRemovals,
      });
      outcomes.push({ plan, status: statusOf(report), report });
    } catch (err) {
      // Изоляция сбоев (REQ-06): ошибка проекта не останавливает обход.
      outcomes.push({ plan, status: 'error', error: msg(err) });
    }
  }

  // Счётчики (REQ-05/R11.6): статусы парка + категории карты (один раз) + досеяно лиц.
  const planStatuses: Record<PlanStatus, number> = { worktree: 0, pinned: 0, missing: 0 };
  for (const plan of plans) if (plan.status) planStatuses[plan.status]++;
  const stepStatuses: Record<OutcomeStatus, number> = {
    updated: 0,
    'up-to-date': 0,
    'needs-decision': 0,
    error: 0,
  };
  let facesSeeded = 0;
  for (const o of outcomes) {
    stepStatuses[o.status]++;
    if (o.report) {
      facesSeeded += o.report.seed.filter((s) => s.kind === 'seeded' || s.kind === 'legacy-absorbed').length;
    }
  }
  const cats = mapCategories(map);
  const counters: Counter[] = [
    { label: 'updated', count: stepStatuses.updated },
    { label: 'up-to-date', count: stepStatuses['up-to-date'] },
    { label: 'worktree', count: planStatuses.worktree },
    { label: 'pinned', count: planStatuses.pinned },
    { label: 'missing', count: planStatuses.missing },
    { label: 'needs decision', count: stepStatuses['needs-decision'] },
    { label: 'errors', count: stepStatuses.error },
    { label: 'new', count: cats.new },
    { label: 'changed', count: cats.changed },
    { label: 'deprecated', count: cats.deprecated },
    { label: 'removed', count: cats.removed },
    { label: 'faces seeded', count: facesSeeded },
  ];

  // Exit-модель (design §«Exit-модель»): error → 1 «Failed»; 0 error +
  // ≥1 «требует решения» → 2 «Done with attention»; иначе 0 «Done».
  const errors = stepStatuses.error;
  const needsDecision = stepStatuses['needs-decision'];
  const exitCode: 0 | 1 | 2 = errors > 0 ? 1 : needsDecision > 0 ? 2 : 0;
  const finalText = errors > 0 ? 'Failed' : needsDecision > 0 ? 'Done with attention' : 'Done';

  // Скан незарегистрированных (REQ-09): после сводного отчёта; ошибка скана —
  // не ошибка прохода (exitCode не меняется).
  const scan = await scanLines(deps, registered);

  return {
    exitCode,
    report: {
      kind: 'section',
      title: SECTION_TITLE,
      children: [
        plansSection(plans, registered.length, duplicates, map),
        projectsSection(outcomes),
        // Суффикс summary у renderer фиксирован («— Done») и не выражает
        // exit-таблицу — слово финальной строки передаёт оркестратор строкой.
        { kind: 'summary', counters, done: false },
        line(exitCode === 1 ? 'error' : exitCode === 2 ? 'warn' : 'ok', finalText),
        ...scan,
      ],
    },
    counters,
  };
}

/** План одной записи реестра: realpath → статусы (порядок гвардов: missing →
 * worktree → pinned); состав/штамп — справочно, только для активных планов. */
function planOf(entry: RegisteredProject): ProjectPlan {
  let real: string;
  try {
    real = realpathSync(entry.path);
  } catch {
    return { name: basename(entry.path), path: entry.path, status: 'missing', composition: null, stampFloor: null };
  }
  // .wolf/ общий с main-чекоутом — копию пропускает main-запись (design «Гварды»)
  if (resolveMemoryRoot(real).worktree !== null) {
    return { name: basename(real), path: real, status: 'worktree', composition: null, stampFloor: null };
  }
  if (entry.pinned) {
    return { name: basename(real), path: real, status: 'pinned', composition: null, stampFloor: null };
  }
  const stamps = stampVersions(real);
  return { name: basename(real), path: real, status: null, composition: stamps.max, stampFloor: stamps.min };
}

/** Справочные версии состава (REQ-02): max/min set= по штампованным файлам
 * свидетеля рендера (loadSyncState). Штамп недостоверен (инвентаризация §3.4)
 * — свидетель касания, не истина; истина состава — карта.
 * shortcut: неоднородность штампов показана min/max, контент-сверка — зона --check (T10). */
function stampVersions(root: string): { max: string | null; min: string | null } {
  let max: string | null = null;
  let min: string | null = null;
  for (const rel of Object.keys(loadSyncState(root).files)) {
    let stamp: ReturnType<typeof parseStamp>;
    try {
      stamp = parseStamp(readFileSync(join(root, rel), 'utf-8'));
    } catch {
      continue;
    }
    if (!stamp) continue;
    if (max === null || compareVersions(stamp.set, max) > 0) max = stamp.set;
    if (min === null || compareVersions(stamp.set, min) < 0) min = stamp.set;
  }
  return { max, min };
}

/** Статус проекта по отчёту шага (REQ-05): done с фактическими изменениями
 * этого прохода — updated, без — up-to-date; needs-decision/error — как есть.
 * «Действие» берём из фаз шага, не из кодов сверки: verify-код removed —
 * состояние «подтверждённо отсутствует» (идемпотентность NFR-02), в повторном
 * прогоне это не изменение. */
function statusOf(report: ProjectReport): OutcomeStatus {
  if (report.exitKind !== 'done') return report.exitKind;
  const changed =
    report.sync.outcomes.some((o) => o.action === 'updated' || o.action === 'created' || o.action === 'appended') ||
    report.sync.removed.length > 0 ||
    report.seed.some((s) => s.kind === 'seeded' || s.kind === 'legacy-absorbed') ||
    report.schema.status === 'migrated';
  return changed ? 'updated' : 'up-to-date';
}

/** Категории карты (числами, REQ-02/R11.6) — считаются один раз по карте. */
function mapCategories(map: UpdateMap): Record<'new' | 'changed' | 'deprecated' | 'removed', number> {
  const cats = { new: 0, changed: 0, deprecated: 0, removed: 0 };
  for (const f of map.files) {
    if (f.category !== 'unchanged') cats[f.category]++;
  }
  return cats;
}

/** opts.now — дефолт часов шага, если фабрика не задала свои (NFR-03). */
function withNow(deps: ProjectStepDeps, now?: () => number): ProjectStepDeps {
  return deps.now || !now ? deps : { ...deps, now };
}

/** Секция планов/подтверждения (REQ-02, вайрфрейм (1)): обзор реестра,
 * строка плана на запись (поля-контракт), дубликаты realpath. */
function plansSection(
  plans: ProjectPlan[],
  registrySize: number,
  duplicates: RegisteredProject[],
  map: UpdateMap
): ReportNode {
  const cats = mapCategories(map);
  const seedFaces = map.faces.filter((f) => f.seed).length;
  const note: string[] = [];
  const statusCount = (s: PlanStatus) => plans.filter((p) => p.status === s).length;
  const pinned = statusCount('pinned');
  const worktree = statusCount('worktree');
  const missing = statusCount('missing');
  if (pinned) note.push(`${pinned} pinned`);
  if (worktree) note.push(`${worktree} worktree`);
  if (missing) note.push(`${missing} missing`);

  const children: ReportNode[] = [
    line(
      'info',
      `${registrySize} ${registrySize === 1 ? 'project' : 'projects'} in registry${note.length ? ` (${note.join(', ')})` : ''}`
    ),
  ];
  for (const plan of plans) {
    if (plan.status === null) {
      children.push(line('info', `plan: ${plan.name} · ${plan.path}`));
      const floor =
        plan.stampFloor !== null && plan.stampFloor !== plan.composition ? ` (stamps from ${plan.stampFloor})` : '';
      children.push(line('info', `composition ${plan.composition ?? 'unknown'}${floor} → ${map.version}`, true));
      children.push(
        line(
          'info',
          `map: ${cats.new} new · ${cats.changed} changed · ${cats.deprecated} deprecated · ${cats.removed} removed · seed×${seedFaces}`,
          true
        )
      );
    } else {
      const reason =
        plan.status === 'worktree'
          ? ' (shared .wolf with the main checkout)'
          : plan.status === 'missing'
            ? ' (path does not exist)'
            : '';
      children.push(line('skip', `plan: ${plan.name} · ${plan.path} · [${plan.status}] — skipped${reason}`));
    }
  }
  for (const dup of duplicates) {
    children.push(line('info', `duplicate registry entry collapsed: ${dup.path}`, true));
  }
  return { kind: 'section', title: 'Plans', children };
}

/** Отображение статуса в строке отчёта (REQ-05): «требует решения» — текст
 * счётчика, не литерал ExitKind шага. */
const STATUS_TEXT: Record<OutcomeStatus, string> = {
  updated: 'updated',
  'up-to-date': 'up-to-date',
  'needs-decision': 'needs decision',
  error: 'error',
};

/** Секция проектов: строка-статус на проект + детали шага (REQ-05, палитра T3). */
function projectsSection(outcomes: StepOutcome[]): ReportNode {
  const children: ReportNode[] = [];
  for (const o of outcomes) {
    const marker: Marker = o.status === 'error' ? 'error' : o.status === 'needs-decision' ? 'warn' : 'ok';
    children.push(
      line(
        marker,
        o.error ? `${o.plan.name} — error: ${o.error}` : `${o.plan.name} — ${STATUS_TEXT[o.status]}`,
        o.status === 'up-to-date'
      )
    );
    const r = o.report;
    if (!r) continue;
    const bs = baseSetSummary(r);
    if (bs) children.push(line('info', `base-set: ${bs}`, true));
    if (r.seed.length > 0) {
      const faces = r.seed.map((s) => `${s.file.replace(/-playbook\.md$/, '')} ${s.kind ?? s.action}`).join(', ');
      children.push(line('info', `faces: ${faces}`, true));
    }
    if (r.schema.status !== 'ok') {
      children.push(line('warn', `schema: ${r.schema.status}${r.schema.error ? ` — ${r.schema.error}` : ''}`, true));
    }
    const v = r.verify.summary;
    const ok = r.verify.items.length - v.needsDecision - v.errors;
    const parts = [`${ok}/${r.verify.items.length} ok`];
    if (v.needsDecision > 0) parts.push(`${v.needsDecision} needs decision`);
    if (v.errors > 0) parts.push(`${v.errors} errors`);
    children.push(
      line(v.errors > 0 ? 'error' : v.needsDecision > 0 ? 'warn' : 'info', `verify: ${parts.join(' · ')}`, true)
    );
  }
  return { kind: 'section', title: 'Projects', children };
}

/** Исходы sync одной строкой: ненулевые счётчики по действиям. */
function baseSetSummary(r: ProjectReport): string | null {
  if (r.sync.outcomes.length === 0) return null;
  const counts: Record<string, number> = { updated: 0, created: 0, appended: 0, identical: 0, mutated: 0, conflict: 0 };
  for (const o of r.sync.outcomes) {
    if (o.action === 'skipped') {
      if (o.mutated) counts.mutated!++;
      else counts.identical!++;
    } else {
      counts[o.action]!++;
    }
  }
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Строки скана (REQ-09): hint с плюрализацией + топ-пути; сбой — предупреждение. */
async function scanLines(deps: UpgradeProjectsDeps, registered: RegisteredProject[]): Promise<ReportNode[]> {
  if (!deps.scan) return [];
  try {
    const found = await deps.scan({ registeredPaths: registered.map((p) => p.path) });
    if (!found) return [];
    const noun = found.found === 1 ? 'project' : 'projects';
    const lines: ReportNode[] = [
      line(
        'warn',
        `found ${found.found} ${noun} with wolf memory outside the registry; running any wolf command in a project registers it (self-healing)`,
        true
      ),
    ];
    for (const path of found.top) lines.push(line('info', path, true));
    return lines;
  } catch (err) {
    return [line('warn', `unregistered-projects scan failed: ${msg(err)} — pass result unaffected`, true)];
  }
}
