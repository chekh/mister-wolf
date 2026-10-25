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
  mapCategories,
  STATUS_TEXT,
  statusOf,
  verifyNameLines,
  type OutcomeStatus,
} from '../../../app/use-cases/upgrade-projects.js';
import { projectPath } from '../../../app/use-cases/verify-against-map.js';
import { compareVersions, loadUpdateMap, type UpdateMap } from '../../fs/update-map.js';
import { ProjectsRegistry, type RegisteredProject } from '../../fs/projects-registry.js';
import { wolfUserConfigDir } from '../../fs/user-config.js';
import type { InspectOutcome } from '../../../ports/base-set-renderer.port.js';
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
function stepDetailLines(report: ProjectReport): ReportNode[] {
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
  out.push(...verifyNameLines(report.verify, report));
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
    };
  }

  const confirmedRemovals = map.files.filter((f) => f.category === 'removed').map(projectPath);
  const runStep = deps.runStep ?? runProjectStep;
  let report: ProjectReport | null = null;
  let error: string | null = null;
  try {
    report = await runStep(deps.makeStepDeps(deps.cwd), deps.cwd, map, { confirmedRemovals });
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
    ...(report ? stepDetailLines(report) : []),
    { kind: 'summary', counters, done: false },
    line(marker, finalText),
  ];
  return { exitCode, report: { kind: 'section', title: HERE_TITLE, children } };
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
async function upgradeHereAction(cwd: string, yes: boolean): Promise<void> {
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
    { yes, tty: isTty, confirm }
  );
  process.stdout.write(`${renderReport(res.report, env)}\n`);
  process.exitCode = res.exitCode;
}

/* ---------- --check парковая сводка (REQ-08, T10): read-only, 0 мутаций ---------- */
// Состав — истина, штамп — свидетель (инвентаризация §3.4): класс проекта —
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
}

export interface UpgradeCheckResult {
  /** Read-only сводка не падает — exit всегда 0 (design exit-таблица: --check). */
  exitCode: 0;
  report: ReportNode;
}

const CHECK_TITLE = 'wolf upgrade — check';

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

/** Секция одного проекта (REQ-08): имя · путь · класс · штамп/состав (справочно) ·
 *  детали · deprecated-строка. Сбой инспекции — error-строка, не крах (REQ-06). */
async function projectCheckLines(
  entry: RegisteredProject,
  map: UpdateMap,
  deps: UpgradeCheckDeps
): Promise<ReportNode[]> {
  const name = basename(entry.path);
  if (!existsSync(entry.path)) {
    return [line('info', `${name} · ${entry.path} — ${CLASS_TEXT.unknown} (path does not exist)`, true)];
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
    return lines;
  } catch (err) {
    return [line('error', `${name} — error: ${msg(err)}`)];
  }
}

/** `--check`-сводка парка (REQ-08): CLI-строка (installed vs available) →
 *  перечисление проектов реестра. Деградации не крахят: битый реестр/npm —
 *  error-строка; карты нет — штампы с пометкой недостоверности и классом
 *  unknown (никогда current); пустой реестр — «no projects». exit 0. */
export async function runUpgradeCheck(deps: UpgradeCheckDeps): Promise<UpgradeCheckResult> {
  const children: ReportNode[] = [];
  try {
    children.push(
      line('info', `cli: installed ${deps.installedVersion()} · available ${await deps.registryVersion()}`)
    );
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
        for (const entry of registered) children.push(...(await projectCheckLines(entry, map, deps)));
      } else {
        // Деградация (design §«--check»): карты нет у самого CLI — только штампы
        // (свидетель касания, не истина) с явной пометкой недостоверности.
        children.push(line('warn', 'map unavailable in this CLI — stamps only, unreliable'));
        for (const entry of registered) {
          children.push(line('info', `${basename(entry.path)} · ${entry.path} — ${CLASS_TEXT.unknown}`));
          children.push(line('info', stampNote(entry.path), true));
        }
      }
    }
  }
  children.push(line('ok', 'Done (read-only)'));
  return { exitCode: 0, report: { kind: 'section', title: CHECK_TITLE, children } };
}

/** CLI-обвязка check-сводки (REQ-08): реестр — как projects (wolfUserConfigDir),
 *  инспекция — read-only inspectBaseSet ('omit' — паритет sync-рендера);
 *  exit не меняется (--check всегда 0). */
async function upgradeCheckAction(viewVersion: () => Promise<string>): Promise<void> {
  const renderer = new OpencodeBaseSetRenderer(templatesRoot(), {
    harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
  });
  const res = await runUpgradeCheck({
    registry: new ProjectsRegistry(wolfUserConfigDir()),
    loadMap: () => loadUpdateMap(),
    registryVersion: viewVersion,
    installedVersion: readInstalledVersion,
    inspect: (root) => renderer.inspectBaseSet(root, { models: 'omit' }),
  });
  process.stdout.write(`${renderReport(res.report, termEnv(process.stdout, process.env))}\n`);
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
  opts: { yes?: boolean } & ReExecDeps = {}
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
  opts: { yes?: boolean } = {}
): Promise<void> {
  const env = termEnv(process.stdout, process.env);
  process.stdout.write(`${renderReport({ kind: 'banner', version: deps.currentVersion }, env)}\n`);
  let outcome: UpgradeOutcome;
  try {
    outcome = await runUpgrade(deps, false);
  } catch (err) {
    console.log('└ Failed'); // секция закрыта; Error:-строку и exit 1 даст runCli
    throw err;
  }
  printOutcome(outcome);
  const reExec = deps.reExec ?? reExecUpgradeProjects;
  if (outcome.kind === 'updated') {
    await reExec(outcome.from, outcome.to, deps.npmPrefix, { yes: opts.yes });
  } else if (outcome.kind === 'up-to-date') {
    await reExec(outcome.current, outcome.current, deps.npmPrefix, { yes: opts.yes });
  }
}

export function memoryUpgradeCommand(): Command {
  return new Command('upgrade')
    .description(
      'One command updates everything: npm phase (npm install -g mister-wolf@latest) followed by the registered-projects pass; --check only reports CLI + park freshness, no install; --here runs the full project update step in the current directory only (no npm self-update, no registry)'
    )
    .option('--check', 'Only check for a newer version, do not install anything')
    .option('--here', 'Update this project only: full project step in cwd (no npm, no re-exec, no registry)')
    .option('--yes', 'Apply the plan without interactive confirmation (--here or the projects pass)')
    .action(async (options: { check?: boolean; here?: boolean; yes?: boolean }) => {
      if (options.here === true) {
        await upgradeHereAction(safeCwd(), options.yes === true);
        return; // npm-ветка при --here не выполняется вообще (REQ-14)
      }
      const checkOnly = options.check === true;
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
      if (options.check === true) {
        printOutcome(await runUpgrade(deps, true));
        await upgradeCheckAction(viewOnce); // порядок: CLI-версии → парк (REQ-08)
        return;
      }
      // npm-фаза + re-exec фазы 2 (T8): --here выше вышел раньше, re-exec там нет
      await runUpgradeWithProjects(deps, { yes: options.yes === true });
    });
}
