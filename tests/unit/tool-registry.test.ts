import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/tool/registry.js';
import { ToolNotFound, ToolExecutorNotFound } from '../../src/tool/errors.js';

describe('ToolRegistry', () => {
  it('should register and get definitions', () => {
    const registry = new ToolRegistry();
    const def = { id: 'test.tool', executor: 'test.tool', risk: 'low' as const };
    registry.registerDefinition(def);
    expect(registry.getDefinition('test.tool')).toBe(def);
    expect(registry.getDefinition('missing')).toBeUndefined();
  });

  it('should require definition', () => {
    const registry = new ToolRegistry();
    const def = { id: 'test.tool', executor: 'test.tool', risk: 'low' as const };
    registry.registerDefinition(def);
    expect(registry.requireDefinition('test.tool')).toBe(def);
    expect(() => registry.requireDefinition('missing')).toThrow(ToolNotFound);
  });

  it('should register and require executor', () => {
    const registry = new ToolRegistry();
    const executor = { id: 'test.tool', execute: async () => ({ tool_id: 'test.tool', output: '' }) };
    registry.registerExecutor(executor);
    expect(registry.requireExecutor('test.tool')).toBe(executor);
    expect(() => registry.requireExecutor('missing')).toThrow(ToolExecutorNotFound);
  });

  it('should list all definitions', () => {
    const registry = new ToolRegistry();
    registry.registerDefinition({ id: 'tool.a', executor: 'tool.a', risk: 'low' as const });
    registry.registerDefinition({ id: 'tool.b', executor: 'tool.b', risk: 'medium' as const });
    expect(registry.list()).toHaveLength(2);
  });

  it('should listForAgent with valid tools', () => {
    const registry = new ToolRegistry();
    registry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low' as const });
    registry.registerDefinition({ id: 'other.tool', executor: 'other.tool', risk: 'medium' as const });
    const result = registry.listForAgent(['context.read']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('context.read');
  });

  it('should throw ToolNotFound for unknown tool in listForAgent', () => {
    const registry = new ToolRegistry();
    registry.registerDefinition({ id: 'context.read', executor: 'context.read', risk: 'low' as const });
    expect(() => registry.listForAgent(['context.read', 'unknown.tool'])).toThrow(ToolNotFound);
  });

  it('should throw when registering duplicate definition', () => {
    const registry = new ToolRegistry();
    registry.registerDefinition({ id: 'tool', executor: 'tool', risk: 'low' as const });
    expect(() => registry.registerDefinition({ id: 'tool', executor: 'tool', risk: 'low' as const })).toThrow(
      'already registered'
    );
  });
});
