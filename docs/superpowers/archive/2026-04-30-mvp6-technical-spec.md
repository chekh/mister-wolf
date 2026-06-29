# MVP6: Agent Tool Calling — Technical Specification

## Overview

MVP6 adds agent-level tool calling to the Mr.Wolf framework. Building on MVP5's model invocation runtime, it introduces a `ToolExecutor` abstraction layer that allows models to request tool execution during agent steps. Each agent step supports at most one tool call, followed by an optional final model invocation to process the result.

**Status:** Planned
**Goal:** Enable agents to call tools (starting with `context.read`) through a dedicated execution layer
**Tech Stack:** TypeScript, Zod, Commander.js, Vitest
**In Scope:** ToolExecutor interface, ToolRegistry, `context.read` built-in tool, two-pass execution flow, agent tool allow-lists, policy integration for tool calls, gate/resume for tool approval, MockProvider tool calling, OpenAIProvider first-tool-only support
**Out of Scope:** Multiple tool calls per step, shell.command tool, streaming tool execution, arbitrary JSON-schema validation, tool result caching, tool chaining, AuditLogService, agent delegation, planner/executor loops, cost tracking, background jobs

---

## Architecture

```
wolf.yaml
  ├── agents[].tools[]      → Agent-level allow-list (NEW)
  ├── policy.rules[]        → PolicyEngine with tool_id matching (EXTENDED)
  └── models.*              → ModelProvider with tool support (EXTENDED)

Execution flow (two-pass):
  WorkflowEngine
    └── AgentRunner.run(step)
          ├── resolves agent + route
          ├── filters tools via ToolRegistry.listForAgent(agent.tools)
          ├── Pass 1: invokes model with available tools
          ├── if tool_call returned:
          │     ├── validate tool against agent allow-list
          │     ├── evaluate policy for tool execution
          │     ├── if ask → create tool_approval gate + snapshot
          │     ├── if deny → ToolDenied error
          │     ├── if allow → execute ToolExecutor
          │     └── Pass 2: invoke model with tool result (no tools exposed)
          └── return final AgentModelResult
```

**Key rule:** `ToolExecutor` is separate from `StepRunner`. Tool execution is not a workflow step. `AgentRunner` orchestrates but does not own tool implementations.

**Mode rule:** Tool calling is active **only in invoke mode**. In stub mode, `AgentRunner` preserves MVP4 behavior and returns `AgentInvocationPlan` without tool execution.

---

## 1. Tool Types & Interfaces

### 1.1 ToolDefinition

```typescript
export const ToolDefinitionSchema = z.object({
  id: z.string(), // 'context.read'
  description: z.string().optional(), // for model prompt
  executor: z.string(), // ID of ToolExecutor, e.g. 'context.read'
  risk: RiskLevelSchema, // 'low' | 'medium' | 'high' | 'critical'
  input_schema: z.unknown().optional(), // metadata-only in MVP6
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
```

**Fields:**

| Field          | Type                                      | Required | Description                                  |
| -------------- | ----------------------------------------- | -------- | -------------------------------------------- |
| `id`           | string                                    | yes      | Unique tool identifier                       |
| `description`  | string                                    | no       | Human-readable description for model prompts |
| `executor`     | string                                    | yes      | ID of the `ToolExecutor` implementation      |
| `risk`         | `low` \| `medium` \| `high` \| `critical` | yes      | Risk level for policy evaluation             |
| `input_schema` | unknown                                   | no       | Metadata-only; no generic validation in MVP6 |

### 1.2 ToolExecutor

```typescript
export interface ToolExecutor {
  id: string;
  execute(input: ToolExecutionInput, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export interface ToolExecutionInput {
  tool_id: string;
  input: unknown;
}

export interface ToolExecutionResult {
  tool_id: string;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  case_id: string;
  workflow_id: string;
  step_id: string;
  project_root: string;
  agent_id: string;
}
```

### 1.3 Model Invocation Extensions

Extend `ModelInvocationRequest`:

```typescript
export interface ModelInvocationRequest {
  provider: string;
  model: string;
  input: string;
  system_prompt?: string;
  context?: string;
  max_tokens?: number;
  temperature?: number;
  tools?: ToolDefinition[]; // available tools for this call
  metadata?: Record<string, unknown>;
}
```

