import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from '../../src/model/openai-provider.js';
import { ProviderNetworkError, StreamingToolCallUnsupported } from '../../src/model/errors.js';

describe('OpenAIProvider streaming', () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('should parse SSE text deltas', async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let index = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (index < streamData.length) {
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(streamData[index++]),
          });
        }
        return Promise.resolve({ done: true });
      }),
    };

    const mockResponse = {
      status: 200,
      ok: true,
      body: { getReader: () => mockReader },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const provider = new OpenAIProvider();
    const chunks: string[] = [];

    const result = await provider.invokeStream(
      { provider: 'openai', model: 'gpt-4', input: 'hello' },
      {
        onStart: () => {},
        onChunk: (chunk) => chunks.push(chunk.text),
        onComplete: () => {},
      }
    );

    expect(chunks).toEqual(['Hello', ' world']);
    expect(result.output).toBe('Hello world');
  });

  it('should throw ProviderNetworkError when response.body is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, body: null }));

    const provider = new OpenAIProvider();
    await expect(
      provider.invokeStream(
        { provider: 'openai', model: 'gpt-4', input: 'hello' },
        { onStart: () => {}, onChunk: () => {}, onComplete: () => {} }
      )
    ).rejects.toThrow(ProviderNetworkError);
  });

  it('should throw StreamingToolCallUnsupported on tool_call delta', async () => {
    const streamData = ['data: {"choices":[{"delta":{"tool_calls":[{"index":0}]}}]}\n\n'];

    let index = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (index < streamData.length) {
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(streamData[index++]),
          });
        }
        return Promise.resolve({ done: true });
      }),
    };

    const mockResponse = {
      status: 200,
      ok: true,
      body: { getReader: () => mockReader },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const provider = new OpenAIProvider();
    await expect(
      provider.invokeStream(
        { provider: 'openai', model: 'gpt-4', input: 'hello' },
        { onStart: () => {}, onChunk: () => {}, onComplete: () => {} }
      )
    ).rejects.toThrow(StreamingToolCallUnsupported);
  });

  it('should stop reading on [DONE]', async () => {
    const streamData = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: [DONE]\n\n',
      'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
    ];

    let index = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (index < streamData.length) {
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(streamData[index++]),
          });
        }
        return Promise.resolve({ done: true });
      }),
    };

    const mockResponse = {
      status: 200,
      ok: true,
      body: { getReader: () => mockReader },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const provider = new OpenAIProvider();
    const chunks: string[] = [];

    const result = await provider.invokeStream(
      { provider: 'openai', model: 'gpt-4', input: 'hello' },
      {
        onStart: () => {},
        onChunk: (chunk) => chunks.push(chunk.text),
        onComplete: () => {},
      }
    );

    expect(chunks).toEqual(['Hi']);
    expect(result.output).toBe('Hi');
  });
});
