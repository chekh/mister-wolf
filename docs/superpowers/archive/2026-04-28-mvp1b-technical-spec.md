# Mr. Wolf MVP1B Technical Specification

**Enhanced Sequential Workflow Runner**

**Date:** 2026-04-28
**Status:** Draft
**Scope:** Workflow core enhancements (conditions, retry, artifacts, config, lifecycle)

---

## 1. Scope

### 1.1 In Scope

- Conditional step execution (`when` DSL)
- Step retry policy with backoff
- Engine-level timeout handling
- Simple artifact support
- Project configuration (`wolf.yaml`)
- Enhanced state machine (cancel, skip, retry statuses)
- Additional event types
- CLI improvements (`validate`, `cancel`, `--config`, `--json`)

### 1.2 Out of Scope (MVP1B)

| Feature                  | Target Milestone  |
| ------------------------ | ----------------- |
| `llm_call` runner        | MVP4/MVP5         |
| Parallel execution       | MVP1C             |
| Dependency graph sorting | MVP1C             |
| Policy engine            | MVP3              |
| Webhook runner           | After tool system |
| A2A / MCP                | MVP8              |
| Full artifact lifecycle  | MVP6              |

---

## 2. Architecture

### 2.1 New Components

```
src/
├── config/
│   └── project-config.ts     # wolf.yaml loader + defaults
├── workflow/
│   ├── conditions.ts         # When condition evaluator
│   └── engine.ts             # Enhanced (retry, timeout, skip)
├── state/
│   └── case-store.ts         # + writeArtifact()
└── cli/
    └── commands/
        └── validate.ts       # wolf validate workflow.yaml
```

### 2.2 Component Changes

| Component        | Change                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------- |
| `WorkflowEngine` | Add retry loop, timeout enforcement, condition check, artifact capture                 |
| `CaseStore`      | Add `writeArtifact()`, `cancelCase()`                                                  |
| `StepRunner`     | `run()` receives `ExecutionContext` with `timeoutMs`                                   |
| `EventBus`       | New event types: `step.skipped`, `step.retrying`, `artifact.created`, `case.cancelled` |
| `CLI`            | New commands: `validate`, `cases cancel`; flags: `--config`, `--json`                  |

---

## 3. Features

### 3.1 When Conditions

#### Syntax

```yaml
steps:
  - id: check_env
    type: builtin
    runner: shell
    input:
      command: 'test -f package.json'
    output: has_pkg

  - id: run_tests
    type: builtin
    runner: shell
    when:
      var: has_pkg
      equals: 'true' # string comparison after interpolation
    input:
      command: 'npm test'
```

#### Supported Operators

| Operator     | Description                                | Example                           |
| ------------ | ------------------------------------------ | --------------------------------- |
| `exists`     | Variable is defined and not null/undefined | `{ var: foo, exists: true }`      |
| `equals`     | String equality                            | `{ var: foo, equals: "bar" }`     |
| `not_equals` | String inequality                          | `{ var: foo, not_equals: "bar" }` |
| `contains`   | Substring match                            | `{ var: foo, contains: "err" }`   |

#### Evaluation Rules

- Conditions evaluated **after** template interpolation, **before** step execution
- Missing variable + `exists: true` → condition false → step skipped
- Missing variable + `exists: false` → condition true → step executes
- No `when` block → step always executes

#### Skip Behavior

- Step status: `skipped`
- Not added to `completed_steps`
- Added to `skipped_steps` (new field in ExecutionState)
- Event emitted: `step.skipped`
- Output variable NOT captured

### 3.2 Retry Policy

#### Syntax

```yaml
steps:
  - id: health_check
    type: builtin
    runner: shell
    retry:
      max_attempts: 3
      delay: '1s'
      backoff: linear # fixed | linear
    input:
      command: 'curl -s http://localhost:3000/health'
```

#### Schema

```typescript
const RetryPolicySchema = z.object({
  max_attempts: z.number().int().min(1).max(10).default(3),
  delay: z.string().default('1s'), // parse: "1s", "500ms", "1m"
  backoff: z.enum(['fixed', 'linear']).default('fixed'),
});
```

#### Behavior

- Retry applies only when step result is `failure`
- NOT applied for: `success`, `gated`, `skipped`
- On retry: emit `step.retrying` event with `{ attempt, max_attempts, reason }`
- After final failure: step gets `failure` status, normal failure flow
- Delay between attempts: `delay * attempt_number` for linear, `delay` for fixed

#### Engine Integration

