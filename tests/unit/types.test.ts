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

import { RetryPolicySchema, ConditionSchema, ArtifactSchema } from '../../src/types/workflow.js';

describe('MVP1B types', () => {
  it('should validate retry policy', () => {
    const result = RetryPolicySchema.safeParse({ max_attempts: 3, delay: '1s', backoff: 'linear' });
    expect(result.success).toBe(true);
  });

  it('should validate condition with equals', () => {
    const result = ConditionSchema.safeParse({ var: 'foo', equals: 'bar' });
    expect(result.success).toBe(true);
  });

  it('should validate artifact', () => {
    const result = ArtifactSchema.safeParse({ path: 'outputs/result.txt' });
    expect(result.success).toBe(true);
  });

  it('should reject absolute artifact path', () => {
    const result = ArtifactSchema.safeParse({ path: '/etc/passwd' });
    expect(result.success).toBe(false);
  });

  it('should reject artifact path with parent traversal', () => {
    const result = ArtifactSchema.safeParse({ path: '../secret.txt' });
    expect(result.success).toBe(false);
  });

  it('should reject condition with multiple operators', () => {
    const result = ConditionSchema.safeParse({ var: 'foo', equals: 'bar', exists: true });
    expect(result.success).toBe(false);
  });
});

describe('MVP1B state types', () => {
  it('should validate execution state with skipped_steps and step_statuses', () => {
    const result = ExecutionStateSchema.safeParse({
      case_id: 'c1',
      workflow_id: 'w1',
      status: 'running',
      completed_steps: [],
      failed_steps: [],
      skipped_steps: ['step1'],
      step_results: {},
      step_statuses: { step1: 'skipped' },
      variables: {},
      gates: {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

describe('MVP1C types', () => {
  it('should validate workflow with graph execution config', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      id: 'test',
      version: '0.1.0',
      execution: { mode: 'graph', max_parallel: 4 },
      steps: [{ id: 's1', type: 'builtin', runner: 'echo' }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.execution?.mode).toBe('graph');
    expect(result.data?.execution?.max_parallel).toBe(4);
  });

  it('should validate workflow without execution config (sequential default)', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      id: 'test',
      version: '0.1.0',
      steps: [{ id: 's1', type: 'builtin', runner: 'echo' }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.execution?.mode).toBe('sequential');
  });

  it('should allow optional max_parallel', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      id: 'test',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [{ id: 's1', type: 'builtin', runner: 'echo' }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.execution?.max_parallel).toBeUndefined();
  });
});

describe('MVP1C state types', () => {
  it('should validate execution state with execution_mode', () => {
    const result = ExecutionStateSchema.safeParse({
      case_id: 'c1',
      workflow_id: 'w1',
      status: 'running',
      execution_mode: 'graph',
      completed_steps: [],
      failed_steps: [],
      skipped_steps: [],
      step_results: {},
      step_statuses: {},
      variables: {},
      gates: {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('should validate step_statuses with new statuses', () => {
    const result = ExecutionStateSchema.safeParse({
      case_id: 'c1',
      workflow_id: 'w1',
      status: 'running',
      execution_mode: 'graph',
      completed_steps: [],
      failed_steps: [],
      skipped_steps: [],
      step_results: {},
      step_statuses: {
        s1: 'pending',
        s2: 'ready',
        s3: 'running',
        s4: 'blocked',
      },
      variables: {},
      gates: {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
