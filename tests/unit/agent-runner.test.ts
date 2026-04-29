import { describe, it, expect } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
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
  },
];

const mockRoutes = {
  'route-a': {
    provider: 'openai',
    model: 'gpt-4',
    purpose: 'general',
    max_tokens: 2048,
  },
};

function createRunner(agents = mockAgents, routes = mockRoutes) {
  const registry = new AgentRegistry(agents);
  const router = new ModelRouter(routes);
  return new AgentRunner(registry, router);
}

function createContext(stateDir: string) {
  return {
    case_id: 'c1',
    workflow_id: 'w1',
    variables: {},
    config: {
      state_dir: stateDir,
    },
  };
}

describe('AgentRunner', () => {
  it('should return invocation plan for valid agent', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.type).toBe('agent_invocation_plan');
    expect(plan.agent_id).toBe('agent-1');
    expect(plan.agent_name).toBe('Agent One');
    expect(plan.model_route).toBe('route-a');
    expect(plan.provider).toBe('openai');
    expect(plan.model).toBe('gpt-4');
    expect(plan.purpose).toBe('general');
    expect(plan.max_tokens).toBe(2048);
    expect(plan.capabilities).toEqual(['read', 'write']);
    expect(plan.tools).toEqual(['tool-1']);
    expect(plan.task).toBe('Do something');
    expect(plan.context_bundle).toBeUndefined();
  });

  it('should fail when agent field is missing', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('AgentInputValidationError');
    expect(result.error?.message).toBe('Missing or invalid input.agent field');
  });

  it('should fail when agent is not found', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'unknown-agent', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('AgentNotFound');
    expect(result.error?.message).toBe('Agent not found: unknown-agent');
  });

  it('should fail when model route is not found', async () => {
    const registry = new AgentRegistry([
      {
        id: 'agent-bad-route',
        name: 'Bad Route Agent',
        capabilities: [],
        model_route: 'nonexistent-route',
        tools: [],
      },
    ]);
    const router = new ModelRouter(mockRoutes);
    const runner = new AgentRunner(registry, router);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-bad-route', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ModelRouteNotFound');
  });

  it('should validate context_bundle path', async () => {
    const tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    const stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(stateDir, { recursive: true });
    const bundlePath = join(tmpDir, '.wolf', 'bundle.json');
    writeFileSync(bundlePath, '{}');

    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', context_bundle: 'bundle.json' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.context_bundle).toBe('bundle.json');

    // Test absolute path rejection
    const absStep: StepDefinition = {
      id: 'step2',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', context_bundle: '/etc/passwd' },
    };
    const absResult = await runner.run(absStep, createContext(stateDir));
    expect(absResult.status).toBe('failure');
    expect(absResult.error?.type).toBe('ContextBundleValidationError');
    expect(absResult.error?.message).toContain('relative path');

    // Test parent traversal rejection
    const travStep: StepDefinition = {
      id: 'step3',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', context_bundle: '../secret.json' },
    };
    const travResult = await runner.run(travStep, createContext(stateDir));
    expect(travResult.status).toBe('failure');
    expect(travResult.error?.type).toBe('ContextBundleValidationError');
    expect(travResult.error?.message).toContain('parent traversal');

    // Test nonexistent file rejection
    const missingStep: StepDefinition = {
      id: 'step4',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', context_bundle: 'missing.json' },
    };
    const missingResult = await runner.run(missingStep, createContext(stateDir));
    expect(missingResult.status).toBe('failure');
    expect(missingResult.error?.type).toBe('ContextBundleValidationError');
    expect(missingResult.error?.message).toContain('not found');

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
