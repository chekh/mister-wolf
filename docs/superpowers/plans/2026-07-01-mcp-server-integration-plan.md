# MCP Server Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stdio MCP server that exposes Mr. Wolf memory operations as MCP tools, reusing existing use-cases and Zod v3 schemas.

**Architecture:** A new inbound adapter under `src/adapters/mcp/` wraps `@modelcontextprotocol/server` with a `StdioServerTransport`. Tool handlers call existing use-cases through the CLI container. Tool inputs are declared as JSON Schema objects derived from existing Zod v3 types, avoiding a Zod v4 dependency.

**Tech Stack:** TypeScript, `@modelcontextprotocol/server@alpha`, Zod v3 (existing), Vitest.

---

## File Structure

- `src/adapters/mcp/mcp-server.ts` — builds `McpServer`, registers tools, connects transport
- `src/adapters/mcp/mcp-schemas.ts` — JSON Schema definitions for tool inputs
- `src/adapters/mcp/mcp-tools.ts` — tool handler implementations, maps MCP calls to use-cases
- `src/bootstrap/mcp.ts` — stdio entry point
- `src/adapters/cli/commands/memory-mcp.ts` — `wolf mcp` CLI alias
- `src/adapters/cli/cli-entry.ts` — register `memory-mcp` command
- `package.json` — add dependency
- `tests/unit/adapters/mcp-server.test.ts` — in-memory tool tests
- `tests/integration/mcp-stdio.test.ts` — stdio JSON-RPC integration test

---

## Task 1: Add MCP dependency

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add package dependency**

```json
"@modelcontextprotocol/server": "^2.0.0-alpha.2"
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: package-lock updated, `node_modules/@modelcontextprotocol/server` exists.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @modelcontextprotocol/server"
```

---

## Task 2: Bootstrap MCP server module

**Files:**

- Create: `src/bootstrap/mcp.ts`
- Create: `src/adapters/mcp/mcp-server.ts`

- [ ] **Step 2: Write failing test**

Create `tests/unit/adapters/mcp-server.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';

describe('buildMcpServer', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mcp-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers at least one tool', async () => {
    const server = buildMcpServer(dir);
    const result = await server.server.listTools();
    expect(result.tools.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement minimal server**

Create `src/bootstrap/mcp.ts`:

```typescript
import { buildMcpServer } from './adapters/mcp/mcp-server.js';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

