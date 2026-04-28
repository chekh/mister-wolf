import { Command } from 'commander';
import { WorkflowEngine } from '../../workflow/engine.js';
import { RunnerRegistry } from '../../workflow/runner-registry.js';
import { EchoRunner } from '../../workflow/runners/echo.js';
import { ShellRunner } from '../../workflow/runners/shell.js';
import { ManualGateRunner } from '../../workflow/runners/manual-gate.js';
import { CaseStore } from '../../state/case-store.js';
import { GateStore } from '../../state/gate-store.js';
import { InProcessEventBus } from '../../kernel/event-bus.js';
import { join } from 'path';

export function createResumeCommand(): Command {
  return new Command('resume')
    .description('Resume a paused workflow case')
    .argument('<case_id>', 'Case ID to resume')
    .action(async (caseId: string) => {
      const cwd = process.cwd();
      const stateDir = join(cwd, '.wolf', 'state');

      const registry = new RunnerRegistry();
      registry.register(new EchoRunner());
      registry.register(new ShellRunner());
      registry.register(new ManualGateRunner());

      const caseStore = new CaseStore(stateDir);
      const gateStore = new GateStore(caseStore);
      const bus = new InProcessEventBus();
      const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

      try {
        const result = await engine.resume(caseId);

        if (result.status === 'paused') {
          const state = engine.getState(caseId);
          const gateId = `gate_${caseId}_${state?.current_step_id}`;
          console.log(`[${caseId}] PAUSED. Run: wolf approve ${gateId}`);
          process.exit(2);
        }

        if (result.status === 'failed') {
          console.log(`[${caseId}] FAILED`);
          process.exit(3);
        }

        console.log(`[${caseId}] Workflow resumed and completed`);
        process.exit(0);
      } catch (err) {
        console.error(`[${caseId}] Error:`, err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
