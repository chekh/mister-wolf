import { StepDefinition } from './workflow.js';
import { StepResult } from './state.js';

export interface ExecutionContext {
  case_id: string;
  workflow_id: string;
  variables: Record<string, unknown>;
  gates?: Record<string, import('./state.js').GateState>;
  config: unknown;
}

export interface StepRunner {
  type: string;
  run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult>;
}
