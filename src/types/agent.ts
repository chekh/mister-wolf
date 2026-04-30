import { z } from 'zod';

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  model_route: z.string(),
  tools: z.array(z.string()).default([]),
  system_prompt: z.string().optional(),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const ModelRouteSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  purpose: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  execution_mode: z.enum(['stub', 'invoke']).optional(),
  system_prompt: z.string().optional(),
  streaming: z.boolean().optional(),
});

export type ModelRoute = z.infer<typeof ModelRouteSchema>;

export const AgentInvocationPlanSchema = z.object({
  type: z.literal('agent_invocation_plan'),
  agent_id: z.string(),
  agent_name: z.string(),
  model_route: z.string(),
  provider: z.string(),
  model: z.string(),
  purpose: z.string().optional(),
  max_tokens: z.number().optional(),
  capabilities: z.array(z.string()),
  tools: z.array(z.string()),
  task: z.string(),
  context_bundle: z.string().optional(),
});

export type AgentInvocationPlan = z.infer<typeof AgentInvocationPlanSchema>;
