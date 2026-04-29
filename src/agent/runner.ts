import { StepRunner, ExecutionContext } from '../types/runner.js';
import { StepDefinition } from '../types/workflow.js';
import { StepResult } from '../types/state.js';
import { AgentRegistry } from './registry.js';
import { ModelRouter, ModelRouteNotFound } from './router.js';
import { AgentInvocationPlan } from '../types/agent.js';
import { ModelProviderRegistry } from '../model/registry.js';
import { ModelInvocationRequest, AgentModelResult } from '../model/types.js';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

function validateContextBundlePath(path: string, stateDir: string): { valid: boolean; reason?: string } {
  if (path.startsWith('/')) {
    return { valid: false, reason: 'context_bundle must be a relative path' };
  }
  if (path.includes('..')) {
    return { valid: false, reason: 'context_bundle must not contain parent traversal' };
  }

  const absoluteStateDir = resolve(stateDir);
  const projectRoot = dirname(absoluteStateDir);
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
    private router: ModelRouter,
    private providerRegistry: ModelProviderRegistry
  ) {}

  private resolveExecutionMode(
    route: import('../types/agent.js').ModelRoute,
    globalMode: 'stub' | 'invoke'
  ): 'stub' | 'invoke' {
    return route.execution_mode ?? globalMode ?? 'stub';
  }

  private readContextBundle(path: string, stateDir: string): { valid: boolean; content?: string; reason?: string } {
    // MVP4 path validation
    if (path.startsWith('/')) {
      return { valid: false, reason: 'context_bundle must be a relative path' };
    }
    if (path.includes('..')) {
      return { valid: false, reason: 'context_bundle must not contain parent traversal' };
    }
    const absoluteStateDir = resolve(stateDir);
    const projectRoot = dirname(absoluteStateDir);
    const resolved = resolve(projectRoot, path);
    if (!resolved.startsWith(projectRoot)) {
      return { valid: false, reason: 'context_bundle must be inside project root' };
    }
    if (!existsSync(resolved)) {
      return { valid: false, reason: `context_bundle not found: ${path}` };
    }

    // MVP5: size limit
    const stats = statSync(resolved);
    if (stats.size > 1048576) {
      return { valid: false, reason: `context_bundle exceeds 1MB limit: ${path}` };
    }

    // Read content
    try {
      const content = readFileSync(resolved, 'utf-8');
      if (path.endsWith('.json')) {
        const parsed = JSON.parse(content);
        return { valid: true, content: JSON.stringify(parsed, null, 2) };
      }
      return { valid: true, content };
    } catch (err) {
      return { valid: false, reason: `Failed to read context_bundle: ${path}` };
    }
  }

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

    const globalMode = ctx.config.models?.execution?.mode ?? 'stub';
    const executionMode = this.resolveExecutionMode(route, globalMode);

    const contextBundle = step.input?.context_bundle as string | undefined;

    if (executionMode === 'stub') {
      // Stub mode: validate path only, return plan
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

    // Invoke mode
    // Validate task
    const task = step.input?.task;
    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      return {
        status: 'failure',
        error: {
          type: 'AgentInputValidationError',
          message: 'Missing or empty input.task field in invoke mode',
          retryable: false,
        },
      };
    }

    let contextBundleContent: string | undefined;
    if (contextBundle) {
      const bundleResult = this.readContextBundle(contextBundle, ctx.config.state_dir);
      if (!bundleResult.valid) {
        return {
          status: 'failure',
          error: {
            type: 'ContextReadError',
            message: bundleResult.reason || 'Context bundle read failed',
            retryable: false,
          },
        };
      }
      contextBundleContent = bundleResult.content;
    }

    // Build request
    const request: ModelInvocationRequest = {
      provider: route.provider,
      model: route.model,
      input: task,
      system_prompt: (step.input?.system_prompt as string | undefined) ?? agent.system_prompt ?? route.system_prompt,
      context: contextBundleContent,
      max_tokens: route.max_tokens,
      temperature: route.temperature,
    };

    // Invoke
    const provider = this.providerRegistry.require(route.provider);
    const result = await provider.invoke(request);

    // Return AgentModelResult
    const modelResult: AgentModelResult = {
      type: 'agent_model_result',
      agent_id: agent.id,
      agent_name: agent.name || agent.id,
      model_route: agent.model_route,
      provider: route.provider,
      model: route.model,
      output: result.output,
      usage: result.usage,
    };

    return {
      status: 'success',
      output: JSON.stringify(modelResult, null, 2),
    };
  }
}
