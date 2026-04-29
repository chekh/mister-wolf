import { describe, it, expect } from 'vitest';
import { ModelRouter, ModelRouteNotFound } from '../../src/agent/router.js';
import { ModelRoute } from '../../src/types/agent.js';

const mockRoutes: Record<string, ModelRoute> = {
  'route-a': {
    provider: 'openai',
    model: 'gpt-4',
    purpose: 'General tasks',
    max_tokens: 2048,
  },
  'route-b': {
    provider: 'anthropic',
    model: 'claude-3',
  },
};

describe('ModelRouter', () => {
  it('should resolve existing route', () => {
    const router = new ModelRouter(mockRoutes);
    expect(router.resolve('route-a')).toEqual(mockRoutes['route-a']);
    expect(router.resolve('route-b')).toEqual(mockRoutes['route-b']);
  });

  it('should throw ModelRouteNotFound for missing route', () => {
    const router = new ModelRouter(mockRoutes);
    expect(() => router.resolve('unknown')).toThrow(ModelRouteNotFound);
    expect(() => router.resolve('unknown')).toThrow('Model route not found: unknown');
  });
});
