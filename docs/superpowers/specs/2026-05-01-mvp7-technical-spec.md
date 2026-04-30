# MVP7: Streaming Model Responses — Technical Specification

## Overview

MVP7 adds streaming model response support to the Mr.Wolf framework. Building on MVP5's model invocation runtime and MVP6's tool calling, it introduces an optional `ModelProvider.invokeStream()` method that delivers response text incrementally via callbacks. Streaming is a transport/event behavior — it does not change the workflow state machine or StepResult persistence model.

**Status:** Planned  
**Goal:** Enable incremental delivery of model text responses through provider streaming  
**Tech Stack:** TypeScript, Zod, native `fetch`, Vitest  
**In Scope:** Streaming provider interface, config, MockProvider streaming, OpenAIProvider SSE streaming, AgentRunner stream collection, CLI TTY chunk printing, stream events  
**Out of Scope:** Streaming tool calls, streaming function arguments, partial structured JSON parsing, multiple streamed choices, multi-agent streaming, memory writes, vector retrieval, autonomous loops, planner/executor streaming

---

## Architecture

```
wolf.yaml
  ├── models.execution.streaming  → Global default (NEW)
  └── models.routes[].streaming   → Route override (NEW)

Execution flow:
  AgentRunner.run(step)
    ├── resolves execution mode (stub / invoke)
    ├── resolves streaming flag
    ├── if streaming=true and invoke:
    │     ├── validate provider supports invokeStream
    │     ├── validate no tools are present
    │     ├── call provider.invokeStream(request, callbacks)
    │     ├── callbacks accumulate chunks + emit events
    │     └── return final AgentModelResult (same shape as non-streaming)
    └── if streaming=false or stub:
          └── existing MVP5/MVP6 behavior
```

**Key rule:** Streaming is transport/event behavior. `StepResult.output` always contains the final complete `AgentModelResult` JSON. No incremental state mutation.

---

## 1. Config Schema

### 1.1 Global Streaming Default

```yaml
models:
  execution:
    mode: invoke
    streaming: false # NEW
```

### 1.2 Route-Level Streaming Override

```yaml
models:
  routes:
    default_coding:
      provider: openai
      model: gpt-4
      execution_mode: invoke
      streaming: true # optional override
```

### 1.3 Resolution

```typescript
function resolveStreaming(route: ModelRoute, globalConfig: ModelsConfig): boolean {
  return route.streaming ?? globalConfig.execution.streaming ?? false;
}
```

**Rules:**

- `streaming` applies only when execution mode is `invoke`
- Stub mode ignores `streaming` and returns `AgentInvocationPlan`
- Default is `false` (backward compatible)

### 1.4 Schema Extensions

Extend `ModelsConfigSchema.execution`:

```typescript
export const ModelsConfigSchema = z.object({
  execution: z
    .object({
      mode: z.enum(['stub', 'invoke']).default('stub'),
      streaming: z.boolean().default(false), // NEW
    })
    .default({ mode: 'stub', streaming: false }),
  routes: z.record(ModelRouteSchema).default({}),
});
```

Extend `ModelRouteSchema`:

```typescript
export const ModelRouteSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  purpose: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  execution_mode: z.enum(['stub', 'invoke']).optional(),
  system_prompt: z.string().optional(),
  streaming: z.boolean().optional(), // NEW
});
```

---

## 2. Streaming Provider Interface

### 2.1 ModelStreamCallbacks

```typescript
export interface ModelStreamStart {
  provider: string;
  model: string;
}

export interface ModelStreamChunk {
  provider: string;
  model: string;
  chunk_index: number;
  text: string;
}

export interface ModelStreamCallbacks {
  onStart?: (event: ModelStreamStart) => void | Promise<void>;
  onChunk?: (chunk: ModelStreamChunk) => void | Promise<void>;
  onComplete?: (result: ModelInvocationResult) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}
```

### 2.2 ModelProvider Extension

```typescript
export interface ModelProvider {
  id: string;
  invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult>;
  invokeStream?(request: ModelInvocationRequest, callbacks: ModelStreamCallbacks): Promise<ModelInvocationResult>;
}
```

**Rules:**

- `invokeStream` is **optional** — providers that don't support streaming omit it
- If `streaming=true` and `invokeStream` is missing → `ProviderStreamingUnsupported`
- `invokeStream` returns `Promise<ModelInvocationResult>` with final complete output
- Callbacks may be async

### 2.3 Provider Error Taxonomy (Extended)

```typescript
export class ProviderStreamingUnsupported extends Error {
  constructor(providerId: string) {
    super(`Provider does not support streaming: ${providerId}`);
  }
}

export class StreamingToolCallUnsupported extends Error {
  constructor() {
    super('Tool calling with streaming is not supported in MVP7');
  }
}
```

