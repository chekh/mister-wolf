import { describe, it, expect } from 'vitest';
import { MockProvider } from '../../src/model/mock-provider.js';

describe('MockProvider', () => {
  it('should produce deterministic output', async () => {
    const provider = new MockProvider();
    const request = { provider: 'mock', model: 'test-model', input: 'hello world' };
    const result = await provider.invoke(request);

    expect(result.output).toBe('[mock:test-model] hello world');
    expect(result.provider).toBe('mock');
    expect(result.model).toBe('test-model');
  });

  it('should truncate long input', async () => {
    const provider = new MockProvider();
    const longInput = 'a'.repeat(250);
    const request = { provider: 'mock', model: 'test-model', input: longInput };
    const result = await provider.invoke(request);

    expect(result.output).toBe(`[mock:test-model] ${'a'.repeat(200)}...`);
    expect(result.output.length).toBeLessThan(longInput.length);
  });

  it('should include usage with context', async () => {
    const provider = new MockProvider();
    const request = {
      provider: 'mock',
      model: 'test-model',
      input: 'hello',
      context: 'world',
    };
    const result = await provider.invoke(request);

    expect(result.usage).toBeDefined();
    expect(result.usage!.input_tokens).toBeGreaterThan(0);
    expect(result.usage!.output_tokens).toBeGreaterThan(0);
    expect(result.usage!.total_tokens).toBe(result.usage!.input_tokens! + result.usage!.output_tokens!);
  });
});
