# Mr. Wolf

<p align="center">
  <img src="./docs/Mr.%20Wolf.png" alt="Mr. Wolf" width="400" />
</p>

> **"I solve problems."**
>
> Universal adaptive agent framework. Single entry point that determines what you need and executes scenarios.

## Status

| Milestone | Status | Description |
|-----------|--------|-------------|
| **MVP1A** | ✅ Complete | Sequential workflow runner with YAML workflows, builtin runners (echo, shell, manual_gate), state persistence, CLI |
| **MVP1B** | ✅ Complete | Enhanced workflow engine with conditions, retry, timeout, artifacts, project config, cancel/validate commands |
| **MVP1C** | 🔄 Planned | Graph orchestration — dependency graph, parallel branches, fallback paths, subworkflow |
| **MVP2** | 📋 Planned | Context resolver — project file discovery, context bundle, case memory |
| **MVP3** | 📋 Planned | Governance layer — policy engine, tool risk model, approval rules |
| **MVP4–5** | 📋 Planned | Agent registry + model router |

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/chekh/mister-wolf.git
cd mister-wolf

# Install dependencies
npm install

# Build the project
npm run build
```

### Run a Workflow

```bash
# Validate a workflow before running
node dist/cli/index.js validate examples/hello-world.yaml

# Run a workflow
node dist/cli/index.js run examples/hello-world.yaml

# List cases
node dist/cli/index.js cases list

# Inspect a case with JSON output
node dist/cli/index.js cases inspect <case_id> --json
```

### Write Your First Workflow

Create `my-workflow.yaml`:

```yaml
id: my_first_workflow
version: "0.1.0"
name: "My First Workflow"

steps:
  - id: greet
    type: builtin
    runner: echo
    input:
      message: "Hello from Mr. Wolf!"

  - id: check_system
    type: builtin
    runner: shell
    input:
      command: "uname -a"
    output: system_info

  - id: conditional_step
    type: builtin
    runner: echo
    when:
      var: system_info
      contains: "Darwin"
    input:
      message: "Running on macOS"
```

Run it:

```bash
node dist/cli/index.js run my-workflow.yaml
```

## Workflow Syntax

### Built-in Runners

| Runner | Description | Example Input |
|--------|-------------|---------------|
| `echo` | Outputs a message | `{ message: "hello" }` |
| `shell` | Executes a shell command | `{ command: "ls -la" }` |
| `manual_gate` | Pauses for human approval | `{ message: "Approve?" }` |

### Step Properties

```yaml
steps:
  - id: unique_step_id          # Required
    type: builtin               # Required
    runner: echo | shell | manual_gate  # Required
    name: "Human-readable name" # Optional
    description: "What this step does"  # Optional
    input:                       # Optional, runner-specific
      message: "Hello"
    output: variable_name        # Optional, saves result to variables
    depends_on: [step_a]         # Optional (MVP1C+)
    timeout: "30s"              # Optional, step timeout
    retry:                       # Optional, retry policy
      max_attempts: 3
      delay: "1s"
      backoff: fixed | linear
    when:                        # Optional, condition
      var: variable_name
      equals: "expected_value"
    artifact:                    # Optional, save output as artifact
      path: "outputs/result.txt"
```

### Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `exists` | Variable is defined | `{ var: foo, exists: true }` |
| `equals` | String equality | `{ var: foo, equals: "bar" }` |
| `not_equals` | String inequality | `{ var: foo, not_equals: "bar" }` |
| `contains` | Substring match | `{ var: foo, contains: "err" }` |

### Project Configuration (`wolf.yaml`)

Create `wolf.yaml` in your project root:

```yaml
state_dir: ".wolf/state"

defaults:
  timeout: "30s"
  shell:
    max_output_size: "1MB"
    blocked_commands:
      - sudo
      - su
```

Use it:

```bash
node dist/cli/index.js run workflow.yaml --config wolf.yaml
```

## CLI Reference

```bash
# Workflow commands
wolf run <workflow.yaml> [--config <path>]
wolf resume <case_id>
wolf validate <workflow.yaml>

# Case management
wolf cases list [--status <status>]
wolf cases inspect <case_id> [--events] [--json]
wolf cases cancel <case_id>

# Gate management
wolf gates list [--case <case_id>]
wolf approve <gate_id>
wolf reject <gate_id>

# Event inspection
wolf events <case_id> [--type <event_type>]
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success / completed |
| 1 | Error (validation, runtime) |
| 2 | Paused (gate) |
| 3 | Failed |
| 4 | Cancelled |

## Architecture

```
Mr. Wolf
├── CLI Layer          # Commander.js entry point
├── Workflow Engine    # Sequential execution, state machine
├── Runner Registry    # Pluggable step runners
│   ├── echo           # Simple output
│   ├── shell          # Shell commands with basic safety checks
│   └── manual_gate    # Human approval gates
├── State Store        # File-based persistence (JSON + JSONL)
│   ├── Case Store     # Case metadata + workflow snapshot
│   ├── Gate Store     # Gate lifecycle
│   └── Artifact Store # Output artifacts
├── Event Bus          # In-process pub/sub
├── Config System      # YAML loader + Zod validation
└── SQLite Index       # Optional fast queries over file storage
```

## Examples

See [`examples/`](./examples/) directory:

- [`hello-world.yaml`](./examples/hello-world.yaml) — Basic workflow with echo, shell, and manual gate
- [`gate-workflow.yaml`](./examples/gate-workflow.yaml) — Approval workflow demonstration
- [`retry-and-conditions.yaml`](./examples/retry-and-conditions.yaml) — Conditions, retry, and artifacts (MVP1B)
- [`shell-error.yaml`](./examples/shell-error.yaml) — Error handling example
- [`duplicate-output.yaml`](./examples/duplicate-output.yaml) — Validation error example

## Development

```bash
# Run tests
npm run test:run

# Run tests in watch mode
npm run test

# Type check
npm run lint

# Build
npm run build

# Watch mode build
npm run dev
```

## Documentation

- [`docs/getting-started.md`](./docs/getting-started.md) — Detailed quick start guide
- [`docs/workflow-syntax.md`](./docs/workflow-syntax.md) — Complete workflow YAML reference
- [`docs/cli-reference.md`](./docs/cli-reference.md) — Full CLI command reference
- [`docs/concept.md`](./docs/concept.md) — Full framework concept (Russian, comprehensive)
- [`docs/superpowers/specs/`](./docs/superpowers/specs/) — Technical specifications
- [`docs/superpowers/plans/`](./docs/superpowers/plans/) — Implementation plans

## License

MIT © 2026 chekh

---

*Mr. Wolf solves problems. One workflow at a time.*
