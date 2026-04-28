import { Command } from 'commander';
import { loadWorkflow } from '../../config/loader.js';
import { validateWorkflow } from '../../config/validator.js';
import { WorkflowEngine } from '../../workflow/engine.js';
import { RunnerRegistry } from '../../workflow/runner-registry.js';
import { EchoRunner } from '../../workflow/runners/echo.js';
import { ShellRunner } from '../../workflow/runners/shell.js';
import { ManualGateRunner } from '../../workflow/runners/manual-gate.js';
import { CaseStore } from '../../state/case-store.js';
import { GateStore } from '../../state/gate-store.js';
import { InProcessEventBus } from '../../kernel/event-bus.js';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a workflow')
    .argument('<workflow>', 'Path to workflow YAML file')
    .action(async (workflowPath: string) => {
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

      let workflow;
      try {
        workflow = loadWorkflow(workflowPath);
      } catch (err) {
        console.error('Failed to load workflow:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const validation = validateWorkflow(workflow);
      if (!validation.success) {
        console.error('Validation failed:');
        validation.errors?.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }

      const caseId = `case_${uuidv4().split('-')[0]}`;
      console.log(`[${caseId}] Created`);

      const result = await engine.execute(caseId, workflow);

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

      console.log(`[${caseId}] Workflow completed`);
      process.exit(0);
    });
}