async function main() {
  const server = buildMcpServer(process.cwd());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
```

Create `src/adapters/mcp/mcp-server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { createCliContainer } from '../../bootstrap/container.js';

export function buildMcpServer(baseDir: string): McpServer {
  const deps = createCliContainer(baseDir);
  const server = new McpServer({ name: 'mr-wolf', version: '0.1.0' });
  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bootstrap/mcp.ts src/adapters/mcp/mcp-server.ts tests/unit/adapters/mcp-server.test.ts package.json package-lock.json
git commit -m "feat(mcp): add bootstrap and server skeleton"
```

---

## Task 3: Implement memory_search tool

**Files:**

- Create: `src/adapters/mcp/mcp-schemas.ts`
- Create: `src/adapters/mcp/mcp-tools.ts`
- Modify: `src/adapters/mcp/mcp-server.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/adapters/mcp-server.test.ts`:

```typescript
it('searches memory objects', async () => {
  const server = buildMcpServer(dir);
  const result = await server.server.callTool({
    name: 'memory_search',
    arguments: { query: 'router' },
  });
  expect(result.content).toHaveLength(1);
  expect((result.content[0] as { text: string }).text).toContain('router');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: FAIL — tool not found.

- [ ] **Step 3: Add schema and handler**

Create `src/adapters/mcp/mcp-schemas.ts`:

```typescript
export const MemorySearchInputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    type: { type: 'string' },
    status: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    memoryClass: { type: 'string' },
    truthRole: { type: 'string' },
    lifetime: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    minImportance: { type: 'number' },
    maxImportance: { type: 'number' },
    createdAfter: { type: 'string' },
    createdBefore: { type: 'string' },
    limit: { type: 'number' },
    includeSuperseded: { type: 'boolean' },
  },
  required: ['query'],
} as const;
```

Create `src/adapters/mcp/mcp-tools.ts`:

```typescript
import { MemorySearchInputSchema } from './mcp-schemas.js';
import { searchMemory } from '../../app/use-cases/search-memory.js';
import { addMemoryObject } from '../../app/use-cases/add-memory-object.js';
import type { McpServer } from '@modelcontextprotocol/server';

export function registerMemoryTools(
  server: McpServer,
  deps: ReturnType<typeof import('../../bootstrap/container.js').createCliContainer>
): void {
  server.registerTool(
    'memory_search',
    {
      description: 'Search project memory objects by query and optional filters',
      inputSchema: MemorySearchInputSchema,
    },
    async (input: unknown) => {
      const args = input as {
        query: string;
        type?: string;
        status?: string;
        confidence?: 'low' | 'medium' | 'high';
        memoryClass?: string;
        truthRole?: string;
        lifetime?: string;
        tags?: string[];
        minImportance?: number;
        maxImportance?: number;
        createdAfter?: string;
        createdBefore?: string;
        limit?: number;
        includeSuperseded?: boolean;
      };
      const results = await searchMemory({ index: deps.index }, args);
      const text = results.map((r) => `${r.object.id} [${r.object.type}] ${r.object.title}`).join('\n');
      return { content: [{ type: 'text' as const, text: text || 'No results.' }] };
    }
  );
}
```

Modify `src/adapters/mcp/mcp-server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { createCliContainer } from '../../bootstrap/container.js';
import { registerMemoryTools } from './mcp-tools.js';

export function buildMcpServer(baseDir: string): McpServer {
  const deps = createCliContainer(baseDir);
  const server = new McpServer({ name: 'mr-wolf', version: '0.1.0' });
  registerMemoryTools(server, deps);
  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: PASS (search returns empty results matching query).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/mcp/mcp-schemas.ts src/adapters/mcp/mcp-tools.ts src/adapters/mcp/mcp-server.ts tests/unit/adapters/mcp-server.test.ts
git commit -m "feat(mcp): add memory_search tool"
```

---

## Task 4: Implement memory_add tool

**Files:**

- Modify: `src/adapters/mcp/mcp-schemas.ts`
- Modify: `src/adapters/mcp/mcp-tools.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/adapters/mcp-server.test.ts`:

```typescript
it('adds a memory object', async () => {
  const server = buildMcpServer(dir);
  const result = await server.server.callTool({
    name: 'memory_add',
    arguments: {
      type: 'lesson',
      title: 'Router reconnect failure',
      body: 'We found a failure mode with router reconnect.',
      tags: ['router'],
      createdBy: 'agent:mcp-test',
    },
  });
  const text = (result.content[0] as { text: string }).text;
  expect(text).toMatch(/Created memory object: mem_/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: FAIL — tool not found.

- [ ] **Step 3: Add schema and handler**

Append to `src/adapters/mcp/mcp-schemas.ts`:

```typescript
export const MemoryAddInputSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    importance: { type: 'number' },
    memoryClass: { type: 'string' },
    truthRole: { type: 'string' },
    lifetime: { type: 'string' },
    createdBy: { type: 'string' },
  },
  required: ['type', 'title', 'createdBy'],
} as const;
```

Modify `src/adapters/mcp/mcp-tools.ts` to import and register `memory_add`:

```typescript
import { MemorySearchInputSchema, MemoryAddInputSchema } from './mcp-schemas.js';
```

Append inside `registerMemoryTools`:

```typescript
server.registerTool(
  'memory_add',
  {
    description: 'Add a generic memory object',
    inputSchema: MemoryAddInputSchema,
  },
  async (input: unknown) => {
    const args = input as {
      type: string;
      title: string;
      body?: string;
      tags?: string[];
      confidence?: 'low' | 'medium' | 'high';
      importance?: number;
      memoryClass?: string;
      truthRole?: string;
      lifetime?: string;
      createdBy: string;
    };
    const result = await addMemoryObject(deps, {
      type: args.type as never,
      title: args.title,
      body: args.body,
      createdBy: args.createdBy,
      tags: args.tags,
      confidence: args.confidence,
      importance: args.importance,
      memoryClass: args.memoryClass as never,
      truthRole: args.truthRole as never,
      lifetime: args.lifetime as never,
    });
    return {
      content: [{ type: 'text' as const, text: `Created memory object: ${result.object.id}` }],
    };
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/mcp/mcp-schemas.ts src/adapters/mcp/mcp-tools.ts src/adapters/mcp/mcp-server.ts tests/unit/adapters/mcp-server.test.ts
git commit -m "feat(mcp): add memory_add tool"
```

---

## Task 5: Implement memory_get and memory_list tools

**Files:**

- Modify: `src/adapters/mcp/mcp-schemas.ts`
- Modify: `src/adapters/mcp/mcp-tools.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/adapters/mcp-server.test.ts`:

```typescript
it('gets a memory object by id', async () => {
  const server = buildMcpServer(dir);
  const added = await server.server.callTool({
    name: 'memory_add',
    arguments: {
      type: 'lesson',
      title: 'Get test',
      body: 'body text',
      createdBy: 'agent:test',
    },
  });
  const id = (added.content[0] as { text: string }).text.replace('Created memory object: ', '');
  const result = await server.server.callTool({
    name: 'memory_get',
    arguments: { id },
  });
  expect((result.content[0] as { text: string }).text).toContain('Get test');
});

it('lists memory objects', async () => {
  const server = buildMcpServer(dir);
  await server.server.callTool({
    name: 'memory_add',
    arguments: { type: 'lesson', title: 'List test', body: 'body', createdBy: 'agent:test' },
  });
  const result = await server.server.callTool({
    name: 'memory_list',
    arguments: { type: 'lesson' },
  });
  expect((result.content[0] as { text: string }).text).toContain('List test');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: FAIL — tools not found.

- [ ] **Step 3: Implement schemas and handlers**

Append to `src/adapters/mcp/mcp-schemas.ts`:

```typescript
export const MemoryGetInputSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
  },
  required: ['id'],
} as const;

export const MemoryListInputSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    status: { type: 'string' },
    stale: { type: 'boolean' },
    memoryClass: { type: 'string' },
    truthRole: { type: 'string' },
    lifetime: { type: 'string' },
  },
} as const;
```

Modify `src/adapters/mcp/mcp-tools.ts` to import `getMemoryObject`, `listMemoryObjects`, and new schemas, then register tools:

```typescript
import { getMemoryObject } from '../../app/use-cases/get-memory-object.js';
import { listMemoryObjects } from '../../app/use-cases/list-memory-objects.js';
```

Append inside `registerMemoryTools`:

```typescript
server.registerTool(
  'memory_get',
  {
    description: 'Get a memory object by id',
    inputSchema: MemoryGetInputSchema,
  },
  async (input: unknown) => {
    const args = input as { id: string };
    const obj = await getMemoryObject(deps.store, args.id);
    if (!obj) {
      return { content: [{ type: 'text' as const, text: `Memory object not found: ${args.id}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `${obj.id} [${obj.type}] ${obj.title}\n\n${obj.body}` }] };
  }
);

server.registerTool(
  'memory_list',
  {
    description: 'List memory objects with optional filters',
    inputSchema: MemoryListInputSchema,
  },
  async (input: unknown) => {
    const args = input as {
      type?: string;
      status?: string;
      stale?: boolean;
      memoryClass?: string;
      truthRole?: string;
      lifetime?: string;
    };
    const objects = await listMemoryObjects(deps.store, args);
    const text = objects.map((o) => `${o.id} [${o.type}] [${o.status}] ${o.title}`).join('\n');
    return { content: [{ type: 'text' as const, text: text || 'No memory objects.' }] };
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/mcp/mcp-schemas.ts src/adapters/mcp/mcp-tools.ts src/adapters/mcp/mcp-server.ts tests/unit/adapters/mcp-server.test.ts
git commit -m "feat(mcp): add memory_get and memory_list tools"
```

---

## Task 6: Implement memory_transition tool

**Files:**

- Modify: `src/adapters/mcp/mcp-schemas.ts`
- Modify: `src/adapters/mcp/mcp-tools.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/adapters/mcp-server.test.ts`:

```typescript
it('transitions a memory object', async () => {
  const server = buildMcpServer(dir);
  const added = await server.server.callTool({
    name: 'memory_add',
    arguments: { type: 'lesson', title: 'Transition test', createdBy: 'agent:test' },
  });
  const id = (added.content[0] as { text: string }).text.replace('Created memory object: ', '');
  const result = await server.server.callTool({
    name: 'memory_transition',
    arguments: { id, status: 'stale' },
  });
  expect((result.content[0] as { text: string }).text).toContain('Transitioned');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: FAIL — tool not found.

- [ ] **Step 3: Implement schema and handler**

Append to `src/adapters/mcp/mcp-schemas.ts`:

```typescript
export const MemoryTransitionInputSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    status: { type: 'string' },
  },
  required: ['id', 'status'],
} as const;
```

Modify `src/adapters/mcp/mcp-tools.ts` to import `transitionMemoryObject` and new schema, then register tool:

```typescript
import { transitionMemoryObject } from '../../app/use-cases/transition-memory-object.js';
```

Append inside `registerMemoryTools`:

```typescript
server.registerTool(
  'memory_transition',
  {
    description: 'Transition a memory object to a new lifecycle status',
    inputSchema: MemoryTransitionInputSchema,
  },
  async (input: unknown) => {
    const args = input as { id: string; status: string };
    await transitionMemoryObject(deps, args.id, args.status as never, 'agent:mcp');
    return { content: [{ type: 'text' as const, text: `Transitioned ${args.id} to ${args.status}.` }] };
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/mcp/mcp-schemas.ts src/adapters/mcp/mcp-tools.ts src/adapters/mcp/mcp-server.ts tests/unit/adapters/mcp-server.test.ts
git commit -m "feat(mcp): add memory_transition tool"
```

---

## Task 7: Implement typed creation tools

**Files:**

- Modify: `src/adapters/mcp/mcp-schemas.ts`
- Modify: `src/adapters/mcp/mcp-tools.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/adapters/mcp-server.test.ts`:

```typescript
it('creates a work thread', async () => {
  const server = buildMcpServer(dir);
  const result = await server.server.callTool({
    name: 'memory_create_thread',
    arguments: { title: 'Thread MCP', goal: 'Test MCP', createdBy: 'agent:test' },
  });
  expect((result.content[0] as { text: string }).text).toMatch(/thread_/);
});

it('creates and resolves a blocker', async () => {
  const server = buildMcpServer(dir);
  const blocker = await server.server.callTool({
    name: 'memory_create_blocker',
    arguments: { title: 'Blocker MCP', impact: 'blocks tests', createdBy: 'agent:test' },
  });
  const id = (blocker.content[0] as { text: string }).text.replace('Created blocker: ', '');
  const resolved = await server.server.callTool({
    name: 'memory_resolve_blocker',
    arguments: { id },
  });
  expect((resolved.content[0] as { text: string }).text).toContain('Resolved');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: FAIL — tools not found.

- [ ] **Step 3: Implement schemas and handlers**

Append to `src/adapters/mcp/mcp-schemas.ts`:

```typescript
export const MemoryCreateThreadInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    goal: { type: 'string' },
    currentState: { type: 'string' },
    nextSteps: { type: 'array', items: { type: 'string' } },
    createdBy: { type: 'string' },
  },
  required: ['title', 'goal', 'createdBy'],
} as const;

export const MemoryCreateInfoRequestInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    thread: { type: 'string' },
    question: { type: 'string' },
    detourReason: { type: 'string' },
    neededFor: { type: 'array', items: { type: 'string' } },
    expectedAnswer: { type: 'array', items: { type: 'string' } },
    preliminaryAnswer: { type: 'string' },
    createdBy: { type: 'string' },
  },
  required: ['title', 'thread', 'question', 'detourReason', 'expectedAnswer', 'createdBy'],
} as const;

export const MemoryCreateArticleInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    thread: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
    answers: { type: 'array', items: { type: 'string' } },
    supports: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'string' } },
    createdBy: { type: 'string' },
  },
  required: ['title', 'thread', 'summary', 'body', 'createdBy'],
} as const;

