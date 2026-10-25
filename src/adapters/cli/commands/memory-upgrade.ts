import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { basename, dirname, join } from 'path';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { runUpgrade, type UpgradeDeps, type UpgradeOutcome } from '../../../app/use-cases/upgrade.js';
import { UserFacingError } from '../../../domain/errors.js';
import { runProjectStep, type ProjectReport, type ProjectStepDeps } from '../../../app/use-cases/project-step.js';
import {
  backupDigestLines,
  jsonProjectFiles,
  mapCategories,
  STATUS_TEXT,
  statusOf,
  verifyNameLines,
  type OutcomeStatus,
  type UpgradeRunResult,
} from '../../../app/use-cases/upgrade-projects.js';
import {
  applyResolutions,
  collectDecisions,
  parseResolveValues,
  planResolutions,
  resolveShowTarget,
  similarTargets,
  emptyPlan,
  jsonDecisions,
  jsonDiverged,
  jsonProtections,
  type AppliedResolution,
  type DecisionTarget,
  type JsonDiverged,
  type JsonProject,
  type JsonProtection,
  type UpgradeCheckJson,
  type UpgradeJson,
  type DecisionDeps,
  type DecisionRegistry,
  type DivergedFace,
  type ResolutionVerb,
} from '../../../app/use-cases/decisions.js';
import { lineDiff, formatDiff } from '../../../domain/line-diff.js';
import { normalizeManaged, parseProtect } from '../../../domain/protect-key.js';
import { projectPath } from '../../../app/use-cases/verify-against-map.js';
import { compareVersions, loadUpdateMap, type UpdateMap } from '../../fs/update-map.js';
import { ProjectsRegistry, type RegisteredProject } from '../../fs/projects-registry.js';
import { wolfUserConfigDir } from '../../fs/user-config.js';
import type { InspectOutcome, ProtectEntry } from '../../../ports/base-set-renderer.port.js';
import { loadSyncState } from '../../render/sync-state.js';
import { parseStamp } from '../../render/stamp.js';
import { harnessTemplatesRoot, templatesRoot } from '../../render/templates-root.js';
import { OpencodeBaseSetRenderer } from '../../render/opencode/opencode-renderer.js';
import { MarkdownMemoryStore } from '../../fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../fs/jsonl-event-log.js';
import { SQLiteSearchIndex } from '../../sqlite/sqlite-search-index.js';
import { SystemClock } from '../../fs/system-clock.js';
import { HashIdGenerator } from '../../fs/hash-id-generator.js';
import { FsMemoryLock } from '../../fs/memory-lock.js';
import { eventsPath, indexPath, memoryDir } from '../../fs/project-paths.js';
import type { FaceObject } from '../../../app/use-cases/create-face-version.js';
import { colorsEnabled } from '../../../domain/facet-colors.js';
import {
  renderReport,
  type ColorDepth,
  type Counter,
  type Marker,
  type ReportNode,
  type TermEnv,
} from '../report-renderer.js';
import { safeCwd } from '../cli-entry.js';

// wolf upgrade (бриф 2026-09-02): npm-самообновление глобальной установки.
// spawn npm идёт через PATH — e2e подменяет npm фейком первой записью PATH,
// реальный registry в тестах не дёргается.

function readInstalledVersion(): string {
  // dist/adapters/cli/commands/ → корень пакета (package.json в tarball-е рядом с dist/)
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(baseDir, '../../../../package.json'), 'utf-8')) as {
    version: string;
  };
  return pkg.version;
}

