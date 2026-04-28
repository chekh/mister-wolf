import { StepDefinition } from './workflow.js';
import { GateState, StepResult } from './state.js';

export interface ExecutionContext {
  case_id: string;
  workflow_id: string;
  variables: Record<string, unknown>;
  gates?: Record<string, GateState>;
  config: unknown;
  timeoutMs?: number;
}

export interface StepRunner {
  type: string;
  run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult>;
}
