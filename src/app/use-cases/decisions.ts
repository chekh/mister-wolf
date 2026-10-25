// src/app/use-cases/decisions.ts
// T7 (волна 2.20.0, REQ-06/REQ-05 AC3, design §4.7/§4.8/§4.12/§4.17):
// реестр решений владельца (read-only сбор + нумерация), разбор `--resolve`
// (грамматика, область целей, матрица «глагол × класс», двухфазная валидация)
// и применение решений (take/keep/protect/pin) с бэкапом локального контента.
// Сбор и валидация ничего не пишут; запись — только applyResolutions, после
// того как все ошибки собраны (AC3 «к другим файлам ничего не применено»).
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { mkdir } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { dedupeByRealpath, type RegisteredProject } from '../../adapters/fs/projects-registry.js';
import type { FileKind, UpdateMap } from '../../adapters/fs/update-map.js';
import type { InspectOutcome } from '../../ports/base-set-renderer.port.js';
import { loadSyncState, saveSyncState, sha256, type SyncEntry } from '../../adapters/render/sync-state.js';
import { parseStamp } from '../../adapters/render/stamp.js';
import { writeFileAtomic } from '../../adapters/fs/markdown-memory-store.js';
import { insertProtect, normalizeManaged, parseProtect, removeProtect } from '../../domain/protect-key.js';
import { projectPath } from './verify-against-map.js';
import { planOf } from './upgrade-projects.js';
import { backupLocalFile } from './project-step.js';

/** Вид цели: файлы base-set (из `map.files[].kind`) и AGENTS.md. */
export type DecisionKind = 'agent' | 'skill' | 'command' | 'plugin' | 'agents-md';

/** Адресуемое решение (design §4.7): `n` — сквозной номер прогона. */
export interface DecisionTarget {
  n: number;
  project: string;
  root: string;
  file: string;
  kind: DecisionKind;
  code: 'mutated' | 'conflict';
}

/** Лицо памяти в дрейфе: видно и учитывается в exit, но не адресуемо (зона Стюарда). */
export interface DivergedFace {
  project: string;
  file: string;
  ownerSkill: string | null;
  version: string | null;
}

export interface SkippedProject {
  name: string;
  reason: 'worktree' | 'pinned' | 'missing';
}

/** Активный проект прогона — вход адресации целей без решения (по пути). */
export interface ProjectRef {
  name: string;
  root: string;
}

export interface DecisionRegistry {
  targets: DecisionTarget[];
  diverged: DivergedFace[];
  skippedProjects: SkippedProject[];
  /** Активные проекты в порядке реестра; поле аддитивно к §4.7 — нужно, чтобы
   *  `--resolve <путь>` работал и на целях без решения (differs/missing/protected). */
  projects: ProjectRef[];
}

/** Живое лицо проекта для read-only проверки дрейфа (diverged). */
export interface LiveFace {
  ownerSkill: string;
  version: string;
  body: string;
  initiator: string;
}

export interface DecisionDeps {
  /** Парковый режим: реестр проектов. */
  registry?: { listStrict(): Promise<RegisteredProject[]> };
  /** `--here`: единственный проект (cwd); реестр не читается. */
  here?: string;
  loadMap: () => UpdateMap;
  /** Read-only инспекция base-set проекта (renderer.inspectBaseSet). */
  inspect: (root: string) => Promise<InspectOutcome[]>;
  /** Read-only лица проекта (для `diverged`); нет — секция не собирается. */
  liveFaces?: (root: string) => Promise<LiveFace[]>;
  /** Шаблоны лиц: basename → сырой контент (сравнение тела, как в посеве). */
  faceTemplates?: Map<string, string>;
}

const KIND_OF: Record<FileKind, DecisionKind> = {
  agent: 'agent',
  skill: 'skill',
  command: 'command',
  plugin: 'plugin',
};

/** Каталоги base-set (LAYOUT рендерера): область wolf-управляемых файлов. */
const BASE_DIRS = ['.opencode/agents', '.opencode/skills', '.opencode/command', '.opencode/plugins'];

/**
 * Тело шаблона лица — то же извлечение, что в `seed-base-playbooks.ts`
 * (единственный источник предиката diverged: живое лицо сравнивается с телом
 * шаблона, дрейф при initiator вне seed/migration — зона Стюарда).
 */
