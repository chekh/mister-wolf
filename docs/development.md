# Development Guide

This guide covers how to set up the Mr. Wolf development environment, run checks, and use Docker for reproducible builds.

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+ (comes with Node.js)
- **Docker** (optional, for containerized builds)

## Local Node.js Workflow

This is the primary development workflow. Direct Node.js usage is fully supported and recommended for day-to-day development.

### Installation

```bash
git clone https://github.com/chekh/mister-wolf.git
cd mister-wolf
npm install
```

### Running Checks

The unified check command runs all verification steps in sequence:

```bash
npm run check
```

This executes:

1. `npm run format:check` — verify Prettier formatting
2. `npm run lint` — TypeScript type checking (`tsc --noEmit`)
3. `npm run test:run` — run the Vitest test suite
4. `npm run build` — compile TypeScript to `dist/`

### Individual Commands

| Command                | Description                                |
| ---------------------- | ------------------------------------------ |
| `npm run format`       | Auto-format all source files with Prettier |
| `npm run format:check` | Check formatting without modifying files   |
| `npm run lint`         | Type-check with TypeScript                 |
| `npm run test:run`     | Run all tests once                         |
| `npm run test`         | Run tests in watch mode                    |
| `npm run build`        | Compile TypeScript to `dist/`              |
| `npm run dev`          | Compile in watch mode                      |

### Running the CLI Locally

After building:

```bash
node dist/cli/index.js --help
node dist/cli/index.js validate examples/hello-world.yaml
node dist/cli/index.js run examples/hello-world.yaml
```

## Docker Workflow (Optional)

Docker is supported as a standard reproducible environment for:

- Running checks in a clean environment
- Safer shell-runner experiments (isolated from host)
- CI/CD pipelines
- Demos and onboarding

Docker is **not required** for normal development. The Node.js workflow above is the primary path.

### Build Targets

The `Dockerfile` provides multi-stage builds:

| Target    | Purpose                               | Command                                                 |
| --------- | ------------------------------------- | ------------------------------------------------------- |
| `base`    | Install dependencies and copy source  | `docker build --target base ...`                        |
| `test`    | Run `npm run check`                   | `docker build --target test -t mister-wolf:test .`      |
| `build`   | Compile the project                   | `docker build --target build ...`                       |
| `runtime` | Production image with compiled output | `docker build --target runtime -t mister-wolf:latest .` |

### Running Checks in Docker

```bash
docker build --target test -t mister-wolf:test .
docker run --rm mister-wolf:test
```

### Running the CLI from Docker

```bash
docker build --target runtime -t mister-wolf:latest .
docker run --rm mister-wolf:latest run examples/hello-world.yaml
```

### Docker Compose

For development convenience:

```bash
# Run all checks in a container with your local source mounted
docker compose run --rm wolf

# Open an interactive shell in the container
docker compose run --rm shell
```

The `shell` service mounts your local directory, so you can iterate without rebuilding the image.

## Context Resolver

The Context Resolver (MVP2) builds a structured context bundle from project files and case memory. It is used to provide agents with relevant project context.

### Commands

```bash
# Dry-run scan — shows metadata without writing files
node dist/cli/index.js context scan [--scenario <id>] [--json]

# Full build — scans, resolves, and writes bundle + markdown
node dist/cli/index.js context build [--scenario <id>] [--json]
```

### Pipeline

1. **Scanner** — discovers project files using `include`/`exclude` globs from `wolf.yaml`
2. **CaseMemoryReader** — reads historical case data from `.wolf/state/cases/`
3. **Resolver** — classifies files into groups (files, docs, rules, configs) and applies scenario overrides
4. **BundleBuilder** — assembles the final `ContextBundle` JSON structure
5. **MdGenerator** — renders a human-readable markdown summary

### Configuration

Add a `context` section to `wolf.yaml`:

