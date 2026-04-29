import { ModelProvider, ModelInvocationRequest, ModelInvocationResult } from './types.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError } from './errors.js';

export class OpenAIProvider implements ModelProvider {
  id = 'openai';
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    if (!this.apiKey) {
      throw new ProviderAuthError(this.id);
    }

    const messages = [];
    if (request.system_prompt) {
      messages.push({ role: 'system', content: request.system_prompt });
    }
    if (request.context) {
      messages.push({ role: 'user', content: `Context:\n${request.context}` });
    }
    messages.push({ role: 'user', content: request.input });

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ProviderAuthError(this.id);
        }
        if (response.status === 400 || response.status === 404) {
          throw new ProviderRequestError(this.id, `HTTP ${response.status}`);
        }
        if (response.status === 429 || response.status >= 500) {
          throw new ProviderNetworkError(this.id);
        }
        throw new ProviderRequestError(this.id, `HTTP ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const output = choice?.message?.content || '';
      const usage = data.usage;

      return {
        output,
        provider: this.id,
        model: request.model,
        usage: usage
          ? {
              input_tokens: usage.prompt_tokens,
              output_tokens: usage.completion_tokens,
              total_tokens: usage.total_tokens,
            }
          : undefined,
        raw: data,
      };
    } catch (err) {
      if (
        err instanceof ProviderAuthError ||
        err instanceof ProviderRequestError ||
        err instanceof ProviderNetworkError
      ) {
        throw err;
      }
      throw new ProviderNetworkError(this.id);
    }
  }
}
