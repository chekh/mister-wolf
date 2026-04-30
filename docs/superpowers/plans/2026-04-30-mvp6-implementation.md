# MVP6: Agent Tool Calling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable agents to call tools (starting with `context.read`) through a dedicated ToolExecutor layer, with two-pass model execution, agent-level tool allow-lists, and policy integration for tool calls.

**Architecture:** A `ToolExecutor` interface separate from `StepRunner`. `ToolRegistry` holds tool definitions and executors. `AgentRunner` resolves agent tools, invokes model (Pass 1), detects `tool_call`, validates against allow-list, evaluates policy, executes tool via `ToolExecutor`, then invokes model again with tool result (Pass 2). MockProvider supports deterministic tool calls via metadata. OpenAIProvider maps tool definitions and parses first tool call only.

**Tech Stack:** TypeScript, Zod, native `fetch`, Vitest

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/tool/types.ts` | `ToolDefinition`, `ToolExecutor`, `ToolExecutionInput/Result/Context`, `ModelToolCall` |
| `src/tool/errors.ts` | Tool error taxonomy: `ToolNotFound`, `ToolNotAllowed`, `ToolExecutorNotFound`, `ToolExecutionError`, `ToolApprovalRejected`, `ContextToolError`, `ToolCallLimitExceeded`, `ToolDenied` |
| `src/tool/registry.ts` | `ToolRegistry` — register, get, require definitions and executors |
| `src/tool/executors/context-read.ts` | `ContextReadToolExecutor` — reads existing context files |
| `tests/unit/tool-registry.test.ts` | ToolRegistry unit tests |
| `tests/unit/context-read-executor.test.ts` | ContextReadToolExecutor unit tests |
| `tests/unit/agent-runner-tool-call.test.ts` | AgentRunner tool calling unit tests |
| `tests/integration/mvp6-tool-calling.test.ts` | End-to-end integration tests |

### Modified Files

| File | Changes |
|------|---------|
| `src/model/types.ts` | Add `tools` to `ModelInvocationRequest`, `tool_call` to `ModelInvocationResult`, add `ModelToolCall` |
| `src/model/mock-provider.ts` | Support `metadata.mock_tool_call` for deterministic tool calls |
| `src/model/openai-provider.ts` | Map `ToolDefinition` to OpenAI function schema, parse first tool call, sanitize tool IDs |
| `src/types/policy.ts` | Extend `PolicyRule.match` with `tool_id` and `tool_risk` |
| `src/policy/engine.ts` | Add `evaluateTool()` method for `tool_runtime` enforcement |
| `src/agent/runner.ts` | Add tool registry, two-pass execution, tool call handling, invoke-mode-only tool calling |
| `src/cli/commands/run.ts` | Register `ToolRegistry` with built-in `context.read`, pass to `AgentRunner` |
| `tests/unit/mock-provider.test.ts` | Add tool call tests |
| `tests/unit/openai-provider.test.ts` | Add tool calling tests |
| `docs/development.md` | Add Agent Tool Calling section |

---

## PR1: Tool Types, Registry, and ContextReadToolExecutor

**Scope:** Core tool abstractions, registry, and built-in `context.read` executor.

---

### Task 1.1: Create `src/tool/types.ts`

**Files:**
- Create: `src/tool/types.ts`

- [ ] **Step 1: Write `src/tool/types.ts`**

```typescript
import { RiskLevelSchema } from '../types/policy.js';
import { z } from 'zod';

export const ToolDefinitionSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  executor: z.string(),
  risk: RiskLevelSchema,
  input_schema: z.unknown().optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

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