**Retryable mapping:**

| Error                          | Retryable |
| ------------------------------ | --------- |
| `ProviderStreamingUnsupported` | `false`   |
| `StreamingToolCallUnsupported` | `false`   |

---

## 3. MockProvider Streaming

### 3.1 Behavior

Deterministic streaming with fixed-size chunks:

```typescript
class MockProvider implements ModelProvider {
  id = 'mock';

  async invokeStream(request: ModelInvocationRequest, callbacks: ModelStreamCallbacks): Promise<ModelInvocationResult> {
    const chunkSize = 20;
    const fullOutput = this.buildOutput(request);

    await callbacks.onStart?.({ provider: this.id, model: request.model });

    for (let i = 0; i < fullOutput.length; i += chunkSize) {
      const text = fullOutput.slice(i, i + chunkSize);
      await callbacks.onChunk?.({
        provider: this.id,
        model: request.model,
        chunk_index: Math.floor(i / chunkSize),
        text,
      });
    }

    const result = this.buildResult(request, fullOutput);
    await callbacks.onComplete?.(result);
    return result;
  }

  private buildOutput(request: ModelInvocationRequest): string {
    return `[mock:${request.model}] ${request.input.slice(0, 200)}${request.input.length > 200 ? '...' : ''}`;
  }

  private buildResult(request: ModelInvocationRequest, output: string): ModelInvocationResult {
    const inputTokens = estimateTokens(request.input);
    const contextTokens = request.context ? estimateTokens(request.context) : 0;
    return {
      output,
      provider: this.id,
      model: request.model,
      usage: {
        input_tokens: inputTokens + contextTokens,
        output_tokens: estimateTokens(output),
        total_tokens: inputTokens + contextTokens + estimateTokens(output),
      },
    };
  }
}
```

**Rules:**

- No timers — callbacks fire synchronously in order
- `chunkSize` is fixed (20 chars) for determinism
- Final `ModelInvocationResult` includes full output and usage

---

## 4. OpenAIProvider Streaming

### 4.1 SSE Implementation

Use native `fetch` with `stream: true` body parameter:

```typescript
async invokeStream(
  request: ModelInvocationRequest,
  callbacks: ModelStreamCallbacks
): Promise<ModelInvocationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ProviderAuthError(this.id);
  }

  const body = this.buildChatBody(request);
  body.stream = true;

  const response = await fetch(this.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  // Error mapping same as non-streaming (401/403 → auth, 429/5xx → network)
  this.handleHttpErrors(response);

  // Validate response body
  if (!response.body) {
    throw new ProviderNetworkError(this.id);
  }

  await callbacks.onStart?.({ provider: this.id, model: request.model });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let chunkIndex = 0;
  let doneSeen = false;

  while (!doneSeen) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') {
        doneSeen = true;
        break;
      }

      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;

      // Reject tool call deltas in MVP7
      if (delta?.tool_calls || delta?.function_call) {
        throw new StreamingToolCallUnsupported();
      }

      if (delta?.content) {
        fullText += delta.content;
        await callbacks.onChunk?.({
          provider: this.id,
          model: request.model,
          chunk_index: chunkIndex++,
          text: delta.content,
        });
      }
    }
  }

  const result: ModelInvocationResult = {
    output: fullText,
    provider: this.id,
    model: request.model,
    // usage omitted in MVP7 streaming — OpenAI doesn't send usage in streaming mode
  };

  await callbacks.onComplete?.(result);
  return result;
}
```

**Rules:**

- Parse `data:` lines from SSE
- `[DONE]` is a terminal marker; stop reading when received
- Extract `choices[0].delta.content` as text delta
- If `response.body` is null → `ProviderNetworkError`
- If tool call deltas arrive → fail with `StreamingToolCallUnsupported`
- Accumulate text into `fullText`
- `usage` may be omitted in streaming result

---

## 5. AgentRunner Streaming Integration

### 5.1 Streaming Decision

```typescript
// In AgentRunner.runInvoke()
const streaming = this.resolveStreaming(route, ctx.config.models);

if (streaming) {
  return this.runInvokeStream(step, ctx, agent, route, contextContent, task, availableTools);
}
```

### 5.2 Streaming Validation

```typescript
private validateStreaming(provider: ModelProvider, availableTools?: ToolDefinition[]): void {
  if (!provider.invokeStream) {
    throw new ProviderStreamingUnsupported(provider.id);
  }
  // If an agent has any available tools and streaming=true, fail before provider invocation.
  // Streaming + tools is out of scope for MVP7.
  if (availableTools && availableTools.length > 0) {
    throw new StreamingToolCallUnsupported();
  }
}
```

### 5.3 Stream Execution