Extend `ModelInvocationResult`:

```typescript
export interface ModelToolCall {
  tool_id: string;
  input: unknown;
}

export interface ModelInvocationResult {
  output: string;
  provider: string;
  model: string;
  tool_call?: ModelToolCall; // set if model requested a tool
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  raw?: unknown;
}
```

---

## 2. Tool Error Taxonomy

```typescript
export class ToolNotFound extends Error {
  constructor(toolId: string) {
    super(`Tool not found: ${toolId}`);
  }
}

export class ToolNotAllowed extends Error {
  constructor(toolId: string, agentId: string) {
    super(`Tool '${toolId}' not allowed for agent '${agentId}'`);
  }
}

export class ToolExecutorNotFound extends Error {
  constructor(executorId: string) {
    super(`Tool executor not found: ${executorId}`);
  }
}

export class ToolExecutionError extends Error {
  constructor(toolId: string, reason: string) {
    super(`Tool execution error (${toolId}): ${reason}`);
  }
}

export class ToolApprovalRejected extends Error {
  constructor(toolId: string, reason: string) {
    super(`Tool '${toolId}' approval rejected: ${reason}`);
  }
}

export class ContextToolError extends Error {
  constructor(reason: string) {
    super(`Context tool error: ${reason}`);
  }
}

export class ToolCallLimitExceeded extends Error {
  constructor() {
    super('Tool call limit exceeded: at most one tool call per agent step');
  }
}

export class ToolDenied extends Error {
  constructor(toolId: string, reason: string) {
    super(`Tool '${toolId}' denied by policy: ${reason}`);
  }
}
```

**Retryable mapping:**

| Error                   | Retryable |
| ----------------------- | --------- |
| `ToolNotFound`          | `false`   |
| `ToolNotAllowed`        | `false`   |
| `ToolExecutorNotFound`  | `false`   |
| `ToolExecutionError`    | `false`   |
| `ContextToolError`      | `false`   |
| `ToolCallLimitExceeded` | `false`   |
| `ToolDenied`            | `false`   |
| `ToolApprovalRejected`  | `false`   |

---

## 3. ToolRegistry

### 3.1 API

```typescript
export class ToolRegistry {
  constructor();
  registerDefinition(def: ToolDefinition): void;
  registerExecutor(executor: ToolExecutor): void;
  getDefinition(id: string): ToolDefinition | undefined;
  requireDefinition(id: string): ToolDefinition;
  requireExecutor(executorId: string): ToolExecutor;
  list(): ToolDefinition[];
  listForAgent(agentTools: string[]): ToolDefinition[];
}
```

### 3.2 Behavior

- `registerDefinition(def)` — registers a `ToolDefinition`. Throws if `id` already registered.
- `registerExecutor(executor)` — registers a `ToolExecutor`. Throws if `id` already registered.
- `getDefinition(id)` — returns definition or `undefined`
- `requireDefinition(id)` — returns definition or throws `ToolNotFound`
- `requireExecutor(executorId)` — returns executor or throws `ToolExecutorNotFound`
- `list()` — returns all registered definitions
  - `listForAgent(agentTools)` — returns definitions whose `id` is in `agentTools`. Throws `ToolNotFound` if any ID is not registered.

### 3.3 No User-Defined Tools in wolf.yaml

MVP6 does **not** add a `tools` section to `wolf.yaml`. Only built-in tools (starting with `context.read`) are registered automatically. `agents[].tools` is an **allow-list over registered built-in tools**, not a place to define new tools.

User-defined tools and custom executors are out of scope for MVP6.

### 3.4 Default Registration

On initialization, `ToolRegistry` automatically registers:

- `context.read` definition — `risk: 'low'`, `executor: 'context.read'`
- `ContextReadToolExecutor` — built-in executor

`context.read` is **registered by default** but **not automatically available** to every agent. An agent must explicitly list `context.read` in its `tools` array.

---

## 4. ContextReadToolExecutor

### 4.1 Behavior

Reads an existing context file. **Does not** invoke `ContextResolver`, `ContextScanner`, or `ContextMdGenerator`.

