import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { join, basename } from 'path';
import yaml from 'js-yaml';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { PlatformAdapter, McpCommand } from '../../ports/platform-adapter.port.js';
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
import { upsertModelRouting } from './model-routing.js';

/** Минимальный контракт реестра для init (структурно совместим с ProjectsRegistry). */
export interface ProjectRegistry {
  register(path: string, schemaVersion: number): Promise<void>;
}

export interface BaseSetOutcome {
  file: string;
  action: RenderAction; // тот же тип, minor 5
  reason?: string;
}
export interface BaseSetDeps {
  render: (baseDir: string, opts?: { models?: ModelContext }) => Promise<BaseSetOutcome[]>;
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
  /** Память: routing-объект моделей (§4.5) + init-отчёт (§4.1). */
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  declarations?: readonly MemoryTypeDeclaration[];
  /** Версия wolf для секции found отчёта (§4.1); нет — строка версий опускается. */
  wolfVersion?: string;
}

/** Входы init v2 (§4 п.4): платформы и модель известны ДО рендера набора. */
export interface InitProjectInput {
  /** Явный выбор платформ (флаг или TTY-ответ) — авторитетен (§4.4); undefined — дефолт рендера. */
  platformChoice?: string[];
  platformSource?: 'flag' | 'tty' | 'default';
  /** Модель агентов (§4.5): primary всегда известен (Q7/Q11); worker = primary при init. */
  models: ModelContext;
  modelSource?: 'flag' | 'tty';
}

export interface PlatformInitOutcome {
  platform: string;
  action: 'written' | 'replaced' | 'unchanged' | 'skipped' | 'removed';
  reason?: string;
  /** F6 (спека 2.1.0 §2.4): имя конфиг-файла платформы + фактические wolf-ключи (проброс из writeConfig). */
  configFile?: string;
  keys?: string[];
}

export interface InitProjectResult {
  npx: boolean;
  platformOutcomes: PlatformInitOutcome[];
  baseSetOutcomes: BaseSetOutcome[];
  routing: { action: 'created' | 'unchanged' | 'superseded' | 'skipped'; id?: string };
  initReport: { action: 'created' | 'skipped'; id?: string };
}

/** Теги init-отчёта — единственный машинный маркер (D4). */
export const INIT_REPORT_TAGS = ['wolf-init', 'onboarding-v2'] as const;

const PROJECT_ROOT_MARKERS = ['package.json', '.git', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'README.md'];

export function looksLikeProjectRoot(dir: string): boolean {
  return PROJECT_ROOT_MARKERS.some((marker) => existsSync(join(dir, marker)));
}

/** Guard идемпотентности отчёта (§4.1): активный report с тегами wolf-init+onboarding-v2. */
export async function findInitReport(store: MemoryStore): Promise<MemoryObject | null> {
  const reports = await store.list({ type: 'report' });
  const active = reports.filter((o) => o.status === 'active' && INIT_REPORT_TAGS.every((t) => o.tags.includes(t)));
  return active.length > 0 ? active[0] : null;
}

/**
 * `wolf init` v2 (спека §4, onboarding-pipeline-v2): без скана (D1/F8 — полный скан живёт
 * в bootstrap), платформы/модель до рендера, routing-объект до рендера, opencode-конфиг
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

  const memDeps = {
    store: deps.store,
    log: deps.log,
    clock: deps.clock,
    idGen: deps.idGen,
    index: deps.index,
    lock: deps.lock,
    declarations: deps.declarations,
  };

  // §4 п.4/§4.5: routing-объект до рендера — рендер подставляет модели. npx молчит (§4 п.6).
  const routing = deps.npx
    ? ({ action: 'skipped' } as const)
    : await upsertModelRouting(memDeps, input.models, 'wolf-init');

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
      baseSetOutcomes.push(...(await deps.baseSet.render(baseDir, { models: input.models })));
      baseSetOutcomes.push(...(await deps.baseSet.seed(baseDir)));
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
        const r = await adapter.writeConfig(baseDir, deps.mcpCommand);
        platformOutcomes.push({
          platform: adapter.id,
          action: r.action,
          reason: r.reason,
          configFile: r.configFile,
          keys: r.keys,
        });
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
    // неинтерактивный дефолт (§4.4 п.3): opencode — безусловно, по факту рендера набора
    // (D2: детекция не гейтит; F4); прочие платформы — по маркерам, не зависящим от рендера
    for (const adapter of deps.adapters) {
      if (adapter.id === 'opencode' || adapter.detect(baseDir)) {
        const r = await adapter.writeConfig(baseDir, deps.mcpCommand);
        platformOutcomes.push({
          platform: adapter.id,
          action: r.action,
          reason: r.reason,
          configFile: r.configFile,
          keys: r.keys,
        });
      }
    }
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
        type: 'report',
        title: `Init report: ${basename(baseDir)}`,
        body: renderInitReportBody(deps, input, { baseSetOutcomes, platformOutcomes, routingAction: routing.action }),
        createdBy: 'wolf-init',
        tags: [...INIT_REPORT_TAGS],
        importance: 0.7,
      });
      initReport = { action: 'created', id: object.id };
    }
  }

  return { npx: deps.npx, platformOutcomes, baseSetOutcomes, routing, initReport };
}

/** Тело init-отчёта (§4.1): made / found / needs-fix. */
function renderInitReportBody(
  deps: InitProjectDeps,
  input: InitProjectInput,
  outcomes: {
    baseSetOutcomes: BaseSetOutcome[];
    platformOutcomes: PlatformInitOutcome[];
    routingAction: string;
  }
): string {
  const { baseSetOutcomes, platformOutcomes, routingAction } = outcomes;
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
  made.push(
    `- model: primary ${input.models.primary} (source: ${modelSource}) — applied to all agents (worker = primary)`
  );
  made.push(`- model routing object: ${routingAction}`);

  const found: string[] = [];
  const skippedFiles = baseSetOutcomes.filter((o) => o.action === 'skipped' && o.file !== '(base set)');
  if (skippedFiles.length > 0)
    found.push(`- pre-existing files (skipped): ${skippedFiles.map((o) => o.file).join(', ')}`);
  if (agentsMd && agentsMd.action !== 'created') found.push(`- AGENTS.md already existed (${agentsMd.action})`);
  const versions: string[] = [];
  if (deps.wolfVersion) versions.push(`wolf ${deps.wolfVersion}`);
  versions.push(`schema v${CURRENT_SCHEMA_VERSION}`);
  found.push(`- versions: ${versions.join(', ')}`);

  const needsFix: string[] = [];
  for (const o of platformOutcomes) {
    if (o.reason && o.action !== 'removed') needsFix.push(`- ${o.platform}: ${o.reason}`);
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
