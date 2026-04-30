import { Command, Option } from 'commander';
import { loadWorkflow } from '../../config/loader.js';
import { validateWorkflow } from '../../config/validator.js';
import { loadProjectConfig } from '../../config/project-config.js';
import { WorkflowEngine } from '../../workflow/engine.js';
import { RunnerRegistry } from '../../workflow/runner-registry.js';
import { EchoRunner } from '../../workflow/runners/echo.js';
import { ShellRunner } from '../../workflow/runners/shell.js';
import { ManualGateRunner } from '../../workflow/runners/manual-gate.js';
import { AgentRunner } from '../../agent/runner.js';
import { AgentRegistry } from '../../agent/registry.js';
import { ModelRouter } from '../../agent/router.js';
import { ModelProviderRegistry } from '../../model/registry.js';
import { MockProvider } from '../../model/mock-provider.js';
import { OpenAIProvider } from '../../model/openai-provider.js';
import { ToolRegistry } from '../../tool/registry.js';
import { ContextReadToolExecutor } from '../../tool/executors/context-read.js';
import { CaseStore } from '../../state/case-store.js';
import { GateStore } from '../../state/gate-store.js';
import { InProcessEventBus } from '../../kernel/event-bus.js';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a workflow')
    .argument('<workflow>', 'Path to workflow YAML file')
    .addOption(new Option('--config <path>', 'Path to wolf.yaml config file'))
    .action(async (workflowPath: string, options: { config?: string }) => {
      const cwd = process.cwd();
      const projectConfig = loadProjectConfig(options.config);
      const stateDir = join(cwd, projectConfig.state_dir);

      const registry = new RunnerRegistry();
      registry.register(new EchoRunner());
      registry.register(new ShellRunner());
      registry.register(new ManualGateRunner());

      const agentRegistry = new AgentRegistry(projectConfig.agents);
      const modelRouter = new ModelRouter(projectConfig.models.routes);
      const providerRegistry = new ModelProviderRegistry([new MockProvider(), new OpenAIProvider()]);
      const toolRegistry = new ToolRegistry();
      toolRegistry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low', description: 'Read project context files' });
      toolRegistry.registerExecutor(new ContextReadToolExecutor());
      registry.register(new AgentRunner(agentRegistry, modelRouter, providerRegistry, toolRegistry, projectConfig.models.execution.mode));

      const caseStore = new CaseStore(stateDir);
      const gateStore = new GateStore(caseStore);
      const bus = new InProcessEventBus();
      const engine = new WorkflowEngine(registry, caseStore, gateStore, bus, projectConfig);

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
        validation.errors?.forEach((e) => console.error(`  - ${e}`));
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