function templateBody(raw: string): string {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? m[2] : raw;
}

async function divergedFaces(root: string, map: UpdateMap, deps: DecisionDeps): Promise<DivergedFace[]> {
  if (!deps.liveFaces) return [];
  const live = await deps.liveFaces(root);
  const out: DivergedFace[] = [];
  const seen = new Set<string>();
  for (const face of map.faces) {
    if (!face.seed || seen.has(face.owner_skill)) continue;
    seen.add(face.owner_skill);
    const tpl = deps.faceTemplates?.get(basename(face.template));
    if (tpl === undefined) continue;
    const active = live.find((f) => f.ownerSkill === face.owner_skill);
    if (!active) continue; // лица нет — штатный посев прохода, не решение владельца
    if (active.body === templateBody(tpl)) continue; // совпало с шаблоном
    if (active.initiator === 'seed' || active.initiator === 'migration') continue; // штатное отставание
    out.push({
      project: basename(root),
      file: `faces/${face.owner_skill}.md`,
      ownerSkill: face.owner_skill,
      version: active.version ?? null,
    });
  }
  return out;
}

/**
 * Реестр решений (design §4.7): строго read-only — `inspectBaseSet` +
 * свидетель + чтение лиц. Порядок: реестр проектов → цели карты в порядке
 * `map.files` → AGENTS.md; нумерация сквозная 1-based и стабильна при
 * неизменном состоянии (NFR-06). `removed`-цели не нумеруются (их решает
 * проход, адресация — только по пути), orphan-дрейф — тоже (решается путём).
 */
export async function collectDecisions(deps: DecisionDeps): Promise<DecisionRegistry> {
  const map = deps.loadMap();
  const projects: ProjectRef[] = [];
  const skippedProjects: SkippedProject[] = [];

  if (deps.here !== undefined) {
    projects.push({ name: basename(deps.here), root: deps.here });
  } else {
    const registered = deps.registry ? await deps.registry.listStrict() : [];
    const { unique } = dedupeByRealpath(registered);
    for (const entry of unique) {
      const plan = planOf(entry);
      if (plan.status !== null) {
        skippedProjects.push({ name: plan.name, reason: plan.status });
        continue;
      }
      projects.push({ name: plan.name, root: plan.path });
    }
  }

  const targets: DecisionTarget[] = [];
  const diverged: DivergedFace[] = [];
  for (const project of projects) {
    const outcomes = await deps.inspect(project.root);
    const byFile = new Map(outcomes.map((o) => [o.file, o]));
    const add = (file: string, kind: DecisionKind, code: 'mutated' | 'conflict'): void => {
      targets.push({ n: targets.length + 1, project: project.name, root: project.root, file, kind, code });
    };
    for (const entry of map.files) {
      if (entry.category === 'removed') continue;
      const rel = projectPath(entry);
      const action = byFile.get(rel)?.action;
      if (action === 'mutated') add(rel, KIND_OF[entry.kind], 'mutated');
      else if (action === 'foreign') add(rel, KIND_OF[entry.kind], 'conflict');
    }
    const agents = byFile.get('AGENTS.md')?.action;
    if (agents === 'mutated') add('AGENTS.md', 'agents-md', 'mutated');
    else if (agents === 'foreign') add('AGENTS.md', 'agents-md', 'conflict');
    diverged.push(...(await divergedFaces(project.root, map, deps)));
  }

  return { targets, diverged, skippedProjects, projects };
}

/** Похожие цели (§4.9, критерий «все к похожим»): та же пара `kind` + `code`. */
export function similarTargets(reg: DecisionRegistry, target: DecisionTarget): DecisionTarget[] {
  return reg.targets.filter((t) => t.n !== target.n && t.kind === target.kind && t.code === target.code);
}

/* ---------- разбор `--resolve` (§4.8) ---------- */

export type ResolutionVerb = 'take' | 'keep' | 'protect' | 'pin';
const VERBS: readonly ResolutionVerb[] = ['take', 'keep', 'protect', 'pin'];

/** Класс цели — строка матрицы «глагол × класс» (design §4.8). */
export type TargetClass =
  | 'mutated'
  | 'conflict'
  | 'protected'
  | 'kept'
  | 'orphan'
  | 'agents-stamped'
  | 'agents-block'
  | 'removed'
  | 'plain'
  | 'missing';

