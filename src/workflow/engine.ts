import { RunnerRegistry } from './runner-registry.js';
import { CaseStore } from '../state/case-store.js';
import { GateStore } from '../state/gate-store.js';
import { InProcessEventBus } from '../kernel/event-bus.js';
import { WorkflowDefinition, StepDefinition } from '../types/workflow.js';
import { ExecutionState, StepResult } from '../types/state.js';
import { RuntimeEvent } from '../types/events.js';
import { interpolateObject } from './template.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowEngine {
  private states = new Map<string, ExecutionState>();

  constructor(
    private registry: RunnerRegistry,
    private caseStore: CaseStore,
    private gateStore: GateStore,
    private bus: InProcessEventBus,
  ) {}

  async execute(caseId: string, workflow: WorkflowDefinition): Promise<{ status: string }> {
    this.caseStore.createCase(caseId, workflow, JSON.stringify(workflow));

    const state: ExecutionState = {
      case_id: caseId,
      workflow_id: workflow.id,
      status: 'running',
      completed_steps: [],
      failed_steps: [],
      step_results: {},
      variables: {},
      gates: {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.states.set(caseId, state);
    this.caseStore.writeState(caseId, state);
    this.caseStore.updateCaseStatus(caseId, 'running');

    await this.emitEvent({
      type: 'workflow.started',
      case_id: caseId,
      workflow_id: workflow.id,
      payload: { version: workflow.version },
    });

    return this.runSteps(workflow, state);
  }

  async resume(caseId: string): Promise<{ status: string }> {
    const workflow = this.caseStore.loadWorkflowSnapshot(caseId);
    const state = this.caseStore.readState(caseId);
    if (!state) {
      throw new Error(`Case not found: ${caseId}`);
    }

    state.status = 'running';
    state.updated_at = new Date().toISOString();
    this.states.set(caseId, state);
    this.caseStore.writeState(caseId, state);
    this.caseStore.updateCaseStatus(caseId, 'running');

    await this.emitEvent({
      type: 'workflow.started',
      case_id: caseId,
      workflow_id: workflow.id,
      payload: { resumed: true },
    });

    return this.runSteps(workflow, state);
  }

  private async runSteps(workflow: WorkflowDefinition, state: ExecutionState): Promise<{ status: string }> {
    for (const step of workflow.steps) {
      if (state.completed_steps.includes(step.id)) {
        continue;
      }

      state.current_step_id = step.id;
      state.updated_at = new Date().toISOString();
      this.caseStore.writeState(state.case_id, state);

      const result = await this.executeStep(step, state);
      state.step_results[step.id] = result;
      state.updated_at = new Date().toISOString();

      if (result.status === 'success') {
        state.completed_steps.push(step.id);

        if (step.output && result.output !== undefined) {
          state.variables[step.output] = result.output;
        }

        if (result.output !== undefined) {
          this.caseStore.writeOutput(state.case_id, step.id, String(result.output));
        }

        this.caseStore.writeState(state.case_id, state);

        await this.emitEvent({
          type: 'step.completed',
          case_id: state.case_id,
          workflow_id: state.workflow_id,
          step_id: step.id,
          payload: { output: result.output },
        });
      } else if (result.status === 'gated') {
        this.gateStore.createGate(state.case_id, step.id);
        const updatedState = this.caseStore.readState(state.case_id)!;
        updatedState.status = 'paused';
        this.caseStore.writeState(state.case_id, updatedState);
        this.states.set(state.case_id, updatedState);
        this.caseStore.updateCaseStatus(state.case_id, 'paused');

        await this.emitEvent({
          type: 'gate.requested',
          case_id: updatedState.case_id,
          workflow_id: updatedState.workflow_id,
          step_id: step.id,
          payload: {},
        });

        return { status: 'paused' };
      } else if (result.status === 'failure') {
        state.status = 'failed';
        state.failed_steps.push(step.id);
        this.caseStore.writeState(state.case_id, state);
        this.caseStore.updateCaseStatus(state.case_id, 'failed');

        await this.emitEvent({
          type: 'step.failed',
          case_id: state.case_id,
          workflow_id: state.workflow_id,
          step_id: step.id,
          payload: { error: result.error },
        });

        await this.emitEvent({
          type: 'workflow.failed',
          case_id: state.case_id,
          workflow_id: state.workflow_id,
          payload: { failed_step: step.id },
        });

        return { status: 'failed' };
      }
    }

    state.status = 'completed';
    state.current_step_id = undefined;
    state.updated_at = new Date().toISOString();
    this.caseStore.writeState(state.case_id, state);
    this.caseStore.updateCaseStatus(state.case_id, 'completed');

    await this.emitEvent({
      type: 'workflow.completed',
      case_id: state.case_id,
      workflow_id: state.workflow_id,
      payload: { completed_steps: state.completed_steps },
    });

    return { status: 'completed' };
  }

  private async executeStep(step: StepDefinition, state: ExecutionState): Promise<StepResult> {
    const interpolatedInput = interpolateObject(step.input, state.variables);
    const runner = this.registry.get(step.runner);

    await this.emitEvent({
      type: 'step.started',
      case_id: state.case_id,
      workflow_id: state.workflow_id,
      step_id: step.id,
      payload: { input: interpolatedInput },
    });

    const context = {
      case_id: state.case_id,
      workflow_id: state.workflow_id,
      variables: state.variables,
      gates: state.gates,
      config: {},
    };

    return runner.run({ ...step, input: interpolatedInput as Record<string, unknown> | undefined }, context);
  }

  private async emitEvent(partial: Omit<RuntimeEvent, 'id' | 'timestamp' | 'actor'>): Promise<void> {
    const event: RuntimeEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      actor: { type: 'system', id: 'workflow-engine' },
      ...partial,
      payload: partial.payload || {},
    };
    await this.bus.publish(event);
  }

  getState(caseId: string): ExecutionState | null {
    return this.states.get(caseId) || this.caseStore.readState(caseId);
  }
}
