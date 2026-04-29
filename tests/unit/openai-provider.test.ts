import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '../../src/model/openai-provider.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError } from '../../src/model/errors.js';

describe('OpenAIProvider', () => {
  it('should throw ProviderAuthError when OPENAI_API_KEY is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', undefined);
    const provider = new OpenAIProvider();
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      input: 'hello',
    };

    await expect(provider.invoke(request)).rejects.toThrow(ProviderAuthError);
  });

  it('should throw ProviderAuthError on HTTP 401', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({}),
        })
      )
    );

    const provider = new OpenAIProvider();
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      input: 'hello',
    };

    await expect(provider.invoke(request)).rejects.toThrow(ProviderAuthError);
  });

  it('should throw ProviderNetworkError on HTTP 429', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({}),
        })
      )
    );

    const provider = new OpenAIProvider();
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      input: 'hello',
    };

    await expect(provider.invoke(request)).rejects.toThrow(ProviderNetworkError);
  });

  it('should throw ProviderNetworkError on HTTP 500', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        })
      )
    );

    const provider = new OpenAIProvider();
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      input: 'hello',
    };

    await expect(provider.invoke(request)).rejects.toThrow(ProviderNetworkError);
  });

  it('should throw ProviderRequestError on HTTP 400', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({}),
        })
      )
    );

    const provider = new OpenAIProvider();
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      input: 'hello',
    };

    await expect(provider.invoke(request)).rejects.toThrow(ProviderRequestError);
  });

  it('should return ModelInvocationResult on success', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: 'Hello back',
                  },
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            }),
        })
      )
    );

    const provider = new OpenAIProvider();
    const request = {
      provider: 'openai',
      model: 'gpt-4',
      input: 'hello',
      system_prompt: 'You are a helpful assistant',
      context: 'Some context',
    };

    const result = await provider.invoke(request);

    expect(result.output).toBe('Hello back');
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4');
    expect(result.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    });
    expect(result.raw).toBeDefined();
  });
});
