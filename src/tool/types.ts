import { RiskLevelSchema } from '../types/policy.js';
import { z } from 'zod';

export const ToolDefinitionSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  executor: z.string(),
  risk: RiskLevelSchema,
  input_schema: z.unknown().optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export interface ToolExecutionInput {
  tool_id: string;
  input: unknown;
}

export interface ToolExecutionResult {
  tool_id: string;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  case_id: string;
  workflow_id: string;
  step_id: string;
  project_root: string;
  agent_id: string;
}

export interface ToolExecutor {
  id: string;
  execute(input: ToolExecutionInput, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export interface ModelToolCall {
  tool_id: string;
  input: unknown;
}
