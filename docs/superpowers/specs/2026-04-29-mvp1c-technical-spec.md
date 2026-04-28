# Mr. Wolf MVP1C Technical Specification

**Graph Orchestration**

**Date:** 2026-04-29
**Status:** Draft
**Scope:** DAG-based workflow execution with parallel branches

---

## 1. Scope

### 1.1 In Scope

- DAG validation (unknown deps, circular deps)
- Topological sorting for execution order
- Graph execution mode (`execution.mode: graph`)
- Ready-queue based step scheduling
- `max_parallel` configuration with precedence
- Dependency-aware failure propagation
- Resume for graph mode (recompute ready queue)
- Graph execution events and state
- Example workflows and tests

### 1.2 Out of Scope

| Feature | Target | Reason |
|---------|--------|--------|
| Subworkflow | MVP1D | Too complex: nested state, event correlation, variable scoping |
| Fallback paths | MVP1D | Complicates graph semantics |
| Dynamic graph mutation | Later | Runtime graph changes require robust checkpointing |
| Distributed execution | MVP8+ | Remote workers, network partitions |
| Matrix jobs | Later | Combinatorial step expansion |
| CLI `--max-parallel` flag | Later | Keep MVP1C focused on graph engine |

---

## 2. Workflow Syntax

### 2.1 Sequential Remains Default

Workflows without `execution` block use sequential execution (MVP1A/B behavior):

```yaml
id: simple
version: "0.1.0"

steps:
  - id: one
    type: builtin
    runner: echo
    input:
      message: one

  - id: two
    type: builtin
    runner: echo
    input:
      message: two
```

### 2.2 Graph Mode

Explicit opt-in via `execution.mode: graph`:

```yaml
id: ci_graph
version: "0.1.0"

execution:
  mode: graph
  max_parallel: 4

steps:
  - id: install
    type: builtin
    runner: shell
    input:
      command: npm install

  - id: lint
    type: builtin
    runner: shell
    depends_on:
      - install
    input:
      command: npm run lint

  - id: test
    type: builtin
    runner: shell
    depends_on:
      - install
    input:
      command: npm test

  - id: report
    type: builtin
    runner: echo
    depends_on:
      - lint
      - test
    input:
      message: "CI complete"
```

### 2.3 Schema Changes

```typescript
// Add to WorkflowDefinitionSchema
const ExecutionConfigSchema = z.object({
  mode: z.enum(['sequential', 'graph']).default('sequential'),
  max_parallel: z.number().int().min(1).default(1),
});

// Update WorkflowDefinitionSchema
export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  execution: ExecutionConfigSchema.optional(),
  steps: z.array(StepDefinitionSchema).min(1),
});
```

### 2.4 `depends_on` Changes

In graph mode:
- `depends_on` is **required** for ordering (no implicit sequential order)
- Steps without `depends_on` are **root steps** (run first)
- Future dependencies are **allowed** (graph sorting handles order)
- In sequential mode: `depends_on` remains validation-only (MVP1A/B behavior)

---

## 3. Graph Validation

### 3.1 Validation Rules

| Check | Error | MVP1C Action |
|-------|-------|--------------|
| Unknown dependency | `depends_on` references non-existent step | Reject |
| Circular dependency | Cycle in dependency graph | Reject |
| Duplicate step ID | Same `id` used twice | Reject (existing) |
| Disconnected steps | Step has no deps and no dependents | Allow (root step) |

### 3.2 Validator Changes

```typescript
// In src/config/validator.ts
function validateGraph(workflow: WorkflowDefinition): ValidationResult {
  const stepIds = new Set(workflow.steps.map(s => s.id));
  const graph = new Map<string, string[]>();

  // Build adjacency list
  for (const step of workflow.steps) {
    graph.set(step.id, step.depends_on || []);
    
    // Check unknown dependencies
    for (const depId of step.depends_on || []) {
      if (!stepIds.has(depId)) {
        errors.push(`Step ${step.id} depends_on unknown step: ${depId}`);
      }
    }
  }

  // Check circular dependencies via DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();
  
  function hasCycle(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    
    for (const dep of graph.get(node) || []) {
      if (!visited.has(dep) && hasCycle(dep)) return true;
      if (recStack.has(dep)) return true;
    }
    
    recStack.delete(node);
    return false;
  }

  for (const stepId of graph.keys()) {
    if (!visited.has(stepId) && hasCycle(stepId)) {
      errors.push(`Circular dependency detected involving: ${stepId}`);
    }
  }

  // Note: disconnected steps are allowed (they're root steps)
}
```

