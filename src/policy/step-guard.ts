import { StepDefinition } from '../types/workflow.js';
import { PolicyDecision } from '../types/policy.js';
import { PolicyConfig } from '../config/project-config.js';
import { PolicyEngine } from './engine.js';

export class PolicyStepGuard {
  private engine = new PolicyEngine();

  evaluate(step: StepDefinition, config: PolicyConfig, workflowId: string): PolicyDecision {
    return this.engine.evaluate(step, config, workflowId, 'step_runtime');
  }
}
