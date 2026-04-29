import { WorkflowDefinition } from '../types/workflow.js';
import { PolicyReport } from '../types/policy.js';
import { PolicyConfig } from '../config/project-config.js';
import { PolicyEngine } from './engine.js';

export class PolicyPreflight {
  private engine = new PolicyEngine();

  evaluate(workflow: WorkflowDefinition, config: PolicyConfig): PolicyReport {
    const decisions = workflow.steps.map((step) =>
      this.engine.evaluate(step, config, workflow.id, 'workflow_preflight')
    );

    const hasDeny = decisions.some((d) => d.decision === 'deny');
    const hasAsk = decisions.some((d) => d.decision === 'ask');

    const overall: PolicyReport['overall'] = hasDeny ? 'deny' : hasAsk ? 'ask' : 'allow';

    return {
      workflow_id: workflow.id,
      overall,
      decisions,
      steps_allowed: decisions.filter((d) => d.decision === 'allow').length,
      steps_ask: decisions.filter((d) => d.decision === 'ask').length,
      steps_denied: decisions.filter((d) => d.decision === 'deny').length,
    };
  }
}