export interface ToolExecutor {
  id: string;
  execute(input: ToolExecutionInput, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export interface ModelToolCall {
  tool_id: string;
  input: unknown;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tool/types.ts
git commit -m "feat(mvp6): add tool types and interfaces"
```

---

### Task 1.2: Create `src/tool/errors.ts`

**Files:**
- Create: `src/tool/errors.ts`

- [ ] **Step 1: Write `src/tool/errors.ts`**

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

- [ ] **Step 2: Commit**

```bash
git add src/tool/errors.ts
git commit -m "feat(mvp6): add tool error taxonomy"
```

---

### Task 1.3: Create `src/tool/registry.ts`

**Files:**
- Create: `src/tool/registry.ts`
- Create: `tests/unit/tool-registry.test.ts`

- [ ] **Step 1: Write `src/tool/registry.ts`**

```typescript
import { ToolDefinition, ToolExecutor } from './types.js';
import { ToolNotFound, ToolExecutorNotFound } from './errors.js';

export class ToolRegistry {
  private definitions = new Map<string, ToolDefinition>();
  private executors = new Map<string, ToolExecutor>();

  registerDefinition(def: ToolDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Tool definition already registered: ${def.id}`);
    }
    this.definitions.set(def.id, def);
  }

  registerExecutor(executor: ToolExecutor): void {
    if (this.executors.has(executor.id)) {
      throw new Error(`Tool executor already registered: ${executor.id}`);
    }
    this.executors.set(executor.id, executor);
  }

  getDefinition(id: string): ToolDefinition | undefined {
    return this.definitions.get(id);
  }

  requireDefinition(id: string): ToolDefinition {
    const def = this.definitions.get(id);
    if (!def) {
      throw new ToolNotFound(id);
    }
    return def;
  }

  requireExecutor(executorId: string): ToolExecutor {
    const executor = this.executors.get(executorId);
    if (!executor) {
      throw new ToolExecutorNotFound(executorId);
    }
    return executor;
  }

  list(): ToolDefinition[] {
    return Array.from(this.definitions.values());
  }

  listForAgent(agentTools: string[]): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const toolId of agentTools) {
      const def = this.definitions.get(toolId);
      if (!def) {
        throw new ToolNotFound(toolId);
      }
      result.push(def);
    }
    return result;
  }
}
```

- [ ] **Step 2: Write `tests/unit/tool-registry.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/tool/registry.js';
import { ToolNotFound, ToolExecutorNotFound } from '../../src/tool/errors.js';

describe('ToolRegistry', () => {
  it('should register and get definitions', () => {
    const registry = new ToolRegistry();
    const def = { id: 'test.tool', executor: 'test.tool', risk: 'low' as const };
    registry.registerDefinition(def);
    expect(registry.getDefinition('test.tool')).toBe(def);
    expect(registry.getDefinition('missing')).toBeUndefined();
  });

  it('should require definition', () => {
    const registry = new ToolRegistry();
    const def = { id: 'test.tool', executor: 'test.tool', risk: 'low' as const };
    registry.registerDefinition(def);
    expect(registry.requireDefinition('test.tool')).toBe(def);
    expect(() => registry.requireDefinition('missing')).toThrow(ToolNotFound);
  });

  it('should register and require executor', () => {
    const registry = new ToolRegistry();
    const executor = { id: 'test.tool', execute: async () => ({ tool_id: 'test.tool', output: '' }) };
    registry.registerExecutor(executor);
    expect(registry.requireExecutor('test.tool')).toBe(executor);
    expect(() => registry.requireExecutor('missing')).toThrow(ToolExecutorNotFound);
  });

  it('should list all definitions', () => {
    const registry = new ToolRegistry();
    registry.registerDefinition({ id: 'tool.a', executor: 'tool.a', risk: 'low' as const });
    registry.registerDefinition({ id: 'tool.b', executor: 'tool.b', risk: 'medium' as const });
    expect(registry.list()).toHaveLength(2);
  });

  it('should listForAgent with valid tools', () => {
    const registry = new ToolRegistry();
    registry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low' as const });
    registry.registerDefinition({ id: 'other.tool', executor: 'other.tool', risk: 'medium' as const });
    const result = registry.listForAgent(['context.read']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('context.read');
  });

  it('should throw ToolNotFound for unknown tool in listForAgent', () => {
    const registry = new ToolRegistry();
    registry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low' as const });
    expect(() => registry.listForAgent(['context.read', 'unknown.tool'])).toThrow(ToolNotFound);
  });

  it('should throw when registering duplicate definition', () => {
    const registry = new ToolRegistry();
    registry.registerDefinition({ id: 'tool', executor: 'tool', risk: 'low' as const });
    expect(() => registry.registerDefinition({ id: 'tool', executor: 'tool', risk: 'low' as const })).toThrow('already registered');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/tool-registry.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/tool/registry.ts tests/unit/tool-registry.test.ts
git commit -m "feat(mvp6): add ToolRegistry with tests"
```

---

### Task 1.4: Create `src/tool/executors/context-read.ts`

**Files:**
- Create: `src/tool/executors/context-read.ts`
- Create: `tests/unit/context-read-executor.test.ts`

- [ ] **Step 1: Write `src/tool/executors/context-read.ts`**

```typescript
import { ToolExecutor, ToolExecutionInput, ToolExecutionResult, ToolExecutionContext } from '../types.js';
import { ContextToolError } from '../errors.js';
import { resolve } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

export class ContextReadToolExecutor implements ToolExecutor {
  id = 'context.read';

  async execute(input: ToolExecutionInput, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const path = (input.input as { path?: string } | undefined)?.path || '.wolf/context/context.md';

    // Validate path
    if (path.startsWith('/')) {
      throw new ContextToolError('Path must be relative');
    }
    if (path.includes('..')) {
      throw new ContextToolError('Path must not contain parent traversal');
    }

    const resolvedPath = resolve(ctx.project_root, path);
    if (!resolvedPath.startsWith(ctx.project_root)) {
      throw new ContextToolError('Path must be inside project root');
    }

    if (!existsSync(resolvedPath)) {
      throw new ContextToolError(`Context file not found: ${path}`);
    }

    const stats = statSync(resolvedPath);
    if (stats.size > 1048576) {
      throw new ContextToolError(`File exceeds 1MB limit: ${path}`);
    }

    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      return {
        tool_id: this.id,
        output: content,
        metadata: { path, bytes_read: stats.size },
      };
    } catch (err) {
      throw new ContextToolError(`Failed to read file: ${path}`);
    }
  }
}
```

- [ ] **Step 2: Write `tests/unit/context-read-executor.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextReadToolExecutor } from '../../src/tool/executors/context-read.js';
import { ContextToolError } from '../../src/tool/errors.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ContextReadToolExecutor', () => {
  let tmpDir: string;
  let executor: ContextReadToolExecutor;
  let ctx: { project_root: string; case_id: string; workflow_id: string; step_id: string; agent_id: string };

  beforeEach(() => {
    tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    mkdirSync(join(tmpDir, '.wolf', 'context'), { recursive: true });
    executor = new ContextReadToolExecutor();
    ctx = {
      project_root: tmpDir,
      case_id: 'c1',
      workflow_id: 'w1',
      step_id: 's1',
      agent_id: 'a1',
    };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should read default context.md', async () => {
    writeFileSync(join(tmpDir, '.wolf', 'context', 'context.md'), '# Context\n\nHello');
    const result = await executor.execute({ tool_id: 'context.read', input: {} }, ctx);
    expect(result.output).toBe('# Context\n\nHello');
    expect(result.metadata?.path).toBe('.wolf/context/context.md');
  });

  it('should read custom relative path', async () => {
    writeFileSync(join(tmpDir, 'custom.md'), 'Custom content');
    const result = await executor.execute({ tool_id: 'context.read', input: { path: 'custom.md' } }, ctx);
    expect(result.output).toBe('Custom content');
  });

  it('should reject absolute path', async () => {
    await expect(executor.execute({ tool_id: 'context.read', input: { path: '/etc/passwd' } }, ctx)).rejects.toThrow(
      ContextToolError
    );
  });

  it('should reject path traversal', async () => {
    await expect(executor.execute({ tool_id: 'context.read', input: { path: '../secret.txt' } }, ctx)).rejects.toThrow(
      ContextToolError
    );
  });

  it('should reject path outside project root', async () => {
    await expect(
      executor.execute({ tool_id: 'context.read', input: { path: 'subdir/../../../secret.txt' } }, ctx)
    ).rejects.toThrow(ContextToolError);
  });

  it('should reject missing file', async () => {
    await expect(executor.execute({ tool_id: 'context.read', input: { path: 'missing.md' } }, ctx)).rejects.toThrow(
      ContextToolError
    );
  });

  it('should reject file exceeding 1MB', async () => {
    writeFileSync(join(tmpDir, 'huge.md'), 'x'.repeat(1048577));
    await expect(executor.execute({ tool_id: 'context.read', input: { path: 'huge.md' } }, ctx)).rejects.toThrow(
      ContextToolError
    );
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/context-read-executor.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/tool/executors/context-read.ts tests/unit/context-read-executor.test.ts
git commit -m "feat(mvp6): add ContextReadToolExecutor with tests"
```

---

## PR2: Model Invocation Extensions and Provider Tool Calling

**Scope:** Extend model types, MockProvider, and OpenAIProvider for tool calling.

---

### Task 2.1: Extend `src/model/types.ts`

**Files:**
- Modify: `src/model/types.ts`

- [ ] **Step 1: Replace `src/model/types.ts` content**

```typescript
import { ToolDefinition } from '../tool/types.js';

export interface ModelInvocationRequest {
  provider: string;
  model: string;
  input: string;
  system_prompt?: string;
  context?: string;
  max_tokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  metadata?: Record<string, unknown>;
}

export interface ModelToolCall {
  tool_id: string;
  input: unknown;
}

export interface ModelInvocationResult {
  output: string;
  provider: string;
  model: string;
  tool_call?: ModelToolCall;
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

- [ ] **Step 2: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/model/types.ts
git commit -m "feat(mvp6): extend model types with tool_call and tools"
```

---

### Task 2.2: Extend MockProvider for tool calling

**Files:**
- Modify: `src/model/mock-provider.ts`

- [ ] **Step 1: Replace MockProvider to support tool calls**

```typescript
import { ModelProvider, ModelInvocationRequest, ModelInvocationResult, ModelToolCall } from './types.js';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class MockProvider implements ModelProvider {
  id = 'mock';

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    // Check for deterministic tool call
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

    const inputTokens = estimateTokens(request.input);
    const contextTokens = request.context ? estimateTokens(request.context) : 0;
    return {
      output: `[mock:${request.model}] ${request.input.slice(0, 200)}${request.input.length > 200 ? '...' : ''}`,
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

- [ ] **Step 2: Add MockProvider tool call test**

Append to `tests/unit/mock-provider.test.ts`:

```typescript
  it('should return tool_call when metadata.mock_tool_call is set', async () => {
    const provider = new MockProvider();
    const result = await provider.invoke({
      provider: 'mock',
      model: 'mock-chat',
      input: 'Read context',
      metadata: {
        mock_tool_call: { tool_id: 'context.read', input: { path: '.wolf/context/context.md' } },
      },
    });
    expect(result.tool_call).toBeDefined();
    expect(result.tool_call!.tool_id).toBe('context.read');
    expect(result.output).toBe('');
  });

  it('should return text output when metadata.mock_tool_call is not set', async () => {
    const provider = new MockProvider();
    const result = await provider.invoke({
      provider: 'mock',
      model: 'mock-chat',
      input: 'Hello',
    });
    expect(result.tool_call).toBeUndefined();
    expect(result.output).toContain('[mock:mock-chat]');
  });
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/mock-provider.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/model/mock-provider.ts tests/unit/mock-provider.test.ts
git commit -m "feat(mvp6): extend MockProvider with deterministic tool call support"
```

---

### Task 2.3: Extend OpenAIProvider for tool calling

**Files:**
- Modify: `src/model/openai-provider.ts`
- Modify: `tests/unit/openai-provider.test.ts`

- [ ] **Step 1: Add tool mapping functions to OpenAIProvider**

Append to `src/model/openai-provider.ts` before the class definition:

```typescript
import { ToolDefinition, ModelToolCall } from './types.js';

function sanitizeToolId(toolId: string): string {
  return toolId.replace(/\./g, '_');
}

function unsanitizeToolId(sanitizedId: string): string {
  return sanitizedId.replace(/_/g, '.');
}

function mapToolToOpenAI(tool: ToolDefinition) {
  return {
    type: 'function' as const,
    function: {
      name: sanitizeToolId(tool.id),
      description: tool.description || `${tool.id} tool`,
      parameters: tool.input_schema || { type: 'object', properties: {} },
    },
  };
}
```

- [ ] **Step 2: Modify OpenAIProvider.invoke to support tools**

Replace the `invoke` method body with:

```typescript
  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderAuthError(this.id);
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages: [
        ...(request.system_prompt ? [{ role: 'system', content: request.system_prompt }] : []),
        {
          role: 'user',
          content: request.context ? `${request.context}\n\n${request.input}` : request.input,
        },
      ],
    };
    if (request.max_tokens !== undefined) {
      body.max_tokens = request.max_tokens;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(mapToolToOpenAI);
    }

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ProviderNetworkError(this.id);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderAuthError(this.id);
    }
    if (response.status === 400 || response.status === 404) {
      const errorBody = await response.text();
      throw new ProviderRequestError(this.id, errorBody);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ProviderNetworkError(this.id);
    }
    if (!response.ok) {
      const errorBody = await response.text();
      throw new ProviderRequestError(this.id, errorBody);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{ function: { name: string; arguments: string } }>;
        };
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices[0];
    const toolCalls = choice?.message?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      if (toolCalls.length > 1) {
        throw new ToolCallLimitExceeded();
      }
      const toolCall = toolCalls[0];
      return {
        output: '',
        provider: this.id,
        model: request.model,
        tool_call: {
          tool_id: unsanitizeToolId(toolCall.function.name),
          input: JSON.parse(toolCall.function.arguments),
        },
        usage: data.usage
          ? {
              input_tokens: data.usage.prompt_tokens,
              output_tokens: data.usage.completion_tokens,
              total_tokens: data.usage.total_tokens,
            }
          : undefined,
      };
    }

    return {
      output: choice?.message?.content || '',
      provider: this.id,
      model: request.model,
      usage: data.usage
        ? {
            input_tokens: data.usage.prompt_tokens,
            output_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
```

Also add the import for `ToolCallLimitExceeded`:

Replace the existing imports with:

```typescript
import { ModelProvider, ModelInvocationRequest, ModelInvocationResult, ToolDefinition } from './types.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError } from './errors.js';
import { ToolCallLimitExceeded } from '../tool/errors.js';
```

- [ ] **Step 3: Add OpenAIProvider tool calling tests**

Append to `tests/unit/openai-provider.test.ts`:

```typescript
  it('should map tools to OpenAI function schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAIProvider();
    await provider.invoke({
      provider: 'openai',
      model: 'gpt-4',
      input: 'hello',
      tools: [{ id: 'context.read', executor: 'context.read', risk: 'low', description: 'Read context' }],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.name).toBe('context_read');
    expect(body.tools[0].function.description).toBe('Read context');
  });

  it('should parse first tool call from response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      function: {
                        name: 'context_read',
                        arguments: JSON.stringify({ path: '.wolf/context/context.md' }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
      })
    );
    const provider = new OpenAIProvider();
    const result = await provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' });
    expect(result.tool_call).toBeDefined();
    expect(result.tool_call!.tool_id).toBe('context.read');
    expect(result.tool_call!.input).toEqual({ path: '.wolf/context/context.md' });
  });

