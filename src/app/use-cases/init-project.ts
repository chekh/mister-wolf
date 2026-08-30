import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';
import { ProjectInitializer } from '../../ports/project-initializer.port.js';
import { PlatformAdapter, McpCommand } from '../../ports/platform-adapter.port.js';
import { scanProject } from './scan-project.js';
import { writeSchemaVersionIfAbsent, CURRENT_SCHEMA_VERSION } from '../../adapters/fs/schema-version.js';
import { renderConfigYaml } from '../../adapters/fs/config-file.js';
import { configPath } from '../../adapters/fs/project-paths.js';
import { writeFileAtomic } from '../../adapters/fs/markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

/** Минимальный контракт реестра для init (структурно совместим с ProjectsRegistry). */
export interface ProjectRegistry {
  register(path: string, schemaVersion: number): Promise<void>;
}

export interface InitProjectDeps {
  initializer: ProjectInitializer;
  registry: ProjectRegistry;
  adapters: PlatformAdapter[];
  mcpCommand: McpCommand;
  /** true, когда бинарник запущен через npx (try-out: MCP-конфиги не пишем никогда). */
  npx: boolean;
  scanDeps: Parameters<typeof scanProject>[0];
  /** Проставить маркер версии схемы (writeSchemaVersionIfAbsent). */
  markSchemaCurrent: (baseDir: string) => Promise<void>;
}

export interface PlatformInitOutcome {
  platform: string;
  action: 'written' | 'replaced' | 'unchanged' | 'skipped' | 'removed';
  reason?: string;
}

export interface InitProjectResult {
  npx: boolean;
  documentCount: number;
  platformOutcomes: PlatformInitOutcome[];
}

const PROJECT_ROOT_MARKERS = ['package.json', '.git', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'README.md'];

export function looksLikeProjectRoot(dir: string): boolean {
  return PROJECT_ROOT_MARKERS.some((marker) => existsSync(join(dir, marker)));
}

/**
 * `wolf init` (спека §3, уровень 1): идемпотентный, неинтерактивный.
 * Скелет (ensure) → маркер схемы → лёгкий scan (document-ref'ы идемпотентны; глубокое
 * наполнение — отдельная команда `wolf bootstrap`) → платформы → реестр.
 */
export async function initProject(
  deps: InitProjectDeps,
  baseDir: string,
  opts: { platformIds?: string[] } = {}
): Promise<InitProjectResult> {
  if (!looksLikeProjectRoot(baseDir)) {
    throw new UserFacingError(
      'Not a project root (no package.json/.git/pyproject.toml/go.mod/Cargo.toml/README.md found). cd into your project first.'
    );
  }

  await deps.initializer.initialize(baseDir);
  await deps.markSchemaCurrent(baseDir);
  const scan = await scanProject(deps.scanDeps, baseDir);

  const platformOutcomes: PlatformInitOutcome[] = [];
  if (deps.npx) {
    // try-out: память создаём, конфиги — никогда (спека §3, npx-путь)
    platformOutcomes.push({ platform: 'npx', action: 'skipped', reason: 'npx try-out never writes MCP configs' });
  } else if (opts.platformIds !== undefined) {
    // явный список ЗАМЕНЯЕТ набор: wolf-записи платформ вне списка удаляются (спека §3)
    const wanted = new Set(opts.platformIds);
    for (const adapter of deps.adapters) {
      if (wanted.has(adapter.id)) {
        platformOutcomes.push({ platform: adapter.id, action: await adapter.writeConfig(baseDir, deps.mcpCommand) });
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
    // авто-детект: объединение найденных; «платформа не детектирована» — warning + skip
    const detected = deps.adapters.filter((a) => a.detect(baseDir));
    if (detected.length === 0) {
      platformOutcomes.push({
        platform: 'none',
        action: 'skipped',
        reason: 'no platform detected; use --platform opencode|claude',
      });
    } else {
      for (const adapter of detected) {
        platformOutcomes.push({ platform: adapter.id, action: await adapter.writeConfig(baseDir, deps.mcpCommand) });
      }
    }
  }

  await deps.registry.register(baseDir, CURRENT_SCHEMA_VERSION);

  return { npx: deps.npx, documentCount: scan.documents.length, platformOutcomes };
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
