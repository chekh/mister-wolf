import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../../src/workflow/engine.js';
import { RunnerRegistry } from '../../src/workflow/runner-registry.js';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { CaseStore } from '../../src/state/case-store.js';
import { GateStore } from '../../src/state/gate-store.js';
import { InProcessEventBus } from '../../src/kernel/event-bus.js';
import { WorkflowDefinition } from '../../src/types/workflow.js';
import { ProjectConfigSchema } from '../../src/config/project-config.js';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function createEngine(streaming: boolean = false) {
  const stateDir = mkdtempSync(join(tmpdir(), 'wolf-test-'));
  const registry = new RunnerRegistry();
  const agentRegistry = new AgentRegistry([
    { id: 'reviewer', name: 'Reviewer', model_route: 'route-a', tools: [], capabilities: [] },
  ]);
  const routes = {
    'route-a': { provider: 'mock', model: 'mock-chat', execution_mode: 'invoke' as const, streaming },
  };
  const modelRouter = new ModelRouter(routes);
  const providerRegistry = new ModelProviderRegistry([new MockProvider()]);
  registry.register(
    new AgentRunner(agentRegistry, modelRouter, providerRegistry, undefined, 'invoke')
  );

  const caseStore = new CaseStore(stateDir);
  const gateStore = new GateStore(caseStore);
  const bus = new InProcessEventBus();
  const config = ProjectConfigSchema.parse({ state_dir: stateDir });
  const engine = new WorkflowEngine(registry, caseStore, gateStore, bus, config);

  return { engine, bus, caseStore, stateDir };
}

describe('MVP7 streaming integration', () => {
  it('should execute streaming workflow end-to-end', async () => {
    const { engine, stateDir } = createEngine(true);
    const workflow: WorkflowDefinition = {
      id: 'test-streaming',
      version: '0.2.0',
      name: 'test-streaming',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'agent', input: { agent: 'reviewer', task: 'Test streaming' } },
      ],
    };

    const result = await engine.execute('case-1', workflow);
    expect(result.status).toBe('completed');
  });

  it('should emit model.stream.started event', async () => {
    const { engine, bus } = createEngine(true);
    const events: string[] = [];
    bus.subscribe('model.stream.started', () => events.push('started'));

    const workflow: WorkflowDefinition = {
      id: 'test-events',
      version: '0.2.0',
      name: 'test-events',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'agent', input: { agent: 'reviewer', task: 'Test events' } },
      ],
    };

    await engine.execute('case-1', workflow);
    expect(events).toContain('started');
  });

  it('should emit model.stream.chunk events', async () => {
    const { engine, bus } = createEngine(true);
    const chunks: string[] = [];
    bus.subscribe('model.stream.chunk', (event) => {
      chunks.push(event.payload.text as string);
    });

    const workflow: WorkflowDefinition = {
      id: 'test-chunks',
      version: '0.2.0',
      name: 'test-chunks',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'agent', input: { agent: 'reviewer', task: 'Test chunks' } },
      ],
    };

    await engine.execute('case-1', workflow);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should emit model.stream.completed event', async () => {
    const { engine, bus } = createEngine(true);
    const events: string[] = [];
    bus.subscribe('model.stream.completed', () => events.push('completed'));

    const workflow: WorkflowDefinition = {
      id: 'test-completed',
      version: '0.2.0',
      name: 'test-completed',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'agent', input: { agent: 'reviewer', task: 'Test completed' } },
      ],
    };

    await engine.execute('case-1', workflow);
    expect(events).toContain('completed');
  });

  it('should store StepResult with full output in CaseStore', async () => {
    const { engine, caseStore } = createEngine(true);
    const workflow: WorkflowDefinition = {
      id: 'test-storage',
      version: '0.2.0',
      name: 'test-storage',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'agent', input: { agent: 'reviewer', task: 'Test storage' } },
      ],
    };

    await engine.execute('case-1', workflow);
    const result = caseStore.getStepResult('case-1', 'step1');
    expect(result).toBeDefined();
    const modelResult = JSON.parse(result!.output as string);
    expect(modelResult.type).toBe('agent_model_result');
    expect(modelResult.output).toContain('[mock:mock-chat]');
  });

  it('should not emit streaming events when streaming=false', async () => {
    const { engine, bus } = createEngine(false);
    const events: string[] = [];
    bus.subscribe('model.stream.started', () => events.push('started'));
    bus.subscribe('model.stream.chunk', () => events.push('chunk'));
    bus.subscribe('model.stream.completed', () => events.push('completed'));

    const workflow: WorkflowDefinition = {
      id: 'test-no-streaming',
      version: '0.2.0',
      name: 'test-no-streaming',
      steps: [
        { id: 'step1', type: 'builtin', runner: 'agent', input: { agent: 'reviewer', task: 'Test no streaming' } },
      ],
    };

    await engine.execute('case-1', workflow);
    expect(events.length).toBe(0);
  });
});