```typescript
private async runInvokeStream(
  step: StepDefinition,
  ctx: ExecutionContext,
  agent: AgentDefinition,
  route: ModelRoute,
  contextContent: string | undefined,
  task: string,
  availableTools?: ToolDefinition[]
): Promise<StepResult> {
  this.validateStreaming(provider, availableTools);

  const request: ModelInvocationRequest = {
    provider: route.provider,
    model: route.model,
    input: task,
    system_prompt: /* ... */,
    context: contextContent,
    max_tokens: route.max_tokens,
    temperature: route.temperature,
    // tools: undefined — streaming + tools is rejected
  };

  // Stream callbacks — AgentRunner never writes to stdout directly
  const callbacks: ModelStreamCallbacks = {
    onStart: async () => {
      await this.emitEvent({
        type: 'model.stream.started',
        case_id: ctx.case_id,
        workflow_id: ctx.workflow_id,
        step_id: step.id,
        payload: { provider: route.provider, model: route.model, agent_id: agent.id },
      });
    },
    onChunk: async (chunk) => {
      await this.emitEvent({
        type: 'model.stream.chunk',
        case_id: ctx.case_id,
        workflow_id: ctx.workflow_id,
        step_id: step.id,
        payload: {
          provider: chunk.provider,
          model: chunk.model,
          agent_id: agent.id,
          chunk_index: chunk.chunk_index,
          text: chunk.text,
        },
      });
    },
    onComplete: async (result) => {
      await this.emitEvent({
        type: 'model.stream.completed',
        case_id: ctx.case_id,
        workflow_id: ctx.workflow_id,
        step_id: step.id,
        payload: { provider: result.provider, model: result.model, agent_id: agent.id },
      });
    },
  };

  let result: ModelInvocationResult;
  try {
    result = await provider.invokeStream!(request, callbacks);
  } catch (err) {
    await this.emitEvent({
      type: 'model.stream.failed',
      case_id: ctx.case_id,
      workflow_id: ctx.workflow_id,
      step_id: step.id,
      payload: { error: err instanceof Error ? err.message : String(err), agent_id: agent.id },
    });
    return {
      status: 'failure',
      error: {
        type: err instanceof Error ? err.constructor.name : 'ProviderError',
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
      },
    };
  }

  // Build final AgentModelResult
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
```

**Rules:**

- AgentRunner never writes directly to `process.stdout`
- CLI/view layer handles TTY chunk printing via event subscription or stream sink callback
- Events emitted for each lifecycle stage
- `StepResult.output` contains final complete `AgentModelResult`
- No incremental `StepResult` mutation
- AgentRunner catches `invokeStream` errors and emits `model.stream.failed`
- Final output comes from `provider.invokeStream` result

---

## 6. Events

### 6.1 Event Types

| Event                    | When               | Payload                                                |
| ------------------------ | ------------------ | ------------------------------------------------------ |
| `model.stream.started`   | Stream begins      | `provider`, `model`, `agent_id`                        |
| `model.stream.chunk`     | Each chunk arrives | `provider`, `model`, `agent_id`, `chunk_index`, `text` |
| `model.stream.completed` | Stream finishes    | `provider`, `model`, `agent_id`                        |
| `model.stream.failed`    | Stream errors      | `error`, `agent_id`                                    |

### 6.2 Event Payload Schema

```typescript
interface ModelStreamChunkEvent {
  type: 'model.stream.chunk';
  case_id: string;
  workflow_id: string;
  step_id: string;
  payload: {
    provider: string;
    model: string;
    agent_id: string;
    chunk_index: number;
    text: string;
  };
}
```

Events appended to `events.jsonl` through existing event mechanism. Chunk events persist text for replay/debugging; future versions may add size caps or replay compaction.

---

## 7. CLI Behavior

### 7.1 TTY Detection

```typescript
if (process.stdout.isTTY && streaming) {
  // Print chunks as they arrive
} else {
  // Silent — no chunk output
}
```

**Rules:**

- Print chunks **only** when stdout is TTY and streaming is enabled
- When not TTY (pipe, CI, redirect), CLI remains silent during streaming
- When stdout is TTY and streaming chunks were printed, CLI should not print the final model output body again; only normal case completion/status lines are printed
- When stdout is non-TTY, CLI preserves existing final output behavior
- Events always emitted regardless of TTY
- AgentRunner never writes directly to stdout; CLI layer subscribes to stream events or receives stream sink callback

### 7.2 Example CLI Output

```bash
$ wolf run workflow.yaml
[case_abc123] Created
Hello, I can help you with that.
Let me analyze the code...
Here is my review:...
[case_abc123] Completed

$ wolf run workflow.yaml | cat
[case_abc123] Created
[case_abc123] Completed
```

---

## 8. Integration Points

