import { describe, it, expect } from 'vitest';
import { ShellRunner } from '../../src/workflow/runners/shell.js';
import { StepDefinition } from '../../src/types/workflow.js';

describe('ShellRunner', () => {
  it('should execute echo command', async () => {
    const runner = new ShellRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'shell',
      input: { command: 'echo hello' },
    };
    const result = await runner.run(step, { case_id: 'c1', workflow_id: 'w1', variables: {}, config: {} });
    expect(result.status).toBe('success');
    expect(result.output).toBe('hello\n');
  });

  it('should fail on invalid command', async () => {
    const runner = new ShellRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'shell',
      input: { command: 'invalid_command_xyz' },
    };
    const result = await runner.run(step, { case_id: 'c1', workflow_id: 'w1', variables: {}, config: {} });
    expect(result.status).toBe('failure');
  });

  it('should reject blocked commands', async () => {
    const runner = new ShellRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'shell',
      input: { command: 'sudo ls' },
    };
    const result = await runner.run(step, { case_id: 'c1', workflow_id: 'w1', variables: {}, config: {} });
    expect(result.status).toBe('failure');
    expect((result.error?.message || '')).toContain('blocked');
  });
});