**Default path:** `.wolf/context/context.md` (relative to project root)

**Input:**

```typescript
{
  path?: string;  // optional, relative path, default: '.wolf/context/context.md'
}
```

**Execution:**

1. Resolve `path` or default to `.wolf/context/context.md`
2. Validate path:
   - Must be relative (reject absolute paths)
   - Must not contain `..` traversal
   - Must resolve inside `project_root`
3. Check file exists. If not → `ContextToolError` / `ContextNotFound`
4. Enforce max read size: 1,048,576 bytes (1MB). Exceeding → `ContextToolError`
5. Read file as UTF-8 text
6. Return content as `output`

### 4.2 Error Cases

| Condition             | Error                | Retryable |
| --------------------- | -------------------- | --------- |
| Absolute path         | `ContextToolError`   | `false`   |
| Path traversal (`..`) | `ContextToolError`   | `false`   |
| Outside project root  | `ContextToolError`   | `false`   |
| File not found        | `ContextToolError`   | `false`   |
| Exceeds 1MB           | `ContextToolError`   | `false`   |
| Read failure          | `ToolExecutionError` | `false`   |

### 4.3 Boundary with MVP2

```text
MVP2: ContextResolver builds context files (context.md, context-bundle.json)
MVP6: ContextReadToolExecutor reads existing context files only
```

Tool execution **never** triggers context rebuilding.

---

## 5. Agent Tool Allow-list

### 5.1 Config Schema

`AgentDefinitionSchema.tools` (existing field) controls tool availability:

```yaml
agents:
  - id: reviewer
    tools:
      - context.read # this agent can call context.read

  - id: architect
    tools: [] # no tools; model sees no tool definitions

  - id: admin
    tools:
      - context.read # shell.command is NOT listed (out of scope)
```

### 5.2 Semantics

| Condition                          | Behavior                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `tools` absent or `[]`             | No tools available; model invoked without tool definitions              |
| Tool in `tools` but not registered | `ToolNotFound` thrown by `listForAgent`                                 |
| Tool registered but not in `tools` | `ToolNotAllowed` if model requests it                                   |
| `context.read` not in `tools`      | Agent cannot call `context.read` even though it's registered by default |

---

## 6. Two-Pass Execution Flow

### 6.1 Pass 1: Initial Model Invocation

**Tool calling is active only in invoke mode.** In stub mode, `AgentRunner` returns `AgentInvocationPlan` (MVP4 behavior) without executing tools.

```typescript
// 1. Resolve agent
const agent = registry.get(agentId);

// 2. Filter tools by agent allow-list
const availableTools = toolRegistry.listForAgent(agent.tools);

// 3. Build request
const request: ModelInvocationRequest = {
  provider: route.provider,
  model: route.model,
  input: task,
  system_prompt: /* ... */,
  context: contextBundleContent,
  max_tokens: route.max_tokens,
  temperature: route.temperature,
  tools: availableTools.length > 0 ? availableTools : undefined,
};

// 4. Invoke model (Pass 1)
const pass1Result = await provider.invoke(request);
```

### 6.2 Tool Call Detection

```typescript
if (!pass1Result.tool_call) {
  // No tool call — return result directly
  return buildAgentModelResult(pass1Result);
}

// Tool call detected — proceed to validation
```

### 6.3 Tool Call Validation

```typescript
const toolCall = pass1Result.tool_call;

// 1. Check agent allow-list
if (!agent.tools.includes(toolCall.tool_id)) {
  throw new ToolNotAllowed(toolCall.tool_id, agent.id);
}

// 2. Resolve tool definition
const toolDef = toolRegistry.requireDefinition(toolCall.tool_id);

// 3. Resolve executor
const executor = toolRegistry.requireExecutor(toolDef.executor);

// 4. Evaluate policy (see Section 7)
const policyDecision = policyEngine.evaluateTool(toolDef /* ... */);
```

### 6.4 Tool Execution

```typescript
// Build execution context
const toolCtx: ToolExecutionContext = {
  case_id: ctx.case_id,
  workflow_id: ctx.workflow_id,
  step_id: step.id,
  project_root: ctx.project_root,
  agent_id: agent.id,
};

// Execute
const toolResult = await executor.execute({ tool_id: toolCall.tool_id, input: toolCall.input }, toolCtx);
```