| Component           | Change    | Details                                                |
| ------------------- | --------- | ------------------------------------------------------ |
| **ModelProvider**   | Extend    | Add optional `invokeStream()` method                   |
| **MockProvider**    | Extend    | Implement `invokeStream()` with deterministic chunks   |
| **OpenAIProvider**  | Extend    | Implement SSE streaming with text-delta parsing        |
| **AgentRunner**     | Extend    | Add streaming path, validation, callbacks, events      |
| **ProjectConfig**   | Extend    | Add `models.execution.streaming` and route `streaming` |
| **CLI**             | Extend    | TTY detection for chunk printing                       |
| **EventBus**        | Extend    | New event types for stream lifecycle                   |
| **Workflow Engine** | No change | Standard runner interface                              |
| **ToolRegistry**    | No change | Streaming + tools is rejected                          |
| **PolicyEngine**    | No change | Policy applies before streaming starts                 |

---

## 9. Testing

### 9.1 Unit Tests

| Test                                | Description                                             |
| ----------------------------------- | ------------------------------------------------------- |
| MockProvider streaming              | Deterministic chunks, correct chunk count               |
| MockProvider streaming callbacks    | onStart, onChunk, onComplete called in order            |
| MockProvider streaming result       | Final result contains full output                       |
| OpenAIProvider SSE parsing          | Parse data: lines, extract text deltas                  |
| OpenAIProvider [DONE] handling      | `[DONE]` stops stream reading                           |
| OpenAIProvider null body            | Throws ProviderNetworkError if response.body is null    |
| OpenAIProvider tool delta rejection | Throws StreamingToolCallUnsupported on tool_call deltas |
| AgentRunner streaming path          | Calls invokeStream when streaming=true                  |
| AgentRunner streaming + tools       | Throws StreamingToolCallUnsupported                     |
| AgentRunner missing invokeStream    | Throws ProviderStreamingUnsupported                     |
| AgentRunner stream events           | Emits started/chunk/completed events                    |
| AgentRunner stream output           | StepResult contains final complete output               |
| Config streaming resolution         | route.streaming > global.streaming > false              |
| Config schema                       | models.execution.streaming defaults to false            |
| Config route streaming              | Route-level override works                              |

### 9.2 Integration Tests

| Test                       | Description                                  |
| -------------------------- | -------------------------------------------- |
| End-to-end streaming       | Workflow with streaming=true completes       |
| Streaming events           | events.jsonl contains stream chunk events    |
| Streaming + stub mode      | Returns AgentInvocationPlan, no streaming    |
| Streaming + tools          | Step fails with StreamingToolCallUnsupported |
| MockProvider CLI streaming | TTY prints chunks, non-TTY silent            |

---

## 10. Acceptance Criteria

1. `models.execution.streaming` is supported in `wolf.yaml`.
2. `models.routes[].streaming` overrides global streaming default.
3. `streaming=false` uses existing non-streaming `invoke` path.
4. `streaming=true` in invoke mode calls `provider.invokeStream()`.
5. Missing `invokeStream` fails with `ProviderStreamingUnsupported`.
6. MockProvider streams deterministic fixed-size text chunks.
7. OpenAIProvider parses text deltas from SSE.
8. AgentRunner emits `model.stream.started`, `model.stream.chunk`, `model.stream.completed` events.
9. AgentRunner stores final complete output in `StepResult.output`.
10. CLI prints chunks only when stdout is TTY.
11. CLI does not print chunks when stdout is not TTY.
12. Streaming + tools is rejected with `StreamingToolCallUnsupported`.
13. No tool-call streaming is implemented.
14. No function-argument streaming is implemented.
15. No multi-agent streaming is implemented.
16. Stub mode ignores `streaming` and returns `AgentInvocationPlan`.
17. `AgentModelResult.usage` may be undefined for streaming providers.
18. If OpenAI `response.body` is null, fail with `ProviderNetworkError`.
19. `[DONE]` is treated as terminal SSE marker; stream stops reading.
20. Tool call deltas during streaming fail with `StreamingToolCallUnsupported`.
21. AgentRunner does not write directly to `process.stdout`.
22. Tests pass locally and in Docker.

---

## 11. Out of Scope

- Streaming tool calls
- Streaming function arguments
- Partial structured JSON parsing from stream
- Multiple streamed choices (only first choice)
- Multi-agent streaming delegation
- Memory writes during streaming
- Vector retrieval streaming
- Autonomous loops with streaming
- Real-time WebSocket streaming
- Stream cancellation mid-flight
- Stream resumption after interruption
- Adaptive chunk sizing

---

## 12. Future Direction

MVP8 may add:

- Memory layer / case learning
- Stream cancellation and resumption
- Streaming tool calls
- Multi-agent delegation with streaming

**Boundary:** MVP7 streams one model text response per agent step. No tool streaming, no multi-agent streaming.

(End of file)
