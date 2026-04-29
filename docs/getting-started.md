# Getting Started with Mr. Wolf

This guide will walk you through installing Mr. Wolf and running your first workflow.

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ or **pnpm** / **yarn**

## Installation

### From Source

```bash
git clone https://github.com/chekh/mister-wolf.git
cd mister-wolf
npm install
npm run build
```

### Link for Global Access

```bash
npm link
# Now you can use `wolf` command globally
wolf --help
```

## Your First Workflow

Create a file named `hello.yaml`:

```yaml
id: hello
version: "0.1.0"

steps:
  - id: greet
    type: builtin
    runner: echo
    input:
      message: "Hello, World!"
```

Validate and run:

```bash
wolf validate hello.yaml
wolf run hello.yaml
```

## Understanding Workflows

A workflow is a YAML file that defines a sequence of steps. Each step:

1. Has a unique `id`
2. Uses a `runner` to execute logic
3. Can produce output saved to `variables`
4. Can have conditions (`when`) to control execution

### Variables and Output

Steps can save their output to variables that later steps can reference:

```yaml
steps:
  - id: get_name
    type: builtin
    runner: echo
    input:
      message: "Alice"
    output: username

  - id: greet_user
    type: builtin
    runner: echo
    input:
      message: "Hello, {{ variables.username }}!"
```

### Template Interpolation

Use `{{ variables.name }}` in string values to reference variables:

```yaml
input:
  message: "Processing {{ variables.filename }}..."
  command: "wc -l {{ variables.filepath }}"
```

## Working with Cases

When you run a workflow, Mr. Wolf creates a **case** — a unique instance of that workflow execution.

### Case Lifecycle

```
pending → running → [paused | completed | failed | cancelled]
```

### Inspecting Cases

```bash
# List all cases
wolf cases list

# List only failed cases
wolf cases list --status failed

# Inspect a specific case
wolf cases inspect case_abc123

# View events for a case
wolf cases inspect case_abc123 --events

# Export case state as JSON
wolf cases inspect case_abc123 --json
```

### State Storage

Cases are stored in `.wolf/state/cases/<case_id>/`:

- `state.json` — Current execution state
- `events.jsonl` — Append-only event log
- `workflow.yaml` — Immutable workflow snapshot
- `outputs/` — Step stdout/stderr files
- `artifacts/` — Artifact files (MVP1B+)

## Gates and Approvals

Use `manual_gate` runner to pause workflow for human approval:

```yaml
steps:
  - id: deploy_request
    type: builtin
    runner: manual_gate
    input:
      message: "Approve deployment to production?"

  - id: deploy
    type: builtin
    runner: shell
    input:
      command: "./deploy.sh"
```

Run the workflow, then approve:

```bash
wolf run workflow.yaml
# Workflow pauses, prints gate ID
wolf approve gate_case_xyz_deploy_request
wolf resume case_xyz
```

## Project Configuration

Create `wolf.yaml` in your project root for defaults:

```yaml
state_dir: ".wolf/state"

defaults:
  timeout: "30s"
  shell:
    max_output_size: "1MB"
```

## Graph Mode

Run steps in parallel by defining a dependency graph:

```yaml
id: parallel_demo
version: "0.1.0"
execution:
  mode: graph
  max_parallel: 2

steps:
  - id: task_a
    type: builtin
    runner: echo
    input:
      message: "Task A"

  - id: task_b
    type: builtin
    runner: echo
    input:
      message: "Task B"

  - id: combine
    type: builtin
    runner: echo
    depends_on: [task_a, task_b]
    input:
      message: "Combined result"
```

- `mode: graph` enables DAG-based scheduling
- `max_parallel` limits concurrent execution
- `depends_on` specifies prerequisite steps

## Next Steps

- Learn [workflow syntax](../workflow-syntax.md) in detail
- Explore [CLI commands](../cli-reference.md)
- Read the [full concept](../concept.md) (Russian)
- Check [examples](../../examples/)