### 6.5 Pass 2: Final Model Invocation

```typescript
// Build Pass 2 request — no tools exposed
const pass2Request: ModelInvocationRequest = {
  provider: route.provider,
  model: route.model,
  input: buildPass2Input(task, toolCall, toolResult),
  system_prompt: /* same as Pass 1 */,
  context: contextBundleContent,
  max_tokens: route.max_tokens,
  temperature: route.temperature,
  // tools: undefined — do not expose tools in Pass 2
};

const pass2Result = await provider.invoke(pass2Request);

// Pass 2 must NOT return another tool_call
if (pass2Result.tool_call) {
  throw new ToolCallLimitExceeded();
}

return buildAgentModelResult(pass2Result);
```

### 6.6 Pass 2 Prompt Format

Stable prompt format for Pass 2:

```typescript
function buildPass2Input(originalTask: string, toolCall: ModelToolCall, toolResult: ToolExecutionResult): string {
  return [originalTask, '', `[Tool Call Result: ${toolCall.tool_id}]`, toolResult.output].join('\n');
}
```

**Rules:**

- The original task is preserved at the top
- Tool result is clearly demarcated with `[Tool Call Result: <tool_id>]`
- No markdown formatting inside the delimiter line
- Tool output is appended verbatim

**Rule:** Pass 2 does not expose tools. If the model requests a tool in Pass 2, it's a protocol violation → `ToolCallLimitExceeded`.

---

## 7. Policy Integration for Tool Calls

### 7.1 Policy Engine Extension

Extend `PolicyRule.match` with `tool_id` and `tool_risk`:

```typescript
export const PolicyRuleSchema = z.object({
  id: z.string(),
  match: z
    .object({
      runner: z.string().optional(),
      command_contains: z.array(z.string()).optional(),
      step_id: z.string().optional(),
      tool_id: z.string().optional(), // NEW: match tool ID
      tool_risk: RiskLevelSchema.optional(), // NEW: match tool risk level
    })
    .default({}),
  decision: DecisionTypeSchema,
  risk: RiskLevelSchema.optional(),
  reason: z.string(),
});
```

### 7.2 Tool Runtime Evaluation

New `enforcement` type: `tool_runtime`

```typescript
function evaluateTool(toolDef: ToolDefinition, ctx: ToolExecutionContext): PolicyDecision {
  const subject = {
    workflow_id: ctx.workflow_id,
    step_id: ctx.step_id,
    agent_id: ctx.agent_id,
    runner: 'agent',
    tool_id: toolDef.id,
    tool_risk: toolDef.risk,
  };

  // Match rules
  // tool_id match: rule.match.tool_id === toolDef.id
  // tool_risk match: rule.match.tool_risk === toolDef.risk
  // Both optional; if both present, both must match

  // Precedence: deny > ask > allow
  // Risk: critical > high > medium > low
}
```

**Note:** Policy is evaluated for the **concrete requested tool_call**, not at AgentRunner initialization. `PolicyEngine` in MVP6 is used **only** for `tool_runtime` decisions. The existing `WorkflowEngine` / `PolicyStepGuard` continues to handle step-level policy (MVP3). AgentRunner delegates tool policy to `PolicyEngine.evaluateTool()` while step policy remains handled upstream.

### 7.3 Policy Decisions

| Decision | Behavior                                                     |
| -------- | ------------------------------------------------------------ |
| `allow`  | Execute tool immediately                                     |
| `ask`    | Create `tool_approval` gate before execution (see Section 8) |
| `deny`   | Throw `ToolDenied` before side effect                        |

### 7.4 Example Policy Rules

```yaml
policy:
  rules:
    - id: allow-context-read
      match:
        tool_id: context.read
      decision: allow
      risk: low
      reason: 'Context read is safe'

    - id: ask-high-risk-tools
      match:
        tool_risk: critical
      decision: ask
      risk: critical
      reason: 'High-risk tools require approval'
```

---

## 8. Tool Approval Gate & Resume

### 8.1 Gate Creation

When policy returns `ask` for a tool call:

