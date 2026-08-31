import { CORE_TAXONOMY, MemoryType, MemoryTypeDeclaration, MemoryStatus } from './memory-types.js';
import { ALLOWED_TRANSITIONS } from './governance.js';

export interface WolfConfig {
  artifact_sources: string[];
  /** Маркер версии схемы проекта (спека §3, уровень 2); отсутствует = легаси. */
  schemaVersion?: number;
  projectTypes: MemoryTypeDeclaration[];
  /** Сырой core-блок как он лежит в файле (для drift-детекта); null — файла/блока нет */
  rawCoreBlock: unknown;
  /** Ф20: проектная таксономия классов ошибок — матчится раньше дефолтной таблицы (§2.1) */
  errorClassTaxonomy?: { id: string; match: string[] }[];
  /** Ф21: порог паттерна N≥3 — параметр процесса (§2.2, §16); Ф26: TTL-override по типам (сессии);
   * E1.2: пороги effectiveness-панели (проценты, undefined-поля отбрасываются) */
  learning?: {
    patternThreshold?: number;
    decayTtl?: Record<string, number>;
    effectivenessThresholds?: { noiseOk?: number; noiseWarn?: number; silentOk?: number };
  };
}

export class ProjectTypeConflictError extends Error {}

export function mergeTaxonomy(config: WolfConfig | null): {
  types: Map<MemoryType, MemoryTypeDeclaration>;
} {
  const types = new Map<MemoryType, MemoryTypeDeclaration>();
  for (const d of CORE_TAXONOMY) types.set(d.name, d);
  if (config) {
    for (const p of config.projectTypes) {
      if (types.has(p.name)) {
        throw new ProjectTypeConflictError(
          `Project type "${p.name}" conflicts with core type. Core types cannot be overridden.`
        );
      }
      for (const s of p.lifecycle) {
        if (!(s in ALLOWED_TRANSITIONS)) {
          throw new ProjectTypeConflictError(
            `Project type "${p.name}" uses unknown status "${s}". Valid: ${Object.keys(ALLOWED_TRANSITIONS).join(', ')}`
          );
        }
      }
      types.set(p.name, p);
    }
  }
  return { types };
}

/** Эффективные переходы для типа: глобальная матрица, обрезанная lifecycle'ом типа. */
export function transitionsFor(decl: MemoryTypeDeclaration): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const from of decl.lifecycle) {
    out[from] = (ALLOWED_TRANSITIONS[from] ?? []).filter((to) => decl.lifecycle.includes(to as MemoryStatus));
  }
  return out;
}

/** Генерирует core-блок конфига из каноничного CORE_TAXONOMY. */
export function generateCoreConfigBlock(): Record<string, unknown> {
  const block: Record<string, unknown> = {};
  for (const d of CORE_TAXONOMY) {
    const entry: Record<string, unknown> = {
      lifecycle: [...d.lifecycle],
      subdir_thread: d.subdirThread,
      subdir_shared: d.subdirShared,
    };
    if (d.fields) entry.fields = d.fields;
    if (d.deprecated) entry.deprecated = true;
    block[d.name] = entry;
  }
  return block;
}
