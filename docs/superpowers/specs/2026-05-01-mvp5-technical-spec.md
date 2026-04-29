# MVP5: Model Provider Runtime — Technical Specification

## Overview

MVP5 adds real model execution to the Mr.Wolf framework. It builds on MVP4's AgentInvocationPlan stub and introduces a `ModelProvider` abstraction with a deterministic `MockProvider` for tests and an optional `OpenAIProvider` for real LLM calls.

**Status:** Planned  
**Goal:** Execute single agent model invocation through a provider adapter  
**Tech Stack:** TypeScript, Zod, Commander.js, Vitest  
**In Scope:** Provider interface, registry, MockProvider, OpenAIProvider (optional), AgentRunner invoke mode, context reading, error taxonomy  
**Out of Scope:** Streaming, tool calling, function calling, multi-agent delegation, planner/executor loops, memory writes, vector retrieval, cost tracking, model fallback chains, provider load balancing, MCP/A2A, background jobs, human chat UI

---

## Architecture

```
wolf.yaml
  ├── agents[]              → AgentRegistry (MVP4)
  ├── models.execution{}    → Execution mode (NEW)
  ├── models.routes{}       → ModelRouter (MVP4) + new fields
  └── policy.rules[]        → PolicyStepGuard (MVP3)

Execution flow:
  WorkflowEngine
    ├── PolicyStepGuard.evaluate(step)   [MVP3 — pre-existing]
    └── AgentRunner.run(step)
          ├── resolves agent + route
          ├── resolves execution mode
          ├── if stub → returns AgentInvocationPlan (MVP4 behavior)
          └── if invoke → executes model via ProviderRegistry
                    ├── provider = registry.require(route.provider)
                    ├── request = build ModelInvocationRequest
                    ├── result = await provider.invoke(request)
                    └── returns AgentModelResult JSON
```

**Key rule:** PolicyStepGuard runs **before** AgentRunner. Provider invocation happens only after policy `allow` or approved `ask`. AgentRunner orchestrates; ModelProvider executes.

---

## 1. Config Schema

### 1.1 Execution Mode

```yaml
models:
  execution:
    mode: stub  # stub | invoke

  routes:
    default_coding:
      provider: mock
      model: mock-chat
      execution_mode: invoke  # optional override
      temperature: 0.7
      system_prompt: "You are a code reviewer."
```

**Execution mode resolution:**
1. If `route.execution_mode` is set, use it
2. Else use `models.execution.mode`
3. If neither is set, default to `stub`

**Rule:** Execution mode is resolved from config, not inferred at runtime.

### 1.2 Extended ModelRoute

Add to existing `ModelRouteSchema`:

```typescript
export const ModelRouteSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  purpose: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  execution_mode: z.enum(['stub', 'invoke']).optional(),
  system_prompt: z.string().optional(),
});
```

**New fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `temperature` | number (0–2) | no | Sampling temperature |
| `execution_mode` | `stub` \| `invoke` | no | Override global execution mode |
| `system_prompt` | string | no | System prompt for the model |

### 1.3 AgentDefinition Extension

Add `system_prompt` to `AgentDefinitionSchema`:

```typescript
export const AgentDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  model_route: z.string(),
  tools: z.array(z.string()).default([]),
  system_prompt: z.string().optional(),
});
```

### 1.4 ProjectConfig Extension

Add `models.execution` to `ProjectConfigSchema`:

```typescript
export const ModelsConfigSchema = z.object({
  execution: z
    .object({
      mode: z.enum(['stub', 'invoke']).default('stub'),
    })
    .default({ mode: 'stub' }),
  routes: z.record(ModelRouteSchema).default({}),
});
```

---

## 2. ModelProvider Interface

### 2.1 Core Types

```typescript
export interface ModelInvocationRequest {
  provider: string;
  model: string;
  input: string;
  system_prompt?: string;
  context?: string;
  max_tokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelInvocationResult {
  output: string;
  provider: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  raw?: unknown;
}

export interface ModelProvider {
  id: string;
  invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult>;
}
```

**Note:** `ModelInvocationResult.raw` contains the full provider response for debugging. It is **not** included in `AgentModelResult` or persisted to `StepResult.output` in MVP5.

### 2.2 Provider Error Taxonomy

```typescript
export class ProviderNotFound extends Error {
  constructor(providerId: string) {
    super(`Provider not found: ${providerId}`);
  }
}

export class ProviderAuthError extends Error {
  constructor(providerId: string) {
    super(`Provider authentication failed: ${providerId}`);
  }
}

export class ProviderRequestError extends Error {
  constructor(providerId: string, message: string) {
    super(`Provider request error (${providerId}): ${message}`);
  }
}

export class ProviderNetworkError extends Error {
  constructor(providerId: string) {
    super(`Provider network error: ${providerId}`);
  }
}

export class ContextReadError extends Error {
  constructor(path: string, reason: string) {
    super(`Context read error (${path}): ${reason}`);
  }
}
```

