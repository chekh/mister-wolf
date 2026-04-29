# MVP4: Agent Registry + Model Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement declarative Agent Registry, deterministic Model Router, and agent runner stub with CLI commands.

**Architecture:** Config schema (agents + models) → AgentRegistry (indexing/querying) + ModelRouter (direct lookup) → AgentRunner (invocation plan JSON) → CLI (list/inspect). Agent definitions live only in `wolf.yaml`. No real LLM calls.

**Tech Stack:** TypeScript, Zod, Commander.js, Vitest

---

## File Structure

**New files:**

- `src/types/agent.ts` — AgentDefinition, ModelRoute, AgentInvocationPlan schemas
- `src/agent/registry.ts` — AgentRegistry class
- `src/agent/router.ts` — ModelRouter class
- `src/agent/runner.ts` — AgentRunner implementation
- `src/cli/commands/agents.ts` — CLI commands
- `tests/unit/agent-registry.test.ts`
- `tests/unit/model-router.test.ts`
- `tests/unit/agent-runner.test.ts`
- `tests/integration/agent-cli.test.ts`

**Modified files:**

- `src/config/project-config.ts` — add agents/models schemas + cross-reference validation
- `src/types/runner.ts` — no changes needed (AgentRunner implements StepRunner)
- `src/workflow/runner-registry.ts` — register AgentRunner
- `src/cli/index.ts` — register agents command
- `README.md` — update status
- `docs/development.md` — add Agent Registry section

---

## PR1: Config Schema + Types

### Task 1.1: Add Agent Types

**Files:**

- Create: `src/types/agent.ts`

- [ ] **Step 1: Write schemas and types**

```typescript
import { z } from 'zod';

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  model_route: z.string(),
  tools: z.array(z.string()).default([]),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const ModelRouteSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  purpose: z.string().optional(),
  max_tokens: z.number().int().positive().optional(),
});

export type ModelRoute = z.infer<typeof ModelRouteSchema>;

export const AgentInvocationPlanSchema = z.object({
  type: z.literal('agent_invocation_plan'),
  agent_id: z.string(),
  agent_name: z.string(),
  model_route: z.string(),
  provider: z.string(),
  model: z.string(),
  purpose: z.string().optional(),
  max_tokens: z.number().optional(),
  capabilities: z.array(z.string()),
  tools: z.array(z.string()),
  task: z.string(),
  context_bundle: z.string().optional(),
});

export type AgentInvocationPlan = z.infer<typeof AgentInvocationPlanSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/types/agent.ts
git commit -m "feat(agent): add AgentDefinition, ModelRoute, AgentInvocationPlan types"
```

### Task 1.2: Extend ProjectConfig

**Files:**

- Modify: `src/config/project-config.ts`

- [ ] **Step 1: Import new schemas**

Add to imports:

```typescript
import { AgentDefinitionSchema, ModelRouteSchema } from '../types/agent.js';
```

- [ ] **Step 2: Add agents and models to ProjectConfigSchema**

```typescript
export const ProjectConfigSchema = z.object({
  state_dir: z.string().default('.wolf/state'),
  index_path: z.string().optional(),
  context: ContextConfigSchema.default({}),
  policy: PolicyConfigSchema.default({}),
  agents: z.array(AgentDefinitionSchema).default([]),
  models: z
    .object({
      routes: z.record(ModelRouteSchema).default({}),
    })
    .default({ routes: {} }),
  defaults: z
    .object({
      timeout: z.string().default('30s'),
      max_parallel: z.number().int().positive().optional(),
      shell: z
        .object({
          max_output_size: z.string().default('1MB'),
          blocked_commands: z
            .array(z.string())
            .default(['sudo', 'su', 'ssh', 'vim', 'nano', 'less', 'more', 'top', 'watch']),
        })
        .optional(),
    })
    .default({}),
});
```

- [ ] **Step 3: Add cross-reference validation**

