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

  it('should return tool_call when metadata.mock_tool_call is set', async () => {
    const provider = new MockProvider();
    const result = await provider.invoke({
      provider: 'mock',
      model: 'mock-chat',
      input: 'Read context',
      metadata: {
        mock_tool_call: { tool_id: 'context.read', input: { path: '.wolf/context/context.md' } },
      },
    });
    expect(result.tool_call).toBeDefined();
    expect(result.tool_call!.tool_id).toBe('context.read');
    expect(result.output).toBe('');
  });

  it('should return text output when metadata.mock_tool_call is not set', async () => {
    const provider = new MockProvider();
    const result = await provider.invoke({
      provider: 'mock',
      model: 'mock-chat',
      input: 'Hello',
    });
    expect(result.tool_call).toBeUndefined();
    expect(result.output).toContain('[mock:mock-chat]');
  });
});
