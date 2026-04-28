# Workflow Syntax Reference

Complete reference for Mr. Wolf workflow YAML files.

## Top-Level Fields

```yaml
id: my_workflow          # Required: unique workflow identifier
version: "0.1.0"         # Required: semantic version
name: "My Workflow"      # Optional: human-readable name
description: "..."       # Optional: what this workflow does

steps:                   # Required: array of steps (minimum 1)
  - ...
```

## Step Definition

```yaml
steps:
  - id: step_id                    # Required: unique within workflow
    type: builtin                  # Required: only "builtin" supported
    runner: echo | shell | manual_gate  # Required
    name: "Step Name"              # Optional
    description: "..."             # Optional
    input:                         # Optional: runner-specific input
      ...
    output: variable_name          # Optional: save result to variable
    depends_on: [step_a, step_b]   # Optional (MVP1C+): prerequisite steps
    timeout: "30s"                 # Optional: step timeout
    retry:                         # Optional: retry configuration
      max_attempts: 3
      delay: "1s"
      backoff: fixed | linear
    when:                          # Optional: execution condition
      ...
    artifact:                      # Optional: save output as file artifact
      path: "outputs/result.txt"
```

## Runners

### echo

Outputs a message. Returns the message as output.

```yaml
- id: greet
  type: builtin
  runner: echo
  input:
    message: "Hello, World!"
  output: greeting
```

**Input fields:**
- `message` (string): Text to output

### shell

Executes a shell command with basic safety checks.

```yaml
- id: list_files
  type: builtin
  runner: shell
  input:
    command: "ls -la"
  output: file_list
```

**Input fields:**
- `command` (string): Shell command to execute

**Security restrictions:**
- Blocked commands: `sudo`, `su`, `ssh`, `vim`, `nano`, `less`, `more`, `top`, `watch`
- Stdin is closed (no interactive commands)
- Max stdout/stderr: 1 MB each
- Timeout enforced by engine

### manual_gate

Pauses workflow for human approval.

```yaml
- id: approval
  type: builtin
  runner: manual_gate
  input:
    message: "Approve this action?"
```

**Gate lifecycle:**
1. Step executes → status: `gated`, gate created with status `pending`
2. User runs `wolf approve <gate_id>` → gate status: `approved`
3. User runs `wolf resume <case_id>` → step completes with `success`
4. Or user runs `wolf reject <gate_id>` → step fails, case fails

## Conditions (`when`)

Control whether a step executes based on variable values.

```yaml
when:
  var: variable_name
  exists: true | false

when:
  var: variable_name
  equals: "expected_value"

when:
  var: variable_name
  not_equals: "forbidden_value"

when:
  var: variable_name
  contains: "substring"
```

**Evaluation rules:**
- Evaluated after template interpolation, before step execution
- Missing variable + `exists: true` → condition false → step skipped
- Missing variable + `exists: false` → condition true → step executes
- No `when` block → step always executes
- All values compared as strings (numbers are coerced)

**Skip behavior:**
- Step status: `skipped`
- Not added to `completed_steps`
- Added to `skipped_steps`
- Event: `step.skipped` emitted
- Output variable NOT captured

## Retry Policy

Configure automatic retry for failing steps.

```yaml
retry:
  max_attempts: 3      # Default: 3, Range: 1-10
  delay: "1s"          # Default: "1s", Format: "100ms", "1s", "1m"
  backoff: fixed       # Options: fixed | linear
```

**Behavior:**
- Retry only applies when step result is `failure`
- NOT applied for: `success`, `gated`, `skipped`
- On retry: `step.retrying` event emitted
- Delay: `fixed` = constant, `linear` = delay × attempt_number
- After final failure: normal failure flow

## Timeout

Set maximum execution time for a step.

```yaml
timeout: "30s"   # Format: "100ms", "1s", "1m"
```

**Precedence** (highest to lowest):
1. Step-level `timeout` field
2. Runner-specific default
3. `wolf.yaml` default
4. Hardcoded engine default (60s)

On timeout: step fails with `TimeoutError`, not retryable.

## Artifacts

Save step output as a file artifact.

```yaml
artifact:
  path: "reports/build-report.txt"
```

**Behavior (MVP1B):**
- Only `output`-only artifacts supported
- `StepResult.output` is written to `.wolf/state/cases/<case_id>/artifacts/<path>`
- Path must be relative (no leading `/`, no `../`)
- Directory structure is preserved
- Event `artifact.created` emitted on success

## Template Interpolation

Use Mustache-style syntax in string values:

```yaml
input:
  message: "Hello, {{ variables.username }}!"
  command: "echo {{ variables.count }}"
```

**Rules:**
- Only `{{ variables.name }}` syntax supported
- Variables must exist (or step will fail with "Missing variable")
- Applied to all string fields in `input` recursively
- Coerces values to strings

## Validation Rules

Workflows are validated before execution:

1. **Schema validation** — all fields must match Zod schemas
2. **Duplicate step IDs** — each step must have unique `id`
3. **Duplicate output variables** — each `output` name must be unique
4. **Dependency references** — `depends_on` must reference existing steps (MVP1C+)
5. **Minimum steps** — workflow must have at least 1 step

Use `wolf validate <workflow.yaml>` to check without running.

## Complete Example

```yaml
id: comprehensive_demo
version: "0.1.0"
name: "Comprehensive Demo"

description: |
  Demonstrates conditions, retry, timeout,
  artifacts, and template interpolation.

steps:
  - id: setup
    type: builtin
    runner: echo
    input:
      message: "Starting comprehensive demo"
    output: setup_result

  - id: check_env
    type: builtin
    runner: shell
    input:
      command: "echo 'env_ok'"
    output: env_status

  - id: conditional_action
    type: builtin
    runner: echo
    when:
      var: env_status
      equals: "env_ok\n"
    input:
      message: "Environment check passed"

  - id: flaky_operation
    type: builtin
    runner: shell
    retry:
      max_attempts: 3
      delay: "500ms"
      backoff: linear
    timeout: "5s"
    input:
      command: "echo 'operation result'"
    output: op_result

  - id: save_report
    type: builtin
    runner: echo
    input:
      message: "Demo completed. Result: {{ variables.op_result }}"
    artifact:
      path: "reports/demo-report.txt"
    output: report_summary
```