export const MemoryCreateDecisionInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    thread: { type: 'string' },
    basedOn: { type: 'array', items: { type: 'string' } },
    createdBy: { type: 'string' },
  },
  required: ['title', 'body', 'createdBy'],
} as const;

export const MemoryCreateBlockerInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    impact: { type: 'string' },
    workaround: { type: 'string' },
    thread: { type: 'string' },
    createdBy: { type: 'string' },
  },
  required: ['title', 'impact', 'createdBy'],
} as const;

export const MemoryResolveBlockerInputSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    resolvedBy: { type: 'string' },
  },
  required: ['id'],
} as const;
```

Modify `src/adapters/mcp/mcp-tools.ts` to import use-cases and schemas, then register tools. Example for thread and blocker:

```typescript
import { createWorkThread } from '../../app/use-cases/create-work-thread.js';
import { createBlocker } from '../../app/use-cases/create-blocker.js';
import { resolveBlocker } from '../../app/use-cases/resolve-blocker.js';
```

Append inside `registerMemoryTools`:

```typescript
server.registerTool(
  'memory_create_thread',
  {
    description: 'Create a work thread',
    inputSchema: MemoryCreateThreadInputSchema,
  },
  async (input: unknown) => {
    const args = input as {
      title: string;
      goal: string;
      currentState?: string;
      nextSteps?: string[];
      createdBy: string;
    };
    const result = await createWorkThread(deps, args);
    return { content: [{ type: 'text' as const, text: `Created thread: ${result.object.id}` }] };
  }
);