```yaml
context:
  include:
    - src/**/*
    - tests/**/*
    - docs/**/*.md
    - README.md
  exclude:
    - node_modules/**
    - dist/**
    - .git/**
  limits:
    max_files: 100
    max_bytes: 10485760
    max_file_bytes: 1048576
    max_cases: 10
  scenarios:
    - id: dev
      match:
        keywords: [develop, debug]
      context:
        include:
          - src/**/*.ts
        limits:
          max_files: 50
```

### Output

- `.wolf/context/context-bundle.json` — structured JSON bundle
- `.wolf/context/context.md` — human-readable markdown summary

## Policy Engine

The Policy Engine (MVP3) enforces governance rules over workflow execution. It evaluates each step against configurable policy rules and can allow, ask for approval, or deny execution.

### Commands

```bash
# Check workflow against policy before running
node dist/cli/index.js policy check <workflow.yaml>

# Output report as JSON
node dist/cli/index.js policy check <workflow.yaml> --json
```

### Behavior

1. **Preflight check** — before a workflow runs, the policy engine evaluates every step against the configured rules. If any step is denied, the entire workflow is rejected before execution begins.
2. **Step guard** — during execution, each step is evaluated again at runtime. This ensures policy decisions respect the current context.
3. **Policy gates** — when a rule decides `ask`, a policy approval gate is created. The workflow pauses until the gate is approved (`wolf approve <gate_id>`) or rejected (`wolf reject <gate_id>`). Approving allows the step to execute; rejecting fails the step and the workflow.

### Configuration

Add a `policy` section to `wolf.yaml`:

```yaml
policy:
  defaults:
    enabled: true
    autonomy: supervised
    max_risk: high
  rules:
    - id: deny_shell
      match:
        runner: shell
      decision: deny
      reason: Shell runner is not allowed in this environment
    - id: ask_destructive
      match:
        command_contains:
          - rm
          - drop
      decision: ask
      risk: high
      reason: Destructive commands require manual approval
    - id: allow_echo
      match:
        runner: echo
      decision: allow
      reason: Echo runner is safe
```

### Rule Matching

Rules match steps by:

- `runner` — the builtin runner name (`echo`, `shell`, `manual_gate`)
- `step_id` — exact step identifier
- `command_contains` — substring matches in the shell command input

### Decision Precedence

When multiple rules match, precedence is:

1. **Deny** (highest priority)
2. **Ask**
3. **Allow**

If no rules match, the default decision is **allow**. The `max_risk` setting can automatically upgrade an `allow` to `ask` when a step's risk exceeds the configured threshold.

## Agent Registry

The Agent Registry (MVP4) provides declarative agent definitions and deterministic model routing. It prepares agent invocations as structured plans but does **not** execute real LLM calls — that boundary belongs to MVP5.

### Configuration

Add `agents` and `models.routes` to `wolf.yaml`:

```yaml
agents:
  - id: reviewer
    name: Code Reviewer
    description: Reviews code and suggests changes
    capabilities:
      - code_review
      - test_analysis
    model_route: default_coding
    tools:
      - context.read

models:
  routes:
    default_coding:
      provider: openai
      model: gpt-5.5-thinking
      purpose: coding
      max_tokens: 12000
```

**Agent fields:**

| Field          | Type     | Required | Description                      |
| -------------- | -------- | -------- | -------------------------------- |
| `id`           | string   | yes      | Unique identifier                |
| `name`         | string   | no       | Human-readable name              |
| `description`  | string   | no       | Purpose description              |
| `capabilities` | string[] | no       | Capability tags for matching     |
| `model_route`  | string   | yes      | Reference to `models.routes` key |
| `tools`        | string[] | no       | Tool references                  |

**Model route fields:**

| Field        | Type   | Required | Description               |
| ------------ | ------ | -------- | ------------------------- |
| `provider`   | string | yes      | Provider name (non-empty) |
| `model`      | string | yes      | Model identifier          |
| `purpose`    | string | no       | Purpose tag               |
| `max_tokens` | number | no       | Token limit               |

### CLI Commands

```bash
# List all configured agents
node dist/cli/index.js agents list
node dist/cli/index.js agents list --json

# Inspect a specific agent (includes resolved model route)
node dist/cli/index.js agents inspect reviewer
node dist/cli/index.js agents inspect reviewer --json
```

