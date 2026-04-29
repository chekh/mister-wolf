import { StepRunner, ExecutionContext } from '../types/runner.js';
import { StepDefinition } from '../types/workflow.js';
import { StepResult } from '../types/state.js';
import { AgentRegistry } from './registry.js';
import { ModelRouter, ModelRouteNotFound } from './router.js';
import { AgentInvocationPlan } from '../types/agent.js';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

function validateContextBundlePath(path: string, stateDir: string): { valid: boolean; reason?: string } {
  if (path.startsWith('/')) {
    return { valid: false, reason: 'context_bundle must be a relative path' };
  }
  if (path.includes('..')) {
    return { valid: false, reason: 'context_bundle must not contain parent traversal' };
  }

  const projectRoot = dirname(stateDir);
  const resolved = resolve(projectRoot, path);
  if (!resolved.startsWith(projectRoot)) {
    return { valid: false, reason: 'context_bundle must be inside project root' };
  }
  if (!existsSync(resolved)) {
    return { valid: false, reason: `context_bundle not found: ${path}` };
  }

  return { valid: true };
}

export class AgentRunner implements StepRunner {
  type = 'agent';

  constructor(
    private registry: AgentRegistry,
    private router: ModelRouter
  ) {}

  async run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult> {
    const agentId = step.input?.agent;
    if (!agentId || typeof agentId !== 'string') {
      return {
        status: 'failure',
        error: {
          type: 'AgentInputValidationError',
          message: 'Missing or invalid input.agent field',
          retryable: false,
        },
      };
    }

    const agent = this.registry.get(agentId);
    if (!agent) {
      return {
        status: 'failure',
        error: {
          type: 'AgentNotFound',
          message: `Agent not found: ${agentId}`,
          retryable: false,
        },
      };
    }

    let route;
    try {
      route = this.router.resolve(agent.model_route);
    } catch (err) {
      if (err instanceof ModelRouteNotFound) {
        return {
          status: 'failure',
          error: {
            type: 'ModelRouteNotFound',
            message: err.message,
            retryable: false,
          },
        };
      }
      throw err;
    }

    const contextBundle = step.input?.context_bundle as string | undefined;
    if (contextBundle) {
      const validation = validateContextBundlePath(contextBundle, ctx.config.state_dir);
      if (!validation.valid) {
        return {
          status: 'failure',
          error: {
            type: 'ContextBundleValidationError',
            message: validation.reason || 'Context bundle validation failed',
            retryable: false,
          },
        };
      }
    }

    const plan: AgentInvocationPlan = {
      type: 'agent_invocation_plan',
      agent_id: agent.id,
      agent_name: agent.name || agent.id,
      model_route: agent.model_route,
      provider: route.provider,
      model: route.model,
      purpose: route.purpose,
      max_tokens: route.max_tokens,
      capabilities: agent.capabilities,
      tools: agent.tools,
      task: (step.input?.task as string) || '',
      context_bundle: contextBundle,
    };

    return {
      status: 'success',
      output: JSON.stringify(plan, null, 2),
    };
  }
}
