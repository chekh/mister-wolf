# MVP1C: Graph Orchestration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DAG-based workflow execution with parallel branches to Mr. Wolf

**Architecture:** Extend existing WorkflowEngine with a graph execution path. Add `graph.ts` module for DAG operations. Sequential mode remains unchanged. Graph mode is explicit opt-in.

**Tech Stack:** TypeScript, Zod, Vitest

---

## Dependencies

All dependencies from MVP1B already present. No new npm packages needed.

---

## Phase 1: Schemas and Types

### Task 1: Extend WorkflowDefinition with ExecutionConfig

**Files:**
- Modify: `src/types/workflow.ts`
- Test: `tests/unit/types.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/types.test.ts — append
describe('MVP1C types', () => {
  it('should validate workflow with graph execution config', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      id: 'test',
      version: '0.1.0',
      execution: { mode: 'graph', max_parallel: 4 },
      steps: [{ id: 's1', type: 'builtin', runner: 'echo' }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.execution?.mode).toBe('graph');
    expect(result.data?.execution?.max_parallel).toBe(4);
  });

  it('should validate workflow without execution config (sequential default)', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      id: 'test',
      version: '0.1.0',
      steps: [{ id: 's1', type: 'builtin', runner: 'echo' }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.execution?.mode).toBe('sequential');
  });

  it('should allow optional max_parallel', () => {
    const result = WorkflowDefinitionSchema.safeParse({
      id: 'test',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [{ id: 's1', type: 'builtin', runner: 'echo' }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.execution?.max_parallel).toBeUndefined();
  });
});
```

- [ ] **Step 2: Add ExecutionConfigSchema to workflow.ts**

```typescript
export const ExecutionConfigSchema = z.object({
  mode: z.enum(['sequential', 'graph']).default('sequential'),
  max_parallel: z.number().int().min(1).optional(),
});

export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;

// Update WorkflowDefinitionSchema:
export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  execution: ExecutionConfigSchema.optional(),
  steps: z.array(StepDefinitionSchema).min(1),
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/types.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/workflow.ts tests/unit/types.test.ts
git commit -m "feat: add execution config schema for graph mode"
```

---

### Task 2: Add execution_mode to ExecutionState

**Files:**
- Modify: `src/types/state.ts`
- Test: `tests/unit/types.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('should validate execution state with execution_mode', () => {
  const result = ExecutionStateSchema.safeParse({
    case_id: 'c1',
    workflow_id: 'w1',
    status: 'running',
    execution_mode: 'graph',
    completed_steps: [],
    failed_steps: [],
    skipped_steps: [],
    step_results: {},
    step_statuses: {},
    variables: {},
    gates: {},
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Update ExecutionStateSchema**

```typescript
export const ExecutionStateSchema = z.object({
  case_id: z.string(),
  workflow_id: z.string(),
  status: z.enum(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  execution_mode: z.enum(['sequential', 'graph']).default('sequential'),
  current_step_id: z.string().optional(),
  completed_steps: z.array(z.string()).default([]),
  failed_steps: z.array(z.string()).default([]),
  skipped_steps: z.array(z.string()).default([]),
  step_results: z.record(StepResultSchema).default({}),
  step_statuses: z.record(z.enum(['pending', 'ready', 'running', 'success', 'failure', 'skipped', 'gated', 'retrying', 'blocked'])).default({}),
  variables: z.record(z.unknown()).default({}),
  gates: z.record(GateStateSchema).default({}),
  started_at: z.string(),
  updated_at: z.string(),
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/types.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/state.ts tests/unit/types.test.ts
git commit -m "feat: add execution_mode and expanded step_statuses"
```

---

## Phase 2: Graph Module

### Task 3: Create Graph Builder and Validator

**Files:**
- Create: `src/workflow/graph.ts`
- Test: `tests/unit/graph.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/graph.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraph, validateGraph, getReadySteps, getTransitiveDependents } from '../../src/workflow/graph.js';
import { WorkflowDefinition } from '../../src/types/workflow.js';

describe('graph', () => {
  it('should build graph from workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo' },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
        { id: 'c', type: 'builtin', runner: 'echo', depends_on: ['a'] },
      ],
    };
    const graph = buildGraph(workflow);
    expect(graph.roots).toEqual(['a']);
    expect(graph.edges.get('b')).toEqual(['a']);
    expect(graph.edges.get('c')).toEqual(['a']);
  });

  it('should detect circular dependency', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['c'] },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
        { id: 'c', type: 'builtin', runner: 'echo', depends_on: ['b'] },
      ],
    };
    const result = validateGraph(workflow);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Circular');
  });

  it('should detect unknown dependency', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['x'] },
      ],
    };
    const result = validateGraph(workflow);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('unknown');
  });

  it('should get ready steps', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo' },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
      ],
    };
    const graph = buildGraph(workflow);
    const ready = getReadySteps(graph, { a: 'success' });
    expect(ready).toContain('b');
    expect(ready).not.toContain('a');
  });

  it('should get transitive dependents', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo' },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
        { id: 'c', type: 'builtin', runner: 'echo', depends_on: ['b'] },
      ],
    };
    const graph = buildGraph(workflow);
    const dependents = getTransitiveDependents(graph, 'a');
    expect(dependents).toEqual(['b', 'c']);
  });
});
```

- [ ] **Step 2: Implement src/workflow/graph.ts**

```typescript
import { WorkflowDefinition } from '../types/workflow.js';
import { ValidationResult } from '../config/validator.js';