export interface ResolveRequest {
  target: string;
  verb: ResolutionVerb;
}

export interface ResolveOp {
  root: string;
  project: string;
  file: string;
  kind: DecisionKind | 'unknown';
  cls: TargetClass;
  verb: ResolutionVerb;
}

export interface ResolvePlan {
  ops: ResolveOp[];
  errors: string[];
}

const EXPECTED = '--resolve: expected <file|N>=take|keep|protect|pin';

/** Грамматика CLI: повторяемый флаг, в значении допускается список через запятую. */
export function parseResolveValues(values: string[]): { requests: ResolveRequest[]; errors: string[] } {
  const requests: ResolveRequest[] = [];
  const errors: string[] = [];
  for (const raw of values) {
    for (const item of raw.split(',')) {
      const text = item.trim();
      if (text === '') {
        errors.push(EXPECTED);
        continue;
      }
      const eq = text.lastIndexOf('=');
      if (eq <= 0 || eq === text.length - 1) {
        errors.push(`${EXPECTED} (got "${text}")`);
        continue;
      }
      const target = text.slice(0, eq).trim();
      const verb = text.slice(eq + 1).trim();
      if (target === '' || verb === '') {
        errors.push(`${EXPECTED} (got "${text}")`);
        continue;
      }
      if (!VERBS.includes(verb as ResolutionVerb)) {
        errors.push(`unknown verb "${verb}" — expected ${VERBS.join('|')}`);
        continue;
      }
      requests.push({ target, verb: verb as ResolutionVerb });
    }
  }
  return { requests, errors };
}

const normRel = (raw: string): string => {
  let rel = raw.trim().replace(/\\/g, '/');
  while (rel.startsWith('./')) rel = rel.slice(2);
  return rel.replace(/\/+$/, '');
};

function walkAll(dir: string, root: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walkAll(abs, root, out);
    else out.push(abs.slice(root.length + 1).replace(/\\/g, '/'));
  }
}

/** Управляемые цели проекта: карта → AGENTS.md → orphan-файлы base-set (алфавит). */
function managedTargets(root: string, map: UpdateMap): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of map.files) {
    const rel = projectPath(entry);
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  if (!seen.has('AGENTS.md')) {
    seen.add('AGENTS.md');
    out.push('AGENTS.md');
  }
  const orphans: string[] = [];
  for (const dir of BASE_DIRS) {
    const found: string[] = [];
    walkAll(join(root, dir), root, found);
    for (const rel of found.sort()) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      orphans.push(rel);
    }
  }
  out.push(...orphans);
  return out;
}

/** Матрица «глагол × класс» (design §4.8): `true` — можно, строка — причина отказа. */
const MATRIX: Record<TargetClass, Record<ResolutionVerb, true | string>> = {
  mutated: { take: true, keep: true, protect: true, pin: true },
  conflict: {
    take: true,
    keep: 'conflict comes from the map, not the witness — use protect',
    protect: true,
    pin: true,
  },
  protected: { take: true, keep: true, protect: true, pin: true },
  kept: { take: true, keep: true, protect: true, pin: true },
  orphan: {
    take: 'no base for a file outside the update map',
    keep: 'conflict comes from the map, not the witness — use protect',
    protect: true,
    pin: true,
  },
  'agents-stamped': {
    take: true,
    keep: true,
    protect: 'AGENTS.md has no YAML frontmatter',
    pin: 'AGENTS.md has no YAML frontmatter',
  },
  'agents-block': {
    take: true,
    keep: true,
    protect: 'AGENTS.md has no YAML frontmatter',
    pin: 'AGENTS.md has no YAML frontmatter',
  },
  removed: { take: 'no base for a file outside the update map', keep: true, protect: true, pin: true },
  plain: { take: true, keep: true, protect: true, pin: true },
  missing: {
    take: true,
    keep: 'nothing to keep: the file does not exist — use take',
    protect: 'cannot protect the file: no YAML frontmatter — add one or use keep',
    pin: 'cannot protect the file: no YAML frontmatter — add one or use keep',
  },
};

const NO_FRONTMATTER = 'no YAML frontmatter — add one or use keep';