```typescript
const gatePayload = {
  gate_type: 'tool_approval',
  policy_decision: policyDecision, // full PolicyDecision object
  agent_id: agent.id,
  workflow_id: ctx.workflow_id,
  step_id: step.id,
  tool_call: pass1Result.tool_call, // ModelToolCall
  tool_definition: toolDef, // ToolDefinition
  initial_model_result: {
    // Sanitized: no raw provider response
    output: pass1Result.output,
    provider: pass1Result.provider,
    model: pass1Result.model,
    tool_call: pass1Result.tool_call,
  },
  tool_execution_context: toolCtx, // ToolExecutionContext
};

// Create gate using existing gate infrastructure
// Gate type: 'tool_approval'
// Status: 'pending'
```

### 8.2 Gate Payload Schema

```typescript
const ToolApprovalGatePayloadSchema = z.object({
  gate_type: z.literal('tool_approval'),
  policy_decision: PolicyDecisionSchema,
  agent_id: z.string(),
  workflow_id: z.string(),
  step_id: z.string(),
  tool_call: z.object({
    tool_id: z.string(),
    input: z.unknown(),
  }),
  tool_definition: ToolDefinitionSchema,
  initial_model_result: z.object({
    output: z.string(),
    provider: z.string(),
    model: z.string(),
    tool_call: z
      .object({
        tool_id: z.string(),
        input: z.unknown(),
      })
      .optional(),
    // Note: raw provider response is intentionally excluded
  }),
  tool_execution_context: z.object({
    case_id: z.string(),
    workflow_id: z.string(),
    step_id: z.string(),
    project_root: z.string(),
    agent_id: z.string(),
  }),
});
```

### 8.3 Resume Behavior

On gate approval + resume:

1. Load snapshotted `tool_call` from gate payload
2. Load snapshotted `tool_definition` and `tool_execution_context`
3. **Do not** re-run Pass 1 model invocation
4. Execute snapshotted tool call using `ToolExecutor`
5. Perform Pass 2 model invocation with tool result
6. Return final `AgentModelResult`

### 8.4 Rejection Behavior

On gate rejection:

1. Do not execute the tool
2. Do not perform Pass 2
3. Step fails with `ToolApprovalRejected`
4. Emit `tool.approval_rejected` event

**Critical:** Resume must not re-invoke the model for Pass 1. The original `tool_call` is snapshotted and executed deterministically.

---

## 9. Provider Changes

### 9.1 MockProvider Tool Calling

Deterministic trigger via `metadata.mock_tool_call`:

```typescript
class MockProvider implements ModelProvider {
  id = 'mock';

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    // If metadata.mock_tool_call is set, return it
    if (request.metadata?.mock_tool_call) {
      const mockCall = request.metadata.mock_tool_call as ModelToolCall;
      return {
        output: '',
        provider: this.id,
        model: request.model,
        tool_call: mockCall,
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      };
    }

    // Normal text output
    const inputTokens = estimateTokens(request.input);
    const contextTokens = request.context ? estimateTokens(request.context) : 0;
    return {
      output: `[mock:${request.model}] ${request.input.slice(0, 200)}`,
      provider: this.id,
      model: request.model,
      usage: {
        input_tokens: inputTokens + contextTokens,
        output_tokens: estimateTokens('[mock]'),
        total_tokens: inputTokens + contextTokens + estimateTokens('[mock]'),
      },
    };
  }
}
```

**Rule:** No fuzzy prompt matching. Tool calls are triggered **only** when `metadata.mock_tool_call` is explicitly set.

### 9.2 OpenAIProvider Tool Calling

Maps `ToolDefinition[]` to OpenAI tool schema:

```typescript
// Map ToolDefinition to OpenAI function schema
// Sanitize tool.id: replace dots with underscores for valid function names
function sanitizeToolId(toolId: string): string {
  return toolId.replace(/\./g, '_');
}

function mapToolToOpenAI(tool: ToolDefinition) {
  return {
    type: 'function',
    function: {
      name: sanitizeToolId(tool.id),
      description: tool.description || `${tool.id} tool`,
      parameters: tool.input_schema || { type: 'object', properties: {} },
    },
  };
}

// Reverse map: OpenAI function name back to original tool_id
function unsanitizeToolId(sanitizedId: string): string {
  return sanitizedId.replace(/_/g, '.');
}
```