### Using the Agent Runner in Workflows

Use `runner: agent` in workflow steps:

```yaml
steps:
  - id: review
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: 'Review current context bundle'
      context_bundle: '.wolf/context/context-bundle.json'
```

**Input fields:**

| Field            | Type   | Required | Description                               |
| ---------------- | ------ | -------- | ----------------------------------------- |
| `agent`          | string | yes      | Agent id from registry                    |
| `task`           | string | no       | Task description passed to the agent      |
| `context_bundle` | string | no       | Relative path to context bundle JSON file |

The agent runner resolves the agent definition and model route, then outputs an `AgentInvocationPlan` as a JSON string. No real LLM call is made in MVP4.

### Policy Rules for Agent Runner

The Policy Engine (MVP3) already supports `runner: agent` through step guard matching. Example policy rules:

```yaml
policy:
  rules:
    - id: ask_agent_review
      match:
        runner: agent
      decision: ask
      risk: high
      reason: Agent invocations require approval
    - id: deny_unknown_agents
      match:
        step_id: review
      decision: deny
      reason: Only specific steps are allowed
```

Policy decisions (allow / ask / deny) work the same way for `runner: agent` as for any other runner. The Agent Runner does **not** call the Policy Engine directly — evaluation happens in the WorkflowEngine via PolicyStepGuard before the runner executes.

## Model Provider Runtime

The Model Provider Runtime (MVP5) adds real LLM execution to the Agent Runner. It supports two execution modes and includes a deterministic MockProvider for testing.

### Execution Modes

Configure the global execution mode in `wolf.yaml`:

```yaml
models:
  execution:
    mode: stub # stub | invoke
```

- **stub** — Returns an `AgentInvocationPlan` JSON without calling any provider (MVP4 behavior)
- **invoke** — Calls the configured provider and returns an `AgentModelResult` JSON

Routes can override the global mode:

```yaml
models:
  routes:
    default_coding:
      provider: mock
      model: mock-chat
      execution_mode: invoke # Overrides global mode for this route
```

### MockProvider

The built-in `MockProvider` is deterministic and requires no API keys. It is always registered and is ideal for CI tests.

```yaml
models:
  routes:
    test_route:
      provider: mock
      model: mock-chat
```

MockProvider output format: `[mock:<model>] <input truncated to 200 chars>`

### OpenAIProvider

The `OpenAIProvider` calls the OpenAI API. It requires the `OPENAI_API_KEY` environment variable.

```yaml
models:
  routes:
    openai_route:
      provider: openai
      model: gpt-4
      temperature: 0.7
      system_prompt: 'You are a helpful assistant.'
```

If `OPENAI_API_KEY` is missing, the provider throws `ProviderAuthError`.

### Context Bundle Usage

In invoke mode, pass a context bundle to the agent:

```yaml
steps:
  - id: review
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: 'Review the codebase'
      context_bundle: '.wolf/context/context.md'
```

The runner reads the bundle file and passes it as `context` in the `ModelInvocationRequest`. Supported formats:

- `.md` — read as UTF-8 text
- `.json` — parsed and stringified with indentation

### Example Workflow with Invoke Mode

```yaml
id: agent_invoke_demo
version: '0.1.0'

steps:
  - id: ask_agent
    type: builtin
    runner: agent
    input:
      agent: helper
      task: 'Explain the project structure'
```

With `models.execution.mode: invoke` and a mock route, this calls the MockProvider and returns a structured result with output and usage statistics.

## CI

GitHub Actions runs on every PR and push to `main` / `dev`:

- **Node.js checks**: `npm run check` on Ubuntu with Node.js 20
- **Docker checks**: build test image and run `npm run check` inside it

See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) for details.

## Troubleshooting

### `better-sqlite3` build fails

Native compilation requires Python, make, and a C++ compiler. These are installed automatically in Docker. Locally:

