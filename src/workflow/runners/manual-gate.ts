import { StepRunner, ExecutionContext } from '../../types/runner.js';
import { StepDefinition } from '../../types/workflow.js';
import { StepResult } from '../../types/state.js';

export class ManualGateRunner implements StepRunner {
  type = 'manual_gate';

  async run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult> {
    const gateId = `gate_${ctx.case_id}_${step.id}`;
    const gate = ctx.gates?.[gateId];

    if (gate?.status === 'approved') {
      return { status: 'success', output: step.input?.message };
    }

    if (gate?.status === 'rejected') {
      return {
        status: 'failure',
        error: {
          type: 'GateRejected',
          message: 'Gate rejected by user',
          retryable: false,
        },
      };
    }

    return {
      status: 'gated',
      output: (step.input?.message as string) || 'Approval required',
    };
  }
}