/** Класс цели по фактическому состоянию (порядок: AGENTS.md → категория карты →
 *  решение реестра → защита/keep → plain). */
function classifyTarget(root: string, file: string, map: UpdateMap, reg: DecisionRegistry): TargetClass {
  const abs = join(root, file);
  if (file === 'AGENTS.md') {
    if (!existsSync(abs)) return 'missing';
    return parseStamp(readFileSync(abs, 'utf-8')) !== null ? 'agents-stamped' : 'agents-block';
  }
  const entry = map.files.find((e) => projectPath(e) === file);
  if (!entry) return 'orphan';
  if (entry.category === 'removed') return 'removed';
  const target = reg.targets.find((t) => t.root === root && t.file === file);
  if (target) return target.code;
  if (!existsSync(abs)) return 'missing';
  const current = readFileSync(abs, 'utf-8');
  if (parseProtect(current).held) return 'protected';
  const entryState = loadSyncState(root).files[file];
  if (
    entryState !== undefined &&
    typeof entryState === 'object' &&
    entryState.origin === 'keep' &&
    entryState.hash === sha256(normalizeManaged(current))
  ) {
    return 'kept';
  }
  return 'plain';
}

/** Проверка глагола по матрице + структурная проверка вставки ключа ДО записи. */
function verbError(op: ResolveOp, root: string, map: UpdateMap): string | null {
  const verdict = MATRIX[op.cls][op.verb];
  if (verdict !== true) return `cannot ${op.verb} ${op.file}: ${verdict}`;
  if (op.verb !== 'protect' && op.verb !== 'pin') return null;
  const abs = join(root, op.file);
  if (!existsSync(abs)) return `cannot ${op.verb} ${op.file}: ${NO_FRONTMATTER}`;
  const current = readFileSync(abs, 'utf-8');
  const probe = insertProtect(current, op.verb === 'protect' ? 'true' : map.version);
  if (probe.error === 'no-yaml-frontmatter') return `cannot ${op.verb} ${op.file}: ${NO_FRONTMATTER}`;
  if (probe.error) return `cannot ${op.verb} ${op.file}: frontmatter would break`;
  return null;
}

interface Candidate {
  root: string;
  project: string;
  file: string;
}

/** Адресация пути: `--here` — от cwd, парк — `<project>/<rel>` или уникальный `<rel>`. */
function pathCandidates(
  reg: DecisionRegistry,
  map: UpdateMap,
  raw: string,
  here: boolean
): { candidates: Candidate[]; error?: string } {
  const rel = normRel(raw);
  if (rel === '') return { candidates: [], error: `unknown target ${raw}` };

  if (here) {
    const project = reg.projects[0];
    if (!project) return { candidates: [], error: `unknown target ${raw}` };
    const managed = managedTargets(project.root, map);
    if (managed.includes(rel) || reg.targets.some((t) => t.root === project.root && t.file === rel)) {
      return { candidates: [{ root: project.root, project: project.name, file: rel }] };
    }
    return { candidates: [], error: `unknown target ${raw}` };
  }

  const [head, ...rest] = rel.split('/');
  const explicit = reg.projects.find((p) => p.name === head);
  if (explicit && rest.length > 0) {
    const file = rest.join('/');
    const managed = managedTargets(explicit.root, map);
    if (managed.includes(file) || reg.targets.some((t) => t.root === explicit.root && t.file === file)) {
      return { candidates: [{ root: explicit.root, project: explicit.name, file }] };
    }
    return { candidates: [], error: `unknown target ${raw}` };
  }

  const candidates: Candidate[] = [];
  for (const project of reg.projects) {
    const managed = managedTargets(project.root, map);
    if (managed.includes(rel) || reg.targets.some((t) => t.root === project.root && t.file === rel)) {
      candidates.push({ root: project.root, project: project.name, file: rel });
    }
  }
  if (candidates.length === 0) return { candidates: [], error: `unknown target ${raw}` };
  if (candidates.length > 1) {
    const list = candidates.map((c) => `${c.project}/${c.file}`).join(', ');
    return { candidates: [], error: `ambiguous target ${raw}: ${list} (use <project>/<path>)` };
  }
  return { candidates };
}

