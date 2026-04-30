import { ToolDefinition, ToolExecutor } from './types.js';
import { ToolNotFound, ToolExecutorNotFound } from './errors.js';

export class ToolRegistry {
  private definitions = new Map<string, ToolDefinition>();
  private executors = new Map<string, ToolExecutor>();

  registerDefinition(def: ToolDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Tool definition already registered: ${def.id}`);
    }
    this.definitions.set(def.id, def);
  }

  registerExecutor(executor: ToolExecutor): void {
    if (this.executors.has(executor.id)) {
      throw new Error(`Tool executor already registered: ${executor.id}`);
    }
    this.executors.set(executor.id, executor);
  }

  getDefinition(id: string): ToolDefinition | undefined {
    return this.definitions.get(id);
  }

  requireDefinition(id: string): ToolDefinition {
    const def = this.definitions.get(id);
    if (!def) {
      throw new ToolNotFound(id);
    }
    return def;
  }

  requireExecutor(executorId: string): ToolExecutor {
    const executor = this.executors.get(executorId);
    if (!executor) {
      throw new ToolExecutorNotFound(executorId);
    }
    return executor;
  }

  list(): ToolDefinition[] {
    return Array.from(this.definitions.values());
  }

  listForAgent(agentTools: string[]): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const toolId of agentTools) {
      const def = this.definitions.get(toolId);
      if (!def) {
        throw new ToolNotFound(toolId);
      }
      result.push(def);
    }
    return result;
  }
}
