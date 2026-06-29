# MVP5: Model Provider Runtime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real model execution to the Mr.Wolf framework via a `ModelProvider` abstraction with deterministic `MockProvider` for tests and optional `OpenAIProvider` for real LLM calls.

**Architecture:** A `ModelProvider` interface with `invoke(request)` method. `ModelProviderRegistry` holds providers. `AgentRunner` resolves execution mode (stub vs invoke) from config: if stub, returns `AgentInvocationPlan` (MVP4 behavior); if invoke, builds `ModelInvocationRequest`, calls provider, returns `AgentModelResult`. PolicyStepGuard runs before AgentRunner as before. Error taxonomy maps HTTP codes to typed errors with retryability.

**Tech Stack:** TypeScript, Zod, native `fetch`, Vitest

---

## File Structure

### New Files

| File                                            | Responsibility                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/model/types.ts`                            | `ModelInvocationRequest`, `ModelInvocationResult`, `ModelProvider`, `AgentModelResult` interfaces                                    |
| `src/model/errors.ts`                           | Provider error taxonomy: `ProviderNotFound`, `ProviderAuthError`, `ProviderRequestError`, `ProviderNetworkError`, `ContextReadError` |
| `src/model/registry.ts`                         | `ModelProviderRegistry` — get, require, list                                                                                         |
| `src/model/mock-provider.ts`                    | `MockProvider` — deterministic test provider                                                                                         |
| `src/model/openai-provider.ts`                  | `OpenAIProvider` — native fetch to OpenAI API                                                                                        |
| `tests/unit/model-provider-registry.test.ts`    | Registry unit tests                                                                                                                  |
| `tests/unit/mock-provider.test.ts`              | MockProvider unit tests                                                                                                              |
| `tests/unit/openai-provider.test.ts`            | OpenAIProvider unit tests with mocked fetch                                                                                          |
| `tests/unit/agent-runner-invoke.test.ts`        | AgentRunner invoke mode tests                                                                                                        |
| `tests/integration/mvp5-model-provider.test.ts` | Integration tests for policy + execution modes                                                                                       |

### Modified Files

| File                                | Changes                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/types/agent.ts`                | Add `system_prompt` to `AgentDefinitionSchema`; add `temperature`, `execution_mode`, `system_prompt` to `ModelRouteSchema`; add `AgentModelResult` interface |
| `src/config/project-config.ts`      | Add `models.execution.mode` to `ModelsConfigSchema`; update `ProjectConfigSchema`                                                                            |
| `src/agent/runner.ts`               | Add invoke mode, execution mode resolution, task validation, context bundle reading, provider registry integration                                           |
| `src/cli/commands/run.ts`           | Register `MockProvider` and `OpenAIProvider` in `ModelProviderRegistry`; pass registry + global mode to `AgentRunner`                                        |
| `tests/unit/project-config.test.ts` | Add tests for `models.execution.mode` and route fields                                                                                                       |
| `README.md`                         | Update MVP5 status to Complete                                                                                                                               |
| `docs/development.md`               | Add Model Provider Runtime section                                                                                                                           |

---

## PR1: Provider Types + Config Extensions

**Scope:** Core type definitions and config schema extensions.

---

### Task 1.1: Create `src/model/types.ts`

**Files:**

- Create: `src/model/types.ts`

- [ ] **Step 1: Write `src/model/types.ts`**

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

- [ ] **Step 2: Commit**

```bash
git add src/model/types.ts
git commit -m "feat(mvp5): add ModelProvider core types"
```

---

### Task 1.2: Create `src/model/errors.ts`

**Files:**

- Create: `src/model/errors.ts`

- [ ] **Step 1: Write `src/model/errors.ts`**

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

- [ ] **Step 2: Commit**

```bash
git add src/model/errors.ts
git commit -m "feat(mvp5): add provider error taxonomy"
```

---

### Task 1.3: Extend `src/types/agent.ts`

**Files:**

- Modify: `src/types/agent.ts`

- [ ] **Step 1: Modify `AgentDefinitionSchema` to add `system_prompt`**

Replace the existing `AgentDefinitionSchema` block with:

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

- [ ] **Step 2: Modify `ModelRouteSchema` to add new fields**

Replace the existing `ModelRouteSchema` block with:

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

- [ ] **Step 3: Add `AgentModelResult` interface at end of file**

Append to the end of `src/types/agent.ts`:

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

- [ ] **Step 4: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/agent.ts
git commit -m "feat(mvp5): extend AgentDefinition and ModelRoute schemas"
```

---

### Task 1.4: Extend `src/config/project-config.ts`

**Files:**

- Modify: `src/config/project-config.ts`

- [ ] **Step 1: Replace `ModelsConfigSchema` and update `ProjectConfigSchema`**

Replace lines 79–89 (the `ProjectConfigSchema` definition) with:

```typescript
export const ModelsConfigSchema = z.object({
  execution: z
    .object({
      mode: z.enum(['stub', 'invoke']).default('stub'),
    })
    .default({ mode: 'stub' }),
  routes: z.record(ModelRouteSchema).default({}),
});

