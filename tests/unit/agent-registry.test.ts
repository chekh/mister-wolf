import { describe, it, expect } from 'vitest';
import { AgentRegistry, AgentNotFound } from '../../src/agent/registry.js';
import { AgentDefinition } from '../../src/types/agent.js';

const mockAgents: AgentDefinition[] = [
  {
    id: 'agent-1',
    name: 'Agent One',
    description: 'First agent',
    capabilities: ['read', 'write'],
    model_route: 'route-a',
    tools: ['tool-1'],
  },
  {
    id: 'agent-2',
    name: 'Agent Two',
    description: 'Second agent',
    capabilities: ['read', 'analyze'],
    model_route: 'route-b',
    tools: ['tool-2'],
  },
];

describe('AgentRegistry', () => {
  it('should get agent by id', () => {
    const registry = new AgentRegistry(mockAgents);
    expect(registry.get('agent-1')).toEqual(mockAgents[0]);
  });

  it('should return undefined for unknown agent', () => {
    const registry = new AgentRegistry(mockAgents);
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should require existing agent', () => {
    const registry = new AgentRegistry(mockAgents);
    expect(registry.require('agent-1')).toEqual(mockAgents[0]);
  });

  it('should throw AgentNotFound for missing agent', () => {
    const registry = new AgentRegistry(mockAgents);
    expect(() => registry.require('unknown')).toThrow(AgentNotFound);
    expect(() => registry.require('unknown')).toThrow('Agent not found: unknown');
  });

  it('should list all agents', () => {
    const registry = new AgentRegistry(mockAgents);
    expect(registry.list()).toHaveLength(2);
    expect(registry.list()).toEqual(expect.arrayContaining(mockAgents));
  });

  it('should find agents by capability', () => {
    const registry = new AgentRegistry(mockAgents);
    const readers = registry.findByCapability('read');
    expect(readers).toHaveLength(2);
    expect(readers).toEqual(expect.arrayContaining(mockAgents));

    const writers = registry.findByCapability('write');
    expect(writers).toHaveLength(1);
    expect(writers[0]).toEqual(mockAgents[0]);

    const unknown = registry.findByCapability('fly');
    expect(unknown).toHaveLength(0);
  });
});