Add after `ProjectConfigSchema.parse(parsed)`:

```typescript
function validateCrossReferences(config: ProjectConfig): void {
  const routeIds = new Set(Object.keys(config.models.routes));
  const agentIds = new Set<string>();

  for (const agent of config.agents) {
    if (agentIds.has(agent.id)) {
      throw new Error(`Duplicate agent id: ${agent.id}`);
    }
    agentIds.add(agent.id);

    if (!routeIds.has(agent.model_route)) {
      throw new Error(`Agent '${agent.id}' references unknown model route '${agent.model_route}'`);
    }
  }
}
```

Update `loadProjectConfig`:

```typescript
const config = ProjectConfigSchema.parse(parsed);
validateCrossReferences(config);
return config;
```

- [ ] **Step 4: Commit**

```bash
git add src/config/project-config.ts
git commit -m "feat(config): add agents and models to ProjectConfig with cross-reference validation"
```

### Task 1.3: Write Config Tests

**Files:**

- Modify: `tests/unit/project-config.test.ts`

- [ ] **Step 1: Add tests for agents and models**

```typescript
it('should load config with agents and model routes', () => {
  writeFileSync(
    join(tempDir, 'wolf.yaml'),
    `
agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default_coding
    tools:
      - context.read

models:
  routes:
    default_coding:
      provider: openai
      model: gpt-5.5-thinking
      purpose: coding
      max_tokens: 12000
`
  );
  const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
  expect(config.agents).toHaveLength(1);
  expect(config.agents[0].id).toBe('reviewer');
  expect(config.agents[0].model_route).toBe('default_coding');
  expect(config.models.routes['default_coding'].provider).toBe('openai');
});

it('should reject config with duplicate agent ids', () => {
  writeFileSync(
    join(tempDir, 'wolf.yaml'),
    `
agents:
  - id: reviewer
    model_route: default_coding
  - id: reviewer
    model_route: default_coding

models:
  routes:
    default_coding:
      provider: openai
      model: gpt-5.5-thinking
`
  );
  expect(() => loadProjectConfig(join(tempDir, 'wolf.yaml'))).toThrow('Duplicate agent id');
});

it('should reject config with missing model route reference', () => {
  writeFileSync(
    join(tempDir, 'wolf.yaml'),
    `
agents:
  - id: reviewer
    model_route: missing_route

models:
  routes:
    default_coding:
      provider: openai
      model: gpt-5.5-thinking
`
  );
  expect(() => loadProjectConfig(join(tempDir, 'wolf.yaml'))).toThrow('unknown model route');
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/project-config.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/project-config.test.ts
git commit -m "test(config): add agents and models config validation tests"
```

---

## PR2: AgentRegistry + ModelRouter

### Task 2.1: Implement AgentRegistry

**Files:**

- Create: `src/agent/registry.ts`

- [ ] **Step 1: Write AgentRegistry**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/registry.ts
git commit -m "feat(agent): implement AgentRegistry with id/capability indexing"
```

### Task 2.2: Implement ModelRouter

**Files:**

- Create: `src/agent/router.ts`

- [ ] **Step 1: Write ModelRouter**

```typescript
import { ModelRoute } from '../types/agent.js';

export class ModelRouteNotFound extends Error {
  constructor(routeId: string) {
    super(`Model route not found: ${routeId}`);
  }
}

export class ModelRouter {
  private routes = new Map<string, ModelRoute>();

  constructor(routes: Record<string, ModelRoute>) {
    for (const [id, route] of Object.entries(routes)) {
      this.routes.set(id, route);
    }
  }