**Retryable mapping:**

| Error | Retryable |
|-------|-----------|
| `ProviderNotFound` | `false` |
| `ProviderAuthError` | `false` |
| `ProviderRequestError` | `false` |
| `ProviderNetworkError` | `true` |
| `ContextReadError` | `false` |

---

## 3. ModelProviderRegistry

### 3.1 API

```typescript
export class ModelProviderRegistry {
  constructor(providers: ModelProvider[]);
  get(id: string): ModelProvider | undefined;
  require(id: string): ModelProvider;
  list(): ModelProvider[];
}
```

### 3.2 Behavior

- `get(id)` — returns provider or `undefined`
- `require(id)` — returns provider or throws `ProviderNotFound`
- `list()` — returns all registered providers

### 3.3 Default Registration

Default provider registry always includes:
- `MockProvider` — required, registered unconditionally
- `OpenAIProvider` — registered normally; checks `OPENAI_API_KEY` at invocation time

---

## 4. MockProvider

### 4.1 Behavior

**Required** for all deterministic CI tests.

Deterministic output (no randomness, no timestamps):

```typescript
class MockProvider implements ModelProvider {
  id = 'mock';

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    const inputTokens = estimateTokens(request.input);
    const contextTokens = request.context ? estimateTokens(request.context) : 0;
    const outputTokens = estimateTokens(`[mock:${request.model}] Received ${inputTokens} tokens.`);

    return {
      output: `[mock:${request.model}] ${request.input.slice(0, 200)}${request.input.length > 200 ? '...' : ''}`,
      provider: this.id,
      model: request.model,
      usage: {
        input_tokens: inputTokens + contextTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + contextTokens + outputTokens,
      },
    };
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

**Rules:**
- Output contains `[mock:<model>]` prefix
- Output truncates input to 200 chars
- Usage tokens are approximated (chars / 4)
- No randomness, no timestamps, no external state

---

## 5. OpenAIProvider

### 5.1 Behavior

**Implemented in MVP5.** Tests requiring real API calls are **not** part of CI.

**Requirements:**
- Requires `OPENAI_API_KEY` environment variable
- If `OPENAI_API_KEY` is missing:
  - Throw `ProviderAuthError`
  - `retryable: false`
  - Do **not** silently skip

**HTTP Error Mapping:**

| HTTP Status | Error Type | Retryable |
|-------------|------------|-----------|
| 401, 403 | `ProviderAuthError` | `false` |
| 400, 404 | `ProviderRequestError` | `false` |
| 429, 500, 502, 503, 504 | `ProviderNetworkError` | `true` |
| Fetch failure | `ProviderNetworkError` | `true` |

**Implementation notes:**
- Use `fetch` API (Node.js 20+ has native fetch)
- Base URL: `https://api.openai.com/v1/chat/completions`
- Map `ModelInvocationRequest` to OpenAI chat completion format
- Map response to `ModelInvocationResult`
- Do not include `raw` response in `AgentModelResult`

---

## 6. AgentRunner Invoke Mode

### 6.1 Execution Mode Resolution

```typescript
function resolveExecutionMode(
  route: ModelRoute,
  globalMode: 'stub' | 'invoke'
): 'stub' | 'invoke' {
  return route.execution_mode ?? globalMode ?? 'stub';
}
```

### 6.2 Stub Mode

Returns `AgentInvocationPlan` JSON (MVP4 behavior preserved).

### 6.3 Invoke Mode

**Step 0: Validate task**

```typescript
const task = step.input?.task;
if (!task || typeof task !== 'string' || task.trim().length === 0) {
  return {
    status: 'failure',
    error: {
      type: 'AgentInputValidationError',
      message: 'Missing or empty input.task field in invoke mode',
      retryable: false,
    },
  };
}
```

**Step 1: Build ModelInvocationRequest**

```typescript
const request: ModelInvocationRequest = {
  provider: route.provider,
  model: route.model,
  input: task,
  system_prompt: (step.input?.system_prompt as string | undefined)
    ?? agent.system_prompt
    ?? route.system_prompt,
  context: contextBundleContent,  // if context_bundle provided
  max_tokens: route.max_tokens,
  temperature: route.temperature,
};
```

**Step 2: Resolve provider**

```typescript
const provider = providerRegistry.require(route.provider);
```

**Step 3: Invoke**

```typescript
const result = await provider.invoke(request);
```

**Step 4: Return AgentModelResult**

```typescript
const modelResult: AgentModelResult = {
  type: 'agent_model_result',
  agent_id: agent.id,
  agent_name: agent.name || agent.id,
  model_route: agent.model_route,
  provider: route.provider,
  model: route.model,
  output: result.output,
  usage: result.usage,
};

return {
  status: 'success',
  output: JSON.stringify(modelResult, null, 2),
};
```

### 6.4 AgentModelResult Type