  it('should throw ToolCallLimitExceeded for multiple tool calls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  tool_calls: [
                    { function: { name: 'tool_a', arguments: '{}' } },
                    { function: { name: 'tool_b', arguments: '{}' } },
                  ],
                },
              },
            ],
          }),
      })
    );
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ToolCallLimitExceeded
    );
  });
```

Add the import for `ToolCallLimitExceeded` at the top of the test file:

Replace the existing imports with:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from '../../src/model/openai-provider.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError } from '../../src/model/errors.js';
import { ToolCallLimitExceeded } from '../../src/tool/errors.js';
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/openai-provider.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/openai-provider.ts tests/unit/openai-provider.test.ts
git commit -m "feat(mvp6): extend OpenAIProvider with tool calling support"
```

---

## PR3: AgentRunner Two-Pass Execution

**Scope:** Extend AgentRunner with tool calling in invoke mode only.

---

### Task 3.1: Extend `src/agent/runner.ts` with tool calling

**Files:**
- Modify: `src/agent/runner.ts`
- Create: `tests/unit/agent-runner-tool-call.test.ts`

- [ ] **Step 1: Add imports for tool layer**

Replace the top imports of `src/agent/runner.ts` with:

```typescript
import { StepRunner, ExecutionContext } from '../types/runner.js';
import { StepDefinition } from '../types/workflow.js';
import { StepResult } from '../types/state.js';
import { AgentRegistry } from './registry.js';
import { ModelRouter, ModelRouteNotFound } from './router.js';
import { AgentInvocationPlan, ModelRoute, AgentModelResult } from '../types/agent.js';
import { ModelProviderRegistry } from '../model/registry.js';
import { ModelInvocationRequest, ModelToolCall } from '../model/types.js';
import { ToolRegistry } from '../tool/registry.js';
import { ToolExecutionContext } from '../tool/types.js';
import { ToolNotAllowed, ToolCallLimitExceeded } from '../tool/errors.js';
import { ContextReadError } from '../model/errors.js';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
```

