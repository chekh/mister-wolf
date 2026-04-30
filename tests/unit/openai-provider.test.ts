import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from '../../src/model/openai-provider.js';
import { ProviderAuthError, ProviderRequestError, ProviderNetworkError } from '../../src/model/errors.js';
import { ToolCallLimitExceeded } from '../../src/tool/errors.js';

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
          text: () => Promise.resolve('Bad Request'),
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
    expect(result.tool_call).toBeUndefined();
  });

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
});