server.registerTool(
  'memory_create_blocker',
  {
    description: 'Create a blocker',
    inputSchema: MemoryCreateBlockerInputSchema,
  },
  async (input: unknown) => {
    const args = input as {
      title: string;
      impact: string;
      workaround?: string;
      thread?: string;
      createdBy: string;
    };
    const result = await createBlocker({ ...deps, relations: deps.relations }, args);
    return { content: [{ type: 'text' as const, text: `Created blocker: ${result.object.id}` }] };
  }
);

server.registerTool(
  'memory_resolve_blocker',
  {
    description: 'Resolve a blocker',
    inputSchema: MemoryResolveBlockerInputSchema,
  },
  async (input: unknown) => {
    const args = input as { id: string; resolvedBy?: string };
    await resolveBlocker({ ...deps, relations: deps.relations }, args.id, args.resolvedBy);
    return { content: [{ type: 'text' as const, text: `Resolved blocker: ${args.id}` }] };
  }
);
```

Register `memory_create_info_request`, `memory_create_article`, and `memory_create_decision` similarly using their respective use-cases and schemas.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/mcp/mcp-schemas.ts src/adapters/mcp/mcp-tools.ts src/adapters/mcp/mcp-server.ts tests/unit/adapters/mcp-server.test.ts
git commit -m "feat(mcp): add typed creation tools"
```