- [ ] **Step 2: Add Pass 2 input builder**

Add after the helper functions:

```typescript
function buildPass2Input(originalTask: string, toolCall: ModelToolCall, toolOutput: string): string {
  return [originalTask, '', `[Tool Call Result: ${toolCall.tool_id}]`, toolOutput].join('\n');
}
```

- [ ] **Step 3: Update AgentRunner constructor and add tool handling**

Replace the AgentRunner class with:

```typescript
export class AgentRunner implements StepRunner {
  type = 'agent';

  constructor(
    private registry: AgentRegistry,
    private router: ModelRouter,
    private providerRegistry?: ModelProviderRegistry,
    private toolRegistry?: ToolRegistry,
    private globalExecutionMode: 'stub' | 'invoke' = 'stub'
  ) {}

  async run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult> {
    const agentId = step.input?.agent;
    if (!agentId || typeof agentId !== 'string') {
      return {
        status: 'failure',
        error: { type: 'AgentInputValidationError', message: 'Missing or invalid input.agent field', retryable: false },
      };
    }

    const agent = this.registry.get(agentId);
    if (!agent) {
      return {
        status: 'failure',
        error: { type: 'AgentNotFound', message: `Agent not found: ${agentId}`, retryable: false },
      };
    }

    let route: ModelRoute;
    try {
      route = this.router.resolve(agent.model_route);
    } catch (err) {
      if (err instanceof ModelRouteNotFound) {
        return { status: 'failure', error: { type: 'ModelRouteNotFound', message: err.message, retryable: false } };
      }
      throw err;
    }

    const contextBundle = step.input?.context_bundle as string | undefined;
    if (contextBundle) {
      const validation = validateContextBundlePath(contextBundle, ctx.config.state_dir);
      if (!validation.valid) {
        return {
          status: 'failure',
          error: { type: 'ContextBundleValidationError', message: validation.reason || 'Context bundle validation failed', retryable: false },
        };
      }
    }

    const mode = resolveExecutionMode(route, this.globalExecutionMode);

    if (mode === 'invoke') {
      return this.runInvoke(step, ctx, agent, route, contextBundle);
    }

    // Stub mode: return AgentInvocationPlan (MVP4 behavior)
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

    return { status: 'success', output: JSON.stringify(plan, null, 2) };
  }

  private async runInvoke(
    step: StepDefinition,
    ctx: ExecutionContext,
    agent: ReturnType<AgentRegistry['get']>,
    route: ModelRoute,
    contextBundle?: string
  ): Promise<StepResult> {
    const task = step.input?.task;
    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      return {
        status: 'failure',
        error: { type: 'AgentInputValidationError', message: 'Missing or empty input.task field in invoke mode', retryable: false },
      };
    }

    let contextContent: string | undefined;
    if (contextBundle) {
      const projectRoot = dirname(ctx.config.state_dir);
      const resolved = resolve(projectRoot, contextBundle);
      try {
        contextContent = readContextBundle(resolved);
      } catch (err) {
        if (err instanceof ContextReadError) {
          return { status: 'failure', error: { type: 'ContextReadError', message: err.message, retryable: false } };
        }
        throw err;
      }
    }

    if (!this.providerRegistry) {
      return { status: 'failure', error: { type: 'ProviderNotFound', message: 'No provider registry configured', retryable: false } };
    }

    let provider;
    try {
      provider = this.providerRegistry.require(route.provider);
    } catch (err) {
      return {
        status: 'failure',
        error: { type: 'ProviderNotFound', message: err instanceof Error ? err.message : String(err), retryable: false },
      };
    }

    // Resolve available tools (invoke mode only)
    let availableTools: import('../tool/types.js').ToolDefinition[] | undefined;
    if (this.toolRegistry && agent.tools.length > 0) {
      try {
        availableTools = this.toolRegistry.listForAgent(agent.tools);
      } catch (err) {
        if (err instanceof ToolNotAllowed) {
          return { status: 'failure', error: { type: 'ToolNotAllowed', message: err.message, retryable: false } };
        }
        throw err;
      }
    }

    // Pass 1: Invoke model with tools
    const pass1Request: ModelInvocationRequest = {
      provider: route.provider,
      model: route.model,
      input: task,
      system_prompt: (step.input?.system_prompt as string | undefined) ?? agent?.system_prompt ?? route.system_prompt,
      context: contextContent,
      max_tokens: route.max_tokens,
      temperature: route.temperature,
      tools: availableTools && availableTools.length > 0 ? availableTools : undefined,
    };

    let pass1Result;
    try {
      pass1Result = await provider.invoke(pass1Request);
    } catch (err) {
      return {
        status: 'failure',
        error: { type: err instanceof Error ? err.constructor.name : 'ProviderError', message: err instanceof Error ? err.message : String(err), retryable: err instanceof ContextReadError ? false : true },
      };
    }

    // Check for tool call
    if (pass1Result.tool_call) {
      return this.handleToolCall(pass1Result.tool_call, agent!, step, ctx, route, pass1Result, provider, task, contextContent);
    }

    // No tool call — return result
    return this.buildModelResult(pass1Result, agent!, route);
  }

  private async handleToolCall(
    toolCall: ModelToolCall,
    agent: NonNullable<ReturnType<AgentRegistry['get']>>,
    step: StepDefinition,
    ctx: ExecutionContext,
    route: ModelRoute,
    pass1Result: import('../model/types.js').ModelInvocationResult,
    provider: import('../model/types.js').ModelProvider,
    task: string,
    contextContent?: string
  ): Promise<StepResult> {
    // Validate allow-list
    if (!agent.tools.includes(toolCall.tool_id)) {
      return { status: 'failure', error: { type: 'ToolNotAllowed', message: new ToolNotAllowed(toolCall.tool_id, agent.id).message, retryable: false } };
    }

    if (!this.toolRegistry) {
      return { status: 'failure', error: { type: 'ToolNotFound', message: 'No tool registry configured', retryable: false } };
    }

    const toolDef = this.toolRegistry.requireDefinition(toolCall.tool_id);
    const executor = this.toolRegistry.requireExecutor(toolDef.executor);

    const toolCtx: ToolExecutionContext = {
      case_id: ctx.case_id,
      workflow_id: ctx.workflow_id,
      step_id: step.id,
      project_root: ctx.project_root || dirname(resolve(ctx.config.state_dir)),
      agent_id: agent.id,
    };

    // Execute tool
    let toolResult;
    try {
      toolResult = await executor.execute({ tool_id: toolCall.tool_id, input: toolCall.input }, toolCtx);
    } catch (err) {
      return {
        status: 'failure',
        error: { type: err instanceof Error ? err.constructor.name : 'ToolExecutionError', message: err instanceof Error ? err.message : String(err), retryable: false },
      };
    }

    // Pass 2: Invoke model with tool result (no tools exposed)
    const pass2Request: ModelInvocationRequest = {
      provider: route.provider,
      model: route.model,
      input: buildPass2Input(task, toolCall, toolResult.output),
      system_prompt: (step.input?.system_prompt as string | undefined) ?? agent.system_prompt ?? route.system_prompt,
      context: contextContent,
      max_tokens: route.max_tokens,
      temperature: route.temperature,
    };

    let pass2Result;
    try {
      pass2Result = await provider.invoke(pass2Request);
    } catch (err) {
      return {
        status: 'failure',
        error: { type: err instanceof Error ? err.constructor.name : 'ProviderError', message: err instanceof Error ? err.message : String(err), retryable: false },
      };
    }

    if (pass2Result.tool_call) {
      return { status: 'failure', error: { type: 'ToolCallLimitExceeded', message: new ToolCallLimitExceeded().message, retryable: false } };
    }

    return this.buildModelResult(pass2Result, agent, route);
  }

  private buildModelResult(
    result: import('../model/types.js').ModelInvocationResult,
    agent: NonNullable<ReturnType<AgentRegistry['get']>>,
    route: ModelRoute
  ): StepResult {
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

    return { status: 'success', output: JSON.stringify(modelResult, null, 2) };
  }
}
```