### 3.3 Sequential Mode Validation

Sequential mode keeps existing MVP1B validation:
- `depends_on` only references past steps (index-based)
- No cycles possible by construction

---

## 4. Execution Model

### 4.1 Sequential Mode (Default)

Unchanged from MVP1B:
- Steps execute in array order
- `depends_on` validated but not used for scheduling
- One step at a time

### 4.2 Graph Mode

**Algorithm:**

```
1. Build dependency graph from workflow.steps
2. Identify root steps (no depends_on)
3. Add root steps to ready queue
4. While ready queue not empty or steps running:
   a. Start ready steps up to max_parallel
   b. Wait for any step to complete
   c. On step completion:
      - If success: add newly-ready dependents to queue
      - If failure: mark dependents as skipped (dependency_failed)
      - If gated: pause workflow
   d. If all steps done → workflow completed/failed
```

### 4.3 Step Readiness

A step is **ready** when:
1. All dependencies have `status === 'success'`
2. Condition (`when`) passes
3. Workflow/case not paused/failed/cancelled

A step is **blocked** when:
1. Any dependency has `status !== 'success'` (pending, running, etc.)
2. Will be evaluated again when dependencies change

### 4.4 Failure Propagation

```
If step fails:
  1. Mark step status = 'failure'
  2. For each dependent step:
     a. Mark status = 'skipped'
     b. Skip reason = 'dependency_failed'
     c. Emit step.skipped event
  3. Workflow status = 'failed'
```

### 4.5 Parallelism

```typescript
interface ParallelConfig {
  max_parallel: number; // workflow > wolf.yaml > default(1)
}
```

Engine maintains:
- `readyQueue: string[]` — steps ready to run
- `runningSet: Set<string>` — currently executing steps
- Never persist readyQueue (recompute on resume)

---

## 5. Resume in Graph Mode

### 5.1 Algorithm

```
1. Load workflow snapshot
2. Load persisted ExecutionState
3. Recompute dependency graph
4. Scan all steps:
   - completed/success → done
   - skipped → done
   - failed → done, check if workflow failed
   - gated → check gate status
     - pending → remain paused
     - approved → mark success, add dependents to ready
     - rejected → mark failure, propagate
   - pending → check if ready (all deps success)
5. Start all ready steps up to max_parallel
```

### 5.2 Key Principle

**Ready queue is never persisted.** It is always recomputed from:
- Workflow snapshot (dependency graph)
- `ExecutionState.step_statuses` (source of truth)

---

## 6. State Changes

### 6.1 ExecutionState Updates

```typescript
interface ExecutionState {
  // Existing fields
  case_id: string;
  workflow_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  current_step_id?: string;
  completed_steps: string[];
  failed_steps: string[];
  skipped_steps: string[];
  step_results: Record<string, StepResult>;
  step_statuses: Record<string, StepStatus>;
  variables: Record<string, unknown>;
  gates: Record<string, GateState>;
  started_at: string;
  updated_at: string;
  
  // MVP1C additions
  execution_mode: 'sequential' | 'graph';
}
```

### 6.2 New Step Status

```typescript
type StepStatus = 
  | 'pending'     // Not yet evaluated
  | 'ready'       // Dependencies met, waiting for slot
  | 'running'     // Currently executing
  | 'success'     // Completed successfully
  | 'failure'     // Failed
  | 'skipped'     // Skipped (condition or dependency failure)
  | 'gated'       // Waiting for approval
  | 'retrying'    // Between retry attempts
  | 'blocked';    // Dependencies not yet met
```

---

## 7. Events

### 7.1 New Event Types

| Event Type | When | Payload |
|------------|------|---------|
| `workflow.graph.started` | Graph execution begins | `{ mode: 'graph', max_parallel }` |
| `step.ready` | Step becomes ready | `{ step_id }` |
| `step.blocked` | Step blocked by dependency | `{ step_id, blocked_by: string[] }` |
| `step.dependency_failed` | Step skipped due to failed dependency | `{ step_id, failed_dependency }` |

