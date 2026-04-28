import { z } from 'zod';

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