```typescript
export interface AgentModelResult {
  type: 'agent_model_result';
  agent_id: string;
  agent_name: string;
  model_route: string;
  provider: string;
  model: string;
  output: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}
```

### 6.5 Context Bundle Reading

If `context_bundle` is provided:

1. Validate path (MVP4 guards: relative, no traversal, inside project root, exists)
2. Check file size ≤ 1MB (1,048,576 bytes). Exceeding limit → `ContextReadError` with `retryable: false`
3. Read file:
   - `.md` → read as UTF-8 text
   - `.json` → parse JSON, then `JSON.stringify(value, null, 2)`
   - Other → read as UTF-8 text
4. Invalid JSON → `ContextReadError` with `retryable: false`
5. Pass content as `context` in `ModelInvocationRequest`

### 6.6 Failure Modes

| Condition | Error Type | Retryable |
|-----------|-----------|-----------|
| Missing or invalid `input.agent` | `AgentInputValidationError` | `false` |
| Unknown agent id | `AgentNotFound` | `false` |
| Unknown model route | `ModelRouteNotFound` | `false` |
| Unknown provider | `ProviderNotFound` | `false` |
| Missing API key | `ProviderAuthError` | `false` |
| Network error | `ProviderNetworkError` | `true` |
| Invalid request | `ProviderRequestError` | `false` |
| Invalid context bundle path | `ContextBundleValidationError` | `false` |
| Invalid context bundle JSON | `ContextReadError` | `false` |

---

## 7. Integration Points

| Component | Change | Details |
|-----------|--------|---------|
| **AgentRunner** | Extend | Add invoke mode, provider registry, context reading |
| **ProjectConfig** | Extend | Add `models.execution.mode` and route fields |
| **Policy Engine** | No changes | PolicyStepGuard still runs before AgentRunner |
| **Workflow Engine** | No changes | Standard runner interface, retry applies to provider errors |
| **CLI** | No changes | Agent commands from MVP4 remain |

---

## 8. Testing

### 8.1 Unit Tests

- MockProvider: deterministic output, usage tokens, no randomness
- ModelProviderRegistry: get, require, list
- AgentRunner stub mode: returns AgentInvocationPlan (MVP4 behavior)
- AgentRunner invoke mode: returns AgentModelResult
- AgentRunner route override: stub overrides global invoke
- AgentRunner global invoke: calls MockProvider
- Unknown provider: ProviderNotFound
- Context bundle reading: .md, .json, invalid JSON
- Context bundle size limit: exceeds 1MB fails
- Task validation: empty task in invoke mode fails
- OpenAIProvider missing key: ProviderAuthError
- OpenAIProvider HTTP error mapping: 401/403/429/5xx

### 8.2 Integration Tests

- Global stub → AgentInvocationPlan
- Global invoke → MockProvider call
- Route stub overrides global invoke
- Route invoke overrides global stub
- Missing provider → failure
- Policy deny prevents provider invocation
- Policy ask gate prevents provider invocation until approved
- Context bundle passed to provider
- Context bundle size limit enforced
- Empty task in invoke mode fails before provider call

---

## 9. Acceptance Criteria

1. `wolf.yaml` supports `models.execution.mode`.
2. `wolf.yaml` supports route-level `execution_mode`, `temperature`, `system_prompt`.
3. `wolf.yaml` supports `agent.system_prompt`.
4. Global stub returns MVP4 `AgentInvocationPlan`.
5. Global invoke calls `MockProvider`.
6. Route-level invoke overrides global stub.
7. Route-level stub overrides global invoke.
8. Unknown provider fails with `ProviderNotFound`.
9. OpenAI route without `OPENAI_API_KEY` fails with `ProviderAuthError`.
10. `context_bundle` content is passed to `ModelInvocationRequest.context`.
11. Invalid/missing `context_bundle` fails before provider invocation.
12. Context bundle exceeding 1MB fails with `ContextReadError`.
13. Empty `task` in invoke mode fails with `AgentInputValidationError`.
14. Policy ask/deny prevents provider invocation.
15. Provider errors integrate with existing retry behavior.
16. MockProvider output is deterministic.
17. OpenAI HTTP errors map correctly (401/403 → auth, 429/5xx → network).
18. No streaming, tool-calling, or multi-agent behavior introduced.
19. Tests pass locally and in Docker.

---

## 10. Out of Scope

- Streaming responses
- Tool calling / function calling
- Multi-agent delegation
- Planner/executor loops
- Memory writes
- Vector retrieval
- Cost tracking / budgets
- Model fallback chains
- Provider load balancing
- MCP / A2A protocols
- Background jobs
- Human chat UI
- Dynamic provider discovery
- Plugin system

---

## 11. Future Direction

MVP6 may add:
- Tool calling by agents
- Streaming responses
- Multi-agent delegation
- Memory / learning
- Provider fallback chains
- Cost tracking

**Boundary:** MVP5 calls one model once. MVP6 adds tools, streaming, and multi-agent behavior.