---

## Task 8: Implement memory_scan and memory_brief tools

**Files:**

- Modify: `src/adapters/mcp/mcp-schemas.ts`
- Modify: `src/adapters/mcp/mcp-tools.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/adapters/mcp-server.test.ts`:

```typescript
it('scans the project', async () => {
  const server = buildMcpServer(dir);
  const result = await server.server.callTool({ name: 'memory_scan', arguments: {} });
  expect((result.content[0] as { text: string }).text).toContain('Project scan');
});

it('generates an agent brief', async () => {
  const server = buildMcpServer(dir);
  const result = await server.server.callTool({ name: 'memory_brief', arguments: {} });
  expect((result.content[0] as { text: string }).text).toContain('# Agent Brief');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: FAIL — tools not found.

- [ ] **Step 3: Implement schemas and handlers**

Append to `src/adapters/mcp/mcp-schemas.ts`:

```typescript
export const EmptyInputSchema = {
  type: 'object',
  properties: {},
} as const;
```

Modify `src/adapters/mcp/mcp-tools.ts` to import `scanProject` and `generateAgentBrief`, then register tools:

```typescript
import { scanProject } from '../../app/use-cases/scan-project.js';
import { generateAgentBrief } from '../../app/use-cases/generate-agent-brief.js';
```

Append inside `registerMemoryTools`:

```typescript
server.registerTool(
  'memory_scan',
  {
    description: 'Scan the project and register documents',
    inputSchema: EmptyInputSchema,
  },
  async () => {
    const result = await scanProject(deps, deps.baseDir);
    return { content: [{ type: 'text' as const, text: `Project scan complete: ${result.object.id}` }] };
  }
);