```typescript
// Pseudocode for executeStep with retry
async executeStep(step, state) {
  const maxAttempts = step.retry?.max_attempts ?? 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await this.runSingleAttempt(step, state);

    if (result.status !== 'failure' || attempt === maxAttempts) {
      return result;
    }

    this.emit('step.retrying', { attempt, maxAttempts, reason: result.error });
    await sleep(calculateDelay(step.retry, attempt));
  }
}
```

### 3.3 Timeout Handling

#### Precedence (highest to lowest)

1. Step-level `timeout` field
2. Runner-specific default (e.g., shell default 30s)
3. `wolf.yaml` default
4. Hardcoded engine default (60s)

#### Syntax

```yaml
steps:
  - id: slow_step
    type: builtin
    runner: shell
    timeout: '10s'
    input:
      command: 'npm test'
```

#### wolf.yaml Default

```yaml
defaults:
  timeout: '30s'
```

#### Behavior

- Timeout enforced by engine, not runner
- Engine passes `timeoutMs` in `ExecutionContext`
- Runner responsible for respecting timeout (or engine kills after timeout)
- On timeout: step result = `failure`, error type = `TimeoutError`, retryable = false

### 3.4 Simple Artifacts (Output-Only)

MVP1B artifact support is intentionally minimal. Artifacts are always created from `StepResult.output`. Copying arbitrary files from workspace or runner temp directories is deferred to MVP6 (full Artifact System).

#### Syntax

```yaml
steps:
  - id: list_files
    type: builtin
    runner: shell
    input:
      command: 'ls -la'
    artifact:
      path: 'outputs/file-list.txt'
```

#### Behavior

- If `artifact.path` is specified and step succeeds, `StepResult.output` is written to `.wolf/state/cases/{case_id}/artifacts/{artifact.path}`
- Artifact path must be **relative** (no leading `/`, no `../`)
- Directory structure within `artifacts/` is preserved
- No lifecycle management (no cleanup, no schemas, no validation)
- Event emitted: `artifact.created` with `{ case_id, step_id, path }`

#### API

```typescript
// CaseStore
writeArtifact(
  caseId: string,
  stepId: string,
  artifactPath: string,
  content: Buffer | string
): void
```

### 3.5 wolf.yaml — Project Configuration

#### Location

- Root of project: `wolf.yaml`
- CLI flag: `--config path/to/config.yaml`

#### Schema

```yaml
# wolf.yaml
state_dir: '.wolf/state'

# Optional SQLite index path
index_path: '.wolf/state/wolf.sqlite'

defaults:
  timeout: '30s'

  shell:
    max_output_size: '1MB'
    blocked_commands:
      - sudo
      - su
      - ssh
      - vim
      - nano
      - less
      - more
      - top
      - watch

# Future: model configs, provider settings, etc.
```

#### Loading

```typescript
// src/config/project-config.ts
export interface ProjectConfig {
  state_dir: string;
  index_path?: string;
  defaults: {
    timeout?: string;
    shell?: {
      max_output_size?: string;
      blocked_commands?: string[];
    };
  };
}

export function loadProjectConfig(path?: string): ProjectConfig;
```

#### Defaults Resolution

```
Final Value = Step Value ?? wolf.yaml Default ?? Hardcoded Default
```

### 3.6 Enhanced State Machine

#### Case Statuses

| Status      | Description                     |
| ----------- | ------------------------------- |
| `pending`   | Created, not yet started        |
| `running`   | Currently executing             |
| `paused`    | Waiting for gate approval       |
| `completed` | All steps finished successfully |
| `failed`    | At least one step failed        |
| `cancelled` | Explicitly cancelled by user    |

#### Step Statuses

| Status     | Description                  |
| ---------- | ---------------------------- |
| `pending`  | Not yet reached              |
| `running`  | Currently executing          |
| `success`  | Completed successfully       |
| `failure`  | Failed (after all retries)   |
| `skipped`  | Condition evaluated to false |
| `gated`    | Waiting for approval         |
| `retrying` | Between retry attempts       |

#### ExecutionState Updates

```typescript
interface ExecutionState {
  // ... existing fields
  skipped_steps: string[]; // NEW
  step_statuses: Record<string, StepStatus>; // NEW: tracks per-step status
}
```

### 3.7 Cancel Command

#### CLI

```bash
wolf cases cancel <case_id>
```

#### Behavior

- Can cancel `running` or `paused` cases
- Sets case status = `cancelled`
- Current step (if running) gets `failure` status
- Remaining steps get `skipped` status
- Emits: `case.cancelled`
- Resume not allowed after cancel

#### Engine Method

```typescript
class WorkflowEngine {
  async cancel(caseId: string): Promise<void>;
}
```