function realPathOrNull(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

interface NpmResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function npmBin(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runNpm(args: string[], inheritStdio = false): Promise<NpmResult> {
  return new Promise((resolve, reject) => {
    // ветвление вместо условных опций: TS не выводит перегрузку spawn по union-stdio
    const child = inheritStdio
      ? spawn(npmBin(), args, { stdio: ['ignore', 'inherit', 'inherit'] })
      : spawn(npmBin(), args);
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (d) => (stdout += d));
    if (child.stderr) child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject); // npm не найден и пр.
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

async function registryVersion(): Promise<string> {
  const res = await runNpm(['view', 'mister-wolf', 'version']);
  const version = res.stdout.trim();
  if (res.code !== 0 || version === '') {
    const detail = res.stderr.trim() !== '' ? `: ${res.stderr.trim()}` : '';
    throw new UserFacingError(`failed to get the version from the npm registry${detail}`);
  }
  return version;
}

async function npmGlobalPrefix(): Promise<string | null> {
  try {
    const res = await runNpm(['prefix', '-g']);
    const p = res.stdout.trim();
    return res.code === 0 && p !== '' ? realPathOrNull(p) : null;
  } catch {
    return null; // npm недоступен — тип установки не проверить (фолбэк = отказ)
  }
}

async function installLatest(from: string, to: string): Promise<void> {
  console.log(`${from} → ${to}`);
  const res = await runNpm(['install', '-g', 'mister-wolf@latest'], true);
  if (res.code !== 0) {
    throw new UserFacingError('npm install -g mister-wolf@latest failed (npm output above)');
  }
}

function printOutcome(outcome: UpgradeOutcome): void {
  switch (outcome.kind) {
    case 'up-to-date':
      console.log(`already the latest version (${outcome.current})`);
      return;
    case 'local-newer':
      console.log(
        `installed ${outcome.current} is newer than the registry version (${outcome.latest}) — no update needed`
      );
      return;
    case 'available':
      console.log(`available ${outcome.latest} (installed ${outcome.current}) — run wolf upgrade`);
      return;
    case 'updated':
      console.log('updated; the new wolf version takes effect on the next run');
      return;
    case 'linked-refusal':
      throw new UserFacingError(
        `a dev/linked copy is installed (${outcome.binaryPath ?? 'path unknown'}) — upgrade not applicable; to update: npm rm -g mister-wolf && npm i -g mister-wolf`
      );
  }
}

/* ---------- --here (REQ-14, T9): полный проектный шаг в cwd ---------- */
// Ранний выход в action: при --here npm-ветка не выполняется вообще. Без
// re-exec и без реестра: реестр не читаем и не пишем (включая самолечение
// P331 — прод-deps собираются вручную, НЕ через createCliContainer).

export interface UpgradeHereDeps {
  /** Корень проекта = cwd вызывающего. */
  cwd: string;
  /** Карта установленного CLI-релиза (T1), один раз на шаг. */
  loadMap: () => UpdateMap;
  /** Фабрика проектных deps (прецедент T7 makeStepDeps); мок в юнит-контуре. */
  makeStepDeps: (root: string) => ProjectStepDeps;
  /** Проектный шаг (T6); мок в юнит-контуре, дефолт — runProjectStep. */
  runStep?: typeof runProjectStep;
}

export interface UpgradeHereOpts {
  /** --yes: применить план без вопросов (REQ-02). */
  yes?: boolean;
  /** TTY-режим caller'а: подтверждение возможно только в TTY. */
  tty?: boolean;
  /** Интерактивное подтверждение; вызывается при tty && !yes с план-узлом
   * ReportNode — caller показывает его ДО вопроса (прецедент T7). */
  confirm?: (plans: ReportNode) => boolean | Promise<boolean>;
}

export interface UpgradeHereResult {
  exitCode: 0 | 1 | 2;
  report: ReportNode;
  /** Машинное представление проекта (design §4.13, mode 'here'). */
  project: JsonProject;
}

const HERE_TITLE = 'wolf upgrade — here';

const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const line = (marker: Marker, text: string, dim = false): ReportNode => ({ kind: 'line', marker, text, dim });

/** Справочный состав/штамп cwd (формат T7 stampVersions): max/min set= по
 * штампованным файлам свидетеля рендера; штамп недостоверен — свидетель, не истина. */
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

/** Одиночный план (правила REQ-02 для одного проекта, формат строк T7):
 * имя · путь · состав/штамп → цель · категории карты числами · режим
 * «вне реестра». Пinned не проверяем — --here осознанный ручной инструмент. */
function planSection(cwd: string, map: UpdateMap): ReportNode {
  const cats = mapCategories(map);
  const stamps = stampVersions(cwd);
  const floor = stamps.min !== null && stamps.min !== stamps.max ? ` (stamps from ${stamps.min})` : '';
  return {
    kind: 'section',
    title: 'Plan',
    children: [
      line('info', `plan: ${basename(cwd)} · ${cwd}`),
      line('info', `composition ${stamps.max ?? 'unknown'}${floor} → ${map.version}`, true),
      line(
        'info',
        `map: ${cats.new} new · ${cats.changed} changed · ${cats.deprecated} deprecated · ${cats.removed} removed · seed×${map.faces.filter((f) => f.seed).length}`,
        true
      ),
      line('info', 'outside the registry — manual mode', true),
    ],
  };
}

/** Детали шага одного проекта (REQ-05): base-set/лица/схема/сверка — формат
 * строк T7 projectsSection. */
function stepDetailLines(report: ProjectReport, map: UpdateMap): ReportNode[] {
  const out: ReportNode[] = [];
  const counts: Record<string, number> = { updated: 0, created: 0, appended: 0, identical: 0, mutated: 0, conflict: 0 };
  for (const o of report.sync.outcomes) {
    if (o.action === 'skipped') {
      if (o.mutated) counts.mutated!++;
      else counts.identical!++;
    } else {
      counts[o.action]!++;
    }
  }
  const bsParts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`);
  if (bsParts.length > 0) out.push(line('info', `base-set: ${bsParts.join(', ')}`, true));
  if (report.seed.length > 0) {
    const faces = report.seed.map((s) => `${s.file.replace(/-playbook\.md$/, '')} ${s.kind ?? s.action}`).join(', ');
    out.push(line('info', `faces: ${faces}`, true));
  }
  if (report.schema.status !== 'ok') {
    out.push(
      line('warn', `schema: ${report.schema.status}${report.schema.error ? ` — ${report.schema.error}` : ''}`, true)
    );
  }
  const v = report.verify.summary;
  const ok = report.verify.items.length - v.needsDecision - v.errors;
  const parts = [`${ok}/${report.verify.items.length} ok`];
  if (v.needsDecision > 0) parts.push(`${v.needsDecision} needs decision`);
  if (v.errors > 0) parts.push(`${v.errors} errors`);
  out.push(line(v.errors > 0 ? 'error' : v.needsDecision > 0 ? 'warn' : 'info', `verify: ${parts.join(' · ')}`, true));
  out.push(...verifyNameLines(report.verify, map));
  out.push(...backupDigestLines(report)); // §4.12: файл + путь бэкапа
  return out;
}

/** Счётчик статуса одного проекта — лейблы паркового словаря T7. */
const STATUS_COUNTER: Record<OutcomeStatus, string> = {
  updated: 'updated',
  'up-to-date': 'up-to-date',
  'needs-decision': 'needs decision',
  error: 'errors',
};

/** Ручной режим (REQ-14): полный проектный шаг (T6) в cwd из текущего
 * бинарника. Guard — именно .wolf/memory (не .wolf): каталог с .wolf без
 * памяти — не живой проект, честный отказ с подсказкой init (exit 1 кладёт
 * caller: UserFacingError → одна строка Error:, прецедент runCli).
 * Отчёт — один проект REQ-05: план → статус+детали → summary → финальная
 * строка exit-таблицы (та же таблица, что у прохода парка). Без banner. */
export async function runUpgradeHere(deps: UpgradeHereDeps, opts: UpgradeHereOpts = {}): Promise<UpgradeHereResult> {
  if (!existsSync(join(deps.cwd, '.wolf', 'memory'))) {
    throw new UserFacingError(`no wolf memory in ${deps.cwd} — run wolf init first`);
  }
  const map = deps.loadMap();
  const plan = planSection(deps.cwd, map);

  // Подтверждение — правила REQ-02 для одиночного плана; список покрывает и
  // удаления (ADR-4), второго вопроса шаг не задаёт.
  let proceed = opts.yes === true;
  let declinedByUser = false;
  if (!proceed && opts.tty && opts.confirm) {
    proceed = await opts.confirm(plan);
    declinedByUser = !proceed;
  }
  if (!proceed) {
    const finalText = declinedByUser ? 'Cancelled — no changes' : 'Cancelled: --yes is required';
    return {
      exitCode: 0,
      report: { kind: 'section', title: HERE_TITLE, children: [plan, line('info', finalText, true)] },
      project: {
        name: basename(deps.cwd),
        path: deps.cwd,
        status: 'skipped',
        files: [],
        protected: [],
        backups: [],
      },
    };
  }

  const confirmedRemovals = map.files.filter((f) => f.category === 'removed').map(projectPath);
  const runStep = deps.runStep ?? runProjectStep;
  let report: ProjectReport | null = null;
  let error: string | null = null;
  try {
    report = await runStep(deps.makeStepDeps(deps.cwd), deps.cwd, map, {
      confirmedRemovals,
      takeMutated: opts.yes === true, // §4.12: --yes = тихий take с бэкапом и в --here
    });
  } catch (err) {
    error = msg(err); // изоляция сбоя шага: error-строка, не крах команды (REQ-06)
  }
  const status: OutcomeStatus = report ? statusOf(report) : 'error';
  const cats = mapCategories(map);
  const seeded = report ? report.seed.filter((s) => s.kind === 'seeded' || s.kind === 'legacy-absorbed').length : 0;
  const counters: Counter[] = [
    { label: STATUS_COUNTER[status], count: 1 },
    { label: 'new', count: cats.new },
    { label: 'changed', count: cats.changed },
    { label: 'deprecated', count: cats.deprecated },
    { label: 'removed', count: cats.removed },
    { label: 'faces seeded', count: seeded },
  ];

  // Exit-модель (design §«Exit-модель», та же таблица для одного проекта)
  const exitCode: 0 | 1 | 2 = status === 'error' ? 1 : status === 'needs-decision' ? 2 : 0;
  const finalText = status === 'error' ? 'Failed' : status === 'needs-decision' ? 'Done with attention' : 'Done';
  const marker: Marker = status === 'error' ? 'error' : status === 'needs-decision' ? 'warn' : 'ok';

  const children: ReportNode[] = [
    plan,
    line(
      marker,
      error !== null ? `${basename(deps.cwd)} — error: ${error}` : `${basename(deps.cwd)} — ${STATUS_TEXT[status]}`,
      status === 'up-to-date'
    ),
    ...(report ? stepDetailLines(report, map) : []),
    { kind: 'summary', counters, done: false },
    line(marker, finalText),
  ];
  const project: JsonProject = {
    name: basename(deps.cwd),
    path: deps.cwd,
    status:
      status === 'up-to-date'
        ? 'up-to-date'
        : status === 'needs-decision'
          ? 'needs-decision'
          : status === 'error'
            ? 'error'
            : 'updated',
    ...(error !== null ? { error } : {}),
    files: report ? jsonProjectFiles(report, map) : [],
    protected: [],
    backups: report?.backups ?? [],
  };
  return { exitCode, report: { kind: 'section', title: HERE_TITLE, children }, project };
}

/** Прод-deps шага для root (контейнер-прецедент по адаптерам, но БЕЗ
 * createCliContainer: его selfHealRegistry пишет реестр, а --here реестр
 * не трогает — REQ-14). Привязка к root напрямую, как per-project deps T7.
 * Экспорт — точечный reuse фазы 2 (T8 upgrade-projects), не дубль сборки. */
export function hereStepDeps(root: string): ProjectStepDeps {
  const tplPlaybooks = join(templatesRoot(), 'playbooks');
  const files = new Map<string, string>();
  if (existsSync(tplPlaybooks)) {
    for (const f of readdirSync(tplPlaybooks)) {
      if (f.endsWith('.md')) files.set(f, readFileSync(join(tplPlaybooks, f), 'utf-8'));
    }
  }
  return {
    renderer: new OpencodeBaseSetRenderer(templatesRoot(), {
      harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
    }),
    files,
    store: new MarkdownMemoryStore(root),
    log: new JsonlEventLog(eventsPath(root)),
    index: new SQLiteSearchIndex(indexPath(root)),
    clock: new SystemClock(),
    idGen: new HashIdGenerator(),
    lock: new FsMemoryLock(memoryDir(root)),
  };
}

/** TermEnv из реального stdout/env (REQ-15): не-TTY/пайп/NO_COLOR → plain;
 * глубина цвета деградирует COLORTERM → TERM → 16; ширина — columns (80).
 * Экспорт — точечный reuse фазы 2 (T8 upgrade-projects). */
export function termEnv(stdout: { isTTY?: boolean; columns?: number }, env: NodeJS.ProcessEnv): TermEnv {
  if (!colorsEnabled(stdout, env)) return { tty: false, colors: 'mono', width: 80 };
  const colorterm = env.COLORTERM ?? '';
  const colors: ColorDepth =
    colorterm.includes('truecolor') || colorterm.includes('24bit')
      ? 'truecolor'
      : (env.TERM ?? '').includes('256color')
        ? '256'
        : '16';
  return { tty: true, colors, width: stdout.columns ?? 80 };
}

/** CLI-обвязка --here: прод-deps + TTY-подтверждение (план показан ДО вопроса,
 * REQ-02) + печать отчёта renderer'ом и простановка exit-кода. */
async function upgradeHereAction(cwd: string, yes: boolean, json = false): Promise<void> {
  const isTty = Boolean(process.stdout.isTTY);
  const env = termEnv(process.stdout, process.env);
  const confirm = isTty
    ? async (plans: ReportNode): Promise<boolean> => {
        process.stdout.write(`${renderReport(plans, env)}\n`);
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          const ans = (await rl.question('Upgrade this project? [y/N] ')).trim().toLowerCase();
          return ans === 'y' || ans === 'yes';
        } finally {
          rl.close();
        }
      }
    : undefined;
  const res = await runUpgradeHere(
    { cwd, loadMap: () => loadUpdateMap(), makeStepDeps: hereStepDeps },
    { yes, tty: json ? false : isTty, confirm: json ? undefined : confirm }
  );
  if (json) {
    const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
      harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
    });
    const map = loadUpdateMap();
    const reg = await collectDecisions({ ...decisionProdDeps(cwd, renderer), loadMap: () => map });
    printJson(
      await modeJsonDoc({ mode: 'here', exit: res.exitCode, registry: reg, map, renderer, projects: [res.project] })
    );
  } else {
    process.stdout.write(`${renderReport(res.report, env)}\n`);
  }
  process.exitCode = res.exitCode;
}

/* ---------- диспетчеризация флагов (design §4.18) ---------- */
// Единственная точка порядка: проверка комбинаций → --check (сильнее --here) →
// --show (T8) → --review (T9) → --resolve → --here → npm+re-exec. Новые режимы
// завершаются в фазе 1 на установленном CLI: флаг не теряется в re-exec.

export type UpgradeMode = 'check' | 'show' | 'review' | 'resolve' | 'here' | 'pass';

export interface UpgradeFlags {
  check?: boolean;
  here?: boolean;
  yes?: boolean;
  resolve?: string[];
  show?: string;
  review?: boolean;
  json?: boolean;
}

export interface UpgradeRoute {
  mode: UpgradeMode;
  /** Несовместимая пара флагов: exit 1 без записей и без сети (§4.18). */
  error?: string;
}

/** Чистый разбор режима (тестируется без IO); T8/T9/T11 расширяют набор флагов. */
export function upgradeRoute(flags: UpgradeFlags): UpgradeRoute {
  const resolve = flags.resolve ?? [];
  const resolveGiven = resolve.length > 0;
  const showGiven = flags.show !== undefined;
  const reviewGiven = flags.review === true;
  // Несовместимые комбинации (§4.18): два способа действия в одном вызове
  if (reviewGiven && flags.json === true) {
    return { mode: 'pass', error: '--review is interactive; --json is not supported' };
  }
  if (reviewGiven && resolveGiven) {
    return { mode: 'pass', error: '--review and --resolve are two ways to apply decisions — run one of them' };
  }
  if (reviewGiven && flags.yes === true) {
    return { mode: 'pass', error: '--yes describes a pass, not a review — drop one of --review/--yes' };
  }
  if (reviewGiven && showGiven) {
    return { mode: 'pass', error: '--review and --show are different read-only modes — run one of them' };
  }
  if (showGiven && resolveGiven) {
    return { mode: 'pass', error: '--show views a file, --resolve writes — run them separately' };
  }
  if (showGiven && flags.yes === true) {
    return { mode: 'pass', error: '--yes describes a pass, not a view — drop one of --show/--yes' };
  }
  if (showGiven && flags.check === true) {
    return { mode: 'pass', error: '--check and --show are different read-only modes — run one of them' };
  }
  if (resolveGiven && flags.yes === true) {
    return { mode: 'pass', error: '--yes describes a pass, not single decisions — drop one of --resolve/--yes' };
  }
  if (resolveGiven && flags.check === true) {
    return { mode: 'pass', error: '--check is read-only and --resolve writes — run them separately' };
  }
  if (flags.check === true) return { mode: 'check' }; // --check сильнее --here (§4.18)
  if (showGiven) return { mode: 'show' };
  if (reviewGiven) return { mode: 'review' };
  if (resolveGiven) return { mode: 'resolve' };
  if (flags.here === true) return { mode: 'here' };
  return { mode: 'pass' };
}

/* ---------- --resolve (T7, REQ-06, design §4.7/§4.8/§4.12) ---------- */

const RESOLVE_TITLE = 'wolf upgrade — resolve';

/** Нумерованный список решений (§4.7/§4.9): один источник для --resolve и --review. */
export function decisionLines(reg: DecisionRegistry): ReportNode[] {
  if (reg.targets.length === 0) return [line('info', 'no decisions — nothing needs a decision', true)];
  const noun = reg.targets.length === 1 ? 'file needs' : 'files need';
  const out: ReportNode[] = [line('warn', `${reg.targets.length} ${noun} a decision`, true)];
  for (const t of reg.targets) out.push(line('info', `  ${t.n}  ${t.project}  ${t.file}  ${t.code}`, true));
  return out;
}

/** Лица памяти: видны и держат exit 2, но адресуемого глагола нет (зона Стюарда). */
export function stewardZoneLines(diverged: DivergedFace[]): ReportNode[] {
  if (diverged.length === 0) return [];
  const out: ReportNode[] = [line('warn', `steward zone (not addressable by --resolve): ${diverged.length}`, true)];
  for (const d of diverged) {
    out.push(line('info', `  ${d.project}  ${d.file}  diverged  v${d.version ?? '?'}`, true));
  }
  return out;
}

/** Дайджест применения: счётчики по глаголам + файл и путь бэкапа (§4.12). */
export function digestLines(applied: AppliedResolution[]): ReportNode[] {
  if (applied.length === 0) return [line('info', 'resolved: none', true)];
  const counts: Record<ResolutionVerb, number> = { take: 0, keep: 0, protect: 0, pin: 0 };
  for (const a of applied) counts[a.verb]++;
  const parts = (Object.entries(counts) as Array<[ResolutionVerb, number]>)
    .filter(([, n]) => n > 0)
    .map(([verb, n]) => `${verb}: ${n}`);
  const out: ReportNode[] = [line('ok', `resolved: ${applied.length} (${parts.join(', ')})`)];
  for (const a of applied) {
    const suffix = a.backup !== undefined ? ` (local saved: ${a.backup})` : a.noop === true ? ' — no-op' : '';
    out.push(line('info', `${a.verb} ${a.project}/${a.file}${suffix}`, true));
  }
  return out;
}

export interface UpgradeResolveDeps extends DecisionDeps {
  /** Эталон одного файла (renderer.renderFreshFile) — вход глагола take. */
  renderer: { renderFreshFile(baseDir: string, rel: string): string | null };
  /** Часы бэкапа (дата каталога `<date>`); дефолт Date.now. */
  now?: () => number;
}

export interface UpgradeResolveResult {
  exitCode: 0 | 1 | 2;
  report: ReportNode;
  /** Реестр после применения (остаток решений). */
  registry: DecisionRegistry;
  backups: Array<{ file: string; backup: string }>;
  /** Ошибки разбора/записи (для `--json.error`; уже напечатаны в отчёте). */
  errors: string[];
}

/** `--resolve` целиком: сбор реестра (read-only) → разбор всех аргументов →
 *  применение ровно заказанного → повторный сбор → дайджест и exit. Ни npm-фазы,
 *  ни re-exec, ни проектного прохода (§4.8 «Взаимодействие с проходом»). */
export async function runUpgradeResolve(
  deps: UpgradeResolveDeps,
  opts: { here: boolean; cwd: string; values: string[] }
): Promise<UpgradeResolveResult> {
  const map = deps.loadMap();
  const collectDeps: DecisionDeps = { ...deps, loadMap: () => map };
  const before = await collectDecisions(collectDeps);
  const parsed = parseResolveValues(opts.values);
  const plan =
    parsed.errors.length > 0
      ? { ops: [], errors: [] as string[] }
      : planResolutions(before, map, parsed.requests, { here: opts.here, cwd: opts.cwd });
  const errors = [...parsed.errors, ...plan.errors];

  const children: ReportNode[] = [];
  if (errors.length > 0) {
    // Двухфазность (AC3): все ошибки собраны до первой записи — записей нет
    for (const error of errors) children.push(line('error', error));
    children.push(...decisionLines(before));
    children.push(line('error', 'Failed'));
    return {
      exitCode: 1,
      report: { kind: 'section', title: RESOLVE_TITLE, children },
      registry: before,
      backups: [],
      errors,
    };
  }

  const applied = await applyResolutions(plan.ops, { map, renderer: deps.renderer, now: deps.now });
  const after = await collectDecisions(collectDeps);

  for (const error of applied.errors) children.push(line('error', error));
  children.push(...digestLines(applied.applied));
  children.push(...decisionLines(after));
  children.push(...stewardZoneLines(after.diverged));
  const exitCode: 0 | 1 | 2 =
    applied.errors.length > 0 ? 1 : after.targets.length > 0 || after.diverged.length > 0 ? 2 : 0;
  const finalText = exitCode === 1 ? 'Failed' : exitCode === 2 ? 'Done with attention' : 'Done';
  children.push(line(exitCode === 1 ? 'error' : exitCode === 2 ? 'warn' : 'ok', finalText));
  return {
    exitCode,
    report: { kind: 'section', title: RESOLVE_TITLE, children },
    registry: after,
    backups: applied.backups,
    errors: applied.errors,
  };
}

/** Шаблоны лиц релиза (basename → сырой контент) — сравнение тела для diverged. */
function faceTemplates(): Map<string, string> {
  const dir = join(templatesRoot(), 'playbooks');
  const files = new Map<string, string>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.md')) files.set(f, readFileSync(join(dir, f), 'utf-8'));
    }
  }
  return files;
}

/** Прод-deps реестра решений: парк (реестр проектов) или `--here` (только cwd). */
function decisionProdDeps(
  here: string | null,
  renderer: OpencodeBaseSetRenderer,
  registry: { listStrict(): Promise<RegisteredProject[]> } = new ProjectsRegistry(wolfUserConfigDir())
): DecisionDeps {
  return {
    ...(here === null ? { registry } : { here }),
    loadMap: () => loadUpdateMap(),
    inspect: (root) => renderer.inspectBaseSet(root, { models: 'omit' }),
    liveFaces: async (root) => {
      const faces = await new MarkdownMemoryStore(root).list({ type: 'face' });
      return faces.map((o) => {
        const face = o as FaceObject;
        return {
          ownerSkill: face.owner_skill,
          version: face.version,
          body: face.body,
          initiator: face.initiator,
        };
      });
    },
    faceTemplates: faceTemplates(),
  };
}

/** CLI-обвязка `--resolve`: прод-deps + печать отчёта + exit-код. */
async function upgradeResolveAction(values: string[], here: boolean, json = false): Promise<void> {
  const cwd = safeCwd();
  const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
    harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
  });
  const res = await runUpgradeResolve(
    { ...decisionProdDeps(here ? cwd : null, renderer), renderer },
    { here, cwd, values }
  );
  if (json) {
    const map = loadUpdateMap();
    printJson(
      await modeJsonDoc({
        mode: 'resolve',
        exit: res.exitCode,
        registry: res.registry,
        map,
        renderer,
        ...(res.errors.length > 0 ? { error: res.errors.join('; ') } : {}),
      })
    );
  } else {
    process.stdout.write(`${renderReport(res.report, termEnv(process.stdout, process.env))}\n`);
  }
  process.exitCode = res.exitCode;
}

/* ---------- --show (T8, REQ-08, design §4.10): read-only просмотр цели ---------- */

const SHOW_TITLE = 'wolf upgrade — show';

export interface UpgradeShowResult {
  exitCode: 0 | 1;
  report: ReportNode;
  /** Реестр решений на момент просмотра (для `--json.decisions`). */
  registry: DecisionRegistry;
  errors: string[];
}

const protectText = (p: ReturnType<typeof parseProtect>): string => {
  if (!p.held) return 'none';
  const value = p.value ?? p.raw ?? '';
  const kind = p.value === 'true' ? 'held' : p.unrecognized ? 'raw' : 'pinned';
  return `${value || '∅'}  (${kind}${p.unrecognized ? '; unrecognized — treated as protected' : '; recognized'})`;
};

/** Отпечаток свидетеля: `origin @ base` либо `n/a` (записи нет). */
const witnessText = (entry: unknown, protectedFile: boolean): string => {
  if (protectedFile) return 'n/a (protected)';
  if (entry === undefined || typeof entry !== 'object' || entry === null) return 'n/a';
  const e = entry as { origin?: string; base?: string; hash?: string };
  return `${e.origin ?? 'render'} @ ${e.base ?? '?'} (${(e.hash ?? '').slice(0, 12)}…)`;
};

/** `--show <file|N>`: protect, обе версии и diff локальный → эталон; ничего не пишет. */
export async function runUpgradeShow(
  deps: UpgradeResolveDeps,
  opts: { here: boolean; cwd: string; value: string }
): Promise<UpgradeShowResult> {
  const map = deps.loadMap();
  const reg = await collectDecisions({ ...deps, loadMap: () => map });
  const resolved = resolveShowTarget(reg, map, opts.value, { here: opts.here, cwd: opts.cwd });
  const children: ReportNode[] = [];
  if (resolved.target === undefined) {
    children.push(line('error', resolved.error ?? `unknown target ${opts.value}`));
    children.push(...decisionLines(reg));
    children.push(line('error', 'Failed'));
    return {
      exitCode: 1,
      report: { kind: 'section', title: SHOW_TITLE, children },
      registry: reg,
      errors: [resolved.error ?? `unknown target ${opts.value}`],
    };
  }

  const t = resolved.target;
  const abs = join(t.root, t.file);
  const current = existsSync(abs) ? readFileSync(abs, 'utf-8') : null;
  const protect = current !== null ? parseProtect(current) : { held: false, value: null, raw: null };
  const protectHeld = protect.held === true;
  const stamp = current !== null ? parseStamp(current) : null;
  const witness = witnessText(loadSyncState(t.root).files[t.file], protectHeld);
  const fresh = deps.renderer.renderFreshFile(t.root, t.file);

  children.push(line('info', `file:      ${t.file}   (project: ${t.project} ${t.root})`));
  children.push(line('info', `protect:   ${protectText(protect)}`));

  if (fresh === null) {
    // Файл вне карты: эталона нет, take запрещён матрицей §4.8
    children.push(
      line('info', `base:      n/a (file outside the update map)   stamp: ${stamp?.set ?? 'n/a'}   drift: n/a`)
    );
    children.push(line('info', 'ⓘ no base to take; the file is held as a sanctioned local variation', true));
    children.push(line('info', `release:   wolf upgrade --resolve ${t.file}=protect|pin`, true));
    return { exitCode: 0, report: { kind: 'section', title: SHOW_TITLE, children }, registry: reg, errors: [] };
  }

  const drift =
    current === null ? 'missing' : normalizeManaged(current) === fresh ? 'none (content equals base)' : 'local ≠ base';
  children.push(
    line(
      'info',
      `base:      ${map.version}   file stamp: ${stamp?.set ?? 'n/a'}   witness: ${witness}   drift: ${drift}`
    )
  );

  if (current !== null) {
    const diff = lineDiff(normalizeManaged(current), fresh);
    children.push(
      line('info', `--- a/local (as is)   +++ b/base ${map.version}   (what --resolve …=take gives you)`, true)
    );
    const markerOf = (text: string): Marker => (text.startsWith('+') ? 'ok' : text.startsWith('-') ? 'warn' : 'info');
    for (const text of formatDiff(diff)) children.push(line(markerOf(text), `  ${text}`, true));
  }
  children.push(line('info', `release:   wolf upgrade --resolve ${t.file}=take`, true));
  return { exitCode: 0, report: { kind: 'section', title: SHOW_TITLE, children }, registry: reg, errors: [] };
}

/** CLI-обвязка `--show`: прод-deps реестра решений + печать отчёта + exit-код. */
async function upgradeShowAction(value: string, here: boolean, json = false): Promise<void> {
  const cwd = safeCwd();
  const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
    harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
  });
  const res = await runUpgradeShow(
    { ...decisionProdDeps(here ? cwd : null, renderer), renderer },
    { here, cwd, value }
  );
  if (json) {
    printJson(
      await modeJsonDoc({
        mode: 'show',
        exit: res.exitCode,
        registry: res.registry,
        map: loadUpdateMap(),
        renderer,
        ...(res.errors.length > 0 ? { error: res.errors.join('; ') } : {}),
      })
    );
  } else {
    process.stdout.write(`${renderReport(res.report, termEnv(process.stdout, process.env))}\n`);
  }
  process.exitCode = res.exitCode;
}

/* ---------- --review (T9, REQ-07, design §4.9): TTY-цикл и non-TTY рецепт ---------- */

const REVIEW_TITLE = 'wolf upgrade — review';
const VERB_KEYS: Record<string, ResolutionVerb> = { t: 'take', k: 'keep', p: 'protect', v: 'pin' };

/** IO-шов юнит-контура: реальный stdio в проде, очередь ответов в тестах. */
export interface ReviewIo {
  tty: boolean;
  write(text: string): void;
  /** Ответ пользователя; `null` — EOF/закрытый stdin. */
  ask(prompt: string): Promise<string | null>;
}

export interface UpgradeReviewResult {
  exitCode: 0 | 1 | 2;
  /** Итоговая секция (в non-TTY — весь рецепт, в TTY — дайджест). */
  report: ReportNode;
  applied: AppliedResolution[];
  errors: string[];
  registry: DecisionRegistry;
}

/** Строка цели в списке §4.9: номер, проект, путь, код, база. */
function reviewTargetLine(t: DecisionTarget, base: string): string {
  return `  ${t.n}  ${t.project}  ${t.file}  ${t.code}  base ${base}`;
}

/** Non-TTY рецепт (design §4.9, AC2): список + готовые команды, без записей. */
function reviewRecipeNodes(reg: DecisionRegistry, base: string, here: boolean): ReportNode[] {
  const out: ReportNode[] = [];
  if (reg.targets.length === 0) {
    out.push(line('info', 'review (non-interactive): no decisions — nothing needs a decision', true));
  } else {
    const noun = reg.targets.length === 1 ? 'file needs' : 'files need';
    out.push(line('warn', `review (non-interactive): ${reg.targets.length} ${noun} a decision`, true));
    for (const t of reg.targets) out.push(line('info', reviewTargetLine(t, base), true));
  }
  out.push(...stewardZoneLines(reg.diverged));
  if (reg.targets.length > 0) {
    const scope = here ? ' --here' : '';
    const resolves = reg.targets.map((t) => `--resolve ${t.n}=take`).join(' ');
    out.push(line('info', `review interactively: wolf upgrade${scope} --review  (in a TTY)`, true));
    out.push(line('info', `apply a decision:    wolf upgrade${scope} ${resolves}  (or keep|protect|pin)`, true));
    out.push(line('info', `inspect a file:      wolf upgrade${scope} --show ${reg.targets[0]!.n}`, true));
  }
  return out;
}

/** Экран одного решения (design §4.9): заголовок, размеры, diff ≤ 40 строк, клавиши. */
function reviewScreen(
  t: DecisionTarget,
  index: number,
  total: number,
  map: UpdateMap,
  renderer: UpgradeResolveDeps['renderer']
): string[] {
  const lines: string[] = [`[${index}/${total}] ${t.project}/${t.file} — ${t.code} · base ${map.version}`];
  const abs = join(t.root, t.file);
  const current = existsSync(abs) ? readFileSync(abs, 'utf-8') : null;
  const fresh = renderer.renderFreshFile(t.root, t.file);
  const localLines = current === null ? 0 : normalizeManaged(current).replace(/\r\n/g, '\n').split('\n').length;
  const baseLines = fresh === null ? 0 : fresh.replace(/\r\n/g, '\n').split('\n').length;
  if (fresh === null) {
    lines.push(`  local: ${localLines} lines · base: n/a (file outside the update map) · no diff`);
  } else if (current === null) {
    lines.push(`  local: missing · base: ${baseLines} lines · take creates the file`);
  } else {
    const diff = lineDiff(normalizeManaged(current), fresh, { maxOutput: 40 });
    lines.push(`  local: ${localLines} lines · base: ${baseLines} lines · −${diff.removed} +${diff.added}`);
    lines.push(`  --- a/base ${map.version}   +++ b/local`);
    for (const text of formatDiff(diff)) lines.push(`  ${text}`);
  }
  lines.push('  choice: [t]ake [k]eep [p]rotect [v]pin [s]kip  (a — apply to all similar, q — quit)');
  return lines;
}

/**
 * `--review`: TTY-цикл по реестру (экраны с diff, клавиши t/k/p/v/s/a/q; EOF
 * завершает цикл) или non-TTY рецепт без единой записи. Применение — тот же
 * `applyResolutions`, что у `--resolve` (одна семантика, один бэкап-путь).
 */
export async function runUpgradeReview(
  deps: UpgradeResolveDeps,
  opts: { here: boolean; cwd: string; io: ReviewIo }
): Promise<UpgradeReviewResult> {
  const map = deps.loadMap();
  const collectDeps: DecisionDeps = { ...deps, loadMap: () => map };
  const before = await collectDecisions(collectDeps);
  const applied: AppliedResolution[] = [];
  const errors: string[] = [];
  const handled = new Set<number>();

  const applyOne = async (target: DecisionTarget, verb: ResolutionVerb): Promise<void> => {
    const plan = planResolutions(before, map, [{ target: String(target.n), verb }], {
      here: opts.here,
      cwd: opts.cwd,
    });
    if (plan.errors.length > 0) {
      errors.push(...plan.errors);
      return;
    }
    const res = await applyResolutions(plan.ops, { map, renderer: deps.renderer, now: deps.now });
    applied.push(...res.applied);
    errors.push(...res.errors);
    handled.add(target.n);
  };

  if (!opts.io.tty) {
    const nodes = reviewRecipeNodes(before, map.version, opts.here);
    const exitCode: 0 | 1 | 2 = before.targets.length > 0 || before.diverged.length > 0 ? 2 : 0;
    return {
      exitCode,
      report: { kind: 'section', title: REVIEW_TITLE, children: nodes },
      applied,
      errors,
      registry: before,
    };
  }

  const total = before.targets.length;
  for (let i = 0; i < before.targets.length; i++) {
    const target = before.targets[i]!;
    if (handled.has(target.n)) continue;
    opts.io.write(`${reviewScreen(target, i + 1, total, map, deps.renderer).join('\n')}\n`);
    const answer = (await opts.io.ask('> '))?.trim().toLowerCase() ?? null;
    if (answer === null || answer === 'q') break;
    if (answer === 's' || answer === '') {
      handled.add(target.n);
      continue;
    }
    if (answer === 'a') {
      // «применить ко всем похожим»: отдельный вопрос о глаголе для группы
      const group = [target, ...similarTargets(before, target).filter((t) => !handled.has(t.n))];
      opts.io.write(
        `apply to all ${group.length} ${target.kind}/${target.code}: ${group.map((t) => t.file).join(', ')}\n`
      );
      const verbAnswer =
        (await opts.io.ask('verb for all: [t]ake [k]eep [p]rotect [v]pin or [enter] back > '))?.trim().toLowerCase() ??
        null;
      const groupVerb = verbAnswer === null ? undefined : VERB_KEYS[verbAnswer];
      if (groupVerb === undefined) continue; // без изменения файлов — возврат к текущей цели
      for (const member of group) await applyOne(member, groupVerb);
      continue;
    }
    const verb = VERB_KEYS[answer];
    if (verb === undefined) continue; // пустой/неизвестный ввод — переспрос (без изменений)
    await applyOne(target, verb);
    // «ко всем похожим» одним вопросом, если остались такие же цели
    const similar = similarTargets(before, target).filter((t) => !handled.has(t.n));
    if (similar.length > 0) {
      opts.io.write(`apply "${verb}" to ${similar.length} more ${target.kind}/${target.code}?\n`);
      for (const s of similar) opts.io.write(`  ${s.n}  ${s.project}  ${s.file}\n`);
      const confirmed = (await opts.io.ask('[y/N] '))?.trim().toLowerCase() ?? null;
      if (confirmed === 'y' || confirmed === 'yes') {
        for (const member of similar) await applyOne(member, verb);
      }
    }
  }

  const after = await collectDecisions(collectDeps);
  const digest = [...digestLines(applied), ...decisionLines(after), ...stewardZoneLines(after.diverged)];
  for (const error of errors) opts.io.write(`error: ${error}\n`);
  opts.io.write(`${digest.map((node) => (node.kind === 'line' ? node.text : '')).join('\n')}\n`);
  const exitCode: 0 | 1 | 2 = errors.length > 0 ? 1 : after.targets.length > 0 || after.diverged.length > 0 ? 2 : 0;
  opts.io.write(`${exitCode === 1 ? 'Failed' : exitCode === 2 ? 'Done with attention' : 'Done'}\n`);
  return {
    exitCode,
    report: { kind: 'section', title: REVIEW_TITLE, children: digest },
    applied,
    errors,
    registry: after,
  };
}

/** Прод-IO цикла: stdout + readline; EOF/Ctrl-D → null (цикл завершается). */
async function upgradeReviewAction(here: boolean): Promise<void> {
  const cwd = safeCwd();
  const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
    harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
  });
  const tty = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const io: ReviewIo = {
    tty,
    write: (text) => process.stdout.write(text),
    ask: async (prompt) => {
      if (!rl) return null;
      try {
        return await rl.question(prompt);
      } catch {
        return null; // stdin закрыт (Ctrl-D/Ctrl-C)
      }
    },
  };
  try {
    const res = await runUpgradeReview(
      { ...decisionProdDeps(here ? cwd : null, renderer), renderer },
      { here, cwd, io }
    );
    if (!tty) process.stdout.write(`${renderReport(res.report, termEnv(process.stdout, process.env))}\n`);
    process.exitCode = res.exitCode;
  } finally {
    rl?.close();
  }
}

/* ---------- --check парковая сводка (REQ-08, T10): read-only, 0 мутаций ---------- */ // Состав — истина, штамп — свидетель (инвентаризация §3.4): класс проекта —
// контентная сверка целей карты установленного пакета с фактическими файлами
// (deps.inspect = renderer.inspectBaseSet, без записей), штампы — справочно.
// Read-only не падает: любые сбои — строки отчёта, exit всегда 0.

/** Класс устаревания проекта (design §«--check»); unknown не показывается
 *  как current — недостоверность ≠ актуальность. */
export type FreshnessClass = 'current' | 'behind' | 'needs-decision' | 'unknown';

const CLASS_TEXT: Record<FreshnessClass, string> = {
  current: 'current',
  behind: 'behind',
  'needs-decision': 'needs decision',
  unknown: 'unknown — out of coverage',
};

/** Срез классификации одного проекта: класс + краткое обоснование (rel-пути). */
export interface ProjectFreshness {
  cls: FreshnessClass;
  differs: string[];
  missing: string[];
  mutated: string[];
  foreign: string[];
  /** Инспекция вернула unknown — класс unknown, но причина не «чужой файл». */
  uncertain: string[];
  /** removed-цели карты, чей файл всё ещё существует. */
  removedPresent: string[];
  /** deprecated-цели — report-only (REQ-11), класс не меняют. */
  deprecated: string[];
  /** Цели инспекции вне карты — справочно, класс не меняют. */
  outsideMap: string[];
  /** Защищённые цели (§4.3 правило 2): не differs, не changed — держатся владельцем. */
  protected: string[];
  /** Принятый локальный контент (правило 6.5): не отставание, не решение. */
  kept: string[];
  /** Причины наблюдений из InspectOutcome.detail (не из reason-строк). */
  details: Array<{ file: string; detail: string }>;
}

/** Чистая классификация (design §«--check»), приоритет правил — как в брифе:
 *  mutated → «требует решения»; differs/missing по целям карты и существующий
 *  removed-файл → «отстаёт»; foreign/unknown → «unknown — вне покрытия»;
 *  иначе «актуальный». AGENTS.md — цель карты agents_md тем же словарём.
 *  deprecated — report-only (REQ-11), вне-карты — справочно. */
export function classifyProject(
  map: UpdateMap,
  outcomes: InspectOutcome[],
  removedExisting: string[]
): ProjectFreshness {
  const out: ProjectFreshness = {
    cls: 'current',
    differs: [],
    missing: [],
    mutated: [],
    foreign: [],
    uncertain: [],
    removedPresent: [...removedExisting],
    deprecated: [],
    outsideMap: [],
    protected: [],
    kept: [],
    details: [],
  };
  for (const o of outcomes) {
    if (o.detail) out.details.push({ file: o.file, detail: o.detail });
  }
  const byFile = new Map(outcomes.map((o) => [o.file, o.action]));
  const targetRels = new Set<string>();
  const absorb = (rel: string, action: InspectOutcome['action'] | undefined): void => {
    if (action === 'mutated') out.mutated.push(rel);
    else if (action === 'foreign') out.foreign.push(rel);
    else if (action === 'unknown') out.uncertain.push(rel);
    else if (action === 'differs') out.differs.push(rel);
    else if (action === 'missing') out.missing.push(rel);
    else if (action === 'protected') out.protected.push(rel);
    else if (action === 'kept') out.kept.push(rel);
  };
  for (const entry of map.files) {
    const rel = projectPath(entry);
    targetRels.add(rel);
    if (entry.category === 'deprecated') {
      out.deprecated.push(rel); // report-only (REQ-11)
      continue;
    }
    absorb(rel, byFile.get(rel));
  }
  if (map.agents_md.category !== 'deprecated') absorb('AGENTS.md', byFile.get('AGENTS.md'));
  for (const o of outcomes) {
    if (o.file !== 'AGENTS.md' && !targetRels.has(o.file)) out.outsideMap.push(o.file);
  }
  out.cls =
    out.mutated.length > 0
      ? 'needs-decision'
      : out.differs.length > 0 || out.missing.length > 0 || out.removedPresent.length > 0
        ? 'behind'
        : out.foreign.length > 0 || out.uncertain.length > 0
          ? 'unknown'
          : 'current';
  return out;
}

export interface UpgradeCheckDeps {
  /** Реестр проектов; listStrict различает «пусто» и «нечитаем» (прецедент T7). */
  registry: { listStrict(): Promise<RegisteredProject[]> };
  /** Карта установленного CLI-релиза (T1); throw → деградация до штампов. */
  loadMap: () => UpdateMap;
  /** npm view доступной версии (мок в тестах). */
  registryVersion: () => Promise<string>;
  /** Установленная версия CLI. */
  installedVersion: () => string;
  /** Read-only инспекция base-set проекта (реализация — renderer.inspectBaseSet). */
  inspect: (root: string) => Promise<InspectOutcome[]>;
  /** Read-only реестр защит проекта (§4.11): вход `--json.protections`. */
  protections?: (root: string) => Promise<ProtectEntry[]>;
  /** Лица памяти (read-only, собраны вызывающим слоем): вход `--json.diverged`. */
  diverged?: JsonDiverged[];
}

export interface UpgradeCheckResult {
  /** Read-only сводка не падает — exit всегда 0 (design exit-таблица: --check). */
  exitCode: 0;
  report: ReportNode;
  /** `wolf.upgrade.check/1` (§4.13): печатает CLI при `--json`. */
  json: UpgradeCheckJson;
}

const CHECK_TITLE = 'wolf upgrade — check';

type JsonCheckProject = UpgradeCheckJson['projects'][number];

/** Детали проекта одной строкой: `2 differ · 1 missing · mutated: …`. */
function freshnessDetails(f: ProjectFreshness): string | null {
  const parts: string[] = [];
  // REQ-01 AC2: путь каждого differ — не выборка и не усечение (§4.15).
  if (f.differs.length > 0) parts.push(`${f.differs.length} differ: ${f.differs.join(', ')}`);
  if (f.missing.length > 0) parts.push(`${f.missing.length} missing`);
  if (f.mutated.length > 0) parts.push(`mutated: ${f.mutated.join(', ')}`);
  if (f.foreign.length > 0) parts.push(`foreign: ${f.foreign.join(', ')}`);
  if (f.uncertain.length > 0) parts.push(`unknown: ${f.uncertain.join(', ')}`);
  if (f.removedPresent.length > 0) parts.push(`removed present: ${f.removedPresent.join(', ')}`);
  if (f.outsideMap.length > 0) parts.push(`${f.outsideMap.length} files outside the map`);
  if (f.kept.length > 0) parts.push(`kept (local): ${f.kept.join(', ')}`);
  if (f.protected.length > 0) parts.push(`${f.protected.length} protected (intentional)`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const stampNote = (root: string): string => {
  const stamps = stampVersions(root);
  const floor = stamps.min !== null && stamps.min !== stamps.max ? ` (stamps from ${stamps.min})` : '';
  return `stamps ${stamps.max ?? 'unknown'}${floor}`;
};

/** Пустая строка документа `--json` (нет чтения/ошибка/карты). */
function emptyCheckRow(name: string, path: string, protectedFiles: JsonProtection[]): JsonCheckProject {
  return {
    name,
    path,
    class: 'unknown',
    differ: [],
    missing: [],
    mutated: [],
    foreign: [],
    details: [],
    protected: protectedFiles,
  };
}

/** Секция одного проекта (REQ-08): строки отчёта + машинная строка (§4.13). */
async function projectCheck(
  entry: RegisteredProject,
  map: UpdateMap,
  deps: UpgradeCheckDeps
): Promise<{ lines: ReportNode[]; row: JsonCheckProject }> {
  const name = basename(entry.path);
  const protections = deps.protections ? jsonProtections(await deps.protections(entry.path)) : [];
  if (!existsSync(entry.path)) {
    return {
      lines: [line('info', `${name} · ${entry.path} — ${CLASS_TEXT.unknown} (path does not exist)`, true)],
      row: emptyCheckRow(name, entry.path, protections),
    };
  }
  try {
    const outcomes = await deps.inspect(entry.path);
    const removedExisting = map.files
      .filter((e) => e.category === 'removed' && existsSync(join(entry.path, projectPath(e))))
      .map(projectPath);
    const f = classifyProject(map, outcomes, removedExisting);
    const marker: Marker = f.cls === 'current' ? 'ok' : f.cls === 'unknown' ? 'info' : 'warn';
    const lines: ReportNode[] = [
      line(marker, `${name} · ${entry.path} — ${CLASS_TEXT[f.cls]}`, f.cls === 'current'),
      line('info', `${stampNote(entry.path)} · map ${map.version}`, true),
    ];
    const details = freshnessDetails(f);
    if (details) lines.push(line('info', details, true));
    for (const d of f.details) {
      lines.push(line('info', `detail: ${d.detail} — treated as foreign (${d.file})`, true));
    }
    if (f.deprecated.length > 0) {
      lines.push(line('info', `deprecated: ${f.deprecated.join(', ')} (report-only)`, true));
    }
    return {
      lines,
      row: {
        name,
        path: entry.path,
        class: f.cls,
        differ: f.differs,
        missing: f.missing,
        mutated: f.mutated,
        foreign: f.foreign,
        details: f.details.map((d) => d.detail),
        protected: protections,
      },
    };
  } catch (err) {
    return {
      lines: [line('error', `${name} — error: ${msg(err)}`)],
      row: emptyCheckRow(name, entry.path, protections),
    };
  }
}

/** `--check`-сводка парка (REQ-08): CLI-строка (installed vs available) →
 *  перечисление проектов реестра. Деградации не крахят: битый реестр/npm —
 *  error-строка; карты нет — штампы с пометкой недостоверности и классом
 *  unknown (никогда current); пустой реестр — «no projects». exit 0.
 *  Документ `--json` строится из тех же строк (§4.13: текст и JSON не расходятся). */
export async function runUpgradeCheck(deps: UpgradeCheckDeps): Promise<UpgradeCheckResult> {
  const children: ReportNode[] = [];
  const rows: JsonCheckProject[] = [];
  let available: string | null = null;
  try {
    available = await deps.registryVersion();
    children.push(line('info', `cli: installed ${deps.installedVersion()} · available ${available}`));
  } catch (err) {
    children.push(line('error', `cli: installed ${deps.installedVersion()} · available unknown — ${msg(err)}`));
  }

  let registered: RegisteredProject[] | null = null;
  try {
    registered = await deps.registry.listStrict();
  } catch (err) {
    children.push(line('error', `failed to read the projects registry: ${msg(err)}`));
  }

  if (registered !== null) {
    if (registered.length === 0) {
      children.push(line('info', 'no projects in the registry — run wolf init in a project to register it'));
    } else {
      let map: UpdateMap | null = null;
      try {
        map = deps.loadMap();
      } catch {
        map = null;
      }
      if (map) {
        for (const entry of registered) {
          const checked = await projectCheck(entry, map, deps);
          children.push(...checked.lines);
          rows.push(checked.row);
        }
      } else {
        // Деградация (design §«--check»): карты нет у самого CLI — только штампы
        // (свидетель касания, не истина) с явной пометкой недостоверности.
        children.push(line('warn', 'map unavailable in this CLI — stamps only, unreliable'));
        for (const entry of registered) {
          children.push(line('info', `${basename(entry.path)} · ${entry.path} — ${CLASS_TEXT.unknown}`));
          children.push(line('info', stampNote(entry.path), true));
          rows.push(emptyCheckRow(basename(entry.path), entry.path, []));
        }
      }
    }
  }
  children.push(line('ok', 'Done (read-only)'));
  return {
    exitCode: 0,
    report: { kind: 'section', title: CHECK_TITLE, children },
    json: {
      schema: 'wolf.upgrade.check/1',
      exit: 0,
      cli: { installed: deps.installedVersion(), available },
      projects: rows,
      diverged: deps.diverged ?? [],
      protections: rows.flatMap((row) => row.protected),
    },
  };
}

/** CLI-обвязка check-сводки (REQ-08): реестр — как projects (wolfUserConfigDir),
 *  инспекция — read-only inspectBaseSet ('omit' — паритет sync-рендера);
 *  exit не меняется (--check всегда 0). `--here` сужает сводку до cwd без
 *  чтения реестра (design §4.18: `--check` сильнее `--here`); полная
 *  here-инспекция с секцией Protections — T13. */
async function upgradeCheckAction(viewVersion: () => Promise<string>, here?: string, json = false): Promise<void> {
  const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
    harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
  });
  const registry =
    here === undefined
      ? new ProjectsRegistry(wolfUserConfigDir())
      : { listStrict: async () => [{ path: here, schema_version: 2, initialized_at: '' }] };
  let map: UpdateMap | null = null;
  try {
    map = loadUpdateMap();
  } catch {
    map = null; // деградация уже обработана runUpgradeCheck
  }
  let diverged: JsonDiverged[] | undefined;
  if (json) {
    // `--json.diverged` (§4.13): read-only сбор реестра решений (только при --json)
    const reg = await collectDecisions({
      ...decisionProdDeps(here ?? null, renderer, registry),
      loadMap: () => loadUpdateMap(),
    });
    diverged = jsonDiverged(reg);
  }
  const res = await runUpgradeCheck({
    registry,
    loadMap: () => {
      if (!map) throw new Error('update map is not available in this CLI');
      return map;
    },
    registryVersion: viewVersion,
    installedVersion: readInstalledVersion,
    inspect: (root) => renderer.inspectBaseSet(root, { models: 'omit' }),
    ...(map ? { protections: (root: string) => renderer.listProtections(root, map.version) } : {}),
    ...(diverged !== undefined ? { diverged } : {}),
  });
  if (json) printJson(res.json);
  else process.stdout.write(`${renderReport(res.report, termEnv(process.stdout, process.env))}\n`);
}

/* ---------- --json (T11, REQ-11, design §4.13): единственный документ в stdout ---------- */

/** Единственный JSON в stdout: `JSON.stringify` без отступов + перевод строки. */
export function printJson(doc: UpgradeJson | UpgradeCheckJson): void {
  process.stdout.write(`${JSON.stringify(doc)}\n`);
}

/** Реестр защит всех активных проектов (`--json.protections`, §4.11/§4.13). */
async function collectProtections(
  reg: DecisionRegistry,
  renderer: OpencodeBaseSetRenderer,
  map: UpdateMap
): Promise<JsonProtection[]> {
  const out: JsonProtection[] = [];
  for (const project of reg.projects) {
    const entries = await renderer.listProtections(project.root, map.version);
    out.push(...jsonProtections(entries));
  }
  return out;
}

/** Документ `wolf.upgrade/1` режима pass (§4.13): факты прохода + остаток
 *  решений, лица и защиты (read-only, после прохода). */
export async function buildPassJsonDoc(
  deps: { registry: { listStrict(): Promise<RegisteredProject[]> }; loadMap: () => UpdateMap },
  res: UpgradeRunResult,
  cli: { installed: string; available: string | null },
  error?: string
): Promise<UpgradeJson> {
  const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
    harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
  });
  const map = deps.loadMap();
  const reg = await collectDecisions({ ...decisionProdDeps(null, renderer, deps.registry), loadMap: () => map });
  const protections = await collectProtections(reg, renderer, map);
  return {
    schema: 'wolf.upgrade/1',
    exit: res.exitCode,
    mode: 'pass',
    cli,
    ...(error !== undefined ? { error } : {}),
    plan: res.plan,
    projects: res.projects.map((p) => ({
      ...p,
      protected: protections.filter((x) => x.project === p.name),
    })),
    decisions: jsonDecisions(reg),
    diverged: jsonDiverged(reg),
    protections,
  };
}

/** Документ `wolf.upgrade/1` для режимов без прохода (resolve/show/here). */
async function modeJsonDoc(args: {
  mode: 'resolve' | 'show' | 'here';
  exit: 0 | 1 | 2;
  registry: DecisionRegistry;
  map: UpdateMap;
  renderer: OpencodeBaseSetRenderer;
  projects?: JsonProject[];
  error?: string;
}): Promise<UpgradeJson> {
  const protections = await collectProtections(args.registry, args.renderer, args.map);
  return {
    schema: 'wolf.upgrade/1',
    exit: args.exit,
    mode: args.mode,
    cli: { installed: readInstalledVersion(), available: null },
    ...(args.error !== undefined ? { error: args.error } : {}),
    plan: emptyPlan(),
    projects: args.projects ?? [],
    decisions: jsonDecisions(args.registry),
    diverged: jsonDiverged(args.registry),
    protections,
  };
}

/** Документ фазы 1 при сбое npm-фазы: проекты не тронуты, exit 1, error (§4.13). */
function npmFailureJsonDoc(installed: string, error: string): UpgradeJson {
  return {
    schema: 'wolf.upgrade/1',
    exit: 1,
    mode: 'pass',
    cli: { installed, available: null },
    error,
    plan: emptyPlan(),
    projects: [],
    decisions: [],
    diverged: [],
    protections: [],
  };
}

/* ---------- re-exec фазы 2 (T8, REQ-01/04, ADR-2/5): транспорт wolf upgrade ---------- */

export interface ReExecDeps {
  /** Инжект spawn для юнит-контура (шпион опций/эмиттер); дефолт — child_process.spawn. */
  spawnImpl?: typeof spawn;
  /** Путь ребёнка; дефолт — env WOLF_UPGRADE_CHILD_BIN (существует ТОЛЬКО для
   *  тестового контура, test-plan решение №1; продуктовое поведение не меняет)
   *  либо `<npmPrefix>/bin/wolf`. */
  childBin?: string;
  /** Дефолт process.exit (не возвращается); юнит-контур — колбэк-шпион. */
  exit?: (code: number) => void;
  /** Каталог state-файла; дефолт — свежий mkdtemp в ОС-tmp. */
  stateDir?: string;
  /** Дефолт Date.now — startedAt state-файла. */
  now?: () => number;
}

/** Re-exec нового бинарника (ADR-2, «Контракт spawn»): state-файл
 *  `{ from, to, startedAt }` пишется ДО spawn; spawn без shell со stdio
 *  inherit и env: process.env (склейка фаз, REQ-15); код родителя = код
 *  ребёнка (убит сигналом → 1); сбой spawn/старта → UserFacingError —
 *  npm-фаза идемпотентна, повторный `wolf upgrade` при up-to-date сразу
 *  уходит в проектный проход. State — только контекст отчёта (NFR-02),
 *  чистка не требуется (ОС-tmp). */
export async function reExecUpgradeProjects(
  from: string,
  to: string,
  npmPrefix: string | null,
  opts: { yes?: boolean; json?: boolean } & ReExecDeps = {}
): Promise<void> {
  const stateDir = opts.stateDir ?? mkdtempSync(join(tmpdir(), 'wolf-upgrade-state-'));
  const statePath = join(stateDir, 'state.json');
  writeFileSync(statePath, JSON.stringify({ from, to, startedAt: (opts.now ?? Date.now)() }));
  const childBin = opts.childBin ?? process.env.WOLF_UPGRADE_CHILD_BIN ?? join(npmPrefix ?? tmpdir(), 'bin', 'wolf');
  const argv = [
    'upgrade-projects',
    '--from',
    from,
    '--to',
    to,
    ...(opts.yes === true ? ['--yes'] : []),
    '--no-banner',
    '--state',
    statePath,
    // §4.18: единственный флаг вывода, который доходит до ребёнка; режимные
    // флаги (--resolve/--show/--review/--check) до re-exec не доходят вовсе.
    ...(opts.json === true ? ['--json'] : []),
  ];
  const child = (opts.spawnImpl ?? spawn)(childBin, argv, { stdio: 'inherit', env: process.env });
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  await new Promise<void>((resolve, reject) => {
    let settled = false; // error и close могут прийти оба (порядок не гарантирован)
    child.on('error', () => {
      if (settled) return;
      settled = true;
      reject(new UserFacingError('CLI updated; projects not touched — run wolf upgrade again for the project pass'));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      exit(code ?? 1); // code null — ребёнок убит сигналом
      resolve(); // прод: exit не возвращает; юнит: exit — колбэк
    });
  });
}

/** npm-фаза + re-exec (T8, REQ-01/04, ADR-2): шапку печатает ТОЛЬКО фаза 1
 *  (склейка фаз, REQ-15 — фаза 2 идёт с --no-banner); npm-сбой закрывает
 *  секцию `└ Failed` (REQ-01 AC3) и падает ДО spawn — проекты не тронуты;
 *  up-to-date НЕ выход — фаза идемпотентна, идём к re-exec; local-newer —
 *  реестру нечему обновляться, spawn не нужен (exit 0); linked-refusal —
 *  отказ printOutcome. reExec-шов — юнит/R01.3-контур (шпион вместо spawn). */
export async function runUpgradeWithProjects(
  deps: UpgradeDeps & { reExec?: typeof reExecUpgradeProjects },
  opts: { yes?: boolean; json?: boolean } = {}
): Promise<void> {
  const json = opts.json === true;
  const env = termEnv(process.stdout, process.env);
  if (!json) process.stdout.write(`${renderReport({ kind: 'banner', version: deps.currentVersion }, env)}\n`);
  let outcome: UpgradeOutcome;
  try {
    outcome = await runUpgrade(deps, false);
  } catch (err) {
    if (json) printJson(npmFailureJsonDoc(deps.currentVersion, msg(err)));
    else console.log('└ Failed'); // секция закрыта; Error:-строку и exit 1 даст runCli
    throw err;
  }
  if (!json) printOutcome(outcome); // §4.13: фаза 1 при --json молчит
  const reExec = deps.reExec ?? reExecUpgradeProjects;
  const reExecOpts = { yes: opts.yes, ...(json ? { json } : {}) };
  if (outcome.kind === 'updated') {
    await reExec(outcome.from, outcome.to, deps.npmPrefix, reExecOpts);
  } else if (outcome.kind === 'up-to-date') {
    await reExec(outcome.current, outcome.current, deps.npmPrefix, reExecOpts);
  }
}

/** commander-коллектор повторяемого `--resolve` (значение может нести список через запятую). */
function collectResolve(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function memoryUpgradeCommand(): Command {
  return new Command('upgrade')
    .description(
      'One command updates everything: npm phase (npm install -g mister-wolf@latest) followed by the registered-projects pass; --check only reports CLI + park freshness, no install; --here runs the full project update step in the current directory only (no npm self-update, no registry); --resolve applies owner decisions (<file|N>=take|keep|protect|pin) without a pass; --show prints one target with the local → base diff (read-only); --review walks the decisions with a diff (TTY) or prints the recipe; --json prints a single machine-readable document'
    )
    .option('--check', 'Only check for a newer version, do not install anything')
    .option('--here', 'Update this project only: full project step in cwd (no npm, no re-exec, no registry)')
    .option('--yes', 'Apply the plan without interactive confirmation (--here or the projects pass)')
    .option(
      '--resolve <target=verb>',
      'Resolve a decision: <file|N>=take|keep|protect|pin (repeatable, comma-separated)',
      collectResolve
    )
    .option('--show <file|N>', 'Show one target: protect, both versions and the local → base diff (read-only)')
    .option('--review', 'Review decisions one by one with a diff (TTY); without a TTY prints the recipe')
    .option('--json', 'Print a single machine-readable document (wolf.upgrade/1) on stdout')
    .action(
      async (options: {
        check?: boolean;
        here?: boolean;
        yes?: boolean;
        resolve?: string[];
        show?: string;
        review?: boolean;
        json?: boolean;
      }) => {
        const json = options.json === true;
        const route = upgradeRoute(options);
        if (route.error !== undefined) {
          // §4.13: при --json stdout содержит единственный документ с error
          if (json) printJson(npmFailureJsonDoc(readInstalledVersion(), route.error));
          throw new UserFacingError(route.error);
        }
        const cwd = safeCwd();
        if (route.mode === 'review') {
          await upgradeReviewAction(options.here === true);
          return; // non-TTY ничего не пишет; TTY применяет по решениям (REQ-07)
        }
        if (route.mode === 'show') {
          await upgradeShowAction(options.show!, options.here === true, json);
          return; // read-only: файлы, свидетель и бэкапы не трогаются (NFR-03)
        }
        if (route.mode === 'resolve') {
          // Решения применяются в фазе 1: без npm-фазы, re-exec и прохода (§4.18)
          await upgradeResolveAction(options.resolve ?? [], options.here === true, json);
          return;
        }
        if (route.mode === 'here') {
          await upgradeHereAction(cwd, options.yes === true, json);
          return; // npm-ветка при --here не выполняется вообще (REQ-14)
        }
        const checkOnly = route.mode === 'check';
        // npm view один на запуск: CLI-часть и парковая сводка делят результат
        let available: string | null = null;
        const viewOnce = async (): Promise<string> => {
          if (available === null) available = await registryVersion();
          return available;
        };
        const deps: UpgradeDeps = {
          currentVersion: readInstalledVersion(),
          binaryPath: process.argv[1] ? realPathOrNull(process.argv[1]) : null,
          npmPrefix: checkOnly ? null : await npmGlobalPrefix(), // --check тип установки не проверяет
          registryVersion: viewOnce,
          installLatest,
        };
        if (route.mode === 'check') {
          // §4.13: при --json фаза 1 молчит — единственный документ печатает check
          if (!json) printOutcome(await runUpgrade(deps, true));
          // порядок: CLI-версии → парк (REQ-08); --here сужает до cwd (read-only)
          await upgradeCheckAction(viewOnce, options.here === true ? cwd : undefined, json);
          return;
        }
        // npm-фаза + re-exec фазы 2 (T8): режимы выше вышли раньше, re-exec там нет
        await runUpgradeWithProjects(deps, { yes: options.yes === true, json });
      }
    );
}
