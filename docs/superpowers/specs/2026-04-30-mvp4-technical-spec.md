# MVP4: Agent Registry + Model Router — Technical Specification

## Overview

MVP4 adds declarative **Agent Registry** and deterministic **Model Router** to the Mr.Wolf framework. It prepares agent invocations but does **not** execute real model calls. That boundary belongs to MVP5.

**Status:** Planned  
**Goal:** Registry + Router foundation with agent runner stub  
**Tech Stack:** TypeScript, Zod, Commander.js, Vitest  
**In Scope:** Config schema, AgentRegistry, ModelRouter, AgentRunner stub, CLI, tests  
**Out of Scope:** Real LLM calls, streaming, tool calling, multi-agent delegation, memory, remote agents, MCP/A2A, cost tracking

---

## Architecture

```
wolf.yaml
  ├── agents[]         → AgentRegistry (validation, indexing, querying)
  ├── models.routes{}  → ModelRouter   (route resolution)
  └── policy.rules[]   → MVP3 PolicyStepGuard (pre-existing)

Workflow step:
  runner: agent
  input:
    agent: reviewer
    task: "Review current context bundle"
    context_bundle: ".wolf/context/context-bundle.json"

Execution flow:
  WorkflowEngine
    ├── PolicyStepGuard.evaluate(step)   [MVP3 — pre-existing]
    └── AgentRunner.run(step)
          ├── resolves agent from AgentRegistry
          ├── resolves model route from ModelRouter
          └── returns AgentInvocationPlan as JSON string
```

**Key rule:** AgentRunner does **not** call Policy Engine directly. PolicyStepGuard in WorkflowEngine already evaluates `runner: agent` before runner execution. Double evaluation would create duplicate gates and inconsistent behavior.

---

## 1. Config Schema

### 1.1 Agent Definition

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
```

**Fields:**

| Field          | Type     | Required | Description                      |
| -------------- | -------- | -------- | -------------------------------- |
| `id`           | string   | yes      | Unique identifier                |
| `name`         | string   | no       | Human-readable name              |
| `description`  | string   | no       | Purpose description              |
| `capabilities` | string[] | no       | Capability tags for matching     |
| `model_route`  | string   | yes      | Reference to models.routes entry |
| `tools`        | string[] | no       | Tool references (default: `[]`)  |

**Validation:**

- `id` must be unique across all agents
- `model_route` must reference an existing route in `models.routes`
- `capabilities` elements must be non-empty strings
- `tools` elements must be non-empty strings

### 1.2 Model Route

```yaml
models:
  routes:
    default_coding:
      provider: openai
      model: gpt-5.5-thinking
      purpose: coding
      max_tokens: 12000
```

**Fields:**

| Field        | Type   | Required | Description               |
| ------------ | ------ | -------- | ------------------------- |
| `provider`   | string | yes      | Provider name (non-empty) |
| `model`      | string | yes      | Model identifier          |
| `purpose`    | string | no       | Purpose tag               |
| `max_tokens` | number | no       | Token limit               |

**Validation:**

- Route keys (ids) must be unique
- `provider` must be non-empty string
- `model` must be non-empty string

**Provider type:** `provider: string` (non-empty). No enum restriction in MVP4 — extensible for future providers without schema changes.

### 1.3 ProjectConfig Extension

Add to `ProjectConfigSchema`:

```typescript
export const AgentDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  model_route: z.string(),
  tools: z.array(z.string()).default([]),
});

export const ModelRouteSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  purpose: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
});