  resolve(routeId: string): ModelRoute {
    const route = this.routes.get(routeId);
    if (!route) {
      throw new ModelRouteNotFound(routeId);
    }
    return route;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/router.ts
git commit -m "feat(agent): implement ModelRouter with direct lookup"
```

### Task 2.3: Write Registry + Router Tests

**Files:**

- Create: `tests/unit/agent-registry.test.ts`
- Create: `tests/unit/model-router.test.ts`

- [ ] **Step 1: Write AgentRegistry tests**

```typescript
import { describe, it, expect } from 'vitest';
import { AgentRegistry, AgentNotFound } from '../../src/agent/registry.js';
import { AgentDefinition } from '../../src/types/agent.js';

function makeAgent(partial: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: partial.id ?? 'agent1',
    name: partial.name,
    description: partial.description,
    capabilities: partial.capabilities ?? [],
    model_route: partial.model_route ?? 'default',
    tools: partial.tools ?? [],
  };
}

describe('AgentRegistry', () => {
  it('should get agent by id', () => {
    const registry = new AgentRegistry([makeAgent({ id: 'a1', name: 'Agent 1' })]);
    expect(registry.get('a1')?.name).toBe('Agent 1');
  });

  it('should return undefined for unknown agent', () => {
    const registry = new AgentRegistry([]);
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should require existing agent', () => {
    const registry = new AgentRegistry([makeAgent({ id: 'a1' })]);
    expect(registry.require('a1').id).toBe('a1');
  });

  it('should throw AgentNotFound for missing agent', () => {
    const registry = new AgentRegistry([]);
    expect(() => registry.require('missing')).toThrow(AgentNotFound);
  });

  it('should list all agents', () => {
    const registry = new AgentRegistry([makeAgent({ id: 'a1' }), makeAgent({ id: 'a2' })]);
    expect(registry.list()).toHaveLength(2);
  });

  it('should find agents by capability', () => {
    const registry = new AgentRegistry([
      makeAgent({ id: 'a1', capabilities: ['code_review'] }),
      makeAgent({ id: 'a2', capabilities: ['code_review', 'planning'] }),
      makeAgent({ id: 'a3', capabilities: ['planning'] }),
    ]);
    expect(registry.findByCapability('code_review')).toHaveLength(2);
    expect(registry.findByCapability('planning')).toHaveLength(2);
    expect(registry.findByCapability('unknown')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write ModelRouter tests**

```typescript
import { describe, it, expect } from 'vitest';
import { ModelRouter, ModelRouteNotFound } from '../../src/agent/router.js';
import { ModelRoute } from '../../src/types/agent.js';

function makeRoute(partial: Partial<ModelRoute> = {}): ModelRoute {
  return {
    provider: partial.provider ?? 'openai',
    model: partial.model ?? 'gpt-4',
    purpose: partial.purpose,
    max_tokens: partial.max_tokens,
  };
}

describe('ModelRouter', () => {
  it('should resolve existing route', () => {
    const router = new ModelRouter({ default: makeRoute({ provider: 'openai', model: 'gpt-4' }) });
    expect(router.resolve('default').provider).toBe('openai');
  });

  it('should throw ModelRouteNotFound for missing route', () => {
    const router = new ModelRouter({});
    expect(() => router.resolve('missing')).toThrow(ModelRouteNotFound);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/agent-registry.test.ts tests/unit/model-router.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/unit/agent-registry.test.ts tests/unit/model-router.test.ts
git commit -m "test(agent): add AgentRegistry and ModelRouter unit tests"
```

---

## PR3: AgentRunner

### Task 3.1: Implement AgentRunner

**Files:**

- Create: `src/agent/runner.ts`

- [ ] **Step 1: Write AgentRunner**

```typescript
import { StepRunner, ExecutionContext } from '../types/runner.js';
import { StepDefinition } from '../types/workflow.js';
import { StepResult } from '../types/state.js';
import { AgentRegistry } from './registry.js';
import { ModelRouter } from './router.js';
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

    const route = this.router.resolve(agent.model_route);

    const contextBundle = step.input?.context_bundle as string | undefined;
    if (contextBundle) {
      const validation = validateContextBundlePath(contextBundle, ctx.config.state_dir);
      if (!validation.valid) {
        return {
          status: 'failure',
          error: {
            type: 'ContextBundleValidationError',
            message: validation.reason,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/runner.ts
git commit -m "feat(agent): implement AgentRunner with invocation plan and context validation"
```

### Task 3.2: Register AgentRunner

**Files:**

- Modify: `src/workflow/runner-registry.ts` — no changes needed (registration happens in CLI setup)
- Modify: `src/cli/index.ts` — register AgentRunner

Actually, registration happens where WorkflowEngine is constructed. Let me check where runners are registered.

- [ ] **Step 1: Check where runners are registered**

Read `src/cli/commands/run.ts` or similar to find where `RunnerRegistry` is constructed.

- [ ] **Step 2: Register AgentRunner in CLI**

In the file where `RunnerRegistry` is constructed (likely `src/cli/commands/run.ts`), add:

```typescript
import { AgentRunner } from '../../agent/runner.js';

const registry = new RunnerRegistry();
// ... existing runners ...
registry.register(new AgentRunner(agentRegistry, modelRouter));
```

Pass `agentRegistry` and `modelRouter` from loaded config.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/run.ts  # or wherever registry is constructed
git commit -m "feat(agent): register AgentRunner in CLI"
```

### Task 3.3: Write AgentRunner Tests

**Files:**

- Create: `tests/unit/agent-runner.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { AgentRegistry } from '../../src/agent/registry.js';
import { ModelRouter } from '../../src/agent/router.js';
import { AgentDefinition, ModelRoute } from '../../src/types/agent.js';
import { StepDefinition } from '../../src/types/workflow.js';
import { ExecutionContext } from '../../src/types/runner.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function makeAgent(partial: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: partial.id ?? 'agent1',
    capabilities: partial.capabilities ?? [],
    model_route: partial.model_route ?? 'default',
    tools: partial.tools ?? [],
    name: partial.name,
    description: partial.description,
  };
}

function makeRoute(partial: Partial<ModelRoute> = {}): ModelRoute {
  return {
    provider: partial.provider ?? 'openai',
    model: partial.model ?? 'gpt-4',
    purpose: partial.purpose,
    max_tokens: partial.max_tokens,
  };
}

function makeStep(partial: Partial<StepDefinition> = {}): StepDefinition {
  return {
    id: partial.id ?? 'step1',
    type: 'builtin',
    runner: 'agent',
    input: partial.input,
  } as StepDefinition;
}

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    case_id: 'case1',
    workflow_id: 'wf1',
    variables: {},
    config: { state_dir: '.wolf/state' } as any,
    ...overrides,
  };
}

describe('AgentRunner', () => {
  const registry = new AgentRegistry([makeAgent({ id: 'reviewer', name: 'Reviewer', capabilities: ['code_review'] })]);
  const router = new ModelRouter({ default: makeRoute() });
  const runner = new AgentRunner(registry, router);

  it('should return invocation plan for valid agent', async () => {
    const step = makeStep({ input: { agent: 'reviewer', task: 'Review code' } });
    const result = await runner.run(step, makeCtx());

    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.type).toBe('agent_invocation_plan');
    expect(plan.agent_id).toBe('reviewer');
    expect(plan.task).toBe('Review code');
  });

  it('should fail when agent field is missing', async () => {
    const step = makeStep({ input: { task: 'Review code' } });
    const result = await runner.run(step, makeCtx());

    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('AgentInputValidationError');
  });

  it('should fail when agent is not found', async () => {
    const step = makeStep({ input: { agent: 'unknown', task: 'Review code' } });
    const result = await runner.run(step, makeCtx());

    expect(result.status).toBe('failure');
    expect(result.error?.type).toBe('AgentNotFound');
  });

  it('should fail when model route is not found', async () => {
    const registry2 = new AgentRegistry([makeAgent({ id: 'bad', model_route: 'missing' })]);
    const runner2 = new AgentRunner(registry2, router);
    const step = makeStep({ input: { agent: 'bad', task: 'Review' } });

    await expect(runner2.run(step, makeCtx())).rejects.toThrow('Model route not found');
  });

  it('should validate context_bundle path', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-agent-'));
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });
    const bundlePath = '.wolf/context/context-bundle.json';
    mkdirSync(join(tempDir, '.wolf', 'context'), { recursive: true });
    writeFileSync(join(tempDir, bundlePath), '{}');

    const step = makeStep({
      input: { agent: 'reviewer', task: 'Review', context_bundle: bundlePath },
    });
    const result = await runner.run(step, makeCtx({ config: { state_dir: join(tempDir, '.wolf', 'state') } as any }));

    expect(result.status).toBe('success');
    const plan = JSON.parse(result.output as string);
    expect(plan.context_bundle).toBe(bundlePath);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/agent-runner.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/agent-runner.test.ts
git commit -m "test(agent): add AgentRunner unit tests"
```

---

## PR4: Agents CLI

### Task 4.1: Implement CLI Commands

**Files:**

- Create: `src/cli/commands/agents.ts`

- [ ] **Step 1: Write agents CLI**

```typescript
import { Command, Option } from 'commander';
import { loadProjectConfig } from '../../config/project-config.js';
import { AgentRegistry } from '../../agent/registry.js';
import { ModelRouter } from '../../agent/router.js';

export function createAgentsCommand(): Command {
  const agents = new Command('agents').description('Manage agents');

  agents
    .command('list')
    .description('List all agents')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (options: { json?: boolean }) => {
      const config = loadProjectConfig();
      const registry = new AgentRegistry(config.agents);

      if (options.json) {
        console.log(JSON.stringify(registry.list(), null, 2));
      } else {
        const list = registry.list();
        if (list.length === 0) {
          console.log('No agents configured.');
          return;
        }
        console.log(`Agents (${list.length}):`);
        for (const agent of list) {
          const name = agent.name || agent.id;
          console.log(`  ${agent.id.padEnd(12)} ${name.padEnd(20)} route: ${agent.model_route}`);
        }
      }
    });

  agents
    .command('inspect')
    .description('Inspect an agent')
    .argument('<id>', 'Agent id')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (id: string, options: { json?: boolean }) => {
      const config = loadProjectConfig();
      const registry = new AgentRegistry(config.agents);
      const router = new ModelRouter(config.models.routes);

      const agent = registry.get(id);
      if (!agent) {
        console.error(`Agent not found: ${id}`);
        process.exit(1);
      }

      const route = router.resolve(agent.model_route);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              ...agent,
              resolved_route: route,
            },
            null,
            2
          )
        );
      } else {
        console.log(`Agent: ${agent.id}`);
        console.log(`  Name: ${agent.name || '(none)'}`);
        console.log(`  Description: ${agent.description || '(none)'}`);
        console.log(`  Capabilities: ${agent.capabilities.join(', ') || '(none)'}`);
        console.log(`  Tools: ${agent.tools.join(', ') || '(none)'}`);
        console.log(`  Model Route: ${agent.model_route}`);
        console.log(`  Provider: ${route.provider}`);
        console.log(`  Model: ${route.model}`);
        if (route.purpose) console.log(`  Purpose: ${route.purpose}`);
        if (route.max_tokens) console.log(`  Max Tokens: ${route.max_tokens}`);
      }
    });

  return agents;
}
```

- [ ] **Step 2: Register in CLI**

Modify `src/cli/index.ts`:

```typescript
import { createAgentsCommand } from './commands/agents.js';
// ...
program.addCommand(createAgentsCommand());
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/agents.ts src/cli/index.ts
git commit -m "feat(cli): add wolf agents list and wolf agents inspect commands"
```

### Task 4.2: Write CLI Integration Tests

**Files:**

- Create: `tests/integration/agent-cli.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