- **macOS**: Install Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: Install `build-essential` and `python3`
- **Windows**: Use WSL2 or Docker

### Prettier formatting issues

Run `npm run format` before committing. If CI fails on formatting, it means some files were not formatted.

### Tests fail in Docker but pass locally

Some tests (e.g., shell runner timeout) rely on process signal behavior that may differ between host OS and Docker. The project is configured to handle these differences. If you encounter issues:

1. Check that your Docker version supports `detached: true` for process groups
2. Ensure the Docker daemon has sufficient resources (RAM/CPU)
3. Run `docker compose run --rm wolf` to test in the standard environment

## Agent Tool Calling (MVP6)

### Overview

Agents can request tool execution during their steps. Each agent step supports at most one tool call, followed by a final model invocation to process the result.

### Built-in Tools

- `context.read` — reads existing `.wolf/context/context.md` (or custom path). Does not rebuild context.

### Agent Configuration

```yaml
agents:
  - id: reviewer
    tools:
      - context.read
```

### Execution Flow

1. AgentRunner invokes model with available tools (Pass 1)
2. If model requests tool call:
   - Validate against agent allow-list
   - Evaluate policy
   - Execute tool via ToolExecutor
   - Invoke model with tool result (Pass 2)
3. Return final AgentModelResult

### Tool Calling Modes

- **Invoke mode**: Tool calling active
- **Stub mode**: Returns AgentInvocationPlan (no tool execution)

### Policy Integration

Policy rules can match by `tool_id` or `tool_risk`:

```yaml
policy:
  rules:
    - id: allow-context-read
      match:
        tool_id: context.read
      decision: allow
      risk: low
      reason: 'Context read is safe'
```

## MVP7: Streaming Model Responses (2026-05-01)

**Goal:** Stream model responses in real-time to provide visible progress during long-running agent tasks.

**What changed:**

- Added streaming callback types (`ModelStreamStart`, `ModelStreamChunk`, `ModelStreamCallbacks`)
- Extended `ModelProvider` with optional `invokeStream` method
- Added `ProviderStreamingUnsupported` and `StreamingToolCallUnsupported` errors
- Added `streaming` config field (global `models.execution.streaming` + per-route `route.streaming`)
- Implemented `MockProvider.invokeStream` for deterministic test streaming
- Implemented `OpenAIProvider.invokeStream` with SSE parsing
- Extended `AgentRunner` with streaming path (validates provider, emits events, returns final output)
- Added CLI TTY stream event subscription (prints chunks only when stdout is TTY)
- Added `getStepResult` to `CaseStore` for step result retrieval
- Added `bus?: EventBus` to `ExecutionContext` for event emission from runners

**How it works:**

- `AgentRunner.runInvoke` resolves `streaming` from config
- If streaming=true: calls `validateStreaming()` → `provider.invokeStream()` → emits chunk events → returns final `StepResult`
- If streaming=false: uses existing `invoke()` path
- Chunk events are published via the event bus (`model.stream.started`, `model.stream.chunk`, `model.stream.completed`, `model.stream.failed`)
- CLI subscribes to these events and prints chunks only when `process.stdout.isTTY`

**Streaming rules:**

- Only text streaming is supported (tool streaming out of scope for MVP7)
- Streaming with tools enabled throws `StreamingToolCallUnsupported`
- Missing `invokeStream` on provider throws `ProviderStreamingUnsupported`
- `[DONE]` is the terminal SSE marker in OpenAI streaming
- Final output is always a complete string, never accumulated via mutation

**Tests:**

- `tests/unit/mock-provider-streaming.test.ts` — 4 tests
- `tests/unit/openai-provider-streaming.test.ts` — 4 tests
- `tests/unit/agent-runner-streaming.test.ts` — 4 tests
- `tests/integration/mvp7-streaming.test.ts` — 6 tests
- Total: 18 new tests (254 total)

**Usage:**

```yaml
models:
  execution:
    mode: invoke
    streaming: true
  routes:
    openai-gpt4:
      provider: openai
      model: gpt-4
      streaming: true
```
