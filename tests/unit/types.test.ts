import { describe, it, expect } from 'vitest';
import { WorkflowDefinitionSchema, StepDefinitionSchema } from '../../src/types/workflow.js';
import { CaseStatus } from '../../src/types/case.js';
import { RuntimeEventSchema } from '../../src/types/events.js';
import { ExecutionStateSchema } from '../../src/types/state.js';

describe('types', () => {
  it('should export WorkflowDefinitionSchema', () => {
    expect(WorkflowDefinitionSchema).toBeDefined();
  });

  it('should export CaseStatus enum values', () => {
    expect(CaseStatus.CREATED).toBe('created');
    expect(CaseStatus.RUNNING).toBe('running');
    expect(CaseStatus.PAUSED).toBe('paused');
    expect(CaseStatus.COMPLETED).toBe('completed');
    expect(CaseStatus.FAILED).toBe('failed');
    expect(CaseStatus.CANCELLED).toBe('cancelled');
  });

  it('should export RuntimeEventSchema', () => {
    expect(RuntimeEventSchema).toBeDefined();
  });

  it('should export ExecutionStateSchema', () => {
    expect(ExecutionStateSchema).toBeDefined();
  });

  it('should validate a correct workflow with WorkflowDefinitionSchema', () => {
    const validWorkflow = {
      id: 'wf-1',
      version: '1.0.0',
      steps: [
        { id: 'step-1', type: 'builtin' as const, runner: 'echo' as const },
      ],
    };
    const result = WorkflowDefinitionSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
  });

  it('should reject a workflow with empty steps', () => {
    const invalidWorkflow = {
      id: 'wf-1',
      version: '1.0.0',
      steps: [],
    };
    const result = WorkflowDefinitionSchema.safeParse(invalidWorkflow);
    expect(result.success).toBe(false);
  });

  it('should validate a correct step with StepDefinitionSchema', () => {
    const validStep = {
      id: 'step-1',
      type: 'builtin' as const,
      runner: 'echo' as const,
      name: 'Echo Step',
      description: 'A simple echo step',
      input: { message: 'hello' },
      output: 'result',
      depends_on: ['step-0'],
      timeout: '30s',
    };
    const result = StepDefinitionSchema.safeParse(validStep);
    expect(result.success).toBe(true);
  });

  it('should validate a correct execution state with ExecutionStateSchema', () => {
    const validState = {
      case_id: 'case-1',
      workflow_id: 'wf-1',
      status: 'running' as const,
      current_step_id: 'step-1',
      completed_steps: ['step-0'],
      failed_steps: [],
      step_results: {},
      variables: {},
      gates: {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = ExecutionStateSchema.safeParse(validState);
    expect(result.success).toBe(true);
  });
});
