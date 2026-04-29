import { describe, it, expect } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { AgentDefinition } from '../../src/types/agent.js';
import { StepDefinition } from '../../src/types/workflow.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const mockAgents: AgentDefinition[] = [
  {
    id: 'agent-1',
    name: 'Agent One',
    description: 'First agent',
    capabilities: ['read', 'write'],
    model_route: 'route-a',
    tools: ['tool-1'],
    system_prompt: 'You are Agent One',
  },
];

const mockRoutes = {
  'route-a': {
    provider: 'mock',
    model: 'gpt-4',
    purpose: 'general',
    max_tokens: 2048,
  },
};

function createRunner(agents = mockAgents, routes = mockRoutes, providers = [new MockProvider()]) {
  const registry = new AgentRegistry(agents);
  const router = new ModelRouter(routes);
  const providerRegistry = new ModelProviderRegistry(providers);
  return new AgentRunner(registry, router, providerRegistry);
}

function createContext(stateDir: string, mode: 'stub' | 'invoke' = 'stub') {
  return {
    case_id: 'c1',
    workflow_id: 'w1',
    variables: {},
    config: {
      state_dir: stateDir,
      models: {
        routes: {},
        execution: {
          mode,
        },
      },
    } as any,
  };
}

describe('AgentRunner invoke mode', () => {
  it('should return AgentModelResult in invoke mode', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state', 'invoke'));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.type).toBe('agent_model_result');
    expect(modelResult.agent_id).toBe('agent-1');
    expect(modelResult.agent_name).toBe('Agent One');
    expect(modelResult.model_route).toBe('route-a');
    expect(modelResult.provider).toBe('mock');
    expect(modelResult.model).toBe('gpt-4');
    expect(modelResult.output).toContain('Do something');
    expect(modelResult.usage).toBeDefined();
    expect(modelResult.usage.input_tokens).toBeGreaterThan(0);
    expect(modelResult.usage.output_tokens).toBeGreaterThan(0);
    expect(modelResult.usage.total_tokens).toBeGreaterThan(0);
  });

  it('should return invocation plan in stub mode', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state', 'stub'));
    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.type).toBe('agent_invocation_plan');
    expect(plan.agent_id).toBe('agent-1');
    expect(plan.task).toBe('Do something');
  });

  it('should allow route invoke to override global stub', async () => {
    const routes = {
      'route-a': {
        provider: 'mock',
        model: 'gpt-4',
        purpose: 'general',
        max_tokens: 2048,
        execution_mode: 'invoke' as const,
      },
    };
    const runner = createRunner(mockAgents, routes);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state', 'stub'));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.type).toBe('agent_model_result');
  });

  it('should allow route stub to override global invoke', async () => {
    const routes = {
      'route-a': {
        provider: 'mock',
        model: 'gpt-4',
        purpose: 'general',
        max_tokens: 2048,
        execution_mode: 'stub' as const,
      },
    };
    const runner = createRunner(mockAgents, routes);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state', 'invoke'));
    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.type).toBe('agent_invocation_plan');
  });

  it('should fail with empty task in invoke mode', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: '' },
    };
    const result = await runner.run(step, createContext('.wolf/state', 'invoke'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('AgentInputValidationError');
    expect(result.error?.message).toBe('Missing or empty input.task field in invoke mode');
  });

  it('should fail with missing task in invoke mode', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1' },
    };
    const result = await runner.run(step, createContext('.wolf/state', 'invoke'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('AgentInputValidationError');
    expect(result.error?.message).toBe('Missing or empty input.task field in invoke mode');
  });

  it('should pass context bundle to provider', async () => {
    const tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    const stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(stateDir, { recursive: true });
    const bundlePath = join(tmpDir, '.wolf', 'bundle.json');
    writeFileSync(bundlePath, JSON.stringify({ key: 'value' }));

    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: {
        agent: 'agent-1',
        task: 'Do something',
        context_bundle: 'bundle.json',
      },
    };
    const result = await runner.run(step, createContext(stateDir, 'invoke'));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.type).toBe('agent_model_result');
    expect(modelResult.output).toContain('Do something');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should enforce context bundle size limit', async () => {
    const tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    const stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(stateDir, { recursive: true });
    const bundlePath = join(tmpDir, '.wolf', 'large-bundle.txt');
    writeFileSync(bundlePath, 'x'.repeat(1048577)); // 1MB + 1 byte

    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: {
        agent: 'agent-1',
        task: 'Do something',
        context_bundle: 'large-bundle.txt',
      },
    };
    const result = await runner.run(step, createContext(stateDir, 'invoke'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ContextReadError');
    expect(result.error?.message).toContain('exceeds 1MB limit');

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
