import { ModelProvider, ModelInvocationRequest, ModelInvocationResult, ModelToolCall } from './types.js';
import { ModelStreamCallbacks } from './stream-types.js';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class MockProvider implements ModelProvider {
  id = 'mock';

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
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

  async invokeStream(request: ModelInvocationRequest, callbacks: ModelStreamCallbacks): Promise<ModelInvocationResult> {
    const chunkSize = 20;
    const fullOutput = `[mock:${request.model}] ${request.input.slice(0, 200)}${request.input.length > 200 ? '...' : ''}`;

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

    const inputTokens = estimateTokens(request.input);
    const contextTokens = request.context ? estimateTokens(request.context) : 0;
    const result: ModelInvocationResult = {
      output: fullOutput,
      provider: this.id,
      model: request.model,
      usage: {
        input_tokens: inputTokens + contextTokens,
        output_tokens: estimateTokens(fullOutput),
        total_tokens: inputTokens + contextTokens + estimateTokens(fullOutput),
      },
    };

    await callbacks.onComplete?.(result);
    return result;
  }
}
