import { describe, it, expect } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { AgentDefinition } from '../../src/types/agent.js';
import { StepDefinition } from '../../src/types/workflow.js';

const mockAgents: AgentDefinition[] = [
  { id: 'reviewer', name: 'Reviewer', model_route: 'route-a', tools: [], capabilities: [] },
];

const mockRoutes = {
  'route-a': { provider: 'mock', model: 'mock-chat', execution_mode: 'invoke' as const },
};

function createRunner(
  agents = mockAgents,
  routes = mockRoutes,
  mode: 'stub' | 'invoke' = 'invoke',
  providers = new ModelProviderRegistry([new MockProvider()])
) {
  const registry = new AgentRegistry(agents);
  const router = new ModelRouter(routes);
  return new AgentRunner(registry, router, providers, undefined, mode);
}

function createContext(stateDir: string) {
  return {
    case_id: 'c1',
    workflow_id: 'w1',
    variables: {},
    config: { state_dir: stateDir },
  };
}

describe('AgentRunner streaming', () => {
  it('should call invokeStream when streaming=true', async () => {
    const routes = {
      'route-a': { provider: 'mock', model: 'mock-chat', execution_mode: 'invoke' as const, streaming: true },
    };
    const runner = createRunner(mockAgents, routes);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'reviewer', task: 'Hello' },
    };

    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.type).toBe('agent_model_result');
  });

  it('should use invoke path when streaming=false', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'reviewer', task: 'Hello' },
    };

    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
  });

  it('should fail with ProviderStreamingUnsupported if provider lacks invokeStream', async () => {
    const providerWithoutStream = { id: 'mock', invoke: async () => ({ output: '', provider: 'mock', model: '' }) };
    const runner = createRunner(
      mockAgents,
      { 'route-a': { provider: 'mock', model: 'mock-chat', execution_mode: 'invoke' as const, streaming: true } },
      'invoke',
      new ModelProviderRegistry([providerWithoutStream as any])
    );
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'reviewer', task: 'Hello' },
    };

    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ProviderStreamingUnsupported');
  });

  it('should store final complete output in StepResult', async () => {
    const routes = {
      'route-a': { provider: 'mock', model: 'mock-chat', execution_mode: 'invoke' as const, streaming: true },
    };
    const runner = createRunner(mockAgents, routes);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'reviewer', task: 'Hello world this is a test' },
    };

    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.output).toContain('[mock:mock-chat]');
  });
});
