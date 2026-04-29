import { describe, it, expect } from 'vitest';
import { ModelProviderRegistry } from '../../src/model/registry.js';
import { ModelProvider } from '../../src/model/types.js';
import { ProviderNotFound } from '../../src/model/errors.js';

const mockProviders: ModelProvider[] = [
  {
    id: 'provider-a',
    invoke: async () => ({ output: 'a', provider: 'provider-a', model: 'model-a' }),
  },
  {
    id: 'provider-b',
    invoke: async () => ({ output: 'b', provider: 'provider-b', model: 'model-b' }),
  },
];

describe('ModelProviderRegistry', () => {
  it('should get provider by id', () => {
    const registry = new ModelProviderRegistry(mockProviders);
    expect(registry.get('provider-a')).toEqual(mockProviders[0]);
  });

  it('should return undefined for unknown provider', () => {
    const registry = new ModelProviderRegistry(mockProviders);
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should require existing provider', () => {
    const registry = new ModelProviderRegistry(mockProviders);
    expect(registry.require('provider-a')).toEqual(mockProviders[0]);
  });

  it('should throw ProviderNotFound for missing provider', () => {
    const registry = new ModelProviderRegistry(mockProviders);
    expect(() => registry.require('unknown')).toThrow(ProviderNotFound);
    expect(() => registry.require('unknown')).toThrow('Provider not found: unknown');
  });

  it('should list all providers', () => {
    const registry = new ModelProviderRegistry(mockProviders);
    expect(registry.list()).toHaveLength(2);
    expect(registry.list()).toEqual(expect.arrayContaining(mockProviders));
  });
});
