import { RunnerRegistry } from './runner-registry.js';
import { CaseStore } from '../state/case-store.js';
import { GateStore } from '../state/gate-store.js';
import { InProcessEventBus } from '../kernel/event-bus.js';
import { WorkflowDefinition, StepDefinition } from '../types/workflow.js';
import { ExecutionState, StepResult } from '../types/state.js';
import { RuntimeEvent } from '../types/events.js';
import { interpolateObject } from './template.js';
import { evaluateCondition } from './conditions.js';
import { ProjectConfig } from '../config/project-config.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowEngine {
  private states = new Map<string, ExecutionState>();

  constructor(
    private registry: RunnerRegistry,
    private caseStore: CaseStore,
    private gateStore: GateStore,
    private bus: InProcessEventBus,
    private config: ProjectConfig = { state_dir: '.wolf/state', defaults: { timeout: '30s' } },
  ) {}

  async execute(caseId: string, workflow: WorkflowDefinition): Promise<{ status: string }> {
    this.caseStore.createCase(caseId, workflow, JSON.stringify(workflow));

    const state: ExecutionState = {
      case_id: caseId,
      workflow_id: workflow.id,
      status: 'running',
      completed_steps: [],
      failed_steps: [],
      skipped_steps: [],
      step_results: {},
      step_statuses: {},
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
    state.step_statuses ??= {};
    state.skipped_steps ??= [];
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

      if (step.when) {
        const shouldRun = evaluateCondition(step.when, state.variables);
        if (!shouldRun) {
          state.skipped_steps.push(step.id);
          state.step_statuses[step.id] = 'skipped';
          state.step_results[step.id] = { status: 'skipped' };

          const event: RuntimeEvent = {
            id: uuidv4(),
            type: 'step.skipped',
            case_id: state.case_id,
            step_id: step.id,
            timestamp: new Date().toISOString(),
            actor: { type: 'system', id: 'workflow-engine' },
            payload: { reason: 'condition_false', condition: step.when },
          };
          await this.bus.publish(event);
          this.caseStore.appendEvent(state.case_id, event);
          this.caseStore.writeState(state.case_id, state);
          continue;
        }
      }

      state.current_step_id = step.id;
      state.updated_at = new Date().toISOString();
      this.caseStore.writeState(state.case_id, state);

      const result = await this.executeStep(step, state);
      state.step_results[step.id] = result;
      state.updated_at = new Date().toISOString();

      if (result.status === 'success') {
        state.step_statuses[step.id] = 'success';
        state.completed_steps.push(step.id);

        if (step.output && result.output !== undefined) {
          state.variables[step.output] = result.output;
        }

        if (result.output !== undefined) {
          this.caseStore.writeOutput(state.case_id, step.id, String(result.output));
        }

        if (step.artifact && result.output !== undefined) {
          this.caseStore.writeArtifact(
            state.case_id,
            step.id,
            step.artifact.path,
            String(result.output)
          );

          await this.emitEvent({
            type: 'artifact.created',
            case_id: state.case_id,
            workflow_id: state.workflow_id,
            step_id: step.id,
            payload: { path: step.artifact.path },
          });
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
        state.step_statuses[step.id] = 'gated';
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
        state.step_statuses[step.id] = 'failure';
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

    await this.emitEvent({
      type: 'step.started',
      case_id: state.case_id,
      workflow_id: state.workflow_id,
      step_id: step.id,
      payload: { input: interpolatedInput },
    });

    return this.executeStepWithRetry(step, state);
  }

  private async executeSingleAttempt(step: StepDefinition, state: ExecutionState): Promise<StepResult> {
    const interpolatedInput = interpolateObject(step.input, state.variables);
    const runner = this.registry.get(step.runner);
    const timeoutMs = this.resolveTimeout(step);

    const context = {
      case_id: state.case_id,
      workflow_id: state.workflow_id,
      variables: state.variables,
      gates: state.gates,
      config: {},
      timeoutMs,
    };

    return this.runWithTimeout(
      () => runner.run({ ...step, input: interpolatedInput as Record<string, unknown> | undefined }, context),
      timeoutMs,
      step.id,
    );
  }

  private resolveTimeout(step: StepDefinition): number {
    if (step.timeout) {
      return this.parseDuration(step.timeout);
    }
    if (this.config.defaults.timeout) {
      return this.parseDuration(this.config.defaults.timeout);
    }
    return this.parseDuration('60s');
  }

  private async runWithTimeout(
    fn: () => Promise<StepResult>,
    timeoutMs: number,
    stepId: string,
  ): Promise<StepResult> {
    return Promise.race([
      fn(),
      new Promise<StepResult>((resolve) =>
        setTimeout(
          () =>
            resolve({
              status: 'failure',
              error: {
                type: 'TimeoutError',
                message: `Step ${stepId} timed out after ${timeoutMs}ms`,
                retryable: false,
              },
            }),
          timeoutMs,
        ),
      ),
    ]);
  }

  private async executeStepWithRetry(step: StepDefinition, state: ExecutionState): Promise<StepResult> {
    state.step_statuses ??= {};
    const maxAttempts = step.retry?.max_attempts ?? 1;
    const delayMs = this.parseDuration(step.retry?.delay ?? '1s');
    const backoff = step.retry?.backoff ?? 'fixed';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      state.step_statuses[step.id] = attempt > 1 ? 'retrying' : 'running';
      state.updated_at = new Date().toISOString();
      this.caseStore.writeState(state.case_id, state);

      const result = await this.executeSingleAttempt(step, state);

      if (result.status !== 'failure' || attempt === maxAttempts) {
        return result;
      }

      // Emit retrying event
      const event: RuntimeEvent = {
        id: uuidv4(),
        type: 'step.retrying',
        case_id: state.case_id,
        step_id: step.id,
        timestamp: new Date().toISOString(),
        actor: { type: 'system', id: 'workflow-engine' },
        payload: { attempt, max_attempts: maxAttempts, reason: result.error?.type || 'unknown' },
      };
      await this.bus.publish(event);
      this.caseStore.appendEvent(state.case_id, event);

      const waitMs = backoff === 'linear' ? delayMs * attempt : delayMs;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    return { status: 'failure' };
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(ms|s|m)$/);
    if (!match) return 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'ms') return value;
    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60 * 1000;
    return 1000;
  }

  private async emitEvent(partial: Omit<RuntimeEvent, 'id' | 'timestamp' | 'actor'>): Promise<void> {
    const event: RuntimeEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      actor: { type: 'system', id: 'workflow-engine' },
      ...partial,
      payload: partial.payload || {},
    };
    this.caseStore.appendEvent(event.case_id, event);
    await this.bus.publish(event);
  }

  async cancel(caseId: string): Promise<void> {
    const state = this.caseStore.readState(caseId);
    if (!state) throw new Error(`Case not found: ${caseId}`);
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
      throw new Error(`Cannot cancel case in status: ${state.status}`);
    }

    state.status = 'cancelled';
    state.updated_at = new Date().toISOString();
    state.step_statuses ??= {};
    state.skipped_steps ??= [];

    // Mark remaining steps as skipped
    const workflow = this.caseStore.loadWorkflowSnapshot(caseId);
    for (const step of workflow.steps) {
      if (!state.step_statuses[step.id]) {
        state.step_statuses[step.id] = 'skipped';
        state.skipped_steps.push(step.id);
      }
    }

    this.states.set(caseId, state);
    this.caseStore.writeState(caseId, state);
    this.caseStore.updateCaseStatus(caseId, 'cancelled');

    const event: RuntimeEvent = {
      id: uuidv4(),
      type: 'case.cancelled',
      case_id: caseId,
      timestamp: new Date().toISOString(),
      actor: { type: 'user', id: 'cli' },
      payload: { cancelled_by: 'cli-user' },
    };
    await this.bus.publish(event);
    this.caseStore.appendEvent(caseId, event);
  }

  getState(caseId: string): ExecutionState | null {
    return this.states.get(caseId) || this.caseStore.readState(caseId);
  }
}
