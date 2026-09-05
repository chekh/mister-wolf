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

export const MemoryTransitionInputSchema = z.object({
  id: z.string(),
  status: z.string(),
});

export const MemoryCreateThreadInputSchema = z.object({
  title: z.string(),
  goal: z.string(),
  currentState: z.string().optional(),
  nextSteps: z.array(z.string()).optional(),
  createdBy: z.string(),
});

export const MemoryCreateInfoRequestInputSchema = z.object({
  title: z.string(),
  thread: z.string(),
  question: z.string(),
  detourReason: z.string(),
  neededFor: z.array(z.string()).optional(),
  expectedAnswer: z.array(z.string()),
  preliminaryAnswer: z.string().optional(),
  createdBy: z.string(),
});

export const MemoryCreateArticleInputSchema = z.object({
  title: z.string(),
  thread: z.string(),
  summary: z.string(),
  body: z.string(),
  answers: z.array(z.string()).optional(),
  supports: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional(),
  createdBy: z.string(),
});

export const MemoryCreateDecisionInputSchema = z.object({
  title: z.string(),
  body: z.string(),
  thread: z.string().optional(),
  basedOn: z.array(z.string()).optional(),
  createdBy: z.string(),
});

export const MemoryCreateBlockerInputSchema = z.object({
  title: z.string(),
  impact: z.string(),
  workaround: z.string().optional(),
  thread: z.string().optional(),
  createdBy: z.string(),
});

export const MemoryResolveBlockerInputSchema = z.object({
  id: z.string(),
  resolvedBy: z.string().optional(),
});

export const MemoryCreateRuleInputSchema = z.object({
  title: z.string(),
  body: z.string(),
  scope: z.enum(['project', 'global']),
  appliesTo: z.array(z.string()).optional(),
  trigger: z.string().optional(),
  createdBy: z.string(),
});

export const InsightsInputSchema = z.object({
  topic: z.string().optional(),
  type: z.enum(['patterns', 'technical_debt', 'decisions', 'lessons', 'activity']).optional(),
});

export const ThinkingStartInputSchema = z.object({
  goal: z.string(),
  thread: z.string().optional(),
  createdBy: z.string(),
});

export const ThinkingAddInputSchema = z.object({
  sequenceId: z.string(),
  type: z.enum(['hypothesis', 'reasoning', 'evidence', 'concern']),
  text: z.string(),
});

export const ThinkingConcludeInputSchema = z.object({
  sequenceId: z.string(),
  title: z.string(),
  body: z.string(),
  createdBy: z.string(),
});

export const ThinkingAbandonInputSchema = z.object({
  sequenceId: z.string(),
});

export const AnalyticsInputSchema = z.object({
  view: z
    .enum([
      'memory',
      'tools',
      'rules',
      'weeklyActivity',
      'agents',
      'steward',
      'outliers',
      'readiness',
      'councils',
      'coordination',
      'campaign',
      'all',
    ])
    .optional(),
  class: z.enum(['new', 'sleeper', 'workhorse', 'dead']).optional(),
  type: z.string().optional(),
  origin: z.enum(['script', 'native']).optional(),
  agent: z.string().optional(),
  top: z.number().int().min(1).optional(),
  weeks: z.number().int().min(1).optional(),
  silent: z.boolean().optional(),
});
