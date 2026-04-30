import { StepRunner, ExecutionContext } from '../types/runner.js';
import { StepDefinition } from '../types/workflow.js';
import { StepResult } from '../types/state.js';
import { AgentRegistry } from './registry.js';
import { ModelRouter, ModelRouteNotFound } from './router.js';
import { AgentInvocationPlan, ModelRoute } from '../types/agent.js';
import { AgentModelResult } from '../model/types.js';
import { ModelProviderRegistry } from '../model/registry.js';
import { ModelInvocationRequest, ModelToolCall } from '../model/types.js';
import { ToolRegistry } from '../tool/registry.js';
import { ToolExecutionContext } from '../tool/types.js';
import { ToolNotAllowed, ToolCallLimitExceeded } from '../tool/errors.js';
import { ContextReadError } from '../model/errors.js';
import { dirname, resolve } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

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

function readContextBundle(path: string): string {
  const stats = statSync(path);
  if (stats.size > 1048576) {
    throw new ContextReadError(path, 'file exceeds 1MB limit');
  }

  const content = readFileSync(path, 'utf-8');
  if (path.endsWith('.json')) {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      throw new ContextReadError(path, 'invalid JSON');
    }
  }
  return content;
}

function resolveExecutionMode(route: ModelRoute, globalMode: 'stub' | 'invoke'): 'stub' | 'invoke' {
  return route.execution_mode ?? globalMode ?? 'stub';
}

function buildPass2Input(originalTask: string, toolCall: ModelToolCall, toolOutput: string): string {
  return [originalTask, '', `[Tool Call Result: ${toolCall.tool_id}]`, toolOutput].join('\n');
}

export class AgentRunner implements StepRunner {
  type = 'agent';

  constructor(
    private registry: AgentRegistry,
    private router: ModelRouter,
    private providerRegistry?: ModelProviderRegistry,
    private toolRegistry?: ToolRegistry,
    private globalExecutionMode: 'stub' | 'invoke' = 'stub'
  ) {}

  async run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult> {
    const agentId = step.input?.agent;
    if (!agentId || typeof agentId !== 'string') {
      return {
        status: 'failure',
        error: { type: 'AgentInputValidationError', message: 'Missing or invalid input.agent field', retryable: false },
      };
    }

    const agent = this.registry.get(agentId);
    if (!agent) {
      return {
        status: 'failure',
        error: { type: 'AgentNotFound', message: `Agent not found: ${agentId}`, retryable: false },
      };
    }

    let route: ModelRoute;
    try {
      route = this.router.resolve(agent.model_route);
    } catch (err) {
      if (err instanceof ModelRouteNotFound) {
        return { status: 'failure', error: { type: 'ModelRouteNotFound', message: err.message, retryable: false } };
      }
      throw err;
    }

    const contextBundle = step.input?.context_bundle as string | undefined;
    if (contextBundle) {
      const validation = validateContextBundlePath(contextBundle, ctx.config.state_dir);
      if (!validation.valid) {
        return {
          status: 'failure',
          error: { type: 'ContextBundleValidationError', message: validation.reason || 'Context bundle validation failed', retryable: false },
        };
      }
    }

    const mode = resolveExecutionMode(route, this.globalExecutionMode);

    if (mode === 'invoke') {
      return this.runInvoke(step, ctx, agent, route, contextBundle);
    }

    // Stub mode: return AgentInvocationPlan (MVP4 behavior)
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

    return { status: 'success', output: JSON.stringify(plan, null, 2) };
  }

  private async runInvoke(
    step: StepDefinition,
    ctx: ExecutionContext,
    agent: NonNullable<ReturnType<AgentRegistry['get']>>,
    route: ModelRoute,
    contextBundle?: string
  ): Promise<StepResult> {
    const task = step.input?.task;
    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      return {
        status: 'failure',
        error: { type: 'AgentInputValidationError', message: 'Missing or empty input.task field in invoke mode', retryable: false },
      };
    }

    let contextContent: string | undefined;
    if (contextBundle) {
      const projectRoot = dirname(ctx.config.state_dir);
      const resolved = resolve(projectRoot, contextBundle);
      try {
        contextContent = readContextBundle(resolved);
      } catch (err) {
        if (err instanceof ContextReadError) {
          return { status: 'failure', error: { type: 'ContextReadError', message: err.message, retryable: false } };
        }
        throw err;
      }
    }

    if (!this.providerRegistry) {
      return { status: 'failure', error: { type: 'ProviderNotFound', message: 'No provider registry configured', retryable: false } };
    }

