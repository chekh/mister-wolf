import { ModelProvider, ModelInvocationRequest, ModelInvocationResult, ToolDefinition } from './types.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError } from './errors.js';
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
}
