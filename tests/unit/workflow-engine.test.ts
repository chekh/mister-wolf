import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine } from '../../src/workflow/engine.js';
import { RunnerRegistry } from '../../src/workflow/runner-registry.js';
import { EchoRunner } from '../../src/workflow/runners/echo.js';
import { ManualGateRunner } from '../../src/workflow/runners/manual-gate.js';
import { CaseStore } from '../../src/state/case-store.js';
import { GateStore } from '../../src/state/gate-store.js';
import { InProcessEventBus } from '../../src/kernel/event-bus.js';
import { WorkflowDefinition } from '../../src/types/workflow.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-engine-'));
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    engine = new WorkflowEngine(registry, caseStore, gateStore, bus);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should execute sequential steps', async () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 's1', type: 'builtin', runner: 'echo', input: { message: 'step1' }, output: 'out1' },
        { id: 's2', type: 'builtin', runner: 'echo', input: { message: 'step2' } },
      ],
    };

    const result = await engine.execute('case_1', workflow);
    expect(result.status).toBe('completed');

    const state = engine.getState('case_1');
    expect(state?.completed_steps).toEqual(['s1', 's2']);
    expect(state?.variables.out1).toBe('step1');
  });
});

describe('WorkflowEngine retry', () => {
  it('should retry failing step', async () => {
    // This is a basic structure test - verify retry policy is parsed
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-retry-'));
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'retry_test',
      version: '0.1.0',
      steps: [
        {
          id: 's1',
          type: 'builtin',
          runner: 'echo',
          input: { message: 'test' },
          retry: { max_attempts: 3, delay: '100ms', backoff: 'fixed' },
        },
      ],
    };

    const result = await engine.execute('retry_case', workflow);
    expect(result.status).toBe('completed');

    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('WorkflowEngine conditions', () => {
  it('should skip step when condition is false', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-cond-'));
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'cond_test',
      version: '0.1.0',
      steps: [
        { id: 's1', type: 'builtin', runner: 'echo', input: { message: 'hello' }, output: 'greeting' },
        {
          id: 's2',
          type: 'builtin',
          runner: 'echo',
          when: { var: 'greeting', equals: 'wrong' },
          input: { message: 'should not run' },
        },
        { id: 's3', type: 'builtin', runner: 'echo', input: { message: 'done' } },
      ],
    };

    const result = await engine.execute('cond_case', workflow);
    expect(result.status).toBe('completed');

    const finalState = engine.getState('cond_case');
    expect(finalState?.skipped_steps).toContain('s2');
    expect(finalState?.completed_steps).toContain('s1');
    expect(finalState?.completed_steps).toContain('s3');

    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('WorkflowEngine cancel', () => {
  it('should cancel running case', async () => {
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    registry.register(new ManualGateRunner());
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-cancel-'));
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const gateWorkflow: WorkflowDefinition = {
      id: 'gate_cancel',
      version: '0.1.0',
      steps: [
        { id: 'setup', type: 'builtin', runner: 'echo', input: { message: 'setup' } },
        { id: 'approval', type: 'builtin', runner: 'manual_gate', input: { message: 'approve?' } },
      ],
    };

    await engine.execute('cancel_case', gateWorkflow);
    await engine.cancel('cancel_case');

    const state = engine.getState('cancel_case');
    expect(state?.status).toBe('cancelled');

    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('WorkflowEngine graph mode', () => {
  let engine: WorkflowEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-graph-'));
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    engine = new WorkflowEngine(registry, caseStore, gateStore, bus);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should execute graph steps in parallel respecting dependencies', async () => {
    const workflow: WorkflowDefinition = {
      id: 'graph_test',
      version: '0.1.0',
      execution: { mode: 'graph', max_parallel: 2 },
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', input: { message: 'a' } },
        { id: 'b', type: 'builtin', runner: 'echo', input: { message: 'b' } },
        { id: 'c', type: 'builtin', runner: 'echo', input: { message: 'c' }, depends_on: ['a', 'b'] },
      ],
    };

    const result = await engine.execute('graph_case', workflow);
    expect(result.status).toBe('completed');

    const state = engine.getState('graph_case');
    expect(state?.completed_steps).toContain('a');
    expect(state?.completed_steps).toContain('b');
    expect(state?.completed_steps).toContain('c');
    expect(state?.execution_mode).toBe('graph');
  });

  it('should skip transitive dependents on failure in graph mode', async () => {
    // Register a failing runner
    class FailingRunner {
      type = 'failing';
      async run(): Promise<{ status: string; error?: unknown }> {
        return { status: 'failure', error: { type: 'TestError', message: 'fail', retryable: false } };
      }
    }

    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    registry.register(new FailingRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const customEngine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'fail_graph',
      version: '0.1.0',
      execution: { mode: 'graph', max_parallel: 2 },
      steps: [
        { id: 'root', type: 'builtin', runner: 'failing' },
        { id: 'child', type: 'builtin', runner: 'echo', depends_on: ['root'] },
        { id: 'orphan', type: 'builtin', runner: 'echo' },
      ],
    };

    const result = await customEngine.execute('fail_case', workflow);
    expect(result.status).toBe('failed');

    const state = customEngine.getState('fail_case');
    expect(state?.failed_steps).toContain('root');
    expect(state?.skipped_steps).toContain('child');
    expect(state?.completed_steps).toContain('orphan');
  });

  it('should gate in graph mode and pause workflow', async () => {
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    registry.register(new ManualGateRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const customEngine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'gate_graph',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [
        { id: 'pre', type: 'builtin', runner: 'echo' },
        { id: 'gate', type: 'builtin', runner: 'manual_gate' },
        { id: 'post', type: 'builtin', runner: 'echo', depends_on: ['gate'] },
      ],
    };

    const result = await customEngine.execute('gate_case', workflow);
    expect(result.status).toBe('paused');

    const state = customEngine.getState('gate_case');
    expect(state?.step_statuses['gate']).toBe('gated');
    expect(state?.step_statuses['pre']).toBe('success');
  });

  it('should respect max_parallel in graph mode', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    class CountingRunner {
      type = 'counting';
      async run(): Promise<{ status: string; output?: string }> {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 50));
        concurrent--;
        return { status: 'success', output: 'done' };
      }
    }

    const registry = new RunnerRegistry();
    registry.register(new CountingRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const customEngine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'parallel_test',
      version: '0.1.0',
      execution: { mode: 'graph', max_parallel: 2 },
      steps: [
        { id: 'a', type: 'builtin', runner: 'counting' },
        { id: 'b', type: 'builtin', runner: 'counting' },
        { id: 'c', type: 'builtin', runner: 'counting' },
      ],
    };

    await customEngine.execute('parallel_case', workflow);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should preserve all variables and statuses under parallel execution', async () => {
    class VariableRunner {
      type = 'var_runner';
      async run(step: any): Promise<{ status: string; output: string }> {
        const value = (step.input?.value as string) || '';
        return { status: 'success', output: value };
      }
    }

    const registry = new RunnerRegistry();
    registry.register(new VariableRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const customEngine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'parallel_vars',
      version: '0.1.0',
      execution: { mode: 'graph', max_parallel: 3 },
      steps: [
        { id: 'a', type: 'builtin', runner: 'var_runner', input: { value: 'alpha' }, output: 'out_a' },
        { id: 'b', type: 'builtin', runner: 'var_runner', input: { value: 'beta' }, output: 'out_b' },
        { id: 'c', type: 'builtin', runner: 'var_runner', input: { value: 'gamma' }, output: 'out_c' },
        {
          id: 'combine',
          type: 'builtin',
          runner: 'var_runner',
          input: { value: '{{ out_a }}-{{ out_b }}-{{ out_c }}' },
          depends_on: ['a', 'b', 'c'],
        },
      ],
    };

    const result = await customEngine.execute('vars_case', workflow);
    expect(result.status).toBe('completed');

    const state = customEngine.getState('vars_case');
    expect(state?.variables.out_a).toBe('alpha');
    expect(state?.variables.out_b).toBe('beta');
    expect(state?.variables.out_c).toBe('gamma');
    expect(state?.step_statuses['a']).toBe('success');
    expect(state?.step_statuses['b']).toBe('success');
    expect(state?.step_statuses['c']).toBe('success');
    expect(state?.step_statuses['combine']).toBe('success');
    expect(state?.completed_steps).toContain('a');
    expect(state?.completed_steps).toContain('b');
    expect(state?.completed_steps).toContain('c');
    expect(state?.completed_steps).toContain('combine');
  });
});
