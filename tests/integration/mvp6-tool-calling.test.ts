import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine } from '../../src/workflow/engine.js';
import { RunnerRegistry } from '../../src/workflow/runner-registry.js';
import { EchoRunner } from '../../src/workflow/runners/echo.js';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { ToolRegistry } from '../../src/tool/registry.js';
import { ContextReadToolExecutor } from '../../src/tool/executors/context-read.js';
import { CaseStore } from '../../src/state/case-store.js';
import { GateStore } from '../../src/state/gate-store.js';
import { InProcessEventBus } from '../../src/kernel/event-bus.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MVP6 Tool Calling Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `wolf-mvp6-${Date.now()}`);
    mkdirSync(join(tmpDir, '.wolf', 'state'), { recursive: true });
    mkdirSync(join(tmpDir, '.wolf', 'context'), { recursive: true });
    writeFileSync(join(tmpDir, '.wolf', 'context', 'context.md'), '# Project Context\n\nIntegration test context.');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should execute end-to-end tool call workflow', async () => {
    const runnerRegistry = new RunnerRegistry();
    runnerRegistry.register(new EchoRunner());

    const agentRegistry = new AgentRegistry([
      { id: 'reviewer', model_route: 'mock', tools: ['context.read'], capabilities: [] },
    ]);
    const modelRouter = new ModelRouter({ mock: { provider: 'mock', model: 'mock-chat' } });
    const providerRegistry = new ModelProviderRegistry([new MockProvider()]);
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low' });
    toolRegistry.registerExecutor(new ContextReadToolExecutor());

    runnerRegistry.register(new AgentRunner(agentRegistry, modelRouter, providerRegistry, toolRegistry, 'invoke'));

    const engine = new WorkflowEngine(runnerRegistry);
    const bus = new InProcessEventBus();
    const store = new CaseStore(join(tmpDir, '.wolf', 'state'));
    const gateStore = new GateStore(join(tmpDir, '.wolf', 'state'));

    const result = await engine.run(
      {
        id: 'test-wf',
        name: 'Test',
        version: '1',
        steps: [
          {
            id: 'step1',
            type: 'builtin',
            runner: 'agent',
            input: {
              agent: 'reviewer',
              task: 'Review code',
              metadata: { mock_tool_call: { tool_id: 'context.read', input: { path: '.wolf/context/context.md' } } },
            },
          },
        ],
      },
      { case_id: 'c1', workflow_id: 'test-wf', variables: {}, config: { state_dir: join(tmpDir, '.wolf', 'state') } },
      bus,
      store,
      gateStore
    );

    expect(result.status).toBe('completed');
  });
});