describe('Agents CLI integration', () => {
  it('should list agents', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-agents-'));
    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default_coding

models:
  routes:
    default_coding:
      provider: openai
      model: gpt-4
`;
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} agents list`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('reviewer');
    expect(output).toContain('Code Reviewer');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should inspect agent', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-agents-'));
    const config = `agents:
  - id: reviewer
    name: Code Reviewer
    capabilities:
      - code_review
    model_route: default_coding

models:
  routes:
    default_coding:
      provider: openai
      model: gpt-4
`;
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} agents inspect reviewer`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Agent: reviewer');
    expect(output).toContain('openai');
    expect(output).toContain('gpt-4');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail inspect for unknown agent', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-agents-'));
    writeFileSync(join(tempDir, 'wolf.yaml'), 'agents: []\nmodels:\n  routes: {}\n');
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    try {
      execSync(`node ${cliPath} agents inspect unknown`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(1);
    rmSync(tempDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm run build
npx vitest run tests/integration/agent-cli.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/agent-cli.test.ts
git commit -m "test(agent): add agents CLI integration tests"
```

---

## PR5: Docs, Examples, Acceptance

### Task 5.1: Update README

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update status table**

Change MVP4 from `⏭️ Next` to `🔄 In Progress` or `📋 Planned` depending on state.

