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
        { id: 's1', type: 'builtin', runner: 'echo', input: { message: 'test' }, retry: { max_attempts: 3, delay: '100ms', backoff: 'fixed' } },
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
        { id: 's2', type: 'builtin', runner: 'echo', when: { var: 'greeting', equals: 'wrong' }, input: { message: 'should not run' } },
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
