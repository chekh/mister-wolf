import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { FieldSpec, MemoryType, MemoryTypeDeclaration } from '../../domain/memory-types.js';
import type { WolfConfig } from '../../domain/taxonomy.js';
import { generateCoreConfigBlock } from '../../domain/taxonomy.js';
import { configPath } from './project-paths.js';

const FieldSpecSchema: z.ZodType<FieldSpec> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('string'), required: z.literal(true), min: z.number().int().optional() }),
  z.object({ kind: z.literal('string'), optional: z.literal(true) }),
  z.object({ kind: z.literal('string'), default: z.string() }),
  z.object({ kind: z.literal('string[]'), required: z.literal(true), minItems: z.number().int().optional() }),
  z.object({ kind: z.literal('string[]'), default: z.array(z.string()).optional() }),
  z.object({ kind: z.literal('int'), default: z.number().int().optional() }),
  z.object({ kind: z.literal('enum'), values: z.array(z.string()).min(1) }),
]);

const ProjectTypeDeclSchema = z.object({
  lifecycle: z.array(z.string()).min(1),
  subdir_thread: z.string().nullable().catch(null),
  subdir_shared: z.string().nullable().catch(null),
  fields: z.record(z.string(), FieldSpecSchema).catch({}),
});

const ConfigFileSchema = z.object({
  schema_version: z.number().int().optional().catch(undefined),
  artifact_sources: z.array(z.string()).catch([]),
  memory_types: z
    .object({
      core: z.unknown().optional(),
      project: z.record(z.string(), ProjectTypeDeclSchema).optional().catch({}),
    })
    .optional()
    .catch({}),
  // Ф20/Ф21: классы ошибок + порог паттерна (спека §2.1, §2.2); Ф26: decay TTL-override
  error_class_taxonomy: z.array(z.object({ id: z.string().min(1), match: z.array(z.string()).min(1) })).catch([]),
  learning: z
    .object({
      pattern_threshold: z.number().int().min(1).optional().catch(undefined),
      // Ф26: TTL по типам в СЕССИЯХ (ключ — тип, значение — сессий без срабатывания)
      decay_ttl: z.record(z.string(), z.number().int().min(1)).optional().catch(undefined),
      // E1.2: пороги effectiveness-панели (проценты); битый блок → дефолты
      effectiveness_thresholds: z
        .object({
          noise_ok: z.number().optional(),
          noise_warn: z.number().optional(),
          silent_ok: z.number().optional(),
        })
        .optional()
        .catch(undefined),
    })
    .catch({}),
  // M3: $-прайсы ($/Mtok) и пороги lifecycle-аналитики (D7); битые блоки отбрасываются
  pricing: z
    .record(z.string(), z.object({ input: z.number(), output: z.number(), cache_read: z.number() }))
    .optional()
    .catch(undefined),
  analytics: z
    .object({
      thresholds: z
        .object({
          new_days: z.number().int().min(1).optional(),
          workhorse_uses: z.number().int().min(1).optional(),
        })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
  // P109 (волна 2.12 4.D): мягкий лимит инъекций сессии; отсутствующие/битые
  // ключи = дефолты (§5.iii: старый волк strip'ает блок, новый — дефолты на старом конфиге)
  delivery: z
    .object({
      context_budget_tokens: z.number().int().positive().catch(200_000),
      context_warning_pct: z.number().min(0).catch(20),
    })
    .optional()
    .catch(undefined),
  // 2.13 §5.3: словарь фасетов «характер записи» (7–10 значений). БЕЗ catch:
  // битый блок — громкая ошибка конфига; отсутствие ключа — старые конфиги
  // читаются без ошибок (инвариант iii).
  facets: z
    .object({
      character: z.array(z.string().min(1)).min(7).max(10),
    })
    .optional(),
});

export class ConfigLoadError extends Error {}

/** E1.2: пороги effectiveness → camelCase, undefined-поля отбрасываются. */
function mapEffectivenessThresholds(t?: {
  noise_ok?: number;
  noise_warn?: number;
  silent_ok?: number;
}): { noiseOk?: number; noiseWarn?: number; silentOk?: number } | undefined {
  if (t === undefined) return undefined;
  const out: { noiseOk?: number; noiseWarn?: number; silentOk?: number } = {};
  if (t.noise_ok !== undefined) out.noiseOk = t.noise_ok;
  if (t.noise_warn !== undefined) out.noiseWarn = t.noise_warn;
  if (t.silent_ok !== undefined) out.silentOk = t.silent_ok;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** M3: analytics.thresholds → camelCase, undefined-поля отбрасываются. */
function mapAnalyticsThresholds(t?: {
  new_days?: number;
  workhorse_uses?: number;
}): { newDays?: number; workhorseUses?: number } | undefined {
  if (t === undefined) return undefined;
  const out: { newDays?: number; workhorseUses?: number } = {};
  if (t.new_days !== undefined) out.newDays = t.new_days;
  if (t.workhorse_uses !== undefined) out.workhorseUses = t.workhorse_uses;
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function loadWolfConfig(baseDir: string): Promise<WolfConfig | null> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath(baseDir), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new ConfigLoadError(`Invalid YAML in ${configPath(baseDir)}: ${err instanceof Error ? err.message : err}`);
  }
  const cfg = ConfigFileSchema.parse(parsed);
  const mt = cfg.memory_types ?? {};
  return {
    artifact_sources: cfg.artifact_sources,
    schemaVersion: cfg.schema_version,
    projectTypes: Object.entries(mt.project ?? {}).map(([name, d]) => ({
      name: name as MemoryType,
      lifecycle: d.lifecycle as MemoryTypeDeclaration['lifecycle'],
      subdirThread: d.subdir_thread,
      subdirShared: d.subdir_shared,
      fields: d.fields,
    })),
    rawCoreBlock: mt.core ?? null,
    errorClassTaxonomy: cfg.error_class_taxonomy,
    pricing: cfg.pricing,
    analytics:
      cfg.analytics === undefined ? undefined : { thresholds: mapAnalyticsThresholds(cfg.analytics.thresholds) },
    learning: {
      patternThreshold: cfg.learning?.pattern_threshold,
      decayTtl: cfg.learning?.decay_ttl,
      effectivenessThresholds: mapEffectivenessThresholds(cfg.learning?.effectiveness_thresholds),
    },
    facets: cfg.facets,
  };
}

/**
 * P104 (A6): процессная мемоизация sync-чтения по mtime+size — sync-yaml-parse уходит
 * с горячего пути телеметрии (паттерн version.ts:5-16; конфиг живёт дольше процесса,
 * поэтому ключ по stat, а не «одно чтение навсегда»). ENOENT кэшируется как stat
 * «файла нет»: появление/изменение файла меняет stat → перечитывается. Ошибки парса
 * (ConfigLoadError) НЕ кэшируются — бросаются как раньше.
 */
const syncConfigCache = new Map<string, { stat: string; value: WolfConfig | null }>();

export function loadWolfConfigSync(baseDir: string): WolfConfig | null {
  const path = configPath(baseDir);
  let stat: string;
  try {
    const st = fsSync.statSync(path);
    stat = `${st.mtimeMs}:${st.size}`;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') stat = 'ENOENT';
    else throw err;
  }
  const hit = syncConfigCache.get(path);
  if (hit !== undefined && hit.stat === stat) return hit.value;
  // stat уже источник истины о существовании: ENOENT → null без повторного чтения
  const value = stat === 'ENOENT' ? null : readWolfConfigSync(path);
  syncConfigCache.set(path, { stat, value });
  return value;
}

/** P109 (4.D): настройки мягкого лимита инъекций — delivery.context_budget_tokens
 * (дефолт 200 000 токенов) и delivery.context_warning_pct (дефолт 20; 0 = выключить
 * предупреждение). Отсутствующий/битый конфиг → дефолты; один вызов на CLI-процесс —
 * процессной мемоизации не требует (в отличие от loadWolfConfigSync для long-lived MCP). */
export function loadDeliverySettings(baseDir: string): {
  contextBudgetTokens: number;
  contextWarningPct: number;
} {
  try {
    const raw = fsSync.readFileSync(configPath(baseDir), 'utf-8');
    const cfg = ConfigFileSchema.parse(yaml.load(raw));
    return {
      contextBudgetTokens: cfg.delivery?.context_budget_tokens ?? 200_000,
      contextWarningPct: cfg.delivery?.context_warning_pct ?? 20,
    };
  } catch {
    return { contextBudgetTokens: 200_000, contextWarningPct: 20 };
  }
}

function readWolfConfigSync(path: string): WolfConfig | null {
  let raw: string;
  try {
    raw = fsSync.readFileSync(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new ConfigLoadError(`Invalid YAML in ${path}: ${err instanceof Error ? err.message : err}`);
  }
  const cfg = ConfigFileSchema.parse(parsed);
  const mt = cfg.memory_types ?? {};
  return {
    artifact_sources: cfg.artifact_sources,
    schemaVersion: cfg.schema_version,
    projectTypes: Object.entries(mt.project ?? {}).map(([name, d]) => ({
      name: name as MemoryType,
      lifecycle: d.lifecycle as MemoryTypeDeclaration['lifecycle'],
      subdirThread: d.subdir_thread,
      subdirShared: d.subdir_shared,
      fields: d.fields,
    })),
    rawCoreBlock: mt.core ?? null,
    errorClassTaxonomy: cfg.error_class_taxonomy,
    pricing: cfg.pricing,
    analytics:
      cfg.analytics === undefined ? undefined : { thresholds: mapAnalyticsThresholds(cfg.analytics.thresholds) },
    learning: {
      patternThreshold: cfg.learning?.pattern_threshold,
      decayTtl: cfg.learning?.decay_ttl,
      effectivenessThresholds: mapEffectivenessThresholds(cfg.learning?.effectiveness_thresholds),
    },
    facets: cfg.facets,
  };
}

/** Детерминированный YAML полного конфига: генерируемый core + сохранённые artifact_sources/project. */
export function renderConfigYaml(existing: WolfConfig | null): string {
  const doc = {
    '# comment': 'memory_types.core is generated by `wolf taxonomy sync`; manual edits will be overwritten',
    schema_version: existing?.schemaVersion,
    artifact_sources: existing?.artifact_sources ?? [],
    // сохраняем при regenerate (иначе taxonomy sync стёр бы настройки контура Ф20/Ф21)
    error_class_taxonomy: existing?.errorClassTaxonomy ?? [],
    learning:
      existing?.learning?.patternThreshold !== undefined
        ? { pattern_threshold: existing.learning.patternThreshold }
        : {},
    memory_types: {
      core: generateCoreConfigBlock(),
      project: Object.fromEntries(
        (existing?.projectTypes ?? []).map((p) => [
          p.name,
          {
            lifecycle: p.lifecycle,
            subdir_thread: p.subdirThread,
            subdir_shared: p.subdirShared,
            fields: p.fields ?? {},
          },
        ])
      ),
    },
  };
  return yaml.dump(doc, { sortKeys: false });
}
