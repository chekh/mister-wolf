import { z } from 'zod';

export const RetryPolicySchema = z.object({
  max_attempts: z.number().int().min(1).max(10).default(3),
  delay: z.string().default('1s'),
  backoff: z.enum(['fixed', 'linear']).default('fixed'),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export const ConditionSchema = z.object({
  var: z.string(),
  exists: z.boolean().optional(),
  equals: z.string().optional(),
  not_equals: z.string().optional(),
  contains: z.string().optional(),
}).refine((data) => {
  const operators = ['exists', 'equals', 'not_equals', 'contains'];
  const provided = operators.filter((op) => data[op as keyof typeof data] !== undefined);
  return provided.length === 1;
}, { message: 'Condition must have exactly one operator' });

export type Condition = z.infer<typeof ConditionSchema>;

export const ArtifactSchema = z.object({
  path: z.string().refine(
    (path) => !path.startsWith('/') && !path.includes('..'),
    { message: 'Artifact path must be relative and not contain parent traversal' }
  ),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

export const StepDefinitionSchema = z.object({
  id: z.string(),
  type: z.literal('builtin'),
  runner: z.enum(['echo', 'shell', 'manual_gate']),
  name: z.string().optional(),
  description: z.string().optional(),
  input: z.record(z.unknown()).optional(),
  output: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  timeout: z.string().optional(),
  retry: RetryPolicySchema.optional(),
  when: ConditionSchema.optional(),
  artifact: ArtifactSchema.optional(),
});

export type StepDefinition = z.infer<typeof StepDefinitionSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  steps: z.array(StepDefinitionSchema).min(1),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
