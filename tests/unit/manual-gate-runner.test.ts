import { describe, it, expect } from 'vitest';
import { ManualGateRunner } from '../../src/workflow/runners/manual-gate.js';
import { StepDefinition } from '../../src/types/workflow.js';

describe('ManualGateRunner', () => {
  it('should return gated when gate is pending', async () => {
    const runner = new ManualGateRunner();
    const step: StepDefinition = {
      id: 'gate1',
      type: 'builtin',
      runner: 'manual_gate',
      input: { message: 'Approve?' },
    };
    const result = await runner.run(step, {
      case_id: 'c1',
      workflow_id: 'w1',
      variables: {},
      gates: {},
      config: {},
    });
    expect(result.status).toBe('gated');
  });

  it('should return success when gate is approved', async () => {
    const runner = new ManualGateRunner();
    const step: StepDefinition = {
      id: 'gate1',
      type: 'builtin',
      runner: 'manual_gate',
      input: { message: 'Approve?' },
    };
    const result = await runner.run(step, {
      case_id: 'c1',
      workflow_id: 'w1',
      variables: {},
      gates: {
        gate_c1_gate1: {
          step_id: 'gate1',
          status: 'approved',
          requested_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
        },
      },
      config: {},
    });
    expect(result.status).toBe('success');
  });

  it('should return failure when gate is rejected', async () => {
    const runner = new ManualGateRunner();
    const step: StepDefinition = {
      id: 'gate1',
      type: 'builtin',
      runner: 'manual_gate',
      input: { message: 'Approve?' },
    };
    const result = await runner.run(step, {
      case_id: 'c1',
      workflow_id: 'w1',
      variables: {},
      gates: {
        gate_c1_gate1: {
          step_id: 'gate1',
          status: 'rejected',
          requested_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
        },
      },
      config: {},
    });
    expect(result.status).toBe('failure');
  });
});
