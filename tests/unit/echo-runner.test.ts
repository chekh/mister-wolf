import { describe, it, expect } from 'vitest';
import { EchoRunner } from '../../src/workflow/runners/echo.js';
import { StepDefinition } from '../../src/types/workflow.js';

describe('EchoRunner', () => {
  it('should echo message', async () => {
    const runner = new EchoRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'echo',
      input: { message: 'hello' },
    };
    const result = await runner.run(step, { case_id: 'c1', workflow_id: 'w1', variables: {}, config: {} });
    expect(result.status).toBe('success');
    expect(result.output).toBe('hello');
  });
});