### 3.8 New Event Types

| Event Type         | Payload                                                      |
| ------------------ | ------------------------------------------------------------ |
| `step.skipped`     | `{ case_id, step_id, reason: "condition_false", condition }` |
| `step.retrying`    | `{ case_id, step_id, attempt, max_attempts, reason }`        |
| `artifact.created` | `{ case_id, step_id, path }`                                 |
| `case.cancelled`   | `{ case_id, cancelled_by }`                                  |
| `step.timed_out`   | `{ case_id, step_id, timeout_ms }`                           |

---

## 4. CLI

### 4.1 New Commands

```bash
# Validate workflow without running
wolf validate workflow.yaml

# Cancel running/paused case
wolf cases cancel <case_id>

# Run with custom config
wolf run workflow.yaml --config wolf.yaml

# Inspect case as JSON
wolf cases inspect <case_id> --json

# Filter events by type
wolf events <case_id> --type step.retrying
```

### 4.2 Exit Codes

| Code | Meaning                     |
| ---- | --------------------------- | ----- |
| 0    | Success / completed         |
| 1    | Error (validation, runtime) |
| 2    | Paused (gate)               |
| 3    | Failed                      |
| 4    | Cancelled                   | # NEW |

---

## 5. Acceptance Criteria

| #   | Criteria                                | Test Strategy                                                           |
| --- | --------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Workflow supports `when` conditions     | Unit: condition evaluator. Integration: workflow with conditional steps |
| 2   | Skipped steps recorded in state/events  | Assert `skipped_steps` array, check events.jsonl                        |
| 3   | Retry policy works for failing commands | Shell runner with `exit 1`, retry 3x, assert attempts in events         |
| 4   | Retry attempts visible in events        | Parse events.jsonl, assert `step.retrying` entries                      |
| 5   | Step timeout at step level              | Shell with `sleep 10`, timeout `1s`, assert `TimeoutError`              |
| 6   | Simple artifacts written to artifacts/  | Workflow with artifact step, assert file exists                         |
| 7   | wolf.yaml provides runtime defaults     | Load config, assert defaults applied                                    |
| 8   | CLI validates workflow without running  | `wolf validate`, assert exit code 0/1                                   |
| 9   | Case cancellation works                 | `wolf cases cancel`, assert status=cancelled                            |
| 10  | All MVP1A behavior unchanged            | Run full MVP1A test suite, assert all pass                              |

---

## 6. File Changes

### 6.1 New Files

```
src/config/project-config.ts      # wolf.yaml loader
src/workflow/conditions.ts        # When evaluator
src/cli/commands/validate.ts      # wolf validate
```

### 6.2 Modified Files

```
src/types/workflow.ts             # + RetryPolicy, Condition, Artifact
src/types/state.ts                # + skipped_steps, step_statuses
src/types/events.ts               # + new event types
src/workflow/engine.ts            # + retry, timeout, conditions, cancel
src/workflow/runners/shell.ts     # + respect ExecutionContext.timeoutMs
src/state/case-store.ts           # + writeArtifact(), cancelCase()
src/cli/commands/run.ts           # + --config flag
src/cli/commands/cases.ts         # + cancel, --json
src/cli/index.ts                  # + validate command
```

---

## 7. Post-MVP1B Roadmap

| Milestone | Features                                                          |
| --------- | ----------------------------------------------------------------- |
| **MVP1C** | Parallel execution, dependency graph, fallback paths, subworkflow |
| **MVP2**  | Context resolver, project file discovery, context bundle          |
| **MVP3**  | Policy engine (allow/ask/deny), tool risk model, approval rules   |
| **MVP4**  | Agent registry, agent definitions, prompt fragments               |
| **MVP5**  | Model router, providers, fallback chains, cost tracking           |
| **MVP6**  | Full artifact system (lifecycle, schemas, validators)             |
| **MVP8**  | A2A / MCP integration                                             |

---

## 8. Risks & Mitigations

| Risk                            | Mitigation                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Timeout handling complexity     | Keep simple: engine passes timeoutMs, runner respects it                     |
| Retry loop + gate interaction   | Retry only on failure, not on gated. Gate takes precedence                   |
| Condition evaluator scope creep | Hard limit: 4 operators only. No expression language                         |
| wolf.yaml schema expansion      | Strict Zod schema, reject unknown keys                                       |
| Artifact path traversal         | Normalize paths, reject `../` and absolute paths                             |
| Artifact source ambiguity       | MVP1B supports output-only artifacts. External file copying deferred to MVP6 |

---

_Spec version: 0.1.0_
_Next step: Implementation plan_
