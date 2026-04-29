import { PolicyDecision } from '../types/policy.js';
import { GateStore } from '../state/gate-store.js';

export class PolicyGateAdapter {
  constructor(private gateStore: GateStore) {}

  createPolicyGate(caseId: string, stepId: string, decision: PolicyDecision, resolvedInput: unknown): string {
    const gateId = this.gateStore.createGate(caseId, stepId, 'policy_approval', {
      decision,
      workflow_id: decision.subject.workflow_id,
      step_id: stepId,
      runner: decision.subject.runner,
      resolved_input: resolvedInput,
    });
    return gateId;
  }

  isPolicyGateApproved(caseId: string, stepId: string): boolean {
    const gateId = `gate_${caseId}_${stepId}`;
    const found = this.gateStore.getGate(gateId);
    return found?.gate.status === 'approved' && found?.gate.type === 'policy_approval';
  }
}
