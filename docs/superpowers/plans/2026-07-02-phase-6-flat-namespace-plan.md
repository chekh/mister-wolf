# Phase 6 + Flat Namespace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 6 governance (`rule` type, governance defaults/validation, lifecycle transitions) and migrate the CLI/MCP surface from `wolf memory ...` / `memory_*` to a flat namespace (`wolf add`, `wolf search`, `recap`, etc.).

**Architecture:** Keep ports-and-adapters. Add `rule` as a first-class memory type with explicit user-only creation. Apply governance defaults to all create use-cases (already partially done). Enforce `ALLOWED_TRANSITIONS` in `transitionMemoryObject`. Flatten CLI commands by registering them directly on the root `wolf` program and rename MCP tools. Files remain canonical; no schema-driven taxonomy yet.

**Tech Stack:** TypeScript 5, Node 20, Vitest, Commander, Zod, js-yaml, better-sqlite3.

---

## File Map

| File                                                    | Responsibility                                           |
| ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/domain/memory-types.ts`                            | Add `rule` to `MEMORY_TYPES`.                            |
| `src/domain/schemas/memory-object-schema.ts`            | Base schema (already has governance fields).             |
| `src/domain/schemas/rule-schema.ts`                     | New Zod schema for `rule` type.                          |
| `src/domain/governance.ts`                              | Defaults, validation, transitions (already mostly done). |
| `src/domain/policies/write-protocol.ts`                 | Already calls `validateGovernance`; may need adjustment. |
| `src/app/use-cases/add-memory-object.ts`                | Already applies governance defaults.                     |
| `src/app/use-cases/create-rule.ts`                      | New use-case; only users can create rules.               |
| `src/app/use-cases/create-decision.ts`                  | Already applies defaults; verify no change needed.       |
| `src/app/use-cases/create-blocker.ts`                   | Already applies defaults; verify no change needed.       |
| `src/app/use-cases/create-info-request.ts`              | Already applies defaults; verify no change needed.       |
| `src/app/use-cases/create-article.ts`                   | Already applies defaults; verify no change needed.       |
| `src/app/use-cases/create-work-thread.ts`               | Already applies defaults; verify no change needed.       |
| `src/app/use-cases/create-session-checkpoint.ts`        | Already applies defaults; verify no change needed.       |
| `src/app/use-cases/transition-memory-object.ts`         | Enforce transitions (already done).                      |
| `src/adapters/fs/project-paths.ts`                      | Add `rule` → `rules` mapping.                            |
| `src/adapters/fs/fs-project-initializer.ts`             | Add `rule` to default config and directory creation.     |
| `src/adapters/cli/commands/memory-rule.ts`              | New CLI command for `wolf rule add/list`.                |
| `src/adapters/cli/cli-entry.ts`                         | Flatten namespace: register commands directly on `wolf`. |
| `src/adapters/mcp/mcp-tools.ts`                         | Rename tools to flat names.                              |
| `src/adapters/mcp/mcp-schemas.ts`                       | Update tool names/input schemas if needed.               |
| `tests/unit/domain/rule-schema.test.ts`                 | Schema validation tests.                                 |
| `tests/unit/use-cases/create-rule.test.ts`              | User-only creation, governance defaults.                 |
| `tests/unit/use-cases/transition-memory-object.test.ts` | Add disallowed transition test.                          |
| `tests/integration/governance-workflow.test.ts`         | Existing; update if needed.                              |
| `tests/integration/mcp-stdio.test.ts`                   | Update expected tool names.                              |
| `MEMORY.md` / `docs/user-guide.md` / `README.md`        | Update command examples.                                 | <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md --> |

---

## Task 1: Add `rule` type to domain

**Files:**

- Modify: `src/domain/memory-types.ts:1-14`
- Create: `src/domain/schemas/rule-schema.ts`
- Test: `tests/unit/domain/rule-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/rule-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { RuleSchema } from '../../../src/domain/schemas/rule-schema.js';