export interface DependencyGraph {
  nodes: Set<string>;
  edges: Map<string, string[]>; // step_id -> dependencies
  dependents: Map<string, string[]>; // step_id -> dependents
  roots: string[];
}

export function buildGraph(workflow: WorkflowDefinition): DependencyGraph {
  const nodes = new Set(workflow.steps.map((s) => s.id));
  const edges = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();

  for (const step of workflow.steps) {
    edges.set(step.id, step.depends_on || []);
    for (const dep of step.depends_on || []) {
      const existing = dependents.get(dep) || [];
      existing.push(step.id);
      dependents.set(dep, existing);
    }
  }

  const roots = workflow.steps.filter((s) => !(s.depends_on?.length)).map((s) => s.id);

  return { nodes, edges, dependents, roots };
}

export function validateGraph(workflow: WorkflowDefinition): ValidationResult {
  const stepIds = new Set(workflow.steps.map((s) => s.id));
  const errors: string[] = [];

  // Unknown dependencies
  for (const step of workflow.steps) {
    for (const depId of step.depends_on || []) {
      if (!stepIds.has(depId)) {
        errors.push(`Step ${step.id} depends_on unknown step: ${depId}`);
      }
    }
  }

  // Circular dependencies
  const graph = buildGraph(workflow);
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    for (const dep of graph.edges.get(node) || []) {
      if (!visited.has(dep) && hasCycle(dep)) return true;
      if (recStack.has(dep)) return true;
    }
    recStack.delete(node);
    return false;
  }

  for (const stepId of graph.nodes) {
    if (!visited.has(stepId) && hasCycle(stepId)) {
      errors.push(`Circular dependency detected involving: ${stepId}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true };
}

export function getReadySteps(
  graph: DependencyGraph,
  statuses: Record<string, string>
): string[] {
  const ready: string[] = [];
  for (const stepId of graph.nodes) {
    const status = statuses[stepId];
    if (status && status !== 'pending') continue;
    const deps = graph.edges.get(stepId) || [];
    const allDepsSuccess = deps.every((depId) => statuses[depId] === 'success');
    if (allDepsSuccess) {
      ready.push(stepId);
    }
  }
  return ready;
}

export function getTransitiveDependents(graph: DependencyGraph, stepId: string): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [stepId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const deps = graph.dependents.get(current) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        result.push(dep);
        queue.push(dep);
      }
    }
  }

  return result;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/graph.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/workflow/graph.ts tests/unit/graph.test.ts
git commit -m "feat: add DAG graph builder, validator, and ready queue"
```

---

## Phase 3: Validator Updates

### Task 4: Update Config Validator for Graph Mode

**Files:**
- Modify: `src/config/validator.ts`
- Test: `tests/unit/validator.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/validator.test.ts — append
describe('graph validation', () => {
  it('should reject graph with circular dependency', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['c'] },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
        { id: 'c', type: 'builtin', runner: 'echo', depends_on: ['b'] },
      ],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes('Circular'))).toBe(true);
  });

  it('should allow future dependency in graph mode', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['b'] },
        { id: 'b', type: 'builtin', runner: 'echo' },
      ],
    };
    const result = validateWorkflow(workflow);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Modify src/config/validator.ts**

```typescript
import { validateGraph } from '../workflow/graph.js';

export function validateWorkflow(workflow: unknown): ValidationResult {
  const schemaResult = WorkflowDefinitionSchema.safeParse(workflow);
  if (!schemaResult.success) {
    return {
      success: false,
      errors: schemaResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  const validated = schemaResult.data;
  const errors: string[] = [];

  // Schema-level checks (existing)
  // ... duplicate step IDs, duplicate outputs ...

  // Graph validation for graph mode
  if (validated.execution?.mode === 'graph') {
    const graphResult = validateGraph(validated);
    if (!graphResult.success) {
      errors.push(...(graphResult.errors || []));
    }
  } else {
    // Sequential mode: future depends_on is still an error
    const stepIndexMap = new Map<string, number>();
    validated.steps.forEach((step, idx) => stepIndexMap.set(step.id, idx));
    for (let i = 0; i < validated.steps.length; i++) {
      const step = validated.steps[i];
      if (step.depends_on) {
        for (const depId of step.depends_on) {
          const depIndex = stepIndexMap.get(depId);
          if (depIndex === undefined) {
            errors.push(`Step ${step.id} depends_on unknown step: ${depId}`);
          } else if (depIndex >= i) {
            errors.push(`Step ${step.id} depends_on future step: ${depId}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/validator.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/config/validator.ts tests/unit/validator.test.ts
git commit -m "feat: update validator for graph mode with cycle and future-dep checks"
```

---

## Phase 4: Engine Graph Execution

### Task 5: Add Graph Execution Path to WorkflowEngine

**Files:**
- Modify: `src/workflow/engine.ts`
- Test: `tests/unit/workflow-engine.test.ts`

This is the largest task. The engine needs:
1. Detect execution mode (sequential vs graph)
2. For graph mode: build graph, run ready queue, manage parallelism
3. For sequential mode: keep existing behavior unchanged

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/workflow-engine.test.ts — append
describe('WorkflowEngine graph mode', () => {
  it('should execute graph with parallel branches', async () => {
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'graph_test',
      version: '0.1.0',
      execution: { mode: 'graph', max_parallel: 2 },
      steps: [
        { id: 'root', type: 'builtin', runner: 'echo', input: { message: 'root' } },
        { id: 'branch_a', type: 'builtin', runner: 'echo', depends_on: ['root'], input: { message: 'a' } },
        { id: 'branch_b', type: 'builtin', runner: 'echo', depends_on: ['root'], input: { message: 'b' } },
        { id: 'merge', type: 'builtin', runner: 'echo', depends_on: ['branch_a', 'branch_b'], input: { message: 'done' } },
      ],
    };

    const result = await engine.execute('graph_case', workflow);
    expect(result.status).toBe('completed');

    const state = engine.getState('graph_case');
    expect(state?.execution_mode).toBe('graph');
    expect(state?.completed_steps).toContain('root');
    expect(state?.completed_steps).toContain('branch_a');
    expect(state?.completed_steps).toContain('branch_b');
    expect(state?.completed_steps).toContain('merge');
  });

  it('should propagate failure transitively in graph', async () => {
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    registry.register(new ShellRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'fail_graph',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [
        { id: 'root', type: 'builtin', runner: 'echo', input: { message: 'root' } },
        { id: 'fail', type: 'builtin', runner: 'shell', depends_on: ['root'], input: { command: 'exit 1' } },
        { id: 'dep', type: 'builtin', runner: 'echo', depends_on: ['fail'], input: { message: 'never' } },
      ],
    };

    const result = await engine.execute('fail_case', workflow);
    expect(result.status).toBe('failed');

    const state = engine.getState('fail_case');
    expect(state?.step_statuses['fail']).toBe('failure');
    expect(state?.step_statuses['dep']).toBe('skipped');
    expect(state?.skipped_steps).toContain('dep');
  });
});
```

- [ ] **Step 2: Implement graph execution in engine.ts**

Add to WorkflowEngine:

```typescript
import { buildGraph, getReadySteps, getTransitiveDependents } from './graph.js';

private async runGraphSteps(workflow: WorkflowDefinition, state: ExecutionState): Promise<{ status: string }> {
  const graph = buildGraph(workflow);
  const maxParallel = this.resolveMaxParallel(workflow);
  const running = new Set<string>();

  // Initialize all steps as pending
  for (const step of workflow.steps) {
    if (!state.step_statuses[step.id]) {
      state.step_statuses[step.id] = 'pending';
    }
  }

  while (true) {
    // Check if workflow is paused/failed/cancelled
    if (state.status === 'paused' || state.status === 'failed' || state.status === 'cancelled') {
      return { status: state.status };
    }

    // Get ready steps
    const ready = getReadySteps(graph, state.step_statuses).filter((id) => !running.has(id));

    // Start ready steps up to max_parallel
    while (ready.length > 0 && running.size < maxParallel) {
      const stepId = ready.shift()!;
      const step = workflow.steps.find((s) => s.id === stepId)!;
      state.step_statuses[stepId] = 'running';
      running.add(stepId);
      this.runStepAsync(step, state, graph, running, workflow);
    }

    // Check if done
    const allDone = workflow.steps.every((s) => {
      const status = state.step_statuses[s.id];
      return ['success', 'failure', 'skipped', 'gated'].includes(status);
    });

    if (allDone && running.size === 0) {
      const hasFailure = workflow.steps.some((s) => state.step_statuses[s.id] === 'failure');
      if (hasFailure) {
        state.status = 'failed';
        this.caseStore.writeState(state.case_id, state);
        this.caseStore.updateCaseStatus(state.case_id, 'failed');
        await this.emitEvent({
          type: 'workflow.failed',
          case_id: state.case_id,
          workflow_id: state.workflow_id,
          payload: {},
        });
        return { status: 'failed' };
      }
      state.status = 'completed';
      state.current_step_id = undefined;
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

    // Wait a bit before checking again
    if (running.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    } else if (ready.length === 0) {
      // Deadlock or all blocked
      break;
    }
  }

  return { status: state.status };
}

private async runStepAsync(
  step: StepDefinition,
  state: ExecutionState,
  graph: DependencyGraph,
  running: Set<string>,
  workflow: WorkflowDefinition,
): Promise<void> {
  try {
    const result = await this.executeStep(step, state);
    running.delete(step.id);
    state.step_results[step.id] = result;

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
    } else if (result.status === 'failure') {
      state.step_statuses[step.id] = 'failure';
      state.failed_steps.push(step.id);
      // Propagate failure transitively
      const dependents = getTransitiveDependents(graph, step.id);
      for (const depId of dependents) {
        if (state.step_statuses[depId] === 'pending' || state.step_statuses[depId] === 'ready' || state.step_statuses[depId] === 'blocked') {
          state.step_statuses[depId] = 'skipped';
          state.skipped_steps.push(depId);
          await this.emitEvent({
            type: 'step.skipped',
            case_id: state.case_id,
            workflow_id: state.workflow_id,
            step_id: depId,
            payload: { reason: 'dependency_failed', failed_dependency: step.id },
          });
        }
      }
      state.status = 'failed';
      this.caseStore.writeState(state.case_id, state);
      this.caseStore.updateCaseStatus(state.case_id, 'failed');
      await this.emitEvent({
        type: 'step.failed',
        case_id: state.case_id,
        workflow_id: state.workflow_id,
        step_id: step.id,
        payload: { error: result.error },
      });
    }
  } catch (err) {
    running.delete(step.id);
    state.step_statuses[step.id] = 'failure';
    state.failed_steps.push(step.id);
    state.status = 'failed';
    this.caseStore.writeState(state.case_id, state);
    this.caseStore.updateCaseStatus(state.case_id, 'failed');
    await this.emitEvent({
      type: 'step.failed',
      case_id: state.case_id,
      workflow_id: state.workflow_id,
      step_id: step.id,
      payload: { error: { type: 'RuntimeError', message: String(err) } },
    });
  }
}

private resolveMaxParallel(workflow: WorkflowDefinition): number {
  if (workflow.execution?.max_parallel) {
    return workflow.execution.max_parallel;
  }
  if (this.config.defaults?.max_parallel) {
    return this.config.defaults.max_parallel;
  }
  return 1;
}
```

- [ ] **Step 3: Update execute() and resume() to dispatch to correct mode**

```typescript
async execute(caseId: string, workflow: WorkflowDefinition): Promise<{ status: string }> {
  // ... existing setup ...
  state.execution_mode = workflow.execution?.mode || 'sequential';
  
  if (state.execution_mode === 'graph') {
    return this.runGraphSteps(workflow, state);
  }
  return this.runSteps(workflow, state);
}

async resume(caseId: string): Promise<{ status: string }> {
  const workflow = this.caseStore.loadWorkflowSnapshot(caseId);
  const state = this.caseStore.readState(caseId);
  if (!state) throw new Error(`Case not found: ${caseId}`);
  
  // ... existing setup ...
  
  if (state.execution_mode === 'graph') {
    return this.runGraphSteps(workflow, state);
  }
  return this.runSteps(workflow, state);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/workflow-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/workflow/engine.ts tests/unit/workflow-engine.test.ts
git commit -m "feat: add graph execution with parallel branches and failure propagation"
```

---

## Phase 5: Resume and Polish

### Task 6: Add Graph Resume Test

**Files:**
- Test: `tests/integration/resume-graph.test.ts`

- [ ] **Step 1: Write test**

```typescript
// tests/integration/resume-graph.test.ts
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

describe('Graph Resume', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-graph-resume-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should resume graph after gate approval', async () => {
    const registry = new RunnerRegistry();
    registry.register(new EchoRunner());
    registry.register(new ManualGateRunner());
    const caseStore = new CaseStore(tempDir);
    const gateStore = new GateStore(caseStore);
    const bus = new InProcessEventBus();
    const engine = new WorkflowEngine(registry, caseStore, gateStore, bus);

    const workflow: WorkflowDefinition = {
      id: 'graph_gate',
      version: '0.1.0',
      execution: { mode: 'graph' },
      steps: [
        { id: 'setup', type: 'builtin', runner: 'echo', input: { message: 'setup' } },
        { id: 'approval', type: 'builtin', runner: 'manual_gate', depends_on: ['setup'], input: { message: 'approve?' } },
        { id: 'finalize', type: 'builtin', runner: 'echo', depends_on: ['approval'], input: { message: 'done' } },
      ],
    };

    // Execute — pauses at gate
    const result1 = await engine.execute('graph_case', workflow);
    expect(result1.status).toBe('paused');

    // Approve gate
    gateStore.approveGate('gate_graph_case_approval', 'user');

    // Resume
    const result2 = await engine.resume('graph_case');
    expect(result2.status).toBe('completed');

    const state = engine.getState('graph_case');
    expect(state?.completed_steps).toContain('setup');
    expect(state?.completed_steps).toContain('approval');
    expect(state?.completed_steps).toContain('finalize');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/integration/resume-graph.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/resume-graph.test.ts
git commit -m "test: add graph resume integration test"
```

---

## Phase 6: Examples and Final Verification

### Task 7: Add Graph Example Workflow

**Files:**
- Create: `examples/graph-ci.yaml`

- [ ] **Step 1: Create example**

```yaml
id: graph_ci
version: "0.1.0"
name: "Graph CI Example"

execution:
  mode: graph
  max_parallel: 2

steps:
  - id: install
    type: builtin
    runner: shell
    input:
      command: "echo 'Installing dependencies...'"

  - id: lint
    type: builtin
    runner: shell
    depends_on:
      - install
    input:
      command: "echo 'Running linter...'"

  - id: test
    type: builtin
    runner: shell
    depends_on:
      - install
    input:
      command: "echo 'Running tests...'"

  - id: report
    type: builtin
    runner: echo
    depends_on:
      - lint
      - test
    input:
      message: "CI pipeline complete"
```

- [ ] **Step 2: Commit**

```bash
git add examples/graph-ci.yaml
git commit -m "chore: add graph CI example workflow"
```

---

### Task 8: Run Full Test Suite

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Verify sequential regression**

Run: `npx vitest run tests/integration/resume.test.ts tests/unit/workflow-engine.test.ts`
Expected: PASS (MVP1B tests still pass)

- [ ] **Step 4: Manual test**

```bash
node dist/cli/index.js validate examples/graph-ci.yaml
node dist/cli/index.js run examples/graph-ci.yaml
node dist/cli/index.js cases list
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: MVP1C acceptance testing complete"
```

---

## Spec Coverage Check

| Spec Section | Implementing Task(s) |
|--------------|---------------------|
| ExecutionConfig schema (2.3) | Task 1 |
| execution_mode in state (6.1) | Task 2 |
| Graph builder/validator (3) | Task 3 |
| Config validator update (3.3) | Task 4 |
| Graph execution algorithm (4.2) | Task 5 |
| Parallelism / max_parallel (4.6, 9) | Task 5 |
| Failure propagation (4.4) | Task 5 |
| Gate behavior in graph (4.5) | Task 5 |
| Resume recomputation (5) | Task 6 |
| Example workflow | Task 7 |
| AC 1-14 | All tasks |

---

*Plan version: 0.1.0*
*Total tasks: 8*
*Estimated phases: 6*
