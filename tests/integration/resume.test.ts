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

describe('Gate + Resume E2E', () => {
  let tempDir: string;
  let caseStore: CaseStore;
  let gateStore: GateStore;
  let engine: WorkflowEngine;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-resume-'));
    caseStore = new CaseStore(tempDir);
    gateStore = new GateStore(caseStore);
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    registry.register(new ManualGateRunner());
    const bus = new InProcessEventBus();
    engine = new WorkflowEngine(registry, caseStore, gateStore, bus);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should pause on gate, approve, and complete', async () => {
    const workflow: WorkflowDefinition = {
      id: 'gate_test',
      version: '0.1.0',
      steps: [
        { id: 'setup', type: 'builtin', runner: 'echo', input: { message: 'setup' } },
        { id: 'approval', type: 'builtin', runner: 'manual_gate', input: { message: 'Do you approve this action?' } },
        { id: 'finalize', type: 'builtin', runner: 'echo', input: { message: 'done' } },
      ],
    };

    // First run — pauses at gate
    const result1 = await engine.execute('case_1', workflow);
    expect(result1.status).toBe('paused');

    // Approve gate
    gateStore.approveGate('gate_case_1_approval', 'user');

    // Resume — should complete
    const result2 = await engine.resume('case_1');
    expect(result2.status).toBe('completed');

    const state = engine.getState('case_1');
    expect(state?.completed_steps).toContain('setup');
    expect(state?.completed_steps).toContain('approval');
    expect(state?.completed_steps).toContain('finalize');
  });
});

describe('graph mode resume', () => {
  it('should resume graph workflow after gate approval', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-graph-resume-'));
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    registry.register(new ManualGateRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'graph_resume',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [
        { id: 'setup', type: 'builtin', runner: 'echo', input: { message: 'setup' }, output: 'setup_out' },
        { id: 'approval', type: 'builtin', runner: 'manual_gate', input: { message: 'approve?' } },
        { id: 'cleanup', type: 'builtin', runner: 'echo', input: { message: 'cleanup' }, depends_on: ['approval'] },
      ],
    };

    // Execute: should pause at gate
    const firstResult = await engine.execute('case_graphresume', workflow);
    expect(firstResult.status).toBe('paused');

    const pausedState = engine.getState('case_graphresume');
    expect(pausedState?.step_statuses['setup']).toBe('success');
    expect(pausedState?.step_statuses['approval']).toBe('gated');
    expect(pausedState?.step_statuses['cleanup']).toBe('pending');

    // Approve gate
    gateStore.approveGate('gate_case_graphresume_approval', 'tester');

    // Resume
    const resumeResult = await engine.resume('case_graphresume');
    expect(resumeResult.status).toBe('completed');

    const finalState = engine.getState('case_graphresume');
    expect(finalState?.step_statuses['setup']).toBe('success');
    expect(finalState?.step_statuses['approval']).toBe('success');
    expect(finalState?.step_statuses['cleanup']).toBe('success');
    expect(finalState?.completed_steps).toContain('cleanup');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should resume graph workflow and run remaining independent steps', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-graph-resume2-'));
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    registry.register(new ManualGateRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'graph_resume2',
      version: '0.1.0',
      execution: { mode: 'graph', max_parallel: 2 },
      steps: [
        { id: 'gate_step', type: 'builtin', runner: 'manual_gate' },
        { id: 'independent', type: 'builtin', runner: 'echo', input: { message: 'independent' } },
        { id: 'after_gate', type: 'builtin', runner: 'echo', depends_on: ['gate_step'] },
      ],
    };

    // Execute: gate_step gates, independent should have already run
    const firstResult = await engine.execute('case_graphresume2', workflow);
    expect(firstResult.status).toBe('paused');

    const pausedState = engine.getState('case_graphresume2');
    expect(pausedState?.step_statuses['gate_step']).toBe('gated');
    expect(pausedState?.step_statuses['independent']).toBe('success');
    expect(pausedState?.step_statuses['after_gate']).toBe('pending');

    // Approve gate
    gateStore.approveGate('gate_case_graphresume2_gate_step', 'tester');

    // Resume
    const resumeResult = await engine.resume('case_graphresume2');
    expect(resumeResult.status).toBe('completed');

    const finalState = engine.getState('case_graphresume2');
    expect(finalState?.step_statuses['gate_step']).toBe('success');
    expect(finalState?.step_statuses['independent']).toBe('success');
    expect(finalState?.step_statuses['after_gate']).toBe('success');

    rmSync(tempDir, { recursive: true, force: true });
  });
});
