import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../../src/config/validator.js';
import { WorkflowDefinition } from '../../src/types/workflow.js';

describe('validator', () => {
  it('should validate a correct workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [{ id: 'step1', type: 'builtin', runner: 'echo', input: { message: 'hello' } }],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(true);
  });

  it('should reject duplicate step ids', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'echo' },
        { id: 'step1', type: 'builtin', runner: 'shell' },
      ],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(false);
  });

  it('should reject duplicate output variables', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'echo', output: 'var1' },
        { id: 'step2', type: 'builtin', runner: 'echo', output: 'var1' },
      ],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(false);
  });

  it('should reject depends_on referencing future step', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'echo', depends_on: ['step2'] },
        { id: 'step2', type: 'builtin', runner: 'echo' },
      ],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(false);
  });
});

describe('graph validation', () => {
  it('should reject graph with circular dependency', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['c'] },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
        { id: 'c', type: 'builtin', runner: 'echo', depends_on: ['b'] },
      ],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes('Circular'))).toBe(true);
  });

  it('should allow future dependency in graph mode', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['b'] },
        { id: 'b', type: 'builtin', runner: 'echo' },
      ],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(true);
  });

  it('should reject future dependency in sequential mode', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['b'] },
        { id: 'b', type: 'builtin', runner: 'echo' },
      ],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes('future'))).toBe(true);
  });
});