### 7.2 Event Emission Rules

- `step.ready` — emitted when step moves from 'pending' to 'ready'
- `step.started` — emitted when step begins execution (moved from ready to running)
- `step.blocked` — optional, for debugging
- Existing events (`step.completed`, `step.failed`, etc.) remain unchanged

---

## 8. CLI Changes

### 8.1 No Breaking Changes

Sequential workflows work exactly as before.

### 8.2 New Inspect View

```bash
wolf cases inspect <case_id> --graph
```

Shows graph execution view:
```
STEP        STATUS      DEPS        OUTPUT
install     success     -           -
lint        success     install     -
test        failed      install     exit 1
report      skipped     lint, test  dependency_failed
```

### 8.3 Validate Graph

```bash
wolf validate graph-workflow.yaml
```

Validates:
- Schema
- Graph structure (no cycles, no unknown deps)

---

## 9. `max_parallel` Configuration

### 9.1 Precedence

```
workflow.execution.max_parallel
  > wolf.yaml defaults.max_parallel
    > hardcoded default (1)
```

### 9.2 wolf.yaml Update

```yaml
defaults:
  timeout: "30s"
  max_parallel: 2
  shell:
    max_output_size: "1MB"
```

### 9.3 Engine Integration

```typescript
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

---

## 10. Architecture

### 10.1 New Components

```
src/
├── workflow/
│   ├── graph.ts           # Graph builder, validator, sorter
│   └── engine.ts          # Enhanced (sequential + graph modes)
```

### 10.2 Component Changes

| Component | Change |
|-----------|--------|
| `WorkflowEngine` | Add graph execution path, ready queue, running set |
| `validateWorkflow` | Add graph validation (cycles, unknown deps) |
| `WorkflowDefinitionSchema` | Add `execution` block |
| `ExecutionStateSchema` | Add `execution_mode` |
| `StepStatus` | Add 'pending', 'ready', 'blocked' |

### 10.3 Graph Module

```typescript
// src/workflow/graph.ts

export interface DependencyGraph {
  nodes: Set<string>;
  edges: Map<string, string[]>; // step_id -> dependencies
  roots: string[]; // steps with no dependencies
}

export function buildGraph(workflow: WorkflowDefinition): DependencyGraph;
export function validateGraph(workflow: WorkflowDefinition): ValidationResult;
export function getReadySteps(graph: DependencyGraph, statuses: Record<string, StepStatus>): string[];
export function getDependents(graph: DependencyGraph, stepId: string): string[];
```

---

## 11. Acceptance Criteria

| # | Criteria | Test |
|---|----------|------|
| 1 | `execution.mode: graph` enables DAG execution | Integration test |
| 2 | Graph validator rejects circular dependencies | Unit test |
| 3 | Graph validator rejects unknown dependencies | Unit test |
| 4 | Future dependencies allowed in graph mode | Unit test |
| 5 | Engine executes ready steps in dependency order | Integration test |
| 6 | Independent branches run in parallel up to max_parallel | Integration test |
| 7 | Dependent step runs only after all deps succeed | Integration test |
| 8 | Failed dependency skips downstream steps | Integration test |
| 9 | Sequential workflows unchanged | Run full MVP1B test suite |
| 10 | Resume recomputes ready queue | Integration test |
| 11 | Resume handles approved gate in graph | Integration test |
| 12 | max_parallel precedence: workflow > wolf.yaml > default | Unit test |
| 13 | Example graph workflow passes | Manual test |
| 14 | `wolf validate` checks graph structure | Integration test |

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Race conditions in parallel execution | Use async/await with Promise.allSettled, never shared mutable state |
| Memory leak with large graphs | Limit max_parallel, clear running set after completion |
| Resume complexity | Ready queue always recomputed, never persisted |
| Step status inconsistency | `step_statuses` is single source of truth, validate on load |
| Sequential mode regression | Keep sequential path separate, run full test suite |

---

## 13. Post-MVP1C Roadmap

| Milestone | Features |
|-----------|----------|
| **MVP1D** | Subworkflow, fallback paths, dynamic graph |
| **MVP2** | Context resolver, project file discovery |
| **MVP3** | Policy engine, governance layer |
| **MVP4–5** | Agent registry, model router |

---

*Spec version: 0.1.0*
*Next step: Implementation plan*