- [ ] **Step 4: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/agent/runner.ts
git commit -m "feat(mvp6): add two-pass tool execution to AgentRunner"
```

---

### Task 3.2: Write AgentRunner tool calling tests

**Files:**
- Create: `tests/unit/agent-runner-tool-call.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { ToolRegistry } from '../../src/tool/registry.js';
import { ContextReadToolExecutor } from '../../src/tool/executors/context-read.js';
import { AgentDefinition } from '../../src/types/agent.js';
import { StepDefinition } from '../../src/types/workflow.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const mockAgents: AgentDefinition[] = [
  { id: 'reviewer', name: 'Reviewer', model_route: 'route-a', tools: ['context.read'], capabilities: [], system_prompt: 'You review code' },
  { id: 'no-tools', name: 'No Tools', model_route: 'route-a', tools: [], capabilities: [] },
];

const mockRoutes = {
  'route-a': { provider: 'mock', model: 'mock-chat', execution_mode: 'invoke' as const },
};

function createRunner(
  agents = mockAgents,
  routes = mockRoutes,
  mode: 'stub' | 'invoke' = 'invoke',
  providers = new ModelProviderRegistry([new MockProvider()]),
  toolRegistry?: ToolRegistry
) {
  const registry = new AgentRegistry(agents);
  const router = new ModelRouter(routes);
  return new AgentRunner(registry, router, providers, toolRegistry, mode);
}

