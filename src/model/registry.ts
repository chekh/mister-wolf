import { ModelProvider } from './types.js';
import { ProviderNotFound } from './errors.js';

export class ModelProviderRegistry {
  private providers = new Map<string, ModelProvider>();

  constructor(providers: ModelProvider[]) {
    for (const provider of providers) {
      this.providers.set(provider.id, provider);
    }
  }

  get(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  require(id: string): ModelProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderNotFound(id);
    }
    return provider;
  }

  list(): ModelProvider[] {
    return Array.from(this.providers.values());
  }
}
