import { AgentDefinition } from '../types/agent.js';

export class AgentNotFound extends Error {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
  }
}

export class AgentRegistry {
  private byId = new Map<string, AgentDefinition>();
  private byCapability = new Map<string, Set<string>>();

  constructor(agents: AgentDefinition[]) {
    for (const agent of agents) {
      this.byId.set(agent.id, agent);
      for (const cap of agent.capabilities) {
        if (!this.byCapability.has(cap)) {
          this.byCapability.set(cap, new Set());
        }
        this.byCapability.get(cap)!.add(agent.id);
      }
    }
  }

  get(id: string): AgentDefinition | undefined {
    return this.byId.get(id);
  }

  require(id: string): AgentDefinition {
    const agent = this.byId.get(id);
    if (!agent) {
      throw new AgentNotFound(id);
    }
    return agent;
  }

  list(): AgentDefinition[] {
    return Array.from(this.byId.values());
  }

  findByCapability(capability: string): AgentDefinition[] {
    const ids = this.byCapability.get(capability);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.byId.get(id)!)
      .filter(Boolean);
  }
}