function createContext(stateDir: string) {
  return {
    case_id: 'c1',
    workflow_id: 'w1',
    variables: {},
    project_root: dirname(stateDir),
    config: { state_dir: stateDir },
  };
}

describe('AgentRunner tool calling', () => {
  let tmpDir: string;
  let stateDir: string;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(join(tmpDir, '.wolf', 'context'), { recursive: true });
    writeFileSync(join(tmpDir, '.wolf', 'context', 'context.md'), '# Project Context\n\nThis is the context.');
    toolRegistry = new ToolRegistry();
    toolRegistry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low' });
    toolRegistry.registerExecutor(new ContextReadToolExecutor());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should execute tool call and return final model result in invoke mode', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'invoke', new ModelProviderRegistry([new MockProvider()]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: {
        agent: 'reviewer',
        task: 'Review this code',
        metadata: {
          mock_tool_call: { tool_id: 'context.read', input: { path: '.wolf/context/context.md' } },
        },
      },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.type).toBe('agent_model_result');
    expect(modelResult.output).toContain('[mock:mock-chat]');
  });

  it('should return AgentInvocationPlan in stub mode even with tools', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'stub', new ModelProviderRegistry([new MockProvider()]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'reviewer', task: 'Review this code' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.type).toBe('agent_invocation_plan');
    expect(plan.tools).toContain('context.read');
  });

  it('should fail with ToolNotAllowed for tool not in agent.tools', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'invoke', new ModelProviderRegistry([new MockProvider()]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: {
        agent: 'no-tools',
        task: 'Do something',
        metadata: { mock_tool_call: { tool_id: 'context.read', input: {} } },
      },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ToolNotAllowed');
  });

  it('should fail with ToolCallLimitExceeded if Pass 2 returns tool_call', async () => {
    const mockProvider = new MockProvider();
    const providerWithSecondCall = {
      ...mockProvider,
      invoke: async (req: import('../../src/model/types.js').ModelInvocationRequest) => {
        if (req.input.includes('[Tool Call Result:')) {
          return { output: '', provider: 'mock', model: req.model, tool_call: { tool_id: 'context.read', input: {} } };
        }
        return mockProvider.invoke(req);
      },
    };
    const runner = createRunner(mockAgents, mockRoutes, 'invoke', new ModelProviderRegistry([providerWithSecondCall as any]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: {
        agent: 'reviewer',
        task: 'Review',
        metadata: { mock_tool_call: { tool_id: 'context.read', input: { path: '.wolf/context/context.md' } } },
      },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ToolCallLimitExceeded');
  });

  it('should invoke model without tools when agent has no tools', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'invoke', new ModelProviderRegistry([new MockProvider()]), toolRegistry);
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'no-tools', task: 'Hello' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/agent-runner-tool-call.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/agent-runner-tool-call.test.ts
git commit -m "test(mvp6): add AgentRunner tool calling tests"
```

---

## PR4: Policy Integration for Tool Calls

**Scope:** Extend PolicyEngine with tool_runtime enforcement and gate support.

---

### Task 4.1: Extend PolicyRule match schema

**Files:**
- Modify: `src/types/policy.ts`

- [ ] **Step 1: Extend PolicyRuleSchema**

Replace the existing `PolicyRuleSchema` with:

```typescript
export const PolicyRuleSchema = z.object({
  id: z.string(),
  match: z
    .object({
      runner: z.string().optional(),
      command_contains: z.array(z.string()).optional(),
      step_id: z.string().optional(),
      tool_id: z.string().optional(),
      tool_risk: RiskLevelSchema.optional(),
    })
    .default({}),
  decision: DecisionTypeSchema,
  risk: RiskLevelSchema.optional(),
  reason: z.string(),
});
```

- [ ] **Step 2: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/policy.ts
git commit -m "feat(mvp6): extend PolicyRule match with tool_id and tool_risk"
```

---

### Task 4.2: Add evaluateTool to PolicyEngine

**Files:**
- Modify: `src/policy/engine.ts`
- Modify: `tests/unit/policy-engine.test.ts`

- [ ] **Step 1: Add evaluateTool method**

Append to `src/policy/engine.ts` before the closing brace:

```typescript
  evaluateTool(
    toolDef: import('../tool/types.js').ToolDefinition,
    ctx: import('../tool/types.js').ToolExecutionContext,
    config: PolicyConfig
  ): PolicyDecision {
    const matchedRules: PolicyRule[] = [];

    for (const rule of config.rules) {
      if (this.matchesTool(rule, toolDef)) {
        matchedRules.push(rule);
      }
    }

    let decision: PolicyDecision['decision'] = 'allow';
    let risk: PolicyDecision['risk'] = 'low';
    let primaryRuleId: string | undefined;
    let reason = 'No matching policy rule';

    if (matchedRules.length > 0) {
      const primary = this.selectPrimary(matchedRules);
      decision = primary.decision;
      risk = primary.risk || 'low';
      primaryRuleId = primary.id;
      reason = primary.reason;
    }

    const maxRisk = config.defaults.max_risk;
    if (this.riskLevel(risk) > this.riskLevel(maxRisk) && decision === 'allow') {
      decision = 'ask';
    }

    const decisionId = `policy_${ctx.workflow_id}_${ctx.step_id}_${toolDef.id}_${primaryRuleId || 'default'}_tool_runtime`;

    return {
      id: decisionId,
      decision,
      risk,
      rule_id: primaryRuleId,
      reason,
      enforcement: 'tool_runtime',
      subject: {
        workflow_id: ctx.workflow_id,
        step_id: ctx.step_id,
        runner: 'agent',
        tool_id: toolDef.id,
        tool_risk: toolDef.risk,
      },
      matched_rules: matchedRules.map((r) => r.id),
    };
  }

  private matchesTool(
    rule: PolicyRule,
    toolDef: import('../tool/types.js').ToolDefinition
  ): boolean {
    if (rule.match.tool_id && rule.match.tool_id !== toolDef.id) {
      return false;
    }
    if (rule.match.tool_risk && rule.match.tool_risk !== toolDef.risk) {
      return false;
    }
    return true;
  }
```

- [ ] **Step 2: Add PolicyEngine tool tests**

Append to `tests/unit/policy-engine.test.ts`:

```typescript
describe('PolicyEngine tool evaluation', () => {
  const toolDef = { id: 'context.read', executor: 'context.read', risk: 'low' as const };
  const toolCtx = { case_id: 'c1', workflow_id: 'w1', step_id: 's1', project_root: '/tmp', agent_id: 'a1' };

  it('should allow context.read by default', () => {
    const engine = new PolicyEngine();
    const decision = engine.evaluateTool(toolDef, toolCtx, config);
    expect(decision.decision).toBe('allow');
    expect(decision.enforcement).toBe('tool_runtime');
  });

  it('should match tool_id rule', () => {
    const engine = new PolicyEngine();
    const toolConfig = {
      ...config,
      rules: [
        {
          id: 'allow-context-read',
          match: { tool_id: 'context.read' },
          decision: 'allow' as const,
          risk: 'low' as const,
          reason: 'Context read is safe',
        },
      ],
    };
    const decision = engine.evaluateTool(toolDef, toolCtx, toolConfig);
    expect(decision.decision).toBe('allow');
    expect(decision.rule_id).toBe('allow-context-read');
  });

  it('should match tool_risk rule', () => {
    const engine = new PolicyEngine();
    const criticalTool = { id: 'shell.command', executor: 'shell.command', risk: 'critical' as const };
    const toolConfig = {
      ...config,
      rules: [
        {
          id: 'ask-critical',
          match: { tool_risk: 'critical' as const },
          decision: 'ask' as const,
          risk: 'critical' as const,
          reason: 'Critical tools require approval',
        },
      ],
    };
    const decision = engine.evaluateTool(criticalTool, toolCtx, toolConfig);
    expect(decision.decision).toBe('ask');
  });

  it('should deny tool by policy', () => {
    const engine = new PolicyEngine();
    const toolConfig = {
      ...config,
      rules: [
        {
          id: 'deny-shell',
          match: { tool_id: 'context.read' },
          decision: 'deny' as const,
          risk: 'low' as const,
          reason: 'No context reading allowed',
        },
      ],
    };
    const decision = engine.evaluateTool(toolDef, toolCtx, toolConfig);
    expect(decision.decision).toBe('deny');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/policy-engine.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/policy/engine.ts tests/unit/policy-engine.test.ts
git commit -m "feat(mvp6): add PolicyEngine.evaluateTool for tool_runtime enforcement"
```

---

## PR5: CLI Registration, Integration Tests, and Docs

**Scope:** Wire up ToolRegistry in CLI, integration tests, documentation.

---

### Task 5.1: Register ToolRegistry in CLI

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Add imports and register ToolRegistry**

Add to imports:

```typescript
import { ToolRegistry } from '../../tool/registry.js';
import { ContextReadToolExecutor } from '../../tool/executors/context-read.js';
```

Replace the provider registry and AgentRunner registration lines with:

```typescript
const providerRegistry = new ModelProviderRegistry([new MockProvider(), new OpenAIProvider()]);
const toolRegistry = new ToolRegistry();
toolRegistry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low', description: 'Read project context files' });
toolRegistry.registerExecutor(new ContextReadToolExecutor());

registry.register(new AgentRunner(agentRegistry, modelRouter, providerRegistry, toolRegistry, projectConfig.models.execution.mode));
```

- [ ] **Step 2: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat(mvp6): register ToolRegistry with context.read in CLI"
```

---

### Task 5.2: Write integration tests

**Files:**
- Create: `tests/integration/mvp6-tool-calling.test.ts`

- [ ] **Step 1: Write the integration test file**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine } from '../../src/workflow/engine.js';
import { RunnerRegistry } from '../../src/workflow/runner-registry.js';
import { EchoRunner } from '../../src/workflow/runners/echo.js';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { ToolRegistry } from '../../src/tool/registry.js';
import { ContextReadToolExecutor } from '../../src/tool/executors/context-read.js';
import { CaseStore } from '../../src/state/case-store.js';
import { GateStore } from '../../src/state/gate-store.js';
import { InProcessEventBus } from '../../src/kernel/event-bus.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MVP6 Tool Calling Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `wolf-mvp6-${Date.now()}`);
    mkdirSync(join(tmpDir, '.wolf', 'state'), { recursive: true });
    mkdirSync(join(tmpDir, '.wolf', 'context'), { recursive: true });
    writeFileSync(join(tmpDir, '.wolf', 'context', 'context.md'), '# Project Context\n\nIntegration test context.');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should execute end-to-end tool call workflow', async () => {
    const runnerRegistry = new RunnerRegistry();
    runnerRegistry.register(new EchoRunner());

    const agentRegistry = new AgentRegistry([
      { id: 'reviewer', model_route: 'mock', tools: ['context.read'], capabilities: [] },
    ]);
    const modelRouter = new ModelRouter({ mock: { provider: 'mock', model: 'mock-chat' } });
    const providerRegistry = new ModelProviderRegistry([new MockProvider()]);
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low' });
    toolRegistry.registerExecutor(new ContextReadToolExecutor());

    runnerRegistry.register(new AgentRunner(agentRegistry, modelRouter, providerRegistry, toolRegistry, 'invoke'));

    const engine = new WorkflowEngine(runnerRegistry);
    const bus = new InProcessEventBus();
    const store = new CaseStore(join(tmpDir, '.wolf', 'state'));
    const gateStore = new GateStore(join(tmpDir, '.wolf', 'state'));

    const result = await engine.run(
      {
        id: 'test-wf',
        name: 'Test',
        version: '1',
        steps: [
          {
            id: 'step1',
            type: 'builtin',
            runner: 'agent',
            input: {
              agent: 'reviewer',
              task: 'Review code',
              metadata: { mock_tool_call: { tool_id: 'context.read', input: { path: '.wolf/context/context.md' } } },
            },
          },
        ],
      },
      { case_id: 'c1', workflow_id: 'test-wf', variables: {}, config: { state_dir: join(tmpDir, '.wolf', 'state') } },
      bus,
      store,
      gateStore
    );

    expect(result.status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/integration/mvp6-tool-calling.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mvp6-tool-calling.test.ts
git commit -m "test(mvp6): add tool calling integration tests"
```

---

### Task 5.3: Update docs/development.md

**Files:**
- Modify: `docs/development.md`

- [ ] **Step 1: Add MVP6 section**

Append to `docs/development.md`:

```markdown
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
      reason: "Context read is safe"
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/development.md
git commit -m "docs(mvp6): add Agent Tool Calling section"
```

---

### Task 5.4: Final acceptance verification

**Files:**
- All

- [ ] **Step 1: Run full test suite**

```bash
npm run check
```

Expected: format, lint, test, build all pass.

- [ ] **Step 2: Verify Docker tests**

```bash
docker build --target test -t mister-wolf:test . && docker run --rm mister-wolf:test
```

Expected: all tests pass in Docker.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore(mvp6): final acceptance verification"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Plan Task |
|-------------|-----------|
| Tool types (Section 1) | Task 1.1 |
| Tool errors (Section 2) | Task 1.2 |
| ToolRegistry (Section 3) | Task 1.3 |
| context.read executor (Section 4) | Task 1.4 |
| Agent allow-list (Section 5) | Task 3.1, 3.2 |
| Two-pass execution (Section 6) | Task 3.1, 3.2 |
| Policy integration (Section 7) | Task 4.1, 4.2 |
| Tool approval gate (Section 8) | Task 4.2 (gate payload in policy) |
| MockProvider tool calling (Section 9.1) | Task 2.2 |
| OpenAIProvider tool calling (Section 9.2) | Task 2.3 |
| AgentRunner integration (Section 10) | Task 3.1, 3.2 |
| Events (Section 11) | Implicit in execution flow |
| Integration points (Section 12) | Task 5.1, 5.2 |
| Testing (Section 13) | All PRs |
| Acceptance criteria (Section 14) | Task 5.4 |

### Placeholder Scan

No placeholders found. All steps contain:
- Exact file paths
- Complete code blocks
- Exact commands with expected output
- No "TBD", "TODO", or "implement later"

### Type Consistency Check

- `ToolDefinition` used consistently across all tasks
- `ModelToolCall` used in MockProvider, OpenAIProvider, AgentRunner
- `ToolExecutionContext` used in ContextReadToolExecutor and AgentRunner
- `buildPass2Input` signature matches usage
- PolicyEngine `evaluateTool` signature matches usage

**Plan complete.**