/** Одна цель по адресу: `N` — только запись реестра; путь — §4.8 область целей. */
function candidateFor(
  reg: DecisionRegistry,
  map: UpdateMap,
  raw: string,
  opts: { here: boolean; cwd: string }
): { candidate?: Candidate; error?: string } {
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const target = reg.targets.find((t) => t.n === n);
    if (!target) {
      return { error: `unknown target ${raw} (the decision list has ${reg.targets.length} entries)` };
    }
    return { candidate: { root: target.root, project: target.project, file: target.file } };
  }
  const found = pathCandidates(reg, map, raw, opts.here);
  if (found.error !== undefined) return { error: found.error };
  return { candidate: found.candidates[0]! };
}

/** Цель `--show` (design §4.10): как у `--resolve`, но разрешены и файлы, которые
 *  сейчас не требуют решения (защищённые/kept/идентичные) — только по пути. */
export interface ShowTarget {
  root: string;
  project: string;
  file: string;
  kind: DecisionKind | 'unknown';
  cls: TargetClass;
}

export function resolveShowTarget(
  reg: DecisionRegistry,
  map: UpdateMap,
  raw: string,
  opts: { here: boolean; cwd: string }
): { target?: ShowTarget; error?: string } {
  const found = candidateFor(reg, map, raw, opts);
  if (found.candidate === undefined) return { error: found.error };
  const { root, project, file } = found.candidate;
  const target = reg.targets.find((t) => t.root === root && t.file === file);
  return {
    target: {
      root,
      project,
      file,
      kind: target ? target.kind : file === 'AGENTS.md' ? 'agents-md' : 'unknown',
      cls: classifyTarget(root, file, map, reg),
    },
  };
}

/**
 * Разбор и валидация ВСЕХ аргументов (design §4.8, шаг 2): ошибки собираются
 * полностью, ни одна не пишет; `ops` — только при пустом списке ошибок.
 * Порядок применения — порядок реестра (карта → AGENTS.md → orphan), не ввода.
 */
export function planResolutions(
  reg: DecisionRegistry,
  map: UpdateMap,
  requests: ResolveRequest[],
  opts: { here: boolean; cwd: string }
): ResolvePlan {
  const errors: string[] = [];
  const resolved: ResolveOp[] = [];
  const seen = new Set<string>();

  // Глобальный порядок целей: проект (порядок реестра) × managed-порядок.
  const order = new Map<string, number>();
  let index = 0;
  for (const project of reg.projects) {
    for (const file of managedTargets(project.root, map)) order.set(`${project.root}\u0000${file}`, index++);
  }

  for (const request of requests) {
    const found = candidateFor(reg, map, request.target, opts);
    if (found.candidate === undefined) {
      errors.push(found.error!);
      continue;
    }

    const candidate = found.candidate;
    const key = `${candidate.root}\u0000${candidate.file}`;
    if (seen.has(key)) {
      errors.push(`target listed twice: ${request.target}`);
      continue;
    }
    seen.add(key);
    const target = reg.targets.find((t) => t.root === candidate.root && t.file === candidate.file);
    const op: ResolveOp = {
      root: candidate.root,
      project: candidate.project,
      file: candidate.file,
      kind: target ? target.kind : candidate.file === 'AGENTS.md' ? 'agents-md' : 'unknown',
      cls: classifyTarget(candidate.root, candidate.file, map, reg),
      verb: request.verb,
    };
    const error = verbError(op, candidate.root, map);
    if (error !== null) {
      errors.push(error);
      continue;
    }
    resolved.push(op);
  }

  resolved.sort((a, b) => (order.get(`${a.root}\u0000${a.file}`) ?? 0) - (order.get(`${b.root}\u0000${b.file}`) ?? 0));
  return { ops: errors.length > 0 ? [] : resolved, errors };
}

/* ---------- применение решений (§4.8 семантика глаголов, §4.12 бэкап) ---------- */

export interface AppliedResolution {
  root: string;
  project: string;
  file: string;
  verb: ResolutionVerb;
  /** Путь бэкапа локального контента (только `take` при отличии от эталона). */
  backup?: string;
  /** Ни файл, ни свидетель не изменились (идемпотентный повтор). */
  noop?: true;
}

export interface ApplyResolutionDeps {
  map: UpdateMap;
  /** Эталон одного файла (`renderer.renderFreshFile`); null — файла нет в карте. */
  renderer: { renderFreshFile(baseDir: string, rel: string): string | null };
  /** Часы бэкапа (путь `<date>`); дефолт Date.now — герметичность в тестах. */
  now?: () => number;
}

