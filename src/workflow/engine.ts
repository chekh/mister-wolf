import { RunnerRegistry } from './runner-registry.js';
import { CaseStore } from '../state/case-store.js';
import { GateStore } from '../state/gate-store.js';
import { InProcessEventBus } from '../kernel/event-bus.js';
import { WorkflowDefinition, StepDefinition } from '../types/workflow.js';
import { ExecutionState, StepResult } from '../types/state.js';
import { RuntimeEvent } from '../types/events.js';
import { interpolateObject } from './template.js';
import { evaluateCondition } from './conditions.js';
import { buildGraph, getReadySteps, getTransitiveDependents, DependencyGraph } from './graph.js';
import { ProjectConfig, ProjectConfigSchema } from '../config/project-config.js';
import { PolicyPreflight } from '../policy/preflight.js';
import { PolicyStepGuard } from '../policy/step-guard.js';
import { PolicyGateAdapter } from '../policy/gate-adapter.js';
import { PolicyDecision } from '../types/policy.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowEngine {
  private states = new Map<string, ExecutionState>();
  private policyGateAdapter: PolicyGateAdapter;

  constructor(
    private registry: RunnerRegistry,
    private caseStore: CaseStore,
    private gateStore: GateStore,
    private bus: InProcessEventBus,
    private config: ProjectConfig = ProjectConfigSchema.parse({})
  ) {
    this.policyGateAdapter = new PolicyGateAdapter(gateStore);
  }

  async execute(caseId: string, workflow: WorkflowDefinition): Promise<{ status: string }> {
    const preflight = new PolicyPreflight();
    const policyReport = preflight.evaluate(workflow, this.config.policy);

    if (policyReport.overall === 'deny') {
      await this.emitEvent({
        type: 'policy.denied',
        case_id: caseId,
        workflow_id: workflow.id,
        payload: {
          reason: 'Workflow denied by policy',
          decisions: policyReport.decisions.filter((d) => d.decision === 'deny'),
        },
      });
      throw new Error(`Workflow denied by policy: ${workflow.id}`);
    }

    this.caseStore.createCase(caseId, workflow, JSON.stringify(workflow));

    const state: ExecutionState = {
      case_id: caseId,
      workflow_id: workflow.id,
      status: 'running',
      execution_mode: workflow.execution?.mode || 'sequential',
      completed_steps: [],
      failed_steps: [],
      skipped_steps: [],
      step_results: {},
      step_statuses: {},
      variables: {},
      gates: {},
      policy_decisions: policyReport.decisions,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    for (const step of workflow.steps) {
      state.step_statuses[step.id] = 'pending';
    }

    this.states.set(caseId, state);
    this.caseStore.writeState(caseId, state);
    this.caseStore.updateCaseStatus(caseId, 'running');

    await this.emitEvent({
      type: 'workflow.started',
      case_id: caseId,
      workflow_id: workflow.id,
      payload: { version: workflow.version },
    });

    if (workflow.execution?.mode === 'graph') {
      return this.runGraph(workflow, state);
    }
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

    if (workflow.execution?.mode === 'graph') {
      return this.runGraph(workflow, state);
    }
    return this.runSteps(workflow, state);
  }

  private async runSteps(workflow: WorkflowDefinition, state: ExecutionState): Promise<{ status: string }> {
    state.step_statuses ??= {};
    for (const step of workflow.steps) {
      if (!state.step_statuses[step.id]) {
        state.step_statuses[step.id] = 'pending';
      }
    }

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

          await this.emitEvent({
            type: 'step.skipped',
            case_id: state.case_id,
            workflow_id: state.workflow_id,
            step_id: step.id,
            payload: { reason: 'condition_false', condition: step.when },
          });
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
          this.caseStore.writeArtifact(state.case_id, step.id, step.artifact.path, String(result.output));

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

  private async runGraph(workflow: WorkflowDefinition, state: ExecutionState): Promise<{ status: string }> {
    const graph = buildGraph(workflow);
    const maxParallel = workflow.execution?.max_parallel ?? this.config.defaults.max_parallel ?? 1;

    // Initialize pending statuses for all steps
    state.step_statuses ??= {};
    for (const step of workflow.steps) {
      if (!state.step_statuses[step.id]) {
        state.step_statuses[step.id] = 'pending';
      }
    }

    // Normalize gated steps on resume/load
    for (const step of workflow.steps) {
      if (state.step_statuses[step.id] === 'gated') {
        const gateId = `gate_${state.case_id}_${step.id}`;
        const gate = state.gates?.[gateId];
        if (gate?.status === 'approved') {
          state.step_statuses[step.id] = 'pending';
        } else if (gate?.status === 'rejected') {
          state.step_statuses[step.id] = 'failure';
          state.failed_steps.push(step.id);
          state.step_results[step.id] = {
            status: 'failure',
            error: {
              type: 'GateRejected',
              message: `Gate ${gateId} was rejected`,
              retryable: false,
            },
          };
        }
      }
    }
    this.caseStore.writeState(state.case_id, state);
    this.states.set(state.case_id, state);

    let hasFailure = state.failed_steps.length > 0;
    let hasGated = false;

    while (true) {
      if (hasFailure) {
        // Fail-fast: don't start new steps
        break;
      }

      if (hasGated) {
        // Gate behavior: running steps allowed to finish, no new steps
        break;
      }

      // Refresh state from disk to pick up changes from parallel steps in previous iterations
      state = this.caseStore.readState(state.case_id) || state;

      const ready = getReadySteps(graph, state.step_statuses);
      if (ready.length === 0) break;

      // Respect max_parallel
      const toRun = ready.slice(0, maxParallel);

      // Mark as running
      for (const stepId of toRun) {
        state.step_statuses[stepId] = 'running';
      }
      state.updated_at = new Date().toISOString();
      this.caseStore.writeState(state.case_id, state);

      // Execute in parallel
      const promises = toRun.map(async (stepId) => {
        const step = workflow.steps.find((s) => s.id === stepId)!;

        // Check when condition
        if (step.when) {
          const shouldRun = evaluateCondition(step.when, state.variables);
          if (!shouldRun) {
            state.skipped_steps.push(step.id);
            state.step_statuses[step.id] = 'skipped';
            state.step_results[step.id] = { status: 'skipped' };

            await this.emitEvent({
              type: 'step.skipped',
              case_id: state.case_id,
              workflow_id: state.workflow_id,
              step_id: step.id,
              payload: { reason: 'condition_false', condition: step.when },
            });
            return { stepId, result: { status: 'skipped' } as StepResult };
          }
        }

        const result = await this.executeStep(step, state, false);
        return { stepId, result };
      });

      const settled = await Promise.allSettled(promises);

      for (const outcome of settled) {
        if (outcome.status === 'rejected') {
          // Should not happen, but handle defensively
          continue;
        }
        const { stepId, result } = outcome.value;

        // Read latest state to avoid overwriting concurrent changes from parallel steps
        const currentState = this.caseStore.readState(state.case_id)!;
        currentState.step_results[stepId] = result;
        currentState.updated_at = new Date().toISOString();

        if (result.status === 'success') {
          currentState.step_statuses[stepId] = 'success';
          currentState.completed_steps.push(stepId);

          const step = workflow.steps.find((s) => s.id === stepId)!;
          if (step.output && result.output !== undefined) {
            currentState.variables[step.output] = result.output;
          }
          if (result.output !== undefined) {
            this.caseStore.writeOutput(state.case_id, stepId, String(result.output));
          }
          if (step.artifact && result.output !== undefined) {
            this.caseStore.writeArtifact(state.case_id, stepId, step.artifact.path, String(result.output));
            await this.emitEvent({
              type: 'artifact.created',
              case_id: currentState.case_id,
              workflow_id: currentState.workflow_id,
              step_id: stepId,
              payload: { path: step.artifact.path },
            });
          }

          this.caseStore.writeState(state.case_id, currentState);
          this.states.set(state.case_id, currentState);
          await this.emitEvent({
            type: 'step.completed',
            case_id: currentState.case_id,
            workflow_id: currentState.workflow_id,
            step_id: stepId,
            payload: { output: result.output },
          });
        } else if (result.status === 'gated') {
          currentState.step_statuses[stepId] = 'gated';
          this.gateStore.createGate(state.case_id, stepId);
          hasGated = true;

          const updatedState = this.caseStore.readState(state.case_id)!;
          updatedState.step_statuses[stepId] = 'gated';
          this.caseStore.writeState(state.case_id, updatedState);
          this.states.set(state.case_id, updatedState);
          await this.emitEvent({
            type: 'gate.requested',
            case_id: updatedState.case_id,
            workflow_id: updatedState.workflow_id,
            step_id: stepId,
            payload: {},
          });
        } else if (result.status === 'failure') {
          currentState.step_statuses[stepId] = 'failure';
          currentState.failed_steps.push(stepId);
          hasFailure = true;

          this.caseStore.writeState(state.case_id, currentState);
          this.states.set(state.case_id, currentState);
          await this.emitEvent({
            type: 'step.failed',
            case_id: currentState.case_id,
            workflow_id: currentState.workflow_id,
            step_id: stepId,
            payload: { error: result.error },
          });
        } else if (result.status === 'skipped') {
          // Already handled above in when condition
        }
      }
    }

    // After main loop, handle final state
    // Refresh state from disk to ensure we're working with latest data
    state = this.caseStore.readState(state.case_id) || state;

    if (hasGated) {
      state.status = 'paused';
      state.current_step_id = undefined;
      state.updated_at = new Date().toISOString();
      this.caseStore.writeState(state.case_id, state);
      this.states.set(state.case_id, state);
      this.caseStore.updateCaseStatus(state.case_id, 'paused');
      return { status: 'paused' };
    }

    if (hasFailure) {
      // Mark pending steps and their transitive dependents as skipped
      const pendingSteps = workflow.steps.filter((s) => state.step_statuses[s.id] === 'pending').map((s) => s.id);

      const toSkip = new Set<string>();
      for (const stepId of pendingSteps) {
        toSkip.add(stepId);
        const dependents = getTransitiveDependents(graph, stepId);
        for (const dep of dependents) {
          toSkip.add(dep);
        }
      }

      for (const stepId of toSkip) {
        if (state.step_statuses[stepId] === 'pending') {
          state.step_statuses[stepId] = 'skipped';
          state.skipped_steps.push(stepId);
          state.step_results[stepId] = { status: 'skipped' };
        }
      }

      state.status = 'failed';
      state.current_step_id = undefined;
      state.updated_at = new Date().toISOString();
      this.caseStore.writeState(state.case_id, state);
      this.states.set(state.case_id, state);
      this.caseStore.updateCaseStatus(state.case_id, 'failed');

      await this.emitEvent({
        type: 'workflow.failed',
        case_id: state.case_id,
        workflow_id: state.workflow_id,
        payload: { failed_steps: state.failed_steps },
      });

      return { status: 'failed' };
    }

    // Check if all steps are done (success or skipped only)
    // Gated steps are NOT considered done — they require explicit resolution
    const allDone = workflow.steps.every((s) => {
      const st = state.step_statuses[s.id];
      return st === 'success' || st === 'skipped';
    });

    if (allDone) {
      state.status = 'completed';
      state.current_step_id = undefined;
      state.updated_at = new Date().toISOString();
      this.caseStore.writeState(state.case_id, state);
      this.states.set(state.case_id, state);
      this.caseStore.updateCaseStatus(state.case_id, 'completed');

      await this.emitEvent({
        type: 'workflow.completed',
        case_id: state.case_id,
        workflow_id: state.workflow_id,
        payload: { completed_steps: state.completed_steps },
      });

      return { status: 'completed' };
    }

    // Should not reach here in normal operation
    return { status: state.status };
  }

  private persistPolicyDecision(caseId: string, decision: PolicyDecision): void {
    const state = this.caseStore.readState(caseId)!;
    state.policy_decisions ??= [];
    // Deduplicate by decision id
    if (!state.policy_decisions.some((d) => d.id === decision.id)) {
      state.policy_decisions.push(decision);
    }
    this.caseStore.writeState(caseId, state);
  }

  private async executeStep(
    step: StepDefinition,
    state: ExecutionState,
    trackState: boolean = true
  ): Promise<StepResult> {
    if (this.policyGateAdapter.isPolicyGateApproved(state.case_id, step.id)) {
      return this.executeStepWithRetry(step, state, trackState);
    }

    const guard = new PolicyStepGuard();
    const decision = guard.evaluate(step, this.config.policy, state.workflow_id);

    this.persistPolicyDecision(state.case_id, decision);

    if (decision.decision === 'deny') {
      return {
        status: 'failure',
        error: {
          type: 'PolicyViolation',
          message: decision.reason,
          retryable: false,
        },
      };
    }

    const interpolatedInput = interpolateObject(step.input, state.variables);

    if (decision.decision === 'ask') {
      this.policyGateAdapter.createPolicyGate(state.case_id, step.id, decision, interpolatedInput);
      return { status: 'gated' };
    }

    await this.emitEvent({
      type: 'step.started',
      case_id: state.case_id,
      workflow_id: state.workflow_id,
      step_id: step.id,
      payload: { input: interpolatedInput },
    });

    return this.executeStepWithRetry(step, state, trackState);
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
      config: this.config,
      timeoutMs,
    };

    return this.runWithTimeout(
      () => runner.run({ ...step, input: interpolatedInput as Record<string, unknown> | undefined }, context),
      timeoutMs,
      step.id
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

  private async runWithTimeout(fn: () => Promise<StepResult>, timeoutMs: number, stepId: string): Promise<StepResult> {
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
          timeoutMs
        )
      ),
    ]);
  }

  private async executeStepWithRetry(
    step: StepDefinition,
    state: ExecutionState,
    trackState: boolean = true
  ): Promise<StepResult> {
    state.step_statuses ??= {};
    const maxAttempts = step.retry?.max_attempts ?? 1;
    const delayMs = this.parseDuration(step.retry?.delay ?? '1s');
    const backoff = step.retry?.backoff ?? 'fixed';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (trackState) {
        state.step_statuses[step.id] = attempt > 1 ? 'retrying' : 'running';
        state.updated_at = new Date().toISOString();
        this.caseStore.writeState(state.case_id, state);
      }

      const result = await this.executeSingleAttempt(step, state);

      if (result.status !== 'failure' || attempt === maxAttempts) {
        return result;
      }

      await this.emitEvent({
        type: 'step.retrying',
        case_id: state.case_id,
        workflow_id: state.workflow_id,
        step_id: step.id,
        payload: { attempt, max_attempts: maxAttempts, reason: result.error?.type || 'unknown' },
      });

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

    await this.emitEvent({
      type: 'case.cancelled',
      case_id: caseId,
      workflow_id: state.workflow_id,
      payload: { cancelled_by: 'cli-user' },
    });
  }

  getState(caseId: string): ExecutionState | null {
    return this.states.get(caseId) || this.caseStore.readState(caseId);
  }
}
