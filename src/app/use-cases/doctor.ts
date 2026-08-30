import { ProjectsRegistry } from '../../adapters/fs/projects-registry.js';
import { readSchemaVersion, CURRENT_SCHEMA_VERSION } from '../../adapters/fs/schema-version.js';
import { PlatformAdapter } from '../../ports/platform-adapter.port.js';

export type DoctorStatus = 'ok' | 'outdated-binary' | 'outdated-project' | 'not-initialized' | 'missing';

export interface DoctorEntry {
  path: string;
  status: DoctorStatus;
  schemaVersion: number | null;
  /** Проблемы конфигов платформ (спека §3: «валидность конфигов платформ»). */
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
}

/**
 * `wolf doctor` (спека §3): по реестру проектов — версия бинаря vs схема каждого проекта,
 * валидность конфигов платформ (wolf-запись на месте?); мёртвые записи чистятся.
 */
export async function runDoctor(deps: DoctorDeps): Promise<DoctorReport> {
  const entries: DoctorEntry[] = [];
  const pruned: string[] = [];
  for (const proj of await deps.registry.list()) {
    if (!(await deps.exists(proj.path))) {
      await deps.registry.remove(proj.path);
      pruned.push(proj.path);
      entries.push({ path: proj.path, status: 'missing', schemaVersion: null, issues: [] });
      continue;
    }
    const v = await deps.readSchema(proj.path);
    // семантика как в guard (schema-guard.ts): null = проект НЕ инициализирован —
    // ленивой миграции не будет, нужна команда init; легаси-версия (1) = миграция
    let status: DoctorStatus;
    let schemaVersion: number | null;
    if (v === null) {
      status = 'not-initialized';
      schemaVersion = null;
    } else {
      schemaVersion = v;
      status = v > CURRENT_SCHEMA_VERSION ? 'outdated-binary' : v < CURRENT_SCHEMA_VERSION ? 'outdated-project' : 'ok';
    }
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
    entries.push({ path: proj.path, status, schemaVersion, issues });
  }
  return { binarySchemaVersion: CURRENT_SCHEMA_VERSION, entries, pruned };
}