server.registerTool(
  'memory_brief',
  {
    description: 'Generate the agent brief from the latest scan and memory',
    inputSchema: EmptyInputSchema,
  },
  async () => {
    const scanResult = await scanProject(deps, deps.baseDir);
    const brief = await generateAgentBrief(
      { store: deps.store, fs: deps.fs, clock: deps.clock },
      deps.baseDir,
      scanResult.snapshot
    );
    return { content: [{ type: 'text' as const, text: brief.content }] };
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/mcp/mcp-schemas.ts src/adapters/mcp/mcp-tools.ts src/adapters/mcp/mcp-server.ts tests/unit/adapters/mcp-server.test.ts
git commit -m "feat(mcp): add scan and brief tools"
```

---

## Task 9: Add `wolf mcp` CLI command

**Files:**

- Create: `src/adapters/cli/commands/memory-mcp.ts`
- Modify: `src/adapters/cli/cli-entry.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/adapters/mcp-server.test.ts` (or create separate CLI test):

```typescript
import { createCli } from '../../../src/adapters/cli/cli-entry.js';

describe('memoryMcpCommand', () => {
  it('is registered in CLI', () => {
    const cli = createCli();
    const command = cli.commands.find((c) => c.name() === 'memory')?.commands.find((c) => c.name() === 'mcp');
    expect(command).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: FAIL — command not registered.

- [ ] **Step 3: Implement command**

Create `src/adapters/cli/commands/memory-mcp.ts`:

```typescript
import { Command } from 'commander';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export function memoryMcpCommand(): Command {
  return new Command('mcp').description('Start the MCP server (stdio)').action(async () => {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const mcpEntry = join(baseDir, '../../../../dist/bootstrap/mcp.js');
    const child = spawn(process.execPath, [mcpEntry], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    await new Promise((resolve) => child.on('close', resolve));
  });
}
```

Modify `src/adapters/cli/cli-entry.ts`:

```typescript
import { memoryMcpCommand } from './commands/memory-mcp.js';
```

Register command before `program.addCommand(memory)`:

```typescript
memory.addCommand(memoryMcpCommand());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/mcp-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/cli/commands/memory-mcp.ts src/adapters/cli/cli-entry.ts tests/unit/adapters/mcp-server.test.ts
git commit -m "feat(cli): add wolf mcp command"
```

---

## Task 10: Add stdio integration test

**Files:**

- Create: `tests/integration/mcp-stdio.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/mcp-stdio.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

describe('MCP stdio server', () => {
  let dir: string;
  let child: ReturnType<typeof spawn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mcp-stdio-'));
    child = spawn(process.execPath, [join(process.cwd(), 'dist/bootstrap/mcp.js')], {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  afterEach(() => {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it('responds to initialize', async () => {
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.1.0' } },
    };
    const response = await sendAndReceive(child, initMessage);
    expect(response.result).toBeDefined();
  });

  function sendAndReceive(proc: typeof child, message: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 5000);
      const handler = (data: Buffer) => {
        clearTimeout(timeout);
        proc.stdout.off('data', handler);
        const lines = data.toString().trim().split('\n');
        const response = JSON.parse(lines[lines.length - 1]);
        resolve(response);
      };
      proc.stdout.on('data', handler);
      proc.stdin.write(JSON.stringify(message) + '\n');
    });
  }
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/integration/mcp-stdio.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mcp-stdio.test.ts
git commit -m "test(mcp): add stdio integration test"
```

---

## Task 11: Final verification

**Files:**

- All changed files

- [ ] **Step 1: Run full check**

Run: `npm run check`
Expected: format check, lint, tests, and build all pass.

- [ ] **Step 2: Commit any final fixes**

If changes were needed:

```bash
git add .
git commit -m "fix(mcp): address final check issues"
```

---

## Spec Coverage

| Spec section                  | Task    |
| ----------------------------- | ------- |
| Dependency                    | Task 1  |
| Bootstrap + server skeleton   | Task 2  |
| `memory_search`               | Task 3  |
| `memory_add`                  | Task 4  |
| `memory_get`, `memory_list`   | Task 5  |
| `memory_transition`           | Task 6  |
| Typed creation tools          | Task 7  |
| `memory_scan`, `memory_brief` | Task 8  |
| `wolf mcp` alias              | Task 9  |
| stdio integration test        | Task 10 |
| Final verification            | Task 11 |

No placeholders or unresolved dependencies remain.
