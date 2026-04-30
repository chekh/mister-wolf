import { ModelProvider, ModelInvocationRequest, ModelInvocationResult, ToolDefinition } from './types.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError, StreamingToolCallUnsupported } from './errors.js';
import { ToolCallLimitExceeded } from '../tool/errors.js';

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

export class OpenAIProvider implements ModelProvider {
  id = 'openai';
  private baseUrl = 'https://api.openai.com/v1/chat/completions';

  private buildChatBody(request: ModelInvocationRequest): Record<string, unknown> {
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
    return body;
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderAuthError(this.id);
    }

    const body = this.buildChatBody(request);

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

  async invokeStream(
    request: ModelInvocationRequest,
    callbacks: import('./stream-types.js').ModelStreamCallbacks
  ): Promise<ModelInvocationResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderAuthError(this.id);
    }

    const body = this.buildChatBody(request);
    body.stream = true;

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
    };

    await callbacks.onComplete?.(result);
    return result;
  }
}