export const ProjectConfigSchema = z.object({
  state_dir: z.string().default('.wolf/state'),
  index_path: z.string().optional(),
  context: ContextConfigSchema.default({}),
  policy: PolicyConfigSchema.default({}),
  agents: z.array(AgentDefinitionSchema).default([]),
  models: z
    .object({
      routes: z.record(ModelRouteSchema).default({}),
    })
    .default({ routes: {} }),
  defaults: z
    .object({
      timeout: z.string().default('30s'),
      max_parallel: z.number().int().positive().optional(),
      shell: z
        .object({
          max_output_size: z.string().default('1MB'),
          blocked_commands: z
            .array(z.string())
            .default(['sudo', 'su', 'ssh', 'vim', 'nano', 'less', 'more', 'top', 'watch']),
        })
        .optional(),
    })
    .default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function loadProjectConfig(path?: string): ProjectConfig {
  const configPath = path || 'wolf.yaml';

  if (!existsSync(configPath)) {
    return ProjectConfigSchema.parse({});
  }

  const content = readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(content);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid config file: ${configPath}`);
  }

  const config = ProjectConfigSchema.parse(parsed);
  validateCrossReferences(config);
  return config;
}

function validateCrossReferences(config: ProjectConfig): void {
  const routeIds = new Set(Object.keys(config.models.routes));
  const agentIds = new Set<string>();

  for (const agent of config.agents) {
    if (agentIds.has(agent.id)) {
      throw new Error(`Duplicate agent id: ${agent.id}`);
    }
    agentIds.add(agent.id);

    if (!routeIds.has(agent.model_route)) {
      throw new Error(`Agent '${agent.id}' references unknown model route '${agent.model_route}'`);
    }
  }
}

export class AgentRegistry {
  constructor(agents: AgentDefinition[]);

  get(id: string): AgentDefinition | undefined;
  require(id: string): AgentDefinition;
  list(): AgentDefinition[];
  findByCapability(capability: string): AgentDefinition[];
}
```

### 2.2 Behavior

- `get(id)` — returns agent or `undefined` (safe lookup)
- `require(id)` — returns agent or throws `AgentNotFound`
- `list()` — returns all agents
- `findByCapability(capability)` — returns agents with matching capability

### 2.3 Errors

```typescript
class AgentNotFound extends Error {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
  }
}
```

### 2.4 Indexing

Internal structure:

- `byId: Map<string, AgentDefinition>`
- `byCapability: Map<string, Set<string>>` (capability → set of agent ids)

---

## 3. ModelRouter

### 3.1 API

```typescript
export interface ModelRoute {
  provider: string;
  model: string;
  purpose?: string;
  max_tokens?: number;
}

export class ModelRouter {
  constructor(routes: Record<string, ModelRoute>);

  resolve(routeId: string): ModelRoute;
}
```

### 3.2 Errors

```typescript
class ModelRouteNotFound extends Error {
  constructor(routeId: string) {
    super(`Model route not found: ${routeId}`);
  }
}
```

### 3.3 Behavior

- `resolve(routeId)` — direct lookup by route id
- Missing route → throws `ModelRouteNotFound`
- No fallback chains
- No auto-assignment

**Rule:** MVP4 routing must be explicit, not magical.

---

## 4. AgentRunner

### 4.1 Workflow Step Format

```yaml
steps:
  - id: review
    runner: agent
    input:
      agent: reviewer
      input: 'Review current context bundle'
      context_bundle: '.wolf/context/context-bundle.json'
```

Uses existing `step.input` field (not `with`). `context_bundle` is optional.

### 4.2 AgentInvocationPlan Type

```typescript
export interface AgentInvocationPlan {
  type: 'agent_invocation_plan';
  agent_id: string;
  agent_name: string;
  model_route: string;
  provider: string;
  model: string;
  purpose?: string;
  max_tokens?: number;
  capabilities: string[];
  tools: string[];
  task: string;
  context_bundle?: string;
}
```

### 4.3 Execution

```typescript
class AgentRunner implements StepRunner {
  type = 'agent';

  constructor(
    private registry: AgentRegistry,
    private router: ModelRouter
  ) {}

  async run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult> {
    const agentId = step.input?.agent;
    if (!agentId || typeof agentId !== 'string') {
      return {
        status: 'failure',
        error: {
          type: 'AgentInputValidationError',
          message: 'Missing or invalid input.agent field',
          retryable: false,
        },
      };
    }

    const agent = this.registry.get(agentId);
    if (!agent) {
      return {
        status: 'failure',
        error: {
          type: 'AgentNotFound',
          message: `Agent not found: ${agentId}`,
          retryable: false,
        },
      };
    }

    const route = this.router.resolve(agent.model_route);

    const contextBundle = step.input?.context_bundle as string | undefined;
    if (contextBundle) {
      const validation = validateContextBundlePath(contextBundle, ctx.config.state_dir);
      if (!validation.valid) {
        return {
          status: 'failure',
          error: {
            type: 'ContextBundleValidationError',
            message: validation.reason,
            retryable: false,
          },
        };
      }
    }

    const plan: AgentInvocationPlan = {
      type: 'agent_invocation_plan',
      agent_id: agent.id,
      agent_name: agent.name || agent.id,
      model_route: agent.model_route,
      provider: route.provider,
      model: route.model,
      purpose: route.purpose,
      max_tokens: route.max_tokens,
      capabilities: agent.capabilities,
      tools: agent.tools,
      task: (step.input?.task as string) || '',
      context_bundle: contextBundle,
    };

    return {
      status: 'success',
      output: JSON.stringify(plan, null, 2),
    };
  }
}
```

### 4.4 Context Bundle Validation

If `context_bundle` is provided, validation must:

- Reject absolute paths (starting with `/`)
- Reject parent traversal (`..`)
- Resolve against project root (parent of `state_dir` or cwd)
- Ensure resolved path stays inside project root
- Check file exists at resolved path

```typescript
function validateContextBundlePath(path: string, stateDir: string): { valid: boolean; reason?: string } {
  if (path.startsWith('/')) {
    return { valid: false, reason: 'context_bundle must be a relative path' };
  }
  if (path.includes('..')) {
    return { valid: false, reason: 'context_bundle must not contain parent traversal' };
  }

  const projectRoot = dirname(stateDir);
  const resolved = resolve(projectRoot, path);
  if (!resolved.startsWith(projectRoot)) {
    return { valid: false, reason: 'context_bundle must be inside project root' };
  }
  if (!existsSync(resolved)) {
    return { valid: false, reason: `context_bundle not found: ${path}` };
  }

  return { valid: true };
}
```

### 4.5 Failure Modes

| Condition                        | Error Type                     |
| -------------------------------- | ------------------------------ |
| Missing or invalid `input.agent` | `AgentInputValidationError`    |
| Unknown agent id                 | `AgentNotFound`                |
| Unknown model route              | `ModelRouteNotFound`           |
| Invalid `context_bundle` path    | `ContextBundleValidationError` |
| Missing `context_bundle` file    | `ContextBundleValidationError` |

All failures return `StepResult` with `status: 'failure'` and typed error.

---

## 5. CLI Commands

### 5.1 `wolf agents list`

```bash
wolf agents list              # Text output
wolf agents list --json       # JSON output
```

Text output:

```
Agents (2):
  reviewer     Code Reviewer        route: default_coding
  planner      Planner              route: default_reasoning
```

### 5.2 `wolf agents inspect <id>`

```bash
wolf agents inspect reviewer         # Text output
wolf agents inspect reviewer --json  # JSON output
```

Text output:

```
Agent: reviewer
  Name: Code Reviewer
  Description: Reviews code and suggests changes
  Capabilities: code_review, test_analysis
  Tools: context.read
  Model Route: default_coding
  Provider: openai
  Model: gpt-5.5-thinking
```

Missing agent → exit code 1.

---

## 6. Integration Points

| Component            | Change              | Details                                             |
| -------------------- | ------------------- | --------------------------------------------------- |
| **ProjectConfig**    | Extend schema       | Add `agents` and `models` fields                    |
| **RunnerRegistry**   | Register new runner | `AgentRunner` with type `'agent'`                   |
| **Policy Engine**    | No changes needed   | `runner: agent` already matches via PolicyStepGuard |
| **Workflow Engine**  | No changes needed   | Standard runner interface                           |
| **Context Resolver** | No changes needed   | AgentRunner references bundle path only             |

---

## 7. Testing

### 7.1 Unit Tests

- AgentRegistry: get, require, list, findByCapability
- ModelRouter: resolve existing, reject missing
- AgentRunner: success path, missing agent, missing route, invalid context_bundle
- Config validation: unique ids, cross-reference, defaults

### 7.2 Integration Tests

- `wolf agents list` works
- `wolf agents inspect <id>` works
- `wolf agents inspect unknown-id` fails with exit 1
- Agent runner in sequential workflow
- Agent runner in graph workflow
- Policy rule matches `runner: agent`
- Missing model route fails step
- Missing agent fails step

---

## 8. Acceptance Criteria

1. `wolf.yaml` supports `agents` and `models.routes`.
2. Invalid agent/model config fails validation.
3. `wolf agents list` works (text + JSON).
4. `wolf agents inspect <id>` works (text + JSON).
5. `wolf agents inspect unknown-id` exits with code 1.
6. ModelRouter resolves routes deterministically by direct lookup.
7. AgentRegistry resolves by id and capability.
8. `runner: agent` resolves agent + model route and outputs invocation plan JSON.
9. Missing agent id fails step with `AgentNotFound`.
10. Missing model route fails step with `ModelRouteNotFound`.
11. Policy Engine can match `runner: agent`.
12. Agent runner works in sequential workflows.
13. Agent runner works in graph workflows.
14. No real provider calls are made.
15. Tests pass locally and in Docker.

---

## 9. Out of Scope

- Real LLM API calls
- Streaming responses
- Tool calling by agents
- Multi-agent delegation
- Memory / learning
- Remote agents
- MCP / A2A protocols
- Provider SDK integrations
- Cost tracking
- Prompt templates as full skill system
- Autonomous planning/execution loops
- Separate agent YAML files
- Agent inheritance/composition
- Hot reload
- Route fallback chains
- Dynamic routing
- Capability-based model selection

---

## 10. Future Direction

MVP4 designs types so separate files can be added later without changing AgentRegistry consumers. AgentRegistry receives already-loaded definitions, not filesystem discovery.

MVP5 will:

- Introduce real model execution
- Add provider SDK integrations
- Support streaming and tool calling
- Build on MVP4's AgentInvocationPlan

**Boundary:** MVP4 resolves and describes agent invocations. MVP5 executes real model calls.
