import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { join, basename } from 'path';
import yaml from 'js-yaml';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { PlatformAdapter, McpCommand, PlatformVersionInfo } from '../../ports/platform-adapter.port.js';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import type { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { writeSchemaVersionIfAbsent, CURRENT_SCHEMA_VERSION } from '../../adapters/fs/schema-version.js';
import { renderConfigYaml } from '../../adapters/fs/config-file.js';
import { configPath } from '../../adapters/fs/project-paths.js';
import { writeFileAtomic } from '../../adapters/fs/markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';
import { RenderAction, ModelContext } from '../../ports/base-set-renderer.port.js';
import { addMemoryObject } from './add-memory-object.js';

/** Минимальный контракт реестра для init (структурно совместим с ProjectsRegistry). */
export interface ProjectRegistry {
  register(path: string, schemaVersion: number): Promise<void>;
}

export interface BaseSetOutcome {
  file: string;
  action: RenderAction; // тот же тип, minor 5
  reason?: string;
}

/** REQ-04 (B0, design §3.4): базовые агенты набора — инвариант контракта
 * BaseSetSpec: каждому agent_id соответствует активное лицо с
 * owner_skill === agent_id (доставка plugin-inject ищет лицо по agent-id). */
export const BASE_SET_AGENT_IDS = [
  'mr-wolf',
  'executor-lead',
  'steward',
  'worker-implementer',
  'worker-researcher',
  'worker-reviewer',
] as const;

/** Активные владельцы лиц → агенты без лица (нарушение §3.4). */
export function baseSetFaceViolations(activeOwners: Iterable<string>): string[] {
  const active = new Set(activeOwners);
  return BASE_SET_AGENT_IDS.filter((id) => !active.has(id));
}
export interface BaseSetDeps {
  render: (
    baseDir: string,
    opts?: { models?: ModelContext | 'omit'; scope?: 'full' | 'agents-md' }
  ) => Promise<BaseSetOutcome[]>;
  seed: (baseDir: string) => Promise<BaseSetOutcome[]>;
}

export interface InitProjectDeps {
  initializer: ProjectInitializer;
  registry: ProjectRegistry;
  adapters: PlatformAdapter[];
  mcpCommand: McpCommand;
  /** true, когда бинарник запущен через npx (try-out: MCP-конфиги не пишем никогда). */
  npx: boolean;
  /** Проставить маркер версии схемы (writeSchemaVersionIfAbsent). */
  markSchemaCurrent: (baseDir: string) => Promise<void>;
  baseSet?: BaseSetDeps;
  /** Память: init-отчёт (§4.1). */
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  declarations?: readonly MemoryTypeDeclaration[];
  /** Версия wolf для секции found отчёта (§4.1); нет — строка версий опускается. */
  wolfVersion?: string;
  /** WP4: ensure wolf-блока в .gitignore; не передан — шаг пропускается (юнит-фейки). */
  ensureGitignore?: (baseDir: string) => Promise<'created' | 'appended' | 'kept'>;
}

/** Входы init: платформы известны до рендера; модели — opt-in (WP2 unpin, спека 2.16 §5). */
export interface InitProjectInput {
  /** Явный выбор платформ (флаг или TTY-ответ) — авторитетен (§4.4); undefined — дефолт рендера. */
  platformChoice?: string[];
  platformSource?: 'flag' | 'tty' | 'default';
  /** 'omit' — дефолт: model-строки вырезаются из fresh-контента (MODEL_LINE_RE);
   * ModelContext — только явный --model (opt-in). */
  models: ModelContext | 'omit';
  modelSource?: 'flag' | 'tty';
  /** true — полный базовый набор + playbook-seed; false/undefined — минимальный набор. */
  full?: boolean;
  /** Ответ TTY-интервью (спека §4): сеется как note+facet context; пусто/не-TTY — не сеется. */
  purpose?: string;
}

/* ---------- K6 (спека 2.16 §4): read-only план init перед любыми записями ---------- */

export interface InitPlanEntry {
  component:
    | 'skeleton'
    | 'config'
    | 'agents-md'
    | 'base-set'
    | 'platforms'
    | 'memory-seed'
    | 'purpose-note'
    | 'gitignore';
  action: 'create' | 'update' | 'keep' | 'skip';
  detail: string;
}

export interface InitPlan {
  /** true — повторный запуск на живом проекте (.wolf/config.yaml существует) — требуется подтверждение. */
  live: boolean;
  entries: InitPlanEntry[];
}

export interface PlanInitDeps {
  exists: (p: string) => Promise<boolean>;
  readFile: (p: string) => Promise<string | null>;
}

const ONBOARDING_MARKER_TEXT = '<!-- wolf:onboarding';

/** K6 (спека 2.16 §4): read-only план init — ничего не пишет; CLI показывает его
 * как diff и требует подтверждения на живом проекте. */
export async function planInit(deps: PlanInitDeps, baseDir: string, input: InitProjectInput): Promise<InitPlan> {
  const cfgPath = configPath(baseDir);
  const cfgRaw = (await deps.exists(cfgPath)) ? await deps.readFile(cfgPath) : null;
  // Краевой случай спеки §4 «пустой/битый конфиг — первый запуск»: пустой после trim
  // конфиг = первый запуск; битый непустой остаётся под гейтом (P3: подтверждение
  // безопаснее молчаливого прохода; ремонт — существующий --recreate).
  const live = cfgRaw !== null && cfgRaw.trim() !== '';
  const agentsRaw = (await deps.readFile(join(baseDir, 'AGENTS.md'))) ?? '';
  const marker = agentsRaw.includes(ONBOARDING_MARKER_TEXT);
  const gitignoreRaw = (await deps.readFile(join(baseDir, '.gitignore'))) ?? '';
  const entries: InitPlanEntry[] = [
    {
      component: 'skeleton',
      action: live ? 'keep' : 'create',
      detail: '.wolf/{memory,threads,shared,briefs,cache} dirs',
    },
    { component: 'config', action: live ? 'keep' : 'create', detail: '.wolf/config.yaml (never overwritten)' },
    {
      component: 'agents-md',
      action: marker ? 'keep' : 'create',
      detail: 'AGENTS.md onboarding marker (marker-append if foreign content)',
    },
    {
      component: 'base-set',
      action: input.full ? (live ? 'keep' : 'create') : 'skip',
      detail: input.full
        ? 'full base set; existing stamped files are never rewritten (fresh/mutated-skip)'
        : 'minimal set — use --full for agents/skills/commands/plugins',
    },
    {
      component: 'platforms',
      action: input.platformChoice !== undefined && input.platformChoice.length > 0 ? 'update' : 'skip',
      detail: input.platformChoice !== undefined ? input.platformChoice.join(', ') : 'no --platform given',
    },
    { component: 'memory-seed', action: live ? 'keep' : 'create', detail: 'init report note (guard by tags)' },
    {
      component: 'purpose-note',
      action: input.purpose ? (live ? 'keep' : 'create') : 'skip',
      detail: input.purpose ? 'interview answer seeded as note' : 'no TTY answer',
    },
    {
      component: 'gitignore',
      action: gitignoreRaw.includes('# wolf-gitignore:v1') ? 'keep' : 'create',
      detail: 'ignore machine-local (.wolf/cache, lock, backup); memory is committed',
    },
  ];
  return { live, entries };
}

export interface PlatformInitOutcome {
  platform: string;
  action: 'written' | 'replaced' | 'unchanged' | 'skipped' | 'removed';
  reason?: string;
  /** F6 (спека 2.1.0 §2.4): имя конфиг-файла платформы + фактические wolf-ключи (проброс из writeConfig). */
  configFile?: string;
  keys?: string[];
  /** 2.14.1: детект версии opencode (диапазон v1 >= 1.18.29 + v2). */
  version?: PlatformVersionInfo;
}

export interface InitProjectResult {
  npx: boolean;
  platformOutcomes: PlatformInitOutcome[];
  baseSetOutcomes: BaseSetOutcome[];
  initReport: { action: 'created' | 'skipped'; id?: string };
  gitignore: 'created' | 'appended' | 'kept' | 'skipped';
}

/** Теги init-отчёта — единственный машинный маркер (D4). */
export const INIT_REPORT_TAGS = ['wolf-init', 'onboarding-v2'] as const;

const PROJECT_ROOT_MARKERS = ['package.json', '.git', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'README.md'];

export function looksLikeProjectRoot(dir: string): boolean {
  return PROJECT_ROOT_MARKERS.some((marker) => existsSync(join(dir, marker)));
}

/** Guard идемпотентности отчёта (§4.1): активный report с тегами wolf-init+onboarding-v2. */
export async function findInitReport(store: MemoryStore): Promise<MemoryObject | null> {
  // wave13-a: report → note+facet history; старые файлы читаются как note (alias)
  const reports = await store.list({ type: 'note' });
  const active = reports.filter(
    (o) =>
      o.status === 'active' &&
      (o as { facet?: string }).facet === 'history' &&
      INIT_REPORT_TAGS.every((t) => o.tags.includes(t))
  );
  return active.length > 0 ? active[0] : null;
}

/**
 * writeConfig + (для opencode) detectVersion — единый outcome обоих call site (§4.4).
 * Версия добавляется, только если адаптер её умеет и вернул.
 */
async function writePlatformOutcome(
  adapter: PlatformAdapter,
  baseDir: string,
  cmd: McpCommand
): Promise<PlatformInitOutcome> {
  const r = await adapter.writeConfig(baseDir, cmd);
  const outcome: PlatformInitOutcome = {
    platform: adapter.id,
    action: r.action,
    reason: r.reason,
    configFile: r.configFile,
    keys: r.keys,
  };
  if (adapter.id === 'opencode') {
    const version = await adapter.detectVersion?.(baseDir);
    if (version) outcome.version = version;
  }
  return outcome;
}

/**
 * `wolf init` v2 (спека §4, onboarding-pipeline-v2): без скана (D1/F8 — полный скан живёт
 * в bootstrap), платформы/модель до рендера, opencode-конфиг
 * безусловно по факту рендера набора (D2/F4), init-отчёт с guard по тегам (D4).
 */
export async function initProject(
  deps: InitProjectDeps,
  baseDir: string,
  input: InitProjectInput
): Promise<InitProjectResult> {
  if (!looksLikeProjectRoot(baseDir)) {
    throw new UserFacingError(
      'Not a project root (no package.json/.git/pyproject.toml/go.mod/Cargo.toml/README.md found). cd into your project first.'
    );
  }

  await deps.initializer.initialize(baseDir);
  await deps.markSchemaCurrent(baseDir);

  // WP4 (спека §7): wolf-блок .gitignore — сразу после штампа схемы
  const gitignore: InitProjectResult['gitignore'] = deps.ensureGitignore
    ? await deps.ensureGitignore(baseDir)
    : 'skipped';

  const memDeps = {
    store: deps.store,
    log: deps.log,
    clock: deps.clock,
    idGen: deps.idGen,
    index: deps.index,
    lock: deps.lock,
    declarations: deps.declarations,
  };

  // §4 п.5: рендер базового набора с подстановкой моделей (AGENTS.md — частью рендера, §4.2)
  const baseSetOutcomes: BaseSetOutcome[] = [];
  if (deps.baseSet) {
    if (deps.npx) {
      baseSetOutcomes.push({
        file: '(base set)',
        action: 'skipped',
        reason: 'npx try-out does not write the base set (spec §7)',
      });
    } else {
      baseSetOutcomes.push(
        ...(await deps.baseSet.render(baseDir, { models: input.models, scope: input.full ? 'full' : 'agents-md' }))
      );
      if (input.full) {
        baseSetOutcomes.push(...(await deps.baseSet.seed(baseDir)));
        // REQ-04 (B0): §3.4-инвариант — после посева каждому базовому агенту
        // должно соответствовать активное лицо с owner_skill === agent_id.
        // Нарушение — не авария init (design §6: отказы B0 подсвечиваются,
        // ловит doctor), а честный conflict-исход в отчёте.
        const activeOwners = (await deps.store.list({ type: 'face' }))
          .filter((o) => o.status === 'active')
          .map((o) => (o as { owner_skill?: unknown }).owner_skill)
          .filter((o): o is string => typeof o === 'string');
        const violations = baseSetFaceViolations(activeOwners);
        if (violations.length > 0) {
          baseSetOutcomes.push({
            file: '(base set faces)',
            action: 'conflict',
            reason: `no active face with owner_skill for agent(s): ${violations.join(', ')} (design §3.4)`,
          });
        }
      }
    }
  }

  // §4 п.6: платформы (D2+D10/F4)
  const platformOutcomes: PlatformInitOutcome[] = [];
  if (deps.npx) {
    // try-out: память создаём, конфиги — никогда (спека §3, npx-путь)
    platformOutcomes.push({ platform: 'npx', action: 'skipped', reason: 'npx try-out never writes MCP configs' });
  } else if (input.platformChoice !== undefined) {
    // явный выбор (флаг/TTY) ЗАМЕНЯЕТ набор: wolf-записи платформ вне списка удаляются (§4.4 п.1)
    const wanted = new Set(input.platformChoice);
    for (const adapter of deps.adapters) {
      if (wanted.has(adapter.id)) {
        platformOutcomes.push(await writePlatformOutcome(adapter, baseDir, deps.mcpCommand));
      } else if (adapter.detect(baseDir)) {
        const removed = await adapter.removeWolf(baseDir);
        platformOutcomes.push({
          platform: adapter.id,
          action: 'removed',
          reason: removed ? 'wolf entry removed (--platform list)' : 'no wolf entry',
        });
      }
    }
  } else {
    // WP1: без --platform платформенные конфиги не пишутся (минимальный путь, спека §4)
  }

  // §4 п.8: реестр проектов
  await deps.registry.register(baseDir, CURRENT_SCHEMA_VERSION);

  // §4 п.9: init-отчёт (D4) — guard по тегам, повторный init не дублирует; npx молчит (§4 п.6)
  let initReport: InitProjectResult['initReport'];
  if (deps.npx) {
    initReport = { action: 'skipped' };
  } else {
    const existing = await findInitReport(deps.store);
    if (existing) {
      initReport = { action: 'skipped', id: existing.id };
    } else {
      const { object } = await addMemoryObject(memDeps, {
        type: 'note', // wave13-a: report → note+facet history (§5.4)
        facet: 'history',
        title: `Init report: ${basename(baseDir)}`,
        body: renderInitReportBody(deps, input, { baseSetOutcomes, platformOutcomes }),
        createdBy: 'wolf-init',
        tags: [...INIT_REPORT_TAGS],
        importance: 0.7,
      });
      initReport = { action: 'created', id: object.id };
    }
  }

  // WP1 (спека §4): ответ TTY-интервью сеется в память (note), не в governing-инструкцию
  if (!deps.npx && input.purpose !== undefined && input.purpose !== '') {
    await addMemoryObject(memDeps, {
      type: 'note',
      facet: 'context',
      title: 'Project purpose and conventions (init)',
      body: input.purpose,
      createdBy: 'user:init',
      tags: ['onboarding', 'project-purpose'],
    });
  }

  return { npx: deps.npx, platformOutcomes, baseSetOutcomes, initReport, gitignore };
}

/** Тело init-отчёта (§4.1): made / found / needs-fix. */
function renderInitReportBody(
  deps: InitProjectDeps,
  input: InitProjectInput,
  outcomes: {
    baseSetOutcomes: BaseSetOutcome[];
    platformOutcomes: PlatformInitOutcome[];
  }
): string {
  const { baseSetOutcomes, platformOutcomes } = outcomes;
  const platformSource = input.platformSource ?? (input.platformChoice ? 'flag' : 'default');
  const selectedPlatforms =
    input.platformChoice ??
    platformOutcomes.filter((o) => o.action !== 'removed' && o.action !== 'skipped').map((o) => o.platform);
  const modelSource = input.modelSource ?? 'flag';
  const agentsMd = baseSetOutcomes.find((o) => o.file === 'AGENTS.md');

  const made: string[] = [];
  for (const o of baseSetOutcomes) {
    if (o.file !== 'AGENTS.md') made.push(`- base set: ${o.file} — ${o.action}${o.reason ? ` (${o.reason})` : ''}`);
  }
  for (const o of platformOutcomes) {
    if (o.action !== 'removed' && o.action !== 'skipped') made.push(`- platform config ${o.platform}: ${o.action}`);
  }
  if (agentsMd) made.push(`- AGENTS.md: ${agentsMd.action}`);
  made.push(`- platforms: ${selectedPlatforms.join(', ') || '—'} (source: ${platformSource})`);
  if (input.models === 'omit') {
    made.push(
      '- model: not pinned (omit) — platform default applies; pin later: wolf init --model <providerID>/<modelID>'
    );
  } else {
    made.push(
      `- model: primary ${input.models.primary} (source: ${modelSource}) — applied to all agents (worker = primary)`
    );
  }

  const found: string[] = [];
  const skippedFiles = baseSetOutcomes.filter((o) => o.action === 'skipped' && o.file !== '(base set)');
  if (skippedFiles.length > 0)
    found.push(`- pre-existing files (skipped): ${skippedFiles.map((o) => o.file).join(', ')}`);
  if (agentsMd && agentsMd.action !== 'created') found.push(`- AGENTS.md already existed (${agentsMd.action})`);
  const versions: string[] = [];
  if (deps.wolfVersion) versions.push(`wolf ${deps.wolfVersion}`);
  versions.push(`schema v${CURRENT_SCHEMA_VERSION}`);
  found.push(`- versions: ${versions.join(', ')}`);

  // 2.14.1: версия opencode (диапазон поддержки v1 >= 1.18.29 + v2)
  const ocVersion = platformOutcomes.find((o) => o.platform === 'opencode')?.version;
  if (ocVersion?.status === 'absent') {
    found.push('- opencode: not found on PATH; assuming v1');
  } else if (ocVersion) {
    found.push(`- opencode: ${ocVersion.raw ?? ocVersion.version} (${ocVersion.status})`);
  }

  const needsFix: string[] = [];
  for (const o of platformOutcomes) {
    if (o.reason && o.action !== 'removed') needsFix.push(`- ${o.platform}: ${o.reason}`);
  }
  if (ocVersion?.status === 'unsupported') {
    needsFix.push(
      `- opencode ${ocVersion.version} is unsupported: Wolf needs opencode v1 >= 1.18.29 or v2 — upgrade opencode`
    );
  }
  if (ocVersion?.status === 'unparseable') {
    needsFix.push(
      `- opencode version could not be parsed (${ocVersion.raw || 'empty output'}): Wolf needs v1 >= 1.18.29 or v2`
    );
  }
  // §4.4 граничный случай: явный выбор без opencode — набор отрендерен, но MCP не подключён (осознанное состояние)
  if (input.platformChoice !== undefined && !input.platformChoice.includes('opencode')) {
    needsFix.push(
      '- opencode not in the --platform list: Wolf agents are rendered into .opencode/, but mcp.wolf/default_agent/subagent_depth are not written; connect: wolf init --platform opencode,…'
    );
  }
  const mcpWritten = platformOutcomes.some((o) => o.action === 'written' || o.action === 'replaced');
  if (mcpWritten)
    needsFix.push(
      '- connect MCP: restart the platform (opencode will pick up mcp.wolf, default_agent and subagent_depth)'
    );

  return [
    '## Done (made)',
    ...made,
    '',
    '## Detected (found)',
    ...found,
    '',
    '## Needs fixing (needs-fix)',
    ...needsFix,
  ].join('\n');
}

/**
 * §6: повреждённый .wolf → неинтерактивное восстановление:
 * битый yaml → бэкап в .wolf/backup/<ts>/ + дефолтный рендер.
 * Валидный yaml-объект и отсутствующий конфиг → no-op.
 */
export async function recreateConfig(baseDir: string): Promise<void> {
  const cfgPath = configPath(baseDir);
  let raw: string | null = null;
  try {
    raw = await fs.readFile(cfgPath, 'utf-8');
  } catch {
    return; // конфига нет — init создаст скелет
  }
  // валидный конфиг не трогаем: --recreate лечит только повреждённый yaml
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch {
    parsed = undefined; // битый yaml — восстанавливаем ниже
  }
  if (parsed !== null && typeof parsed === 'object') return;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(baseDir, '.wolf', 'backup', stamp);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(cfgPath, join(backupDir, 'config.yaml'));
  await writeFileAtomic(cfgPath, renderConfigYaml(null));
}