export interface ApplyResolutionResult {
  applied: AppliedResolution[];
  backups: Array<{ file: string; backup: string }>;
  errors: string[];
}

const entryEquals = (a: string | SyncEntry | undefined, b: SyncEntry): boolean =>
  a !== undefined && typeof a === 'object' && a.hash === b.hash && a.origin === b.origin && a.base === b.base;

/**
 * Применение решений в порядке реестра. Каждая операция: бэкап (если нужен) →
 * атомарная запись файла → атомарная запись свидетеля. Сбой k-й операции
 * останавливает обход (`applied` 1..k−1 сохраняются), ошибка возвращается
 * вызывающему для exit 1.
 */
export async function applyResolutions(ops: ResolveOp[], deps: ApplyResolutionDeps): Promise<ApplyResolutionResult> {
  const now = deps.now ?? Date.now;
  const applied: AppliedResolution[] = [];
  const backups: Array<{ file: string; backup: string }> = [];
  const errors: string[] = [];

  for (const op of ops) {
    try {
      const abs = join(op.root, op.file);
      const state = loadSyncState(op.root);
      const current = existsSync(abs) ? readFileSync(abs, 'utf-8') : null;
      let nextContent = current;
      let entry: SyncEntry;
      let backupPath: string | undefined;

      switch (op.verb) {
        case 'take': {
          const fresh = deps.renderer.renderFreshFile(op.root, op.file);
          if (fresh === null) throw new Error('no base for a file outside the update map');
          if (current !== null && normalizeManaged(current) !== fresh) {
            backupPath = (await backupLocalFile(op.root, op.file, current, new Date(now()))).path;
          }
          nextContent = fresh;
          entry = { hash: sha256(normalizeManaged(fresh)), origin: 'render', base: deps.map.version };
          break;
        }
        case 'keep': {
          // блочный AGENTS.md живёт вне синка: keep — законный no-op без записи
          if (current === null) throw new Error('nothing to keep: the file does not exist — use take');
          if (op.file === 'AGENTS.md' && op.cls === 'agents-block') {
            applied.push({ root: op.root, project: op.project, file: op.file, verb: op.verb, noop: true });
            continue;
          }
          // keep может снимать ключ protect (unprotect, REQ-05) — контент иначе не меняется
          nextContent = parseProtect(current).held ? removeProtect(current) : current;
          entry = { hash: sha256(normalizeManaged(nextContent)), origin: 'keep', base: deps.map.version };
          break;
        }
        case 'protect':
        case 'pin': {
          if (current === null) throw new Error(`cannot protect ${op.file}: ${NO_FRONTMATTER}`);
          const value = op.verb === 'protect' ? 'true' : deps.map.version;
          const inserted = insertProtect(current, value);
          if (inserted.error === 'no-yaml-frontmatter') {
            throw new Error(`cannot protect ${op.file}: ${NO_FRONTMATTER}`);
          }
          if (inserted.error) throw new Error(`${op.file} — frontmatter would break`);
          nextContent = inserted.content;
          entry = { hash: sha256(normalizeManaged(nextContent)), origin: 'keep', base: deps.map.version };
          break;
        }
      }

      const stateDirty = !entryEquals(state.files[op.file], entry!);
      const fileDirty = nextContent !== current;
      if (!stateDirty && !fileDirty) {
        applied.push({ root: op.root, project: op.project, file: op.file, verb: op.verb, noop: true });
        continue;
      }
      if (fileDirty) {
        await mkdir(dirname(abs), { recursive: true });
        await writeFileAtomic(abs, nextContent!);
      }
      if (stateDirty) {
        state.files[op.file] = entry!;
        saveSyncState(op.root, state);
      }
      applied.push({
        root: op.root,
        project: op.project,
        file: op.file,
        verb: op.verb,
        ...(backupPath !== undefined ? { backup: backupPath } : {}),
      });
      if (backupPath !== undefined) backups.push({ file: op.file, backup: backupPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`error: ${op.file} — ${message}`);
      break; // оставшиеся цели не трогаем (design §4.8, сбой k-й операции)
    }
  }

  return { applied, backups, errors };
}
