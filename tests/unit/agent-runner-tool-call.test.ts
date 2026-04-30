import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { ToolRegistry } from '../../src/tool/registry.js';
import { ContextReadToolExecutor } from '../../src/tool/executors/context-read.js';
import { AgentDefinition } from '../../src/types/agent.js';
import { StepDefinition } from '../../src/types/workflow.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const mockAgents: AgentDefinition[] = [
  { id: 'reviewer', name: 'Reviewer', model_route: 'route-a', tools: ['context.read'], capabilities: [], system_prompt: 'You review code' },
  { id: 'no-tools', name: 'No Tools', model_route: 'route-a', tools: [], capabilities: [] },
];

const mockRoutes = {
  'route-a': { provider: 'mock', model: 'mock-chat' },
};

function createRunner(
  agents = mockAgents,
  routes = mockRoutes,
  mode: 'stub' | 'invoke' = 'invoke',
  providers = new ModelProviderRegistry([new MockProvider()]),
  toolRegistry?: ToolRegistry
) {
  const registry = new AgentRegistry(agents);
  const router = new ModelRouter(routes);
  return new AgentRunner(registry, router, providers, toolRegistry, mode);
}

function createContext(stateDir: string) {
  return {
    case_id: 'c1',
    workflow_id: 'w1',
    variables: {},
    config: { state_dir: stateDir },
  };
}

describe('AgentRunner tool calling', () => {
  let tmpDir: string;
  let stateDir: string;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(join(tmpDir, '.wolf', 'context'), { recursive: true });
    writeFileSync(join(tmpDir, '.wolf', 'context', 'context.md'), '# Project Context\n\nThis is the context.');
    toolRegistry = new ToolRegistry();
    toolRegistry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low' });
    toolRegistry.registerExecutor(new ContextReadToolExecutor());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should execute tool call and return final model result in invoke mode', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'invoke', new ModelProviderRegistry([new MockProvider()]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: {
        agent: 'reviewer',
        task: 'Review this code',
        metadata: {
          mock_tool_call: { tool_id: 'context.read', input: { path: '.wolf/context/context.md' } },
        },
      },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.type).toBe('agent_model_result');
    expect(modelResult.output).toContain('[mock:mock-chat]');
  });

  it('should return AgentInvocationPlan in stub mode even with tools', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'stub', new ModelProviderRegistry([new MockProvider()]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'reviewer', task: 'Review this code' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.type).toBe('agent_invocation_plan');
    expect(plan.tools).toContain('context.read');
  });

  it('should fail with ToolNotAllowed for tool not in agent.tools', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'invoke', new ModelProviderRegistry([new MockProvider()]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: {
        agent: 'no-tools',
        task: 'Do something',
        metadata: { mock_tool_call: { tool_id: 'context.read', input: {} } },
      },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ToolNotAllowed');
  });

  it('should fail with ToolCallLimitExceeded if Pass 2 returns tool_call', async () => {
    const mockProvider = new MockProvider();
    const providerWithSecondCall = {
      ...mockProvider,
      invoke: async (req: import('../../src/model/types.js').ModelInvocationRequest) => {
        if (req.input.includes('[Tool Call Result:')) {
          return { output: '', provider: 'mock', model: req.model, tool_call: { tool_id: 'context.read', input: {} } };
        }
        return mockProvider.invoke(req);
      },
    };
    const runner = createRunner(mockAgents, mockRoutes, 'invoke', new ModelProviderRegistry([providerWithSecondCall as any]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: {
        agent: 'reviewer',
        task: 'Review',
        metadata: { mock_tool_call: { tool_id: 'context.read', input: { path: '.wolf/context/context.md' } } },
      },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ToolCallLimitExceeded');
  });

  it('should invoke model without tools when agent has no tools', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'invoke', new ModelProviderRegistry([new MockProvider()]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'no-tools', task: 'Hello' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');
  });
});
