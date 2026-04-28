import { StepRunner, ExecutionContext } from '../../types/runner.js';
import { StepDefinition } from '../../types/workflow.js';
import { StepResult } from '../../types/state.js';

export class EchoRunner implements StepRunner {
  type = 'echo';

  async run(step: StepDefinition, _ctx: ExecutionContext): Promise<StepResult> {
    const message = (step.input?.message as string) || '';
    return {
      status: 'success',
      output: message,
    };
  }
}
