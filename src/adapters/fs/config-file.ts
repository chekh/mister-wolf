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
  artifact_sources: z.array(z.string()).catch([]),
  memory_types: z
    .object({
      core: z.unknown().optional(),
      project: z.record(z.string(), ProjectTypeDeclSchema).optional().catch({}),
    })
    .optional()
    .catch({}),
  // Ф20/Ф21: классы ошибок + порог паттерна (спека §2.1, §2.2)
  error_class_taxonomy: z.array(z.object({ id: z.string().min(1), match: z.array(z.string()).min(1) })).catch([]),
  learning: z.object({ pattern_threshold: z.number().int().min(1).optional().catch(undefined) }).catch({}),
});

export class ConfigLoadError extends Error {}

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
    projectTypes: Object.entries(mt.project ?? {}).map(([name, d]) => ({
      name: name as MemoryType,
      lifecycle: d.lifecycle as MemoryTypeDeclaration['lifecycle'],
      subdirThread: d.subdir_thread,
      subdirShared: d.subdir_shared,
      fields: d.fields,
    })),
    rawCoreBlock: mt.core ?? null,
    errorClassTaxonomy: cfg.error_class_taxonomy,
    learning: { patternThreshold: cfg.learning?.pattern_threshold },
  };
}

export function loadWolfConfigSync(baseDir: string): WolfConfig | null {
  let raw: string;
  try {
    raw = fsSync.readFileSync(configPath(baseDir), 'utf-8');
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
    projectTypes: Object.entries(mt.project ?? {}).map(([name, d]) => ({
      name: name as MemoryType,
      lifecycle: d.lifecycle as MemoryTypeDeclaration['lifecycle'],
      subdirThread: d.subdir_thread,
      subdirShared: d.subdir_shared,
      fields: d.fields,
    })),
    rawCoreBlock: mt.core ?? null,
    errorClassTaxonomy: cfg.error_class_taxonomy,
    learning: { patternThreshold: cfg.learning?.pattern_threshold },
  };
}

/** Детерминированный YAML полного конфига: генерируемый core + сохранённые artifact_sources/project. */
export function renderConfigYaml(existing: WolfConfig | null): string {
  const doc = {
    '# comment': 'memory_types.core генерируется `wolf taxonomy sync`; ручные правки будут перезаписаны',
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
