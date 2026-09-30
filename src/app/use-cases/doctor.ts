import { join } from 'path';
import { ProjectsRegistry } from '../../adapters/fs/projects-registry.js';
import { readSchemaVersion, CURRENT_SCHEMA_VERSION } from '../../adapters/fs/schema-version.js';
import { PlatformAdapter } from '../../ports/platform-adapter.port.js';

export type DoctorStatus = 'ok' | 'outdated-binary' | 'outdated-project' | 'not-initialized' | 'missing' | 'sandbox';

export interface DoctorEntry {
  path: string;
  status: DoctorStatus;
  schemaVersion: number | null;
  /** Проблемы конфигов платформ (спека §3) и призрак-детекта (спека 2.14 §8.2). */
  issues: string[];
}

export interface DoctorReport {
  binarySchemaVersion: number;
  entries: DoctorEntry[];
  pruned: string[];
}

export interface DoctorDeps {
  registry: Pick<ProjectsRegistry, 'list' | 'remove'>;
  readSchema: (baseDir: string) => Promise<number | null>;
  exists: (p: string) => Promise<boolean>;
  adapters: PlatformAdapter[];
  /** cwd для призрак-детекта (§8.2): незарегистрированный путь тоже проверяется. */
  cwd?: string;
  /** Классификация песочниц (§8.2): записи под os.tmpdir() — чистим тем же механизмом, что missing. */
  isSandbox?: (p: string) => boolean;
  /** Чтение файла для маркера onboarding; null — файла нет. */
  readFile?: (p: string) => Promise<string | null>;
}

/** Маркер onboarding-блока, который wolf init/sync штампует в AGENTS.md/CLAUDE.md. */
const ONBOARDING_MARKER = '<!-- wolf:onboarding';

function classify(v: number | null): { status: DoctorStatus; schemaVersion: number | null } {
  if (v === null) return { status: 'not-initialized', schemaVersion: null };
  return {
    status: v > CURRENT_SCHEMA_VERSION ? 'outdated-binary' : v < CURRENT_SCHEMA_VERSION ? 'outdated-project' : 'ok',
    schemaVersion: v,
  };
}

/**
 * Призрак-детект (§8.2): маркер onboarding в AGENTS.md/CLAUDE.md против наличия
 * `.wolf/memory/`. Продолжение существующих issues-строк, нового статуса нет.
 */
async function ghostIssues(deps: DoctorDeps, path: string): Promise<string[]> {
  const exists = deps.exists;
  const readFile =
    deps.readFile ??
    (async () => {
      return null;
    });
  const memory = await exists(join(path, '.wolf', 'memory'));
  const agentsMd = await readFile(join(path, 'AGENTS.md'));
  const claudeMd = await readFile(join(path, 'CLAUDE.md'));
  const marker = (agentsMd ?? '').includes(ONBOARDING_MARKER) || (claudeMd ?? '').includes(ONBOARDING_MARKER);
  if (marker && !memory) return ['инструктирует wolf, памяти нет — wolf init'];
  if (memory && !marker) return ['память есть, агент не подключён — wolf sync'];
  return [];
}

/**
 * `wolf doctor` (спека §3): по реестру проектов — версия бинаря vs схема каждого проекта,
 * валидность конфигов платформ (wolf-запись на месте?); мёртвые записи чистятся;
 * песочницы под os.tmpdir() — чистятся с пометкой sandbox (спека 2.14 §8.2);
 * призрак-детект для cwd и каждого зарегистрированного пути.
 */
export async function runDoctor(deps: DoctorDeps): Promise<DoctorReport> {
  const isSandbox = deps.isSandbox ?? (() => false);
  const entries: DoctorEntry[] = [];
  const pruned: string[] = [];
  for (const proj of await deps.registry.list()) {
    if (isSandbox(proj.path)) {
      await deps.registry.remove(proj.path);
      pruned.push(proj.path);
      entries.push({ path: proj.path, status: 'sandbox', schemaVersion: null, issues: [] });
      continue;
    }
    if (!(await deps.exists(proj.path))) {
      await deps.registry.remove(proj.path);
      pruned.push(proj.path);
      entries.push({ path: proj.path, status: 'missing', schemaVersion: null, issues: [] });
      continue;
    }
    const { status, schemaVersion } = classify(await deps.readSchema(proj.path));
    // семантика как в guard (schema-guard.ts): null = проект НЕ инициализирован —
    // ленивой миграции не будет, нужна команда init; легаси-версия (1) = миграция
    const issues: string[] = [];
    if (status === 'ok') {
      for (const adapter of deps.adapters) {
        if (!adapter.detect(proj.path)) continue;
        const cfg = await adapter.readConfig(proj.path).catch(() => null);
        const mcp = cfg && typeof cfg === 'object' ? ((cfg.mcp ?? cfg.mcpServers) as Record<string, unknown>) : null;
        if (!mcp || mcp.wolf === undefined) {
          issues.push(`${adapter.id}: wolf entry missing — run wolf init`);
        }
      }
    }
    issues.push(...(await ghostIssues(deps, proj.path)));
    entries.push({ path: proj.path, status, schemaVersion, issues });
  }
  // призрак-детект cwd (§8.2): незарегистрированный cwd проверяется тоже; запись
  // добавляем только при наличии issue — чистый cwd не шумит в отчёте
  const cwd = deps.cwd;
  if (cwd && !entries.some((e) => e.path === cwd) && (await deps.exists(cwd))) {
    const issues = await ghostIssues(deps, cwd);
    if (issues.length > 0) {
      const { status, schemaVersion } = classify(await deps.readSchema(cwd));
      entries.push({ path: cwd, status, schemaVersion, issues });
    }
  }
  return { binarySchemaVersion: CURRENT_SCHEMA_VERSION, entries, pruned };
}