- [ ] **Step 2: Add CLI reference**

Add to CLI Reference section:

```markdown
### `wolf agents list [--json]`

List all configured agents.

### `wolf agents inspect <id> [--json]`

Show agent details and resolved model route.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add wolf agents commands to README"
```

### Task 5.2: Update Development Docs

**Files:**

- Modify: `docs/development.md`

- [ ] **Step 1: Add Agent Registry section**

Add section covering:

- Configuring agents in wolf.yaml
- Configuring model routes
- Agent runner usage in workflows
- Policy rules for runner: agent

- [ ] **Step 2: Commit**

```bash
git add docs/development.md
git commit -m "docs: add Agent Registry section to development guide"
```

### Task 5.3: Final Acceptance

- [ ] **Step 1: Run full test suite**

```bash
npm run check
```

Expected: All tests pass, build succeeds.

- [ ] **Step 2: Run Docker tests**

```bash
docker build --target test -t mister-wolf:test .
docker run --rm mister-wolf:test
```

Expected: All tests pass.

- [ ] **Step 3: Commit acceptance**

```bash
git commit --allow-empty -m "acceptance: MVP4 Agent Registry + Model Router complete"
```

---

## Plan Self-Review

### Spec Coverage

| Spec Requirement               | Plan Task         |
| ------------------------------ | ----------------- |
| Config schema (agents, models) | PR1 Task 1.1, 1.2 |
| Cross-reference validation     | PR1 Task 1.2      |
| AgentRegistry                  | PR2 Task 2.1      |
| ModelRouter                    | PR2 Task 2.2      |
| AgentRunner                    | PR3 Task 3.1      |
| Context bundle validation      | PR3 Task 3.1      |
| CLI (list, inspect)            | PR4 Task 4.1      |
| Tests (unit + integration)     | All PRs           |
| README + docs                  | PR5 Task 5.1, 5.2 |
| No real LLM calls              | N/A (stub only)   |

### Placeholder Scan

- No TBD/TODO
- No vague requirements
- All steps have code
- All steps have commands

### Type Consistency

- `AgentDefinition` — consistent across all tasks
- `ModelRoute` — consistent across all tasks
- `AgentInvocationPlan` — uses `task` field (not `input`)
- Error types: `AgentNotFound`, `ModelRouteNotFound`, `AgentInputValidationError`, `ContextBundleValidationError` — all defined

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/YYYY-MM-DD-mvp4-implementation.md`.**

**1. Subagent-Driven (recommended)** — Fresh subagent per PR/task, review between tasks

**2. Inline Execution** — Execute tasks in this session

**Which approach?**