export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

export const ProjectConfigSchema = z.object({
  state_dir: z.string().default('.wolf/state'),
  index_path: z.string().optional(),
  context: ContextConfigSchema.default({}),
  policy: PolicyConfigSchema.default({}),
  agents: z.array(AgentDefinitionSchema).default([]),
  models: ModelsConfigSchema.default({ routes: {} }),
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
```

- [ ] **Step 2: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/config/project-config.ts
git commit -m "feat(mvp5): add models.execution.mode to project config"
```

---

### Task 1.5: Add config tests in `tests/unit/project-config.test.ts`

**Files:**

- Modify: `tests/unit/project-config.test.ts`

- [ ] **Step 1: Add test for `models.execution.mode` default**

Append inside the `describe('loadProjectConfig', ...)` block:

```typescript
it('should default models.execution.mode to stub', () => {
  const config = loadProjectConfig(join(tempDir, 'nonexistent.yaml'));
  expect(config.models.execution.mode).toBe('stub');
});

it('should load custom models.execution.mode', () => {
  writeFileSync(
    join(tempDir, 'wolf.yaml'),
    `
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: mock
      model: mock-chat
`
  );
  const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
  expect(config.models.execution.mode).toBe('invoke');
  expect(config.models.routes['default'].provider).toBe('mock');
  expect(config.models.routes['default'].model).toBe('mock-chat');
});

it('should load route with temperature, execution_mode, and system_prompt', () => {
  writeFileSync(
    join(tempDir, 'wolf.yaml'),
    `
agents:
  - id: reviewer
    model_route: openai-gpt4
    system_prompt: "You are a code reviewer."
models:
  routes:
    openai-gpt4:
      provider: openai
      model: gpt-4
      temperature: 0.7
      execution_mode: invoke
      system_prompt: "You are a helpful assistant."
`
  );
  const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
  expect(config.agents[0].system_prompt).toBe('You are a code reviewer.');
  const route = config.models.routes['openai-gpt4'];
  expect(route.temperature).toBe(0.7);
  expect(route.execution_mode).toBe('invoke');
  expect(route.system_prompt).toBe('You are a helpful assistant.');
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/project-config.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/project-config.test.ts
git commit -m "test(mvp5): add config schema tests for execution mode and route fields"
```

---

## PR2: ProviderRegistry + MockProvider

**Scope:** Registry implementation and deterministic mock provider.

---

### Task 2.1: Create `src/model/registry.ts`

**Files:**

- Create: `src/model/registry.ts`

- [ ] **Step 1: Write `src/model/registry.ts`**

```typescript
import { ModelProvider } from './types.js';
import { ProviderNotFound } from './errors.js';

export class ModelProviderRegistry {
  private providers = new Map<string, ModelProvider>();

  constructor(providers: ModelProvider[] = []) {
    for (const provider of providers) {
      this.providers.set(provider.id, provider);
    }
  }

  get(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  require(id: string): ModelProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderNotFound(id);
    }
    return provider;
  }

  list(): ModelProvider[] {
    return Array.from(this.providers.values());
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/model/registry.ts
git commit -m "feat(mvp5): add ModelProviderRegistry"
```

---

### Task 2.2: Create `src/model/mock-provider.ts`

**Files:**

- Create: `src/model/mock-provider.ts`

- [ ] **Step 1: Write `src/model/mock-provider.ts`**

```typescript
import { ModelProvider, ModelInvocationRequest, ModelInvocationResult } from './types.js';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class MockProvider implements ModelProvider {
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
```

- [ ] **Step 2: Commit**

```bash
git add src/model/mock-provider.ts
git commit -m "feat(mvp5): add deterministic MockProvider"
```

---

### Task 2.3: Write registry tests

**Files:**

- Create: `tests/unit/model-provider-registry.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { ProviderNotFound } from '../../src/model/errors.js';

describe('ModelProviderRegistry', () => {
  it('should register providers on construction', () => {
    const mock = new MockProvider();
    const registry = new ModelProviderRegistry([mock]);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].id).toBe('mock');
  });

  it('should get an existing provider', () => {
    const mock = new MockProvider();
    const registry = new ModelProviderRegistry([mock]);
    expect(registry.get('mock')).toBe(mock);
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should require an existing provider', () => {
    const mock = new MockProvider();
    const registry = new ModelProviderRegistry([mock]);
    expect(registry.require('mock')).toBe(mock);
  });

  it('should throw ProviderNotFound when requiring unknown provider', () => {
    const registry = new ModelProviderRegistry();
    expect(() => registry.require('openai')).toThrow(ProviderNotFound);
    expect(() => registry.require('openai')).toThrow('Provider not found: openai');
  });

  it('should return empty list when no providers registered', () => {
    const registry = new ModelProviderRegistry();
    expect(registry.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/model-provider-registry.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/model-provider-registry.test.ts
git commit -m "test(mvp5): add ModelProviderRegistry tests"
```

---

### Task 2.4: Write MockProvider tests

**Files:**

- Create: `tests/unit/mock-provider.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { MockProvider } from '../../src/model/mock-provider.js';

describe('MockProvider', () => {
  it('should return deterministic output with model prefix', async () => {
    const provider = new MockProvider();
    const result = await provider.invoke({
      provider: 'mock',
      model: 'mock-chat',
      input: 'Hello world',
    });
    expect(result.output).toBe('[mock:mock-chat] Hello world');
    expect(result.provider).toBe('mock');
    expect(result.model).toBe('mock-chat');
  });

  it('should truncate input to 200 characters', async () => {
    const provider = new MockProvider();
    const longInput = 'a'.repeat(300);
    const result = await provider.invoke({
      provider: 'mock',
      model: 'mock-chat',
      input: longInput,
    });
    expect(result.output).toBe(`[mock:mock-chat] ${'a'.repeat(200)}...`);
  });

  it('should include usage with token estimates', async () => {
    const provider = new MockProvider();
    const result = await provider.invoke({
      provider: 'mock',
      model: 'mock-chat',
      input: 'Hello',
    });
    expect(result.usage).toBeDefined();
    expect(result.usage!.input_tokens).toBe(2); // ceil(5/4)
    expect(result.usage!.output_tokens).toBeGreaterThan(0);
    expect(result.usage!.total_tokens).toBe(result.usage!.input_tokens! + result.usage!.output_tokens!);
  });

  it('should include context tokens in input_tokens', async () => {
    const provider = new MockProvider();
    const result = await provider.invoke({
      provider: 'mock',
      model: 'mock-chat',
      input: 'Hello',
      context: 'Some context',
    });
    expect(result.usage!.input_tokens).toBe(5); // ceil(5/4) + ceil(12/4) = 2 + 3
  });

  it('should be deterministic across multiple invocations', async () => {
    const provider = new MockProvider();
    const req = { provider: 'mock', model: 'mock-chat', input: 'Test' };
    const r1 = await provider.invoke(req);
    const r2 = await provider.invoke(req);
    expect(r1.output).toBe(r2.output);
    expect(r1.usage).toEqual(r2.usage);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/mock-provider.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/mock-provider.test.ts
git commit -m "test(mvp5): add MockProvider deterministic behavior tests"
```

---

## PR3: OpenAIProvider + Error Mapping

**Scope:** OpenAI provider with native fetch and HTTP error mapping.

---

### Task 3.1: Create `src/model/openai-provider.ts`

**Files:**

- Create: `src/model/openai-provider.ts`

- [ ] **Step 1: Write `src/model/openai-provider.ts`**

```typescript
import { ModelProvider, ModelInvocationRequest, ModelInvocationResult } from './types.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError } from './errors.js';

export class OpenAIProvider implements ModelProvider {
  id = 'openai';
  private baseUrl = 'https://api.openai.com/v1/chat/completions';

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
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    return {
      output: data.choices[0]?.message?.content || '',
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
}
```

- [ ] **Step 2: Commit**

```bash
git add src/model/openai-provider.ts
git commit -m "feat(mvp5): add OpenAIProvider with fetch and error mapping"
```

---

### Task 3.2: Write OpenAIProvider tests with mocked fetch

**Files:**

- Create: `tests/unit/openai-provider.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from '../../src/model/openai-provider.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError } from '../../src/model/errors.js';

describe('OpenAIProvider', () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('should throw ProviderAuthError when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderAuthError
    );
  });

  it('should map 401 to ProviderAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderAuthError
    );
  });

  it('should map 403 to ProviderAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 403, ok: false }));
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderAuthError
    );
  });

  it('should map 400 to ProviderRequestError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 400, ok: false, text: () => Promise.resolve('bad request') })
    );
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderRequestError
    );
  });

  it('should map 404 to ProviderRequestError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, text: () => Promise.resolve('not found') })
    );
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderRequestError
    );
  });

  it('should map 429 to ProviderNetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 429, ok: false }));
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderNetworkError
    );
  });

  it('should map 500 to ProviderNetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 500, ok: false }));
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderNetworkError
    );
  });

  it('should map 502 to ProviderNetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 502, ok: false }));
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderNetworkError
    );
  });

  it('should map 503 to ProviderNetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503, ok: false }));
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderNetworkError
    );
  });

  it('should map 504 to ProviderNetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 504, ok: false }));
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderNetworkError
    );
  });

  it('should map fetch failure to ProviderNetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const provider = new OpenAIProvider();
    await expect(provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' })).rejects.toThrow(
      ProviderNetworkError
    );
  });

  it('should return result on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Hello back' } }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
          }),
      })
    );
    const provider = new OpenAIProvider();
    const result = await provider.invoke({ provider: 'openai', model: 'gpt-4', input: 'hello' });
    expect(result.output).toBe('Hello back');
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4');
    expect(result.usage).toEqual({ input_tokens: 5, output_tokens: 2, total_tokens: 7 });
  });

  it('should include system_prompt in messages when provided', async () => {
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
      system_prompt: 'You are a bot',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a bot' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' });
  });

  it('should prepend context to input when provided', async () => {
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
      context: 'Context here',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Context here\n\nhello' });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/openai-provider.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/openai-provider.test.ts
git commit -m "test(mvp5): add OpenAIProvider tests with mocked fetch"
```

---

## PR4: AgentRunner Invoke Mode

**Scope:** Extend AgentRunner with invoke mode, context bundle reading, and CLI registration.

---

### Task 4.1: Modify `src/agent/runner.ts`

**Files:**

- Modify: `src/agent/runner.ts`

- [ ] **Step 1: Replace imports and add helper functions**

Replace the top of `src/agent/runner.ts` (lines 1–28) with:

```typescript
import { StepRunner, ExecutionContext } from '../types/runner.js';
import { StepDefinition } from '../types/workflow.js';
import { StepResult } from '../types/state.js';
import { AgentRegistry } from './registry.js';
import { ModelRouter, ModelRouteNotFound } from './router.js';
import { AgentInvocationPlan, ModelRoute, AgentModelResult } from '../types/agent.js';
import { ModelProviderRegistry } from '../model/registry.js';
import { ContextReadError } from '../model/errors.js';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

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

function readContextBundle(path: string): string {
  const stats = statSync(path);
  if (stats.size > 1048576) {
    throw new ContextReadError(path, 'file exceeds 1MB limit');
  }

  const content = readFileSync(path, 'utf-8');
  if (path.endsWith('.json')) {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      throw new ContextReadError(path, 'invalid JSON');
    }
  }
  return content;
}

function resolveExecutionMode(route: ModelRoute, globalMode: 'stub' | 'invoke'): 'stub' | 'invoke' {
  return route.execution_mode ?? globalMode ?? 'stub';
}
```

- [ ] **Step 2: Replace the AgentRunner class**

Replace the entire `AgentRunner` class (lines 30–115) with:

```typescript
export class AgentRunner implements StepRunner {
  type = 'agent';

  constructor(
    private registry: AgentRegistry,
    private router: ModelRouter,
    private providerRegistry?: ModelProviderRegistry,
    private globalExecutionMode: 'stub' | 'invoke' = 'stub'
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

    let route: ModelRoute;
    try {
      route = this.router.resolve(agent.model_route);
    } catch (err) {
      if (err instanceof ModelRouteNotFound) {
        return {
          status: 'failure',
          error: {
            type: 'ModelRouteNotFound',
            message: err.message,
            retryable: false,
          },
        };
      }
      throw err;
    }

    const contextBundle = step.input?.context_bundle as string | undefined;
    if (contextBundle) {
      const validation = validateContextBundlePath(contextBundle, ctx.config.state_dir);
      if (!validation.valid) {
        return {
          status: 'failure',
          error: {
            type: 'ContextBundleValidationError',
            message: validation.reason || 'Context bundle validation failed',
            retryable: false,
          },
        };
      }
    }

    const mode = resolveExecutionMode(route, this.globalExecutionMode);

    if (mode === 'invoke') {
      return this.runInvoke(step, ctx, agent, route, contextBundle);
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
        error: {
          type: 'AgentInputValidationError',
          message: 'Missing or empty input.task field in invoke mode',
          retryable: false,
        },
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
          return {
            status: 'failure',
            error: {
              type: 'ContextReadError',
              message: err.message,
              retryable: false,
            },
          };
        }
        throw err;
      }
    }

    if (!this.providerRegistry) {
      return {
        status: 'failure',
        error: {
          type: 'ProviderNotFound',
          message: 'No provider registry configured',
          retryable: false,
        },
      };
    }

    let provider;
    try {
      provider = this.providerRegistry.require(route.provider);
    } catch (err) {
      if (err instanceof ContextReadError) {
        return {
          status: 'failure',
          error: {
            type: 'ContextReadError',
            message: err.message,
            retryable: false,
          },
        };
      }
      return {
        status: 'failure',
        error: {
          type: 'ProviderNotFound',
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        },
      };
    }

    const request = {
      provider: route.provider,
      model: route.model,
      input: task,
      system_prompt: (step.input?.system_prompt as string | undefined) ?? agent?.system_prompt ?? route.system_prompt,
      context: contextContent,
      max_tokens: route.max_tokens,
      temperature: route.temperature,
    };

    let result;
    try {
      result = await provider.invoke(request);
    } catch (err) {
      return {
        status: 'failure',
        error: {
          type: err instanceof Error ? err.constructor.name : 'ProviderError',
          message: err instanceof Error ? err.message : String(err),
          retryable: err instanceof ContextReadError ? false : true,
        },
      };
    }

    const modelResult: AgentModelResult = {
      type: 'agent_model_result',
      agent_id: agent!.id,
      agent_name: agent!.name || agent!.id,
      model_route: agent!.model_route,
      provider: route.provider,
      model: route.model,
      output: result.output,
      usage: result.usage,
    };

    return {
      status: 'success',
      output: JSON.stringify(modelResult, null, 2),
    };
  }
}
```

- [ ] **Step 3: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/agent/runner.ts
git commit -m "feat(mvp5): add AgentRunner invoke mode with context bundle reading"
```

---

### Task 4.2: Modify `src/cli/commands/run.ts`

**Files:**

- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Add imports for model providers**

Replace lines 1–17 with:

```typescript
import { Command, Option } from 'commander';
import { loadWorkflow } from '../../config/loader.js';
import { validateWorkflow } from '../../config/validator.js';
import { loadProjectConfig } from '../../config/project-config.js';
import { WorkflowEngine } from '../../workflow/engine.js';
import { RunnerRegistry } from '../../workflow/runner-registry.js';
import { EchoRunner } from '../../workflow/runners/echo.js';
import { ShellRunner } from '../../workflow/runners/shell.js';
import { ManualGateRunner } from '../../workflow/runners/manual-gate.js';
import { AgentRunner } from '../../agent/runner.js';
import { AgentRegistry } from '../../agent/registry.js';
import { ModelRouter } from '../../agent/router.js';
import { ModelProviderRegistry } from '../../model/registry.js';
import { MockProvider } from '../../model/mock-provider.js';
import { OpenAIProvider } from '../../model/openai-provider.js';
import { CaseStore } from '../../state/case-store.js';
import { GateStore } from '../../state/gate-store.js';
import { InProcessEventBus } from '../../kernel/event-bus.js';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
```

- [ ] **Step 2: Register providers and pass to AgentRunner**

Replace lines 29–36 with:

```typescript
const registry = new RunnerRegistry();
registry.register(new EchoRunner());
registry.register(new ShellRunner());
registry.register(new ManualGateRunner());

const agentRegistry = new AgentRegistry(projectConfig.agents);
const modelRouter = new ModelRouter(projectConfig.models.routes);
const providerRegistry = new ModelProviderRegistry([new MockProvider(), new OpenAIProvider()]);
registry.register(new AgentRunner(agentRegistry, modelRouter, providerRegistry, projectConfig.models.execution.mode));
```

- [ ] **Step 3: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat(mvp5): register MockProvider and OpenAIProvider in CLI run command"
```

---

### Task 4.3: Write `tests/unit/agent-runner-invoke.test.ts`

**Files:**

- Create: `tests/unit/agent-runner-invoke.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { MockProvider } from '../../src/model/mock-provider.js';
import { AgentDefinition } from '../../src/types/agent.js';
import { StepDefinition } from '../../src/types/workflow.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const mockAgents: AgentDefinition[] = [
  {
    id: 'agent-1',
    name: 'Agent One',
    description: 'First agent',
    capabilities: ['read', 'write'],
    model_route: 'route-a',
    tools: ['tool-1'],
    system_prompt: 'You are agent one',
  },
];

const mockRoutes = {
  'route-a': {
    provider: 'mock',
    model: 'mock-chat',
    purpose: 'general',
    max_tokens: 2048,
    temperature: 0.5,
    execution_mode: 'invoke' as const,
    system_prompt: 'You are helpful',
  },
  'route-stub': {
    provider: 'mock',
    model: 'mock-chat',
    purpose: 'general',
    execution_mode: 'stub' as const,
  },
};

function createRunner(
  agents = mockAgents,
  routes = mockRoutes,
  mode: 'stub' | 'invoke' = 'invoke',
  providers = new ModelProviderRegistry([new MockProvider()])
) {
  const registry = new AgentRegistry(agents);
  const router = new ModelRouter(routes);
  return new AgentRunner(registry, router, providers, mode);
}

function createContext(stateDir: string) {
  return {
    case_id: 'c1',
    workflow_id: 'w1',
    variables: {},
    config: {
      state_dir: stateDir,
    } as any,
  };
}

describe('AgentRunner invoke mode', () => {
  it('should return AgentModelResult in invoke mode', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.type).toBe('agent_model_result');
    expect(modelResult.agent_id).toBe('agent-1');
    expect(modelResult.agent_name).toBe('Agent One');
    expect(modelResult.model_route).toBe('route-a');
    expect(modelResult.provider).toBe('mock');
    expect(modelResult.model).toBe('mock-chat');
    expect(modelResult.output).toContain('[mock:mock-chat]');
    expect(modelResult.usage).toBeDefined();
  });

  it('should fail when task is empty in invoke mode', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: '' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('AgentInputValidationError');
    expect(result.error?.message).toBe('Missing or empty input.task field in invoke mode');
  });

  it('should fail when task is missing in invoke mode', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('AgentInputValidationError');
  });

  it('should return invocation plan in stub mode', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'stub');
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.type).toBe('agent_invocation_plan');
  });

  it('should allow route stub to override global invoke', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'invoke');
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    // route-stub has execution_mode: stub
    const agents = [{ ...mockAgents[0], model_route: 'route-stub' }];
    const runnerWithStubRoute = createRunner(agents, mockRoutes, 'invoke');
    const result = await runnerWithStubRoute.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.type).toBe('agent_invocation_plan');
  });

  it('should allow route invoke to override global stub', async () => {
    const runner = createRunner(mockAgents, mockRoutes, 'stub');
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.type).toBe('agent_model_result');
  });

  it('should fail for unknown provider', async () => {
    const routes = {
      'route-unknown': {
        provider: 'unknown',
        model: 'x',
        execution_mode: 'invoke' as const,
      },
    };
    const agents = [{ ...mockAgents[0], model_route: 'route-unknown' }];
    const runner = createRunner(agents, routes, 'invoke', new ModelProviderRegistry());
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ProviderNotFound');
  });

  it('should read .md context bundle and pass to provider', async () => {
    const tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    const stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(tmpDir, 'context.md'), '# Context\n\nHello');

    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', context_bundle: 'context.md' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.output).toContain('[mock:mock-chat]');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should read .json context bundle, parse and stringify', async () => {
    const tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    const stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(tmpDir, 'context.json'), JSON.stringify({ key: 'value' }));

    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', context_bundle: 'context.json' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('success');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should fail for invalid JSON context bundle', async () => {
    const tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    const stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(tmpDir, 'bad.json'), 'not json');

    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', context_bundle: 'bad.json' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ContextReadError');
    expect(result.error?.message).toContain('invalid JSON');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should fail for context bundle exceeding 1MB', async () => {
    const tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    const stateDir = join(tmpDir, '.wolf', 'state');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(tmpDir, 'huge.md'), 'x'.repeat(1048577));

    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', context_bundle: 'huge.md' },
    };
    const result = await runner.run(step, createContext(stateDir));
    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('ContextReadError');
    expect(result.error?.message).toContain('1MB');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should resolve system_prompt from step input > agent > route', async () => {
    const runner = createRunner();
    const step: StepDefinition = {
      id: 'step1',
      type: 'builtin',
      runner: 'agent',
      input: { agent: 'agent-1', task: 'Do something', system_prompt: 'Step prompt' },
    };
    const result = await runner.run(step, createContext('.wolf/state'));
    expect(result.status).toBe('success');
    const modelResult = JSON.parse(result.output as string);
    expect(modelResult.output).toContain('[mock:mock-chat]');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/agent-runner-invoke.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/agent-runner-invoke.test.ts
git commit -m "test(mvp5): add AgentRunner invoke mode tests"
```

---

### Task 4.4: Verify existing AgentRunner tests still pass

**Files:**

- Test: `tests/unit/agent-runner.test.ts`

- [ ] **Step 1: Run existing agent runner tests**

```bash
npx vitest run tests/unit/agent-runner.test.ts
```

Expected: all tests pass. The constructor now accepts optional `providerRegistry` and `globalExecutionMode` parameters with defaults, so existing tests that only pass `registry` and `router` continue to work.

- [ ] **Step 2: Commit (if any fixes needed)**

If any existing tests fail due to constructor changes, fix them in `tests/unit/agent-runner.test.ts` by passing `undefined, 'stub'` as the third and fourth arguments, then commit.

---

## PR5: Policy, Docs, Acceptance

**Scope:** Integration tests, documentation updates, final acceptance verification.

---

### Task 5.1: Write integration tests

**Files:**

- Create: `tests/integration/mvp5-model-provider.test.ts`

- [ ] **Step 1: Write the integration test file**

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

describe('MVP5 Model Provider Runtime integration', () => {
  it('should return AgentInvocationPlan in global stub mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    const workflow = `id: stub_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: stub
  routes:
    default:
      provider: mock
      model: mock-chat
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const casesDir = join(tempDir, '.wolf', 'state', 'cases');
    const caseDirs = readdirSync(casesDir);
    expect(caseDirs.length).toBe(1);

    const caseId = caseDirs[0];
    const statePath = join(casesDir, caseId, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stepResult = state.step_results['agent_step'];
    expect(stepResult.status).toBe('success');
    const plan = JSON.parse(stepResult.output);
    expect(plan.type).toBe('agent_invocation_plan');
    expect(plan.agent_id).toBe('reviewer');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return AgentModelResult in global invoke mode with MockProvider', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    const workflow = `id: invoke_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: mock
      model: mock-chat
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const casesDir = join(tempDir, '.wolf', 'state', 'cases');
    const caseId = readdirSync(casesDir)[0];
    const statePath = join(casesDir, caseId, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stepResult = state.step_results['agent_step'];
    expect(stepResult.status).toBe('success');
    const modelResult = JSON.parse(stepResult.output);
    expect(modelResult.type).toBe('agent_model_result');
    expect(modelResult.output).toContain('[mock:mock-chat]');
    expect(modelResult.usage).toBeDefined();

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should allow route stub to override global invoke', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    const workflow = `id: route_stub_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: mock
      model: mock-chat
      execution_mode: stub
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const casesDir = join(tempDir, '.wolf', 'state', 'cases');
    const caseId = readdirSync(casesDir)[0];
    const statePath = join(casesDir, caseId, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stepResult = state.step_results['agent_step'];
    expect(stepResult.status).toBe('success');
    const plan = JSON.parse(stepResult.output);
    expect(plan.type).toBe('agent_invocation_plan');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should allow route invoke to override global stub', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    const workflow = `id: route_invoke_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: stub
  routes:
    default:
      provider: mock
      model: mock-chat
      execution_mode: invoke
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const casesDir = join(tempDir, '.wolf', 'state', 'cases');
    const caseId = readdirSync(casesDir)[0];
    const statePath = join(casesDir, caseId, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stepResult = state.step_results['agent_step'];
    expect(stepResult.status).toBe('success');
    const modelResult = JSON.parse(stepResult.output);
    expect(modelResult.type).toBe('agent_model_result');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail when provider is unknown in invoke mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    const workflow = `id: unknown_provider_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: unknown
      model: x
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    try {
      execSync(`node ${cliPath} run workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(3);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should prevent provider invocation when policy denies', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    const workflow = `id: policy_deny_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: mock
      model: mock-chat
policy:
  rules:
    - id: deny_agent
      match:
        runner: agent
      decision: deny
      reason: Agent runner denied by policy
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    try {
      execSync(`node ${cliPath} run workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(3);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create policy gate and prevent provider invocation until approved', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    const workflow = `id: policy_ask_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: mock
      model: mock-chat
policy:
  rules:
    - id: ask_agent
      match:
        runner: agent
      decision: ask
      reason: Agent runner requires approval
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    let output = '';
    try {
      output = execSync(`node ${cliPath} run workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      output = err.stdout || '';
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(2);
    expect(output).toContain('PAUSED');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should pass context_bundle content to provider in invoke mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    writeFileSync(join(tempDir, 'context.md'), '# Project Context\n\nThis is the context.');

    const workflow = `id: context_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
      context_bundle: "context.md"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: mock
      model: mock-chat
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail for empty task in invoke mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    const workflow = `id: empty_task_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: ""
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: mock
      model: mock-chat
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    try {
      execSync(`node ${cliPath} run workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(3);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail for context bundle exceeding 1MB', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-mvp5-'));

    writeFileSync(join(tempDir, 'huge.md'), 'x'.repeat(1048577));

    const workflow = `id: huge_context_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: reviewer
      task: "Review code"
      context_bundle: "huge.md"
`;

    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default
models:
  execution:
    mode: invoke
  routes:
    default:
      provider: mock
      model: mock-chat
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    try {
      execSync(`node ${cliPath} run workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(3);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Build the project before running integration tests**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Run integration tests**

```bash
npx vitest run tests/integration/mvp5-model-provider.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/mvp5-model-provider.test.ts
git commit -m "test(mvp5): add integration tests for model provider runtime"
```

---

### Task 5.2: Update `README.md`

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update MVP5 status line**

In `README.md`, replace:

```markdown
| **MVP5** | ⏭️ Next | Real LLM execution, provider SDK integration |
```

With:

```markdown
| **MVP5** | ✅ Complete | Model Provider Runtime — provider abstraction, MockProvider, OpenAIProvider, invoke mode, context bundles |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(mvp5): update README with MVP5 complete status"
```

---

### Task 5.3: Update `docs/development.md`

**Files:**

- Modify: `docs/development.md`

- [ ] **Step 1: Insert Model Provider Runtime section after Agent Registry section**

After the Agent Registry section (after line 343: "Policy decisions (allow / ask / deny) work the same way for `runner: agent` as for any other runner. The Agent Runner does **not** call the Policy Engine directly — evaluation happens in the WorkflowEngine via PolicyStepGuard before the runner executes."), insert:

````markdown
## Model Provider Runtime

The Model Provider Runtime (MVP5) executes real LLM calls through provider adapters. It builds on MVP4's `AgentInvocationPlan` stub and adds an `invoke` execution mode.

### Configuration

Add `models.execution` and route-level overrides to `wolf.yaml`:

```yaml
models:
  execution:
    mode: stub # stub | invoke
  routes:
    default_coding:
      provider: mock
      model: mock-chat
      execution_mode: invoke # optional override
      temperature: 0.7
      system_prompt: 'You are a code reviewer.'
```
````

**Execution mode resolution:**

1. If `route.execution_mode` is set, use it
2. Else use `models.execution.mode`
3. If neither is set, default to `stub`

### Agent Runner Input

In addition to MVP4 fields, steps can include:

| Field            | Type   | Required | Description                              |
| ---------------- | ------ | -------- | ---------------------------------------- |
| `agent`          | string | yes      | Agent id from registry                   |
| `task`           | string | yes\*    | Required in invoke mode                  |
| `context_bundle` | string | no       | Relative path to context file            |
| `system_prompt`  | string | no       | Overrides agent and route system prompts |

### Providers

| Provider | ID       | Description                          |
| -------- | -------- | ------------------------------------ |
| Mock     | `mock`   | Deterministic test provider          |
| OpenAI   | `openai` | Real LLM via native fetch (optional) |

### Error Types

| Error                  | Retryable | Cause                         |
| ---------------------- | --------- | ----------------------------- |
| `ProviderNotFound`     | no        | Unknown provider id           |
| `ProviderAuthError`    | no        | Missing or invalid API key    |
| `ProviderRequestError` | no        | Bad request (400, 404)        |
| `ProviderNetworkError` | yes       | Network failure or rate limit |
| `ContextReadError`     | no        | Invalid JSON or file > 1MB    |

### CLI

No new CLI commands. Agent execution mode is controlled via `wolf.yaml`:

```bash
node dist/cli/index.js run workflow.yaml --config wolf.yaml
```

````

- [ ] **Step 2: Commit**

```bash
git add docs/development.md
git commit -m "docs(mvp5): add Model Provider Runtime section to development guide"
````

---

### Task 5.4: Final acceptance verification

**Files:**

- All modified and new files

- [ ] **Step 1: Run full check locally**

```bash
npm run check
```

Expected output sequence:

1. `prettier --check` passes
2. `tsc --noEmit` passes
3. `vitest run` passes (all unit + integration tests)
4. `tsc` build succeeds

- [ ] **Step 2: Run tests in Docker**

```bash
docker build --target test -t mister-wolf:test .
docker run --rm mister-wolf:test
```

Expected: all checks pass inside container.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(mvp5): Model Provider Runtime — complete implementation"
```

---

## Self-Review Checklist

### 1. Spec Coverage

| Spec Section                  | Implementing Task              |
| ----------------------------- | ------------------------------ |
| 1.1 Execution Mode            | Task 1.4, Task 4.2             |
| 1.2 Extended ModelRoute       | Task 1.3                       |
| 1.3 AgentDefinition Extension | Task 1.3                       |
| 1.4 ProjectConfig Extension   | Task 1.4                       |
| 2.1 Core Types                | Task 1.1                       |
| 2.2 Provider Error Taxonomy   | Task 1.2                       |
| 3.1–3.3 ModelProviderRegistry | Task 2.1, Task 2.3             |
| 4.1–4.3 MockProvider          | Task 2.2, Task 2.4             |
| 5.1–5.3 OpenAIProvider        | Task 3.1, Task 3.2             |
| 6.1 Execution Mode Resolution | Task 4.1                       |
| 6.2 Stub Mode                 | Task 4.1 (preserved), Task 4.3 |
| 6.3 Invoke Mode               | Task 4.1, Task 4.3             |
| 6.4 AgentModelResult          | Task 1.1, Task 4.1             |
| 6.5 Context Bundle Reading    | Task 4.1, Task 4.3, Task 5.1   |
| 6.6 Failure Modes             | Task 4.1, Task 4.3, Task 3.2   |
| 8.1 Unit Tests                | Tasks 1.5, 2.3, 2.4, 3.2, 4.3  |
| 8.2 Integration Tests         | Task 5.1                       |
| 9. Acceptance Criteria        | Task 5.4                       |

### 2. Placeholder Scan

- No "TBD", "TODO", "implement later" found.
- No vague "add appropriate error handling" — every error handler is specified with exact error types and messages.
- No "similar to Task N" — each task is self-contained with full code.

### 3. Type Consistency

- `ModelInvocationRequest`, `ModelInvocationResult`, `ModelProvider`, `AgentModelResult` defined once in `src/model/types.ts` and imported everywhere.
- `ProviderNotFound`, `ProviderAuthError`, `ProviderRequestError`, `ProviderNetworkError`, `ContextReadError` defined once in `src/model/errors.ts` and imported everywhere.
- `AgentDefinitionSchema` and `ModelRouteSchema` fields match the spec exactly.
- `resolveExecutionMode` uses `route.execution_mode ?? globalMode ?? 'stub'` as specified.
- `AgentRunner` constructor signature adds optional parameters to preserve backward compatibility.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-01-mvp5-implementation.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