**Behavior:**

- If `request.tools` is provided and non-empty → include `tools` in OpenAI API call
- Parse first `tool_calls[0]` from response → `ModelToolCall`
- 0 tool calls → text output (no `tool_call`)
- 1 tool call → `ModelToolCall`
- > 1 tool calls → throw `ToolCallLimitExceeded`

**Error mapping:** Same as MVP5 (401/403 → auth, 429/5xx → network).

---

## 10. AgentRunner Integration

### 10.1 Constructor Changes

```typescript
export class AgentRunner implements StepRunner {
  type = 'agent';

  constructor(
    private registry: AgentRegistry,
    private router: ModelRouter,
    private providerRegistry: ModelProviderRegistry,
    private toolRegistry: ToolRegistry,           // NEW
    private policyEngine: PolicyEngine             // NEW (for tool policy)
  ) {}
```

### 10.2 Invoke Mode with Tools

Tool calling is active **only in invoke mode**. In stub mode, `AgentRunner` preserves MVP4 behavior and returns `AgentInvocationPlan` without tool execution.

Extend invoke mode execution:

```typescript
// After building contextBundleContent...

// Resolve available tools
const availableTools = this.toolRegistry.listForAgent(agent.tools);

// Build Pass 1 request with tools
const pass1Request: ModelInvocationRequest = {
  // ...existing fields...
  tools: availableTools.length > 0 ? availableTools : undefined,
};

const pass1Result = await provider.invoke(pass1Request);

// Check for tool call
if (pass1Result.tool_call) {
  return await this.handleToolCall(pass1Result.tool_call, agent, step, ctx, route, pass1Result, provider);
}

// No tool call — return as before
return buildAgentModelResult(pass1Result);
```

### 10.3 Handle Tool Call

```typescript
private async handleToolCall(
  toolCall: ModelToolCall,
  agent: AgentDefinition,
  step: StepDefinition,
  ctx: ExecutionContext,
  route: ModelRoute,
  pass1Result: ModelInvocationResult,
  provider: ModelProvider
): Promise<StepResult> {
  // 1. Validate allow-list
  if (!agent.tools.includes(toolCall.tool_id)) {
    return failureResult(new ToolNotAllowed(toolCall.tool_id, agent.id));
  }

  // 2. Resolve tool
  const toolDef = this.toolRegistry.requireDefinition(toolCall.tool_id);
  const executor = this.toolRegistry.requireExecutor(toolDef.executor);

  // 3. Build execution context
  const toolCtx: ToolExecutionContext = {
    case_id: ctx.case_id,
    workflow_id: ctx.workflow_id,
    step_id: step.id,
    project_root: ctx.project_root,
    agent_id: agent.id,
  };

  // 4. Evaluate policy
  const policyDecision = this.policyEngine.evaluateTool(toolDef, toolCtx);

  if (policyDecision.decision === 'deny') {
    return failureResult(new ToolDenied(toolCall.tool_id, policyDecision.reason));
  }

  if (policyDecision.decision === 'ask') {
    // Create gate
    const gatePayload = {
      gate_type: 'tool_approval',
      policy_decision: policyDecision,
      agent_id: agent.id,
      workflow_id: ctx.workflow_id,
      step_id: step.id,
      tool_call: toolCall,
      tool_definition: toolDef,
      initial_model_result: {
        output: pass1Result.output,
        provider: pass1Result.provider,
        model: pass1Result.model,
        tool_call: pass1Result.tool_call,
      },
      tool_execution_context: toolCtx,
    };
    return gatedResult(gatePayload);
  }

  // 5. Execute tool (allow)
  const toolResult = await executor.execute(
    { tool_id: toolCall.tool_id, input: toolCall.input },
    toolCtx
  );

  // 6. Pass 2 — no tools
  const pass2Request: ModelInvocationRequest = {
    provider: route.provider,
    model: route.model,
    input: buildPass2Input(task, toolCall, toolResult),
    system_prompt: /* ... */,
    context: /* contextBundleContent */,
    max_tokens: route.max_tokens,
    temperature: route.temperature,
    // tools: undefined
  };

  const pass2Result = await provider.invoke(pass2Request);

  if (pass2Result.tool_call) {
    return failureResult(new ToolCallLimitExceeded());
  }

  return successResult(buildAgentModelResult(pass2Result));
}
```

