import { ModelProvider, ModelInvocationRequest, ModelInvocationResult } from './types.js';

export class MockProvider implements ModelProvider {
  id = 'mock';

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    const inputTokens = estimateTokens(request.input);
    const contextTokens = request.context ? estimateTokens(request.context) : 0;
    const outputText = `[mock:${request.model}] Received ${inputTokens} tokens.`;
    const outputTokens = estimateTokens(outputText);

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