    let provider;
    try {
      provider = this.providerRegistry.require(route.provider);
    } catch (err) {
      return {
        status: 'failure',
        error: { type: 'ProviderNotFound', message: err instanceof Error ? err.message : String(err), retryable: false },
      };
    }

    // Resolve available tools (invoke mode only)
    let availableTools: import('../tool/types.js').ToolDefinition[] | undefined;
    if (this.toolRegistry && agent.tools.length > 0) {
      try {
        availableTools = this.toolRegistry.listForAgent(agent.tools);
      } catch (err) {
        if (err instanceof ToolNotAllowed) {
          return { status: 'failure', error: { type: 'ToolNotAllowed', message: err.message, retryable: false } };
        }
        throw err;
      }
    }

    // Pass 1: Invoke model with tools
    const pass1Request: ModelInvocationRequest = {
      provider: route.provider,
      model: route.model,
      input: task,
      system_prompt: (step.input?.system_prompt as string | undefined) ?? agent.system_prompt ?? route.system_prompt,
      context: contextContent,
      max_tokens: route.max_tokens,
      temperature: route.temperature,
      tools: availableTools && availableTools.length > 0 ? availableTools : undefined,
    };

    let pass1Result;
    try {
      pass1Result = await provider.invoke(pass1Request);
    } catch (err) {
      return {
        status: 'failure',
        error: { type: err instanceof Error ? err.constructor.name : 'ProviderError', message: err instanceof Error ? err.message : String(err), retryable: err instanceof ContextReadError ? false : true },
      };
    }

    // Check for tool call
    if (pass1Result.tool_call) {
      return this.handleToolCall(pass1Result.tool_call, agent!, step, ctx, route, pass1Result, provider, task, contextContent);
    }

    // No tool call — return result
    return this.buildModelResult(pass1Result, agent!, route);
  }

  private async handleToolCall(
    toolCall: ModelToolCall,
    agent: NonNullable<ReturnType<AgentRegistry['get']>>,
    step: StepDefinition,
    ctx: ExecutionContext,
    route: ModelRoute,
    pass1Result: import('../model/types.js').ModelInvocationResult,
    provider: import('../model/types.js').ModelProvider,
    task: string,
    contextContent?: string
  ): Promise<StepResult> {
    // Validate allow-list
    if (!agent.tools.includes(toolCall.tool_id)) {
      return { status: 'failure', error: { type: 'ToolNotAllowed', message: new ToolNotAllowed(toolCall.tool_id, agent.id).message, retryable: false } };
    }

    if (!this.toolRegistry) {
      return { status: 'failure', error: { type: 'ToolNotFound', message: 'No tool registry configured', retryable: false } };
    }

    const toolDef = this.toolRegistry.requireDefinition(toolCall.tool_id);
    const executor = this.toolRegistry.requireExecutor(toolDef.executor);

    const toolCtx: ToolExecutionContext = {
      case_id: ctx.case_id,
      workflow_id: ctx.workflow_id,
      step_id: step.id,
      project_root: dirname(resolve(ctx.config.state_dir)),
      agent_id: agent.id,
    };

    // Execute tool
    let toolResult;
    try {
      toolResult = await executor.execute({ tool_id: toolCall.tool_id, input: toolCall.input }, toolCtx);
    } catch (err) {
      return {
        status: 'failure',
        error: { type: err instanceof Error ? err.constructor.name : 'ToolExecutionError', message: err instanceof Error ? err.message : String(err), retryable: false },
      };
    }

    // Pass 2: Invoke model with tool result (no tools exposed)
    const pass2Request: ModelInvocationRequest = {
      provider: route.provider,
      model: route.model,
      input: buildPass2Input(task, toolCall, toolResult.output),
      system_prompt: (step.input?.system_prompt as string | undefined) ?? agent.system_prompt ?? route.system_prompt,
      context: contextContent,
      max_tokens: route.max_tokens,
      temperature: route.temperature,
    };

    let pass2Result;
    try {
      pass2Result = await provider.invoke(pass2Request);
    } catch (err) {
      return {
        status: 'failure',
        error: { type: err instanceof Error ? err.constructor.name : 'ProviderError', message: err instanceof Error ? err.message : String(err), retryable: false },
      };
    }

    if (pass2Result.tool_call) {
      return { status: 'failure', error: { type: 'ToolCallLimitExceeded', message: new ToolCallLimitExceeded().message, retryable: false } };
    }

    return this.buildModelResult(pass2Result, agent, route);
  }

  private buildModelResult(
    result: import('../model/types.js').ModelInvocationResult,
    agent: NonNullable<ReturnType<AgentRegistry['get']>>,
    route: ModelRoute
  ): StepResult {
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

    return { status: 'success', output: JSON.stringify(modelResult, null, 2) };
  }
}