---

## 11. Events

Use existing event/state infrastructure. Do not add `AuditLogService`.

### 11.1 Event Types

| Event                    | When                      | Payload                                         |
| ------------------------ | ------------------------- | ----------------------------------------------- |
| `tool.requested`         | Model returns `tool_call` | `tool_id`, `agent_id`, `step_id`, `workflow_id` |
| `tool.approval_required` | Policy returns `ask`      | `tool_id`, `gate_id`, `policy_decision`         |
| `tool.approval_granted`  | Gate approved             | `tool_id`, `gate_id`, `approved_by`             |
| `tool.approval_rejected` | Gate rejected             | `tool_id`, `gate_id`, `rejected_by`             |
| `tool.executed`          | Tool execution succeeds   | `tool_id`, `output_length`, `metadata`          |
| `tool.denied`            | Policy returns `deny`     | `tool_id`, `policy_decision`                    |
| `tool.failed`            | Tool execution fails      | `tool_id`, `error_type`, `error_message`        |

Events are appended to `events.jsonl` through the existing event mechanism.

---

## 12. Integration Points

| Component                   | Change    | Details                                                                       |
| --------------------------- | --------- | ----------------------------------------------------------------------------- |
| **AgentRunner**             | Extend    | Add tool registry, two-pass execution, tool call handling                     |
| **ModelProvider**           | Extend    | Add `tools` to request, `tool_call` to result                                 |
| **MockProvider**            | Extend    | Support `metadata.mock_tool_call`                                             |
| **OpenAIProvider**          | Extend    | Map tool definitions, parse first tool call                                   |
| **PolicyEngine**            | Extend    | Add `tool_id` and `tool_risk` to match schema; add `tool_runtime` enforcement |
| **ProjectConfig**           | No change | `agents[].tools` already exists                                               |
| **Workflow Engine**         | No change | Standard runner interface                                                     |
| **ToolRegistry**            | New       | Tool definition and executor registry                                         |
| **ContextReadToolExecutor** | New       | Built-in tool for reading context files                                       |
| **GateSystem**              | Extend    | Support `tool_approval` gate type with snapshot payload                       |

---

## 13. Testing

### 13.1 Unit Tests

| Test                                   | Description                                           |
| -------------------------------------- | ----------------------------------------------------- |
| ToolRegistry                           | Register/get/require definitions and executors        |
| ToolRegistry.listForAgent              | Filter by allow-list, throw on unknown IDs            |
| ToolRegistry default registration      | `context.read` registered on init                     |
| ContextReadToolExecutor                | Read default `.wolf/context/context.md`               |
| ContextReadToolExecutor custom path    | Read custom relative path                             |
| ContextReadToolExecutor path traversal | Reject `..` and absolute paths                        |
| ContextReadToolExecutor missing file   | Throw `ContextToolError`                              |
| ContextReadToolExecutor size limit     | Reject files > 1MB                                    |
| MockProvider with tool call            | Return `tool_call` when `metadata.mock_tool_call` set |
| MockProvider without tool call         | Return normal text output                             |
| OpenAIProvider tool mapping            | Map `ToolDefinition` to OpenAI schema                 |
| OpenAIProvider first tool call         | Parse `tool_calls[0]`                                 |
| OpenAIProvider multiple tool calls     | Throw `ToolCallLimitExceeded`                         |
| AgentRunner no tools                   | Invoke model without tool definitions                 |
| AgentRunner with tools                 | Pass tool definitions to model                        |
| AgentRunner tool call flow             | Pass 1 → validate → execute → Pass 2                  |
| AgentRunner tool not allowed           | `ToolNotAllowed` error                                |
| AgentRunner Pass 2 tool call           | `ToolCallLimitExceeded` error                         |
| PolicyEngine tool_id match             | Match rule by `tool_id`                               |
| PolicyEngine tool_risk match           | Match rule by `tool_risk`                             |
| PolicyEngine tool deny                 | Throw `ToolDenied`                                    |
| PolicyEngine tool ask                  | Create `tool_approval` gate                           |
| Gate resume tool call                  | Execute snapshotted tool, skip Pass 1                 |
| Gate rejection                         | Step fails with `ToolApprovalRejected`, no Pass 2     |
| Stub mode with tools                   | Returns `AgentInvocationPlan`, no tool execution      |
| listForAgent unknown tool              | Throws `ToolNotFound`                                 |
| Gate payload sanitized                 | No `raw` field in `initial_model_result`              |

