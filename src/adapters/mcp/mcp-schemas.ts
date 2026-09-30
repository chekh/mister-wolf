import { z } from 'zod';
import { perTypeExtraFields } from '../../domain/type-schema-builder.js';

export const EmptyInputSchema = z.object({});

export const MemoryGetInputSchema = z.object({
  id: z.string(),
});

export const MemoryListInputSchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  stale: z.boolean().optional(),
  memoryClass: z.string().optional(),
  truthRole: z.string().optional(),
  lifetime: z.string().optional(),
});

export const MemorySearchInputSchema = z.object({
  query: z.string(),
  type: z.string().optional(),
  status: z.string().optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  memoryClass: z.string().optional(),
  truthRole: z.string().optional(),
  lifetime: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minImportance: z.number().optional(),
  maxImportance: z.number().optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  file_path: z.string().optional(),
  limit: z.number().optional(),
  includeSuperseded: z.boolean().optional(),
});

// Per-type поля таксономии (scope, executor, …) — из perTypeExtraFields(),
// не вручную: неизвестные ключи отсекает .strict(), известные не стрипаются.
export const MemoryAddInputSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    body: z.string().optional(),
    tags: z.array(z.string()).optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
    importance: z.number().optional(),
    createdBy: z.string(),
    ...perTypeExtraFields(),
  })
  .strict();

/** Известные ключи тула add: базовая форма + per-type поля таксономии. */
const ADD_KNOWN_KEYS = new Set([
  'type',
  'title',
  'body',
  'tags',
  'confidence',
  'importance',
  'createdBy',
  ...Object.keys(perTypeExtraFields()),
]);

/**
 * T011: camelCase-ключи агента → snake_case per-type поля (expectedAnswer →
 * expected_answer, detourReason → detour_reason). Ренейм только если snake-версия
 * входит в известное множество (createdBy — часть контракта, не переименовывается);
 * неизвестные ключи не трогаются — их отсечёт .strict() с внятной ошибкой.
 * Вызывается обёрткой схемы в mcp-tools (register), НЕ внутри zod-схемы:
 * z.preprocess ломает JSON-Schema-генерацию для tools/list.
 */
export function normalizeAddInputKeys(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const snake = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    out[ADD_KNOWN_KEYS.has(key) || !ADD_KNOWN_KEYS.has(snake) ? key : snake] = value;
  }
  return out;
}

export const MemoryTransitionInputSchema = z.object({
  id: z.string(),
  status: z.string(),
});
