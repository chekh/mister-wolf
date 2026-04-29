# Mr. Wolf

<p align="center">
  <img src="./docs/Mr.%20Wolf.png" alt="Mr. Wolf" width="400" />
</p>

> **"I solve problems."**
>
> Universal adaptive agent framework. Single entry point that determines what you need and executes scenarios.

## Status

| Milestone | Status         | Description                                                                                                        |
| --------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **MVP1A** | ✅ Complete    | Sequential workflow runner with YAML workflows, builtin runners (echo, shell, manual_gate), state persistence, CLI |
| **MVP1B** | ✅ Complete    | Enhanced workflow engine with conditions, retry, timeout, artifacts, project config, cancel/validate commands      |
| **MVP1C** | ✅ Complete    | Graph orchestration — DAG execution, parallel scheduling, transitive failure propagation                           |
| **MVP2**  | ✅ Complete    | Context resolver — deterministic project file discovery, context bundle, case memory                               |
| **MVP3**  | ✅ Complete    | Policy engine — rule-based workflow preflight, step runtime guard, policy gates, risk levels, CLI                  |
| **MVP4**  | 🔄 In Progress | Agent registry + model router                                                                                      |
| **MVP5**  | ⏭️ Next        | Real LLM execution, provider SDK integration                                                                       |

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
version: '0.1.0'
name: 'My First Workflow'

steps:
  - id: greet
    type: builtin
    runner: echo
    input:
      message: 'Hello from Mr. Wolf!'

  - id: check_system
    type: builtin
    runner: shell
    input:
      command: 'uname -a'
    output: system_info

  - id: conditional_step
    type: builtin
    runner: echo
    when:
      var: system_info
      contains: 'Darwin'
    input:
      message: 'Running on macOS'
```

Run it:

```bash
node dist/cli/index.js run my-workflow.yaml
```

## Workflow Syntax

### Built-in Runners

| Runner        | Description               | Example Input             |
| ------------- | ------------------------- | ------------------------- |
| `echo`        | Outputs a message         | `{ message: "hello" }`    |
| `shell`       | Executes a shell command  | `{ command: "ls -la" }`   |
| `manual_gate` | Pauses for human approval | `{ message: "Approve?" }` |

### Step Properties

```yaml
steps:
  - id: unique_step_id # Required
    type: builtin # Required
    runner: echo | shell | manual_gate # Required
    name: 'Human-readable name' # Optional
    description: 'What this step does' # Optional
    input: # Optional, runner-specific
      message: 'Hello'
    output: variable_name # Optional, saves result to variables
    depends_on: [step_a] # Optional (MVP1C+)
    timeout: '30s' # Optional, step timeout
    retry: # Optional, retry policy
      max_attempts: 3
      delay: '1s'
      backoff: fixed | linear
    when: # Optional, condition
      var: variable_name
      equals: 'expected_value'
    artifact: # Optional, save output as artifact
      path: 'outputs/result.txt'
```

### Condition Operators

| Operator     | Description         | Example                           |
| ------------ | ------------------- | --------------------------------- |
| `exists`     | Variable is defined | `{ var: foo, exists: true }`      |
| `equals`     | String equality     | `{ var: foo, equals: "bar" }`     |
| `not_equals` | String inequality   | `{ var: foo, not_equals: "bar" }` |
| `contains`   | Substring match     | `{ var: foo, contains: "err" }`   |

### Graph Mode (MVP1C)

Run steps in parallel using a dependency graph:

```yaml
execution:
  mode: graph
  max_parallel: 3

steps:
  - id: fetch_a
    type: builtin
    runner: echo
    input:
      message: 'Fetching A'

  - id: fetch_b
    type: builtin
    runner: echo
    input:
      message: 'Fetching B'

  - id: process
    type: builtin
    runner: echo
    depends_on: [fetch_a, fetch_b]
    input:
      message: 'Processing results'
```

- Steps with no `depends_on` run in parallel (up to `max_parallel`)
- Steps wait for all dependencies to succeed
- Fail-fast: if a step fails, running steps finish but no new steps start
- Transitive dependents are automatically skipped on failure

### Project Configuration (`wolf.yaml`)

Create `wolf.yaml` in your project root:

```yaml
state_dir: '.wolf/state'

defaults:
  timeout: '30s'
  shell:
    max_output_size: '1MB'
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

# Policy engine
wolf policy check <workflow.yaml> [--json]

# Context resolver
wolf context scan [--scenario <id>] [--json]
wolf context build [--scenario <id>] [--json]

# Agent registry
wolf agents list [--json]
wolf agents inspect <id> [--json]
```

### Exit Codes

| Code | Meaning                     |
| ---- | --------------------------- |
| 0    | Success / completed         |
| 1    | Error (validation, runtime) |
| 2    | Paused (gate)               |
| 3    | Failed                      |
| 4    | Cancelled                   |

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
├── Context Resolver   # Project file discovery, bundle builder, case memory
└── SQLite Index       # Optional fast queries over file storage
```

## Examples

See [`examples/`](./examples/) directory:

- [`hello-world.yaml`](./examples/hello-world.yaml) — Basic workflow with echo, shell, and manual gate
- [`gate-workflow.yaml`](./examples/gate-workflow.yaml) — Approval workflow demonstration
- [`retry-and-conditions.yaml`](./examples/retry-and-conditions.yaml) — Conditions, retry, and artifacts (MVP1B)
- [`shell-error.yaml`](./examples/shell-error.yaml) — Error handling example
- [`duplicate-output.yaml`](./examples/duplicate-output.yaml) — Validation error example
- [`graph-demo.yaml`](./examples/graph-demo.yaml) — Parallel execution with dependency graph (MVP1C)

## Development

### Local Node.js Workflow (Primary)

```bash
# Install dependencies
npm install

# Run all checks (format, type check, tests, build)
npm run check

# Individual commands
npm run format       # Format code with Prettier
npm run lint         # Type check with TypeScript
npm run test:run     # Run tests once
npm run test         # Run tests in watch mode
npm run build        # Compile TypeScript
npm run dev          # Watch mode build
```

### Docker Workflow (Optional)

Docker provides a reproducible environment for testing, CI, and safer shell-runner experiments. It is **not required** for normal development.

```bash
# Build and run all checks in Docker
docker build --target test -t mister-wolf:test .
docker run --rm mister-wolf:test

# Build runtime image
docker build --target runtime -t mister-wolf:latest .

# Run CLI from runtime image
docker run --rm mister-wolf:latest run examples/hello-world.yaml

# Docker Compose for development
docker compose run --rm wolf   # Run all checks
docker compose run --rm shell  # Interactive shell in container
```

### CI

All PRs and pushes to `main` / `dev` run:

- Format check (`prettier --check`)
- Type check (`tsc --noEmit`)
- Tests (`vitest run`)
- Build (`tsc`)
- Docker build and test

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

_Mr. Wolf solves problems. One workflow at a time._
