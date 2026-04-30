import { describe, it, expect } from 'vitest';
import { MockProvider } from '../../src/model/mock-provider.js';

describe('MockProvider streaming', () => {
  it('should stream deterministic chunks', async () => {
    const provider = new MockProvider();
    const chunks: string[] = [];

    const result = await provider.invokeStream(
      { provider: 'mock', model: 'mock-chat', input: 'Hello world this is a test' },
      {
        onStart: () => {},
        onChunk: (chunk) => {
          chunks.push(chunk.text);
        },
        onComplete: () => {},
      }
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe(result.output);
    expect(result.output).toContain('[mock:mock-chat]');
  });

  it('should call callbacks in order', async () => {
    const provider = new MockProvider();
    const order: string[] = [];

    await provider.invokeStream(
      { provider: 'mock', model: 'mock-chat', input: 'Test' },
      {
        onStart: () => order.push('start'),
        onChunk: () => order.push('chunk'),
        onComplete: () => order.push('complete'),
      }
    );

    expect(order[0]).toBe('start');
    expect(order[order.length - 1]).toBe('complete');
    expect(order.filter((o) => o === 'chunk').length).toBeGreaterThan(0);
  });

  it('should return final result with usage', async () => {
    const provider = new MockProvider();
    const result = await provider.invokeStream(
      { provider: 'mock', model: 'mock-chat', input: 'Hello' },
      {
        onStart: () => {},
        onChunk: () => {},
        onComplete: () => {},
      }
    );

    expect(result.provider).toBe('mock');
    expect(result.model).toBe('mock-chat');
    expect(result.output).toContain('[mock:mock-chat]');
    expect(result.usage).toBeDefined();
  });

  it('should use fixed chunk size of 20', async () => {
    const provider = new MockProvider();
    const chunks: string[] = [];
    const longInput = 'a'.repeat(100);

    await provider.invokeStream(
      { provider: 'mock', model: 'mock-chat', input: longInput },
      {
        onStart: () => {},
        onChunk: (chunk) => {
          chunks.push(chunk.text);
        },
        onComplete: () => {},
      }
    );

    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].length).toBe(20);
    }
  });
});