### 13.2 Integration Tests

| Test                      | Description                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------ |
| End-to-end tool call      | Agent with `context.read` → model requests tool → tool executes → final model result |
| Policy ask gate           | Tool policy `ask` → gate created → approve → resume → final result                   |
| Policy deny gate          | Tool policy `deny` → step fails before execution                                     |
| Context read in tool call | `context.read` returns context file content                                          |
| Pass 2 no tools           | Pass 2 request has no `tools` field                                                  |
| Tool call limit exceeded  | Pass 2 returns tool call → failure                                                   |
| Stub mode preserves MVP4  | Agent with tools in stub mode returns `AgentInvocationPlan`                          |
| Gate rejection            | Reject → step fails, `tool.approval_rejected` event emitted                          |

---

## 14. Acceptance Criteria

1. `ToolRegistry` registers built-in `context.read` on initialization.
2. `context.read` is available only to agents that list it in `agent.tools`.
3. `context.read` reads existing `.wolf/context/context.md` by default.
4. `context.read` rejects path traversal, absolute paths, and files outside project root.
5. `context.read` rejects files exceeding 1MB.
6. `context.read` does not invoke `ContextResolver` or rebuild context.
7. Agent with no tools invokes model without tool definitions.
8. Agent with tools passes tool definitions to model.
9. MockProvider returns `tool_call` when `metadata.mock_tool_call` is set.
10. MockProvider returns text output when `metadata.mock_tool_call` is not set.
11. OpenAIProvider maps tool definitions and parses the first tool call.
12. OpenAIProvider throws `ToolCallLimitExceeded` for multiple tool calls.
13. Pass 2 does not expose tools to the model.
14. Pass 2 returning a tool call throws `ToolCallLimitExceeded`.
15. Tool call for non-allowed tool throws `ToolNotAllowed`.
16. Tool call for unregistered tool throws `ToolNotFound`.
17. Policy `deny` for tool call throws `ToolDenied` before execution.
18. Policy `ask` for tool call creates `tool_approval` gate with full snapshot.
19. Gate resume executes snapshotted tool call without re-running Pass 1.
20. Policy rules support `tool_id` and `tool_risk` matching.
21. Tool events (`tool.requested`, `tool.executed`, `tool.denied`, etc.) are emitted.
22. No `AuditLogService` is introduced.
23. `shell.command` does not appear in MVP6 examples or config.
24. All tool errors have retryable mapping.
25. Tool calling is active only in invoke mode; stub mode returns `AgentInvocationPlan`.
26. Gate rejection fails step with `ToolApprovalRejected`; no Pass 2 executed.
27. Gate payload does not include raw provider response.
28. No user-defined tools in `wolf.yaml`; only built-in `context.read` exists.
29. `listForAgent` throws `ToolNotFound` for unknown tool IDs.
30. Tests pass locally and in Docker.

---

## 15. Out of Scope

- Multiple tool calls per agent step
- `shell.command` tool (out of scope for MVP6)
- Arbitrary JSON Schema / Zod validation for tool input
- Tool result caching
- Tool chaining (tool A → tool B)
- Streaming tool execution
- Async / background tool execution
- AuditLogService
- Tool marketplace / dynamic tool discovery
- Tool versioning
- Multi-agent tool delegation
- Cost tracking for tool execution
- Tool execution timeouts (handled at step level)

---

## 16. Future Direction

MVP7 may add:

- `shell.command` tool with strict validation and policy
- Multiple tool calls per step
- Tool result caching
- File system tools (`file.read`, `file.write`)
- HTTP request tool
- Tool chaining
- Streaming tool execution

**Boundary:** MVP6 calls at most one tool per agent step, with one final model invocation.

(End of file)
