import { ToolDefinition } from '../tool/types.js';
export { ToolDefinition };

export interface ModelInvocationRequest {
  provider: string;
  model: string;
  input: string;
  system_prompt?: string;
  context?: string;
  max_tokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  metadata?: Record<string, unknown>;
}

export interface ModelToolCall {
  tool_id: string;
  input: unknown;
}

export interface ModelInvocationResult {
  output: string;
  provider: string;
  model: string;
  tool_call?: ModelToolCall;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  raw?: unknown;
}

export interface ModelProvider {
  id: string;
  invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult>;
}

export interface AgentModelResult {
  type: 'agent_model_result';
  agent_id: string;
  agent_name: string;
  model_route: string;
  provider: string;
  model: string;
  output: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}