describe('RuleSchema', () => {
  it('accepts a valid project rule', () => {
    const result = RuleSchema.safeParse({
      id: 'mem_test',
      type: 'rule',
      title: 'Always use strict mode',
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.9,
      created_at: '2026-07-02T10:00:00Z',
      updated_at: '2026-07-02T10:00:00Z',
      created_by: 'user:cli',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: ['typescript'],
      superseded_by: null,
      body: 'Enable TypeScript strict mode in all tsconfig files.',
      memory_class: 'canonical',
      truth_role: 'source_of_truth',
      lifetime: 'long_term',
      scope: 'project',
      applies_to: ['src/**/*.ts'],
      trigger: 'when creating tsconfig',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a rule without scope', () => {
    const result = RuleSchema.safeParse({
      id: 'mem_test',
      type: 'rule',
      title: 'Always use strict mode',
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.9,
      created_at: '2026-07-02T10:00:00Z',
      updated_at: '2026-07-02T10:00:00Z',
      created_by: 'user:cli',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      body: '',
      memory_class: 'canonical',
      truth_role: 'source_of_truth',
      lifetime: 'long_term',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- tests/unit/domain/rule-schema.test.ts
```

Expected: FAIL — `RuleSchema` not found.

- [ ] **Step 3: Add `rule` to MEMORY_TYPES**

Modify `src/domain/memory-types.ts`:

```typescript
export const MEMORY_TYPES = [
  'document',
  'decision',
  'lesson',
  'observation',
  'session-summary',
  'open-question',
  'context',
  'work-thread',
  'info-request',
  'article',
  'blocker',
  'session-checkpoint',
  'rule',
] as const;
```

- [ ] **Step 4: Create rule schema**

Create `src/domain/schemas/rule-schema.ts`:

```typescript
import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const RuleSchema = MemoryObjectSchema.extend({
  type: z.literal('rule'),
  status: z.enum(['active', 'superseded', 'obsolete']),
  scope: z.enum(['project', 'global']),
  applies_to: z.array(z.string()).default([]),
  trigger: z.string().default(''),
});

export type Rule = z.infer<typeof RuleSchema>;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:run -- tests/unit/domain/rule-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/memory-types.ts src/domain/schemas/rule-schema.ts tests/unit/domain/rule-schema.test.ts
git commit -m "feat(domain): add rule memory type"
```

---

## Task 2: Add `rule` storage paths and initializer support

**Files:**

- Modify: `src/adapters/fs/project-paths.ts:12-31`
- Modify: `src/adapters/fs/fs-project-initializer.ts:6-24`
- Test: existing `tests/unit/adapters/project-paths.test.ts`

- [ ] **Step 1: Add rule path mapping**

Modify `src/adapters/fs/project-paths.ts` mapping:

```typescript
const mapping: Record<MemoryType, string> = {
  decision: 'decisions',
  lesson: 'lessons',
  observation: 'observations',
  'session-summary': 'sessions',
  document: 'documents',
  'open-question': 'questions',
  context: 'context',
  'work-thread': 'threads',
  'info-request': 'info-requests',
  article: 'articles',
  blocker: 'blockers',
  'session-checkpoint': 'checkpoints',
  rule: 'rules',
};
```

- [ ] **Step 2: Add rule to default config and directory creation**

Modify `src/adapters/fs/fs-project-initializer.ts`:

```typescript
const DEFAULT_CONFIG = `# Mr. Wolf Project Memory Configuration
version: 1
memory:
  types:
    - document
    - decision
    - lesson
    - observation
    - session-summary
    - open-question
    - context
    - work-thread
    - info-request
    - article
    - blocker
    - session-checkpoint
    - rule
search:
  default_limit: 20
`;
```

`MEMORY_TYPES` loop already creates directories for all types.

- [ ] **Step 3: Run existing tests**

```bash
npm run test:run -- tests/unit/adapters/project-paths.test.ts tests/unit/use-cases/init-project-memory.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/adapters/fs/project-paths.ts src/adapters/fs/fs-project-initializer.ts
git commit -m "feat(fs): add rule storage paths and initializer config"
```

---

## Task 3: Create `createRule` use-case

**Files:**

- Create: `src/app/use-cases/create-rule.ts`
- Test: `tests/unit/use-cases/create-rule.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/use-cases/create-rule.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRule } from '../../../src/app/use-cases/create-rule.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createRule', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-rule-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a rule with canonical governance for a user', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const result = await createRule(
      { store, log, clock, idGen },
      {
        title: 'Use TypeScript strict mode',
        body: 'Always enable strict mode in tsconfig.',
        scope: 'project',
        appliesTo: ['src/**/*.ts'],
        trigger: 'when creating tsconfig',
        createdBy: 'user:cli',
      }
    );

    expect(result.object.type).toBe('rule');
    expect(result.object.scope).toBe('project');
    expect(result.object.memory_class).toBe('canonical');
    expect(result.object.truth_role).toBe('source_of_truth');
  });

  it('rejects rule creation by agents', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    await expect(
      createRule(
        { store, log, clock, idGen },
        {
          title: 'Use strict mode',
          body: '...',
          scope: 'project',
          createdBy: 'agent:opencode',
        }
      )
    ).rejects.toThrow('Rules can only be created by explicit user request');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- tests/unit/use-cases/create-rule.test.ts
```

Expected: FAIL — `createRule` not found.

- [ ] **Step 3: Implement createRule**

Create `src/app/use-cases/create-rule.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { Rule, RuleSchema } from '../../domain/schemas/rule-schema.js';

export interface CreateRuleInput {
  title: string;
  body: string;
  scope: 'project' | 'global';
  appliesTo?: string[];
  trigger?: string;
  createdBy: string;
}

export interface CreateRuleResult {
  object: Rule;
}

export async function createRule(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex },
  input: CreateRuleInput
): Promise<CreateRuleResult> {
  if (input.createdBy.startsWith('agent:')) {
    throw new Error('Rules can only be created by explicit user request');
  }

  const now = deps.clock.now();
  const object: Rule = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'rule',
    title: input.title,
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.9,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: input.body,
    memory_class: 'canonical',
    truth_role: 'source_of_truth',
    lifetime: 'long_term',
    scope: input.scope,
    applies_to: input.appliesTo ?? [],
    trigger: input.trigger ?? '',
  };

  RuleSchema.parse(object);

  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor: input.createdBy,
    payload: { memory_id: object.id, type: object.type },
  });
  if (deps.index) {
    await deps.index.indexObject(object);
  }

  return { object };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- tests/unit/use-cases/create-rule.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/use-cases/create-rule.ts tests/unit/use-cases/create-rule.test.ts
git commit -m "feat(use-cases): add create-rule with user-only guard"
```

---

## Task 4: Verify governance defaults in all create use-cases

**Files:**

- Modify: `src/app/use-cases/create-decision.ts`, `create-blocker.ts`, `create-info-request.ts`, `create-article.ts`, `create-session-checkpoint.ts`
- Test: existing governance tests

- [ ] **Step 1: Check each use-case applies `governanceDefaults`**

All listed use-cases already call `governanceDefaults(input.createdBy)`. Verify the merge is present in every file. If any is missing, add it.

- [ ] **Step 2: Run governance workflow test**

```bash
npm run test:run -- tests/integration/governance-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit if any changes**

If no changes, skip. If changes:

```bash
git add src/app/use-cases/create-*.ts
git commit -m "fix(use-cases): ensure governance defaults in all create flows"
```

---

## Task 5: Enforce lifecycle transitions

**Files:**

- Modify: `src/app/use-cases/transition-memory-object.ts:17-19`
- Test: `tests/unit/use-cases/transition-memory-object.test.ts`

- [ ] **Step 1: Check transition enforcement**

`transition-memory-object.ts` already calls `canTransition`. Verify it throws a clear error. Current implementation is fine.

- [ ] **Step 2: Add explicit disallowed transition test**

Modify `tests/unit/use-cases/transition-memory-object.test.ts` after the existing invalid transition test:

```typescript
it('rejects active to accepted transition', async () => {
  const store = new MarkdownMemoryStore(dir);
  const log = new JsonlEventLog(eventsPath(dir));
  const clock = new SystemClock();
  const idGen = new HashIdGenerator();

  const added = await addMemoryObject(
    { store, log, clock, idGen },
    { type: 'lesson', title: 'Transition test', body: '...', createdBy: 'user:test' }
  );

  await expect(transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'accepted')).rejects.toThrow(
    'Invalid transition from active to accepted'
  );
});
```

- [ ] **Step 3: Run transition tests**

```bash
npm run test:run -- tests/unit/use-cases/transition-memory-object.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/use-cases/transition-memory-object.test.ts
git commit -m "test(transition): add disallowed transition coverage"
```

---

## Task 6: Add CLI command for rules

**Files:**

- Create: `src/adapters/cli/commands/memory-rule.ts`

- [ ] **Step 1: Implement CLI command**

Create `src/adapters/cli/commands/memory-rule.ts`:

```typescript
import { Command } from 'commander';
import { createRule } from '../../../app/use-cases/create-rule.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryRuleCommand(): Command {
  const rule = new Command('rule').description('Manage rules');

  rule
    .command('add')
    .description('Add a rule (user only)')
    .requiredOption('--title <title>', 'Rule title')
    .requiredOption('--body <body>', 'Rule body')
    .requiredOption('--scope <scope>', 'Rule scope (project|global)')
    .option('--applies-to <items>', 'Comma-separated paths/patterns')
    .option('--trigger <trigger>', 'When to apply the rule')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen, index } = createCliContainer(process.cwd());
      const result = await createRule(
        { store, log, clock, idGen, index },
        {
          title: options.title,
          body: options.body,
          scope: options.scope,
          appliesTo: options.appliesTo ? options.appliesTo.split(',').map((t: string) => t.trim()) : [],
          trigger: options.trigger,
          createdBy: options.createdBy,
        }
      );
      console.log(`Created rule: ${result.object.id}`);
    });

  rule
    .command('list')
    .description('List rules')
    .action(async () => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'rule' });
      for (const obj of objects) {
        console.log(`${obj.id} [${obj.status}] [${(obj as { scope?: string }).scope ?? ''}] ${obj.title}`);
      }
    });

  return rule;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/cli/commands/memory-rule.ts
git commit -m "feat(cli): add rule add/list commands"
```

---

## Task 7: Flatten CLI namespace

**Files:**

- Modify: `src/adapters/cli/cli-entry.ts`
- Modify: all `src/adapters/cli/commands/memory-*.ts` files (rename not required, but command names change)
- Test: `tests/integration/thread-info-article-workflow.test.ts`, `tests/integration/memory-workflow.test.ts`, `tests/integration/mcp-stdio.test.ts` (CLI integration tests)

- [ ] **Step 1: Update CLI entry to flat namespace**

Modify `src/adapters/cli/cli-entry.ts`:

```typescript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import { memoryInitCommand as initCommand } from './commands/memory-init.js';
import { memoryAddCommand as addCommand } from './commands/memory-add.js';
import { memoryListCommand as listCommand } from './commands/memory-list.js';
import { memoryGetCommand as getCommand } from './commands/memory-get.js';
import { memorySearchCommand as searchCommand } from './commands/memory-search.js';
import { memoryRebuildIndexCommand as rebuildIndexCommand } from './commands/memory-rebuild-index.js';
import { memorySupersedeCommand as supersedeCommand } from './commands/memory-supersede.js';
import { memoryTransitionCommand as transitionCommand } from './commands/memory-transition.js';
import { memoryScanCommand as scanCommand } from './commands/memory-scan.js';
import { memoryBriefCommand as briefCommand } from './commands/memory-brief.js';
import { memoryThreadCommand as threadCommand } from './commands/memory-thread.js';
import { memoryInfoRequestCommand as infoRequestCommand } from './commands/memory-info-request.js';
import { memoryArticleCommand as articleCommand } from './commands/memory-article.js';
import { memoryDecisionCommand as decisionCommand } from './commands/memory-decision.js';
import { memoryBlockerCommand as blockerCommand } from './commands/memory-blocker.js';
import {
  memorySessionCommand as sessionCommand,
  memoryThreadDiffCommand as threadDiffCommand,
} from './commands/memory-session.js';
import { memoryMcpCommand as mcpCommand } from './commands/memory-mcp.js';
import { memoryRuleCommand as ruleCommand } from './commands/memory-rule.js';

function readPackageVersion(): string {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(baseDir, '../../../package.json'), 'utf-8')) as { version: string };
  return pkg.version;
}

export function createCli(): Command {
  const program = new Command('wolf');
  program.version(readPackageVersion());

  program.addCommand(initCommand());
  program.addCommand(addCommand());
  program.addCommand(listCommand());
  program.addCommand(getCommand());
  program.addCommand(searchCommand());
  program.addCommand(rebuildIndexCommand());
  program.addCommand(supersedeCommand());
  program.addCommand(transitionCommand());
  program.addCommand(scanCommand());
  program.addCommand(briefCommand());
  program.addCommand(threadCommand());
  program.addCommand(threadDiffCommand());
  program.addCommand(decisionCommand());
  program.addCommand(blockerCommand());
  program.addCommand(infoRequestCommand());
  program.addCommand(articleCommand());
  program.addCommand(sessionCommand());
  program.addCommand(mcpCommand());
  program.addCommand(ruleCommand());

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createCli().parse();
}
```

- [ ] **Step 2: Update command names inside command files where needed**

Each command file already returns a `Command` with its own name (e.g., `new Command('add')`). No change needed for most. The `thread diff` command is a separate function returning `new Command('diff')`; ensure it still works under `wolf thread diff`. The parent `threadCommand` is `new Command('thread')` with subcommands. Flattening keeps subcommands intact.

- [ ] **Step 3: Update integration tests**

In `tests/integration/thread-info-article-workflow.test.ts` replace `memory ` with empty string in all `runCli` calls:

- `memory init` → `init`
- `memory thread create` → `thread create`
- `memory info-request create` → `info-request create`
- `memory article add` → `article add`
- `memory thread brief` → `thread brief`

In `tests/integration/memory-workflow.test.ts` and `tests/integration/mcp-stdio.test.ts` (if CLI commands are tested), update similarly.

- [ ] **Step 4: Run integration tests**

```bash
npm run build
npm run test:run -- tests/integration/thread-info-article-workflow.test.ts tests/integration/memory-workflow.test.ts tests/integration/mcp-stdio.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/cli/cli-entry.ts tests/integration/*.test.ts
git commit -m "refactor(cli): flatten namespace from wolf memory to wolf"
```

---

## Task 8: Rename MCP tools to flat namespace

**Files:**

- Modify: `src/adapters/mcp/mcp-tools.ts`
- Modify: `src/adapters/mcp/mcp-schemas.ts` (no names in schemas, but tool registration names change)
- Test: `tests/unit/adapters/mcp-server.test.ts`, `tests/integration/mcp-stdio.test.ts`

- [ ] **Step 1: Rename tools in mcp-tools.ts**

Replace all tool names in `server.registerTool(...)` calls in `src/adapters/mcp/mcp-tools.ts`:

- `memory_search` → `search`
- `memory_get` → `get`
- `memory_list` → `list`
- `memory_add` → `add`
- `memory_transition` → `transition`
- `memory_create_thread` → `create_thread`
- `memory_create_info_request` → `create_info_request`
- `memory_create_article` → `create_article`
- `memory_create_decision` → `create_decision`
- `memory_create_blocker` → `create_blocker`
- `memory_resolve_blocker` → `resolve_blocker`
- `memory_scan` → `scan`
- `memory_brief` → `brief`

Also add `create_rule` tool (copy pattern from `memory_create_decision`):

```typescript
server.registerTool(
  'create_rule',
  {
    description: 'Create a rule (user request only)',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        scope: { type: 'string', enum: ['project', 'global'] },
        appliesTo: { type: 'array', items: { type: 'string' } },
        trigger: { type: 'string' },
        createdBy: { type: 'string' },
      },
      required: ['title', 'body', 'scope', 'createdBy'],
    }),
  },
  async (input: unknown) => {
    const args = input as {
      title: string;
      body: string;
      scope: 'project' | 'global';
      appliesTo?: string[];
      trigger?: string;
      createdBy: string;
    };
    const result = await createRule(deps, args);
    return { content: [{ type: 'text' as const, text: `Created rule: ${result.object.id}` }] };
  }
);
```

Import `createRule` at the top.

- [ ] **Step 2: Update MCP tests**

In `tests/unit/adapters/mcp-server.test.ts` and `tests/integration/mcp-stdio.test.ts` replace tool names from `memory_*` to flat names.

- [ ] **Step 3: Run MCP tests**

```bash
npm run test:run -- tests/unit/adapters/mcp-server.test.ts tests/integration/mcp-stdio.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/adapters/mcp/mcp-tools.ts tests/unit/adapters/mcp-server.test.ts tests/integration/mcp-stdio.test.ts
git commit -m "refactor(mcp): flatten tool namespace and add create_rule"
```

---

## Task 9: Update documentation

**Files:**

- Modify: `README.md`
- Modify: `MEMORY.md` <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->
- Modify: `docs/user-guide.md`

- [ ] **Step 1: Replace `wolf memory ` with `wolf ` in command examples**

Use a careful replace (verify each file):

```bash
# Do not run blindly; review first
rg 'wolf memory ' README.md MEMORY.md docs/user-guide.md <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->
```

Then edit examples. Keep prose references readable.

- [ ] **Step 2: Add rule examples**

Add to `README.md` commands section:

```markdown
### Rules

- `wolf rule add --title "..." --body "..." --scope project|global` — add a rule.
- `wolf rule list` — list rules.
```

Add to `MEMORY.md` section on rules: <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->

````markdown
### Rules

Rules are behavioral guardrails. They require explicit user request:

```bash
wolf rule add --title "Never run migrations without rollback plan" \
  --body "Always have a rollback plan reviewed by the team." \
  --scope project \
  --applies-to "src/migrations/*" \
  --trigger "when creating migrations"
```
````

Agents cannot create rules proactively.

````

- [ ] **Step 3: Commit**

```bash
git add README.md MEMORY.md docs/user-guide.md <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->
git commit -m "docs: update commands for flat namespace and rule type"
````

---

## Task 10: Final verification

- [ ] **Step 1: Run full check**

```bash
npm run check
```

Expected: PASS (format check, lint, tests, build).

- [ ] **Step 2: Manual CLI smoke test**

```bash
npm run build
node dist/bootstrap/cli.js init
node dist/bootstrap/cli.js rule add --title "Use strict mode" --body "Enable TS strict mode." --scope project
node dist/bootstrap/cli.js rule list
node dist/bootstrap/cli.js add --type lesson --title "Smoke test" --body "Testing flat namespace." --tags smoke
node dist/bootstrap/cli.js search "smoke"
```

Expected: All commands succeed.

- [ ] **Step 3: Commit if any fixes**

If fixes were needed:

```bash
git add .
git commit -m "fix: address check failures"
```

---

## Self-Review Checklist

- [ ] Spec coverage: `rule` type, user-only creation, governance defaults, lifecycle transitions, flat CLI, flat MCP.
- [ ] Placeholder scan: no TBD, no "add appropriate error handling", no "write tests for the above".
- [ ] Type consistency: `RuleSchema`, `CreateRuleInput`, `createRule` use same field names (`applies_to` in schema, `appliesTo` in input).
- [ ] Test coverage: rule schema, create-rule user guard, transition disallowed.
- [ ] Documentation updated for flat namespace and rules.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-02-phase-6-flat-namespace-plan.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach do you prefer?
