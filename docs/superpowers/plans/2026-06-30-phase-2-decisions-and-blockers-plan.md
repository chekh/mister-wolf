# Phase 2 — Decisions and Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `decision` and `blocker` memory types with schemas, use-cases, CLI commands, brief integration, tests, and updated user guide.

**Architecture:** Follow the existing Phase 1 pattern: each type gets a Zod schema, a creation use-case, a CLI command module, and explicit integration into agent/thread briefs. Reuse `supersedeMemoryObject` for lifecycle transitions and add a dedicated `resolveBlocker` use-case.

**Tech Stack:** TypeScript, Zod, Vitest, Commander, better-sqlite3, js-yaml, fast-glob.

---

## File Map

| File                                           | Responsibility                               |
| ---------------------------------------------- | -------------------------------------------- |
| `src/domain/schemas/decision-schema.ts`        | Zod schema and type for `decision`           |
| `src/domain/schemas/blocker-schema.ts`         | Zod schema and type for `blocker`            |
| `src/app/use-cases/create-decision.ts`         | Create a decision, emit `memory.added` event |
| `src/app/use-cases/create-blocker.ts`          | Create a blocker, emit `memory.added` event  |
| `src/app/use-cases/resolve-blocker.ts`         | Transition blocker status to `resolved`      |
| `src/adapters/cli/commands/memory-decision.ts` | `wolf memory decision add/list` CLI          |
| `src/adapters/cli/commands/memory-blocker.ts`  | `wolf memory blocker add/list/resolve` CLI   |
| `src/domain/memory-types.ts`                   | Add `blocker` to `MEMORY_TYPES`              |
| `src/adapters/fs/fs-project-initializer.ts`    | Add `blocker` to default config type list    |
| `src/adapters/cli/cli-entry.ts`                | Register decision and blocker CLI commands   |
| `src/app/use-cases/generate-agent-brief.ts`    | Include active decisions and blockers        |
| `src/app/use-cases/get-thread-brief.ts`        | Include thread-linked decisions and blockers |
| `docs/guide/user-guide.md`                     | Document new commands and statuses           |
| `tests/unit/use-cases/create-decision.test.ts` | Tests for `createDecision`                   |
| `tests/unit/use-cases/create-blocker.test.ts`  | Tests for `createBlocker`                    |
| `tests/unit/use-cases/resolve-blocker.test.ts` | Tests for `resolveBlocker`                   |

---

## Task 1: Add `decision` schema

**Files:**

- Create: `src/domain/schemas/decision-schema.ts`

- [ ] **Step 1: Create schema file**

```typescript
import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const DecisionSchema = MemoryObjectSchema.extend({
  type: z.literal('decision'),
  status: z.enum(['active', 'superseded', 'rejected', 'obsolete']),
  thread: z.string().optional(),
  body: z.string().default(''),
});

export type Decision = z.infer<typeof DecisionSchema>;
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/domain/schemas/decision-schema.ts
git commit -m "feat(domain): add decision schema"
```

---

## Task 2: Add `blocker` schema

**Files:**

- Create: `src/domain/schemas/blocker-schema.ts`

- [ ] **Step 1: Create schema file**

```typescript
import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const BlockerSchema = MemoryObjectSchema.extend({
  type: z.literal('blocker'),
  status: z.enum(['active', 'resolved', 'obsolete']),
  thread: z.string().optional(),
  impact: z.string().min(1),
  workaround: z.string().optional(),
  body: z.string().default(''),
});

export type Blocker = z.infer<typeof BlockerSchema>;
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/domain/schemas/blocker-schema.ts
git commit -m "feat(domain): add blocker schema"
```

---

## Task 3: Register `blocker` type in system constants

**Files:**

- Modify: `src/domain/memory-types.ts`
- Modify: `src/adapters/fs/fs-project-initializer.ts`

- [ ] **Step 1: Add `blocker` to MEMORY_TYPES**

In `src/domain/memory-types.ts`, change:

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
] as const;
```

- [ ] **Step 2: Add `blocker` to default config**

In `src/adapters/fs/fs-project-initializer.ts`, add `- blocker` after `- article` in `DEFAULT_CONFIG`.

```yaml
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
```

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck
npm run test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/domain/memory-types.ts src/adapters/fs/fs-project-initializer.ts
git commit -m "chore: register blocker type in memory types and default config"
```

---

## Task 4: Implement `createDecision` use-case

**Files:**

- Create: `src/app/use-cases/create-decision.ts`
- Test: `tests/unit/use-cases/create-decision.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/use-cases/create-decision.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDecision } from '../../../src/app/use-cases/create-decision.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createDecision', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-decision-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves an active decision with body and optional thread', async () => {
    const result = await createDecision(
      { store, log, clock, idGen },
      {
        title: 'Use SQLite for search',
        body: 'SQLite is already a dependency.',
        thread: 'thread-abc',
        createdBy: 'user:chekh',
      }
    );

    expect(result.object.type).toBe('decision');
    expect(result.object.title).toBe('Use SQLite for search');
    expect(result.object.body).toBe('SQLite is already a dependency.');
    expect(result.object.thread).toBe('thread-abc');
    expect(result.object.status).toBe('active');
    expect(result.object.review_state).toBe('accepted');

    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('decision');

    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
  });

  it('sets review_state to proposed when created by an agent', async () => {
    const result = await createDecision(
      { store, log, clock, idGen },
      {
        title: 'Agent decision',
        body: 'Body',
        createdBy: 'agent:zorg',
      }
    );

    expect(result.object.review_state).toBe('proposed');
    expect(result.object.thread).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test tests/unit/use-cases/create-decision.test.ts
```

Expected: FAIL — `createDecision` not found

- [ ] **Step 3: Implement use-case**

Create `src/app/use-cases/create-decision.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { Decision, DecisionSchema } from '../../domain/schemas/decision-schema.js';

export interface CreateDecisionInput {
  title: string;
  body: string;
  thread?: string;
  createdBy: string;
}

export interface CreateDecisionResult {
  object: Decision;
}

export async function createDecision(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: CreateDecisionInput
): Promise<CreateDecisionResult> {
  const now = deps.clock.now();
  const object: Decision = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'decision',
    title: input.title,
    status: 'active',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.7,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: input.body,
    thread: input.thread,
  };

  DecisionSchema.parse(object);

  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor: input.createdBy,
    payload: { memory_id: object.id, type: object.type },
  });

  return { object };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test tests/unit/use-cases/create-decision.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/use-cases/create-decision.ts tests/unit/use-cases/create-decision.test.ts
git commit -m "feat(use-cases): implement create-decision"
```

---

## Task 5: Implement `createBlocker` use-case

**Files:**

- Create: `src/app/use-cases/create-blocker.ts`
- Test: `tests/unit/use-cases/create-blocker.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/use-cases/create-blocker.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createBlocker } from '../../../src/app/use-cases/create-blocker.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createBlocker', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-blocker-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves an active blocker with impact and workaround', async () => {
    const result = await createBlocker(
      { store, log, clock, idGen },
      {
        title: 'CI test failures',
        impact: 'Every CI run fails on better-sqlite3 compilation.',
        workaround: 'Run tests only on macOS runners temporarily.',
        thread: 'thread-abc',
        createdBy: 'user:chekh',
      }
    );

    expect(result.object.type).toBe('blocker');
    expect(result.object.title).toBe('CI test failures');
    expect(result.object.impact).toBe('Every CI run fails on better-sqlite3 compilation.');
    expect(result.object.workaround).toBe('Run tests only on macOS runners temporarily.');
    expect(result.object.thread).toBe('thread-abc');
    expect(result.object.status).toBe('active');
    expect(result.object.review_state).toBe('accepted');

    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('blocker');

    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
  });

  it('sets review_state to proposed when created by an agent', async () => {
    const result = await createBlocker(
      { store, log, clock, idGen },
      {
        title: 'Agent blocker',
        impact: 'Blocks deployment.',
        createdBy: 'agent:zorg',
      }
    );

    expect(result.object.review_state).toBe('proposed');
    expect(result.object.thread).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test tests/unit/use-cases/create-blocker.test.ts
```

Expected: FAIL — `createBlocker` not found

- [ ] **Step 3: Implement use-case**

Create `src/app/use-cases/create-blocker.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { Blocker, BlockerSchema } from '../../domain/schemas/blocker-schema.js';

export interface CreateBlockerInput {
  title: string;
  impact: string;
  workaround?: string;
  thread?: string;
  createdBy: string;
}

export interface CreateBlockerResult {
  object: Blocker;
}

export async function createBlocker(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: CreateBlockerInput
): Promise<CreateBlockerResult> {
  const now = deps.clock.now();
  const object: Blocker = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'blocker',
    title: input.title,
    status: 'active',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.8,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    impact: input.impact,
    workaround: input.workaround,
    body: '',
    thread: input.thread,
  };

  BlockerSchema.parse(object);

  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor: input.createdBy,
    payload: { memory_id: object.id, type: object.type },
  });

  return { object };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test tests/unit/use-cases/create-blocker.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/use-cases/create-blocker.ts tests/unit/use-cases/create-blocker.test.ts
git commit -m "feat(use-cases): implement create-blocker"
```

---

## Task 6: Implement `resolveBlocker` use-case

**Files:**

- Create: `src/app/use-cases/resolve-blocker.ts`
- Test: `tests/unit/use-cases/resolve-blocker.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/use-cases/resolve-blocker.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createBlocker } from '../../../src/app/use-cases/create-blocker.js';
import { resolveBlocker } from '../../../src/app/use-cases/resolve-blocker.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('resolveBlocker', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-resolve-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('transitions blocker status to resolved and emits event', async () => {
    const { object: blocker } = await createBlocker(
      { store, log, clock, idGen },
      {
        title: 'CI test failures',
        impact: 'CI fails.',
        createdBy: 'user:chekh',
      }
    );

    await resolveBlocker({ store, log, clock, idGen }, blocker.id);

    const loaded = await store.get(blocker.id);
    expect(loaded?.status).toBe('resolved');

    const events = await log.readAll();
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('memory.resolved');
    expect(events[1].payload).toMatchObject({ memory_id: blocker.id });
  });

  it('throws if blocker is not found', async () => {
    await expect(resolveBlocker({ store, log, clock, idGen }, 'missing-id')).rejects.toThrow(
      'Memory object not found: missing-id'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test tests/unit/use-cases/resolve-blocker.test.ts
```

Expected: FAIL — `resolveBlocker` not found

- [ ] **Step 3: Implement use-case**

Create `src/app/use-cases/resolve-blocker.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';

export async function resolveBlocker(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  id: string
): Promise<void> {
  const now = deps.clock.now();
  const existing = await deps.store.get(id);
  if (!existing) throw new Error(`Memory object not found: ${id}`);

  await deps.store.update(id, { status: 'resolved' });
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.resolved',
    timestamp: now.toISOString(),
    actor: 'system:wolf',
    payload: { memory_id: id },
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test tests/unit/use-cases/resolve-blocker.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/use-cases/resolve-blocker.ts tests/unit/use-cases/resolve-blocker.test.ts
git commit -m "feat(use-cases): implement resolve-blocker"
```

---

## Task 7: Add `memory decision` CLI command

**Files:**

- Create: `src/adapters/cli/commands/memory-decision.ts`
- Modify: `src/adapters/cli/cli-entry.ts`

- [ ] **Step 1: Create command module**

Create `src/adapters/cli/commands/memory-decision.ts`:

```typescript
import { Command } from 'commander';
import { createDecision } from '../../../app/use-cases/create-decision.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { Decision } from '../../../domain/schemas/decision-schema.js';

export function memoryDecisionCommand(): Command {
  const decision = new Command('decision').description('Manage decisions');

  decision
    .command('add')
    .description('Add a decision')
    .requiredOption('--title <title>', 'Decision title')
    .requiredOption('--body <body>', 'Decision rationale')
    .option('--thread <thread-id>', 'Parent thread id')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await createDecision(
        { store, log, clock, idGen },
        {
          title: options.title,
          body: options.body,
          thread: options.thread,
          createdBy: options.createdBy,
        }
      );
      console.log(`Created decision: ${result.object.id}`);
    });

  decision
    .command('list')
    .description('List decisions')
    .option('--thread <thread-id>', 'Filter by thread')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'decision' });
      for (const obj of objects) {
        if (options.thread && (obj as Decision).thread !== options.thread) continue;
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  return decision;
}
```

- [ ] **Step 2: Register command in CLI**

In `src/adapters/cli/cli-entry.ts`, add:

```typescript
import { memoryDecisionCommand } from './commands/memory-decision.js';
```

and register it:

```typescript
memory.addCommand(memoryDecisionCommand());
```

- [ ] **Step 3: Build and smoke test**

```bash
npm run build
node dist/bootstrap/cli.js memory decision add --title "Test decision" --body "Test body"
node dist/bootstrap/cli.js memory decision list
```

Expected: decision is created and listed.

- [ ] **Step 4: Commit**

```bash
git add src/adapters/cli/commands/memory-decision.ts src/adapters/cli/cli-entry.ts
git commit -m "feat(cli): add memory decision command"
```

---

## Task 8: Add `memory blocker` CLI command

**Files:**

- Create: `src/adapters/cli/commands/memory-blocker.ts`
- Modify: `src/adapters/cli/cli-entry.ts`

- [ ] **Step 1: Create command module**

Create `src/adapters/cli/commands/memory-blocker.ts`:

```typescript
import { Command } from 'commander';
import { createBlocker } from '../../../app/use-cases/create-blocker.js';
import { resolveBlocker } from '../../../app/use-cases/resolve-blocker.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { Blocker } from '../../../domain/schemas/blocker-schema.js';

export function memoryBlockerCommand(): Command {
  const blocker = new Command('blocker').description('Manage blockers');

  blocker
    .command('add')
    .description('Add a blocker')
    .requiredOption('--title <title>', 'Blocker title')
    .requiredOption('--impact <impact>', 'What is blocked')
    .option('--workaround <workaround>', 'Temporary workaround')
    .option('--thread <thread-id>', 'Parent thread id')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await createBlocker(
        { store, log, clock, idGen },
        {
          title: options.title,
          impact: options.impact,
          workaround: options.workaround,
          thread: options.thread,
          createdBy: options.createdBy,
        }
      );
      console.log(`Created blocker: ${result.object.id}`);
    });

  blocker
    .command('list')
    .description('List blockers')
    .option('--thread <thread-id>', 'Filter by thread')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'blocker' });
      for (const obj of objects) {
        if (options.thread && (obj as Blocker).thread !== options.thread) continue;
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  blocker
    .command('resolve')
    .description('Resolve a blocker')
    .argument('<id>', 'Blocker id')
    .action(async (id) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      await resolveBlocker({ store, log, clock, idGen }, id);
      console.log(`Resolved blocker: ${id}`);
    });

  return blocker;
}
```

- [ ] **Step 2: Register command in CLI**

In `src/adapters/cli/cli-entry.ts`, add:

```typescript
import { memoryBlockerCommand } from './commands/memory-blocker.js';
```

and register it:

```typescript
memory.addCommand(memoryBlockerCommand());
```

- [ ] **Step 3: Build and smoke test**

```bash
npm run build
node dist/bootstrap/cli.js memory blocker add --title "Test blocker" --impact "Blocks test"
node dist/bootstrap/cli.js memory blocker list
# copy id from output and resolve it
node dist/bootstrap/cli.js memory blocker resolve <id>
```

Expected: blocker is created, listed, then resolved.

- [ ] **Step 4: Commit**

```bash
git add src/adapters/cli/commands/memory-blocker.ts src/adapters/cli/cli-entry.ts
git commit -m "feat(cli): add memory blocker command"
```

---

## Task 9: Include decisions and blockers in agent brief

**Files:**

- Modify: `src/app/use-cases/generate-agent-brief.ts`
- Test: `tests/unit/use-cases/generate-agent-brief.test.ts`

- [ ] **Step 1: Update test expectations**

In `tests/unit/use-cases/generate-agent-brief.test.ts`, add after the existing `addMemoryObject` calls:

```typescript
await addMemoryObject(
  { store, log, clock, idGen },
  {
    type: 'blocker',
    title: 'CI flaky tests',
    body: 'Tests fail intermittently on CI.',
    createdBy: 'user:test',
  }
);
```

Then add to expectations:

```typescript
expect(content).toContain('## Blockers');
expect(content).toContain('CI flaky tests');
```

Run the test first to confirm it fails:

```bash
npm run test tests/unit/use-cases/generate-agent-brief.test.ts
```

Expected: FAIL — `## Blockers` not found.

- [ ] **Step 2: Modify generate-agent-brief**

In `src/app/use-cases/generate-agent-brief.ts`, update `renderBrief` signature and call:

```typescript
const activeDecisions = memoryObjects
  .filter((obj) => obj.type === 'decision')
  .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

const activeBlockers = memoryObjects
  .filter((obj) => obj.type === 'blocker')
  .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
```

Pass them to `renderBrief`. Add sections after Open Questions:

```typescript
lines.push('## Blockers');
for (const blocker of activeBlockers) {
  lines.push(`- ${blocker.title}`);
  if (blocker.body) {
    lines.push(`  ${blocker.body.split('\n')[0].slice(0, 120)}`);
  }
}
if (activeBlockers.length === 0) lines.push('_No active blockers._');
lines.push('');
```

Decisions remain in **Active Memory** because they are accepted active objects; blockers get their own section because they are actionable.

- [ ] **Step 3: Run tests**

```bash
npm run test tests/unit/use-cases/generate-agent-brief.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/use-cases/generate-agent-brief.ts tests/unit/use-cases/generate-agent-brief.test.ts
git commit -m "feat(brief): include active blockers in agent brief"
```

---

## Task 10: Include decisions and blockers in thread brief

**Files:**

- Modify: `src/app/use-cases/get-thread-brief.ts`
- Test: `tests/unit/use-cases/get-thread-brief.test.ts`

- [ ] **Step 1: Update test**

In `tests/unit/use-cases/get-thread-brief.test.ts`, add imports:

```typescript
import { createDecision } from '../../../src/app/use-cases/create-decision.js';
import { createBlocker } from '../../../src/app/use-cases/create-blocker.js';
```

Add after article creation:

```typescript
const { object: decision } = await createDecision(
  { store, log, clock, idGen },
  {
    title: 'Use SQLite',
    body: 'SQLite is already a dependency.',
    thread: thread.id,
    createdBy: 'user:test',
  }
);

const { object: blocker } = await createBlocker(
  { store, log, clock, idGen },
  {
    title: 'CI fails',
    impact: 'CI fails on native bindings.',
    thread: thread.id,
    createdBy: 'user:test',
  }
);
```

Add expectations:

```typescript
expect(brief.rendered).toContain('## Decisions');
expect(brief.rendered).toContain(decision.title);
expect(brief.rendered).toContain('## Blockers');
expect(brief.rendered).toContain(blocker.title);
```

Run test to confirm failure:

```bash
npm run test tests/unit/use-cases/get-thread-brief.test.ts
```

Expected: FAIL — sections not present.

- [ ] **Step 2: Modify get-thread-brief**

In `src/app/use-cases/get-thread-brief.ts`, update the `ThreadBrief` interface:

```typescript
export interface ThreadBrief {
  thread: WorkThread;
  openInfoRequests: InfoRequest[];
  answeredInfoRequests: InfoRequest[];
  articles: Article[];
  decisions: Decision[];
  blockers: Blocker[];
  rendered: string;
}
```

Add imports:

```typescript
import { Decision } from '../../domain/schemas/decision-schema.js';
import { Blocker } from '../../domain/schemas/blocker-schema.js';
```

Filter decisions and blockers:

```typescript
const decisions = all.filter((o) => o.type === 'decision' && (o as Decision).thread === threadId) as Decision[];
const blockers = all.filter((o) => o.type === 'blocker' && (o as Blocker).thread === threadId) as Blocker[];
```

Add to return object and renderer. Insert after Articles section:

```typescript
lines.push('', '## Decisions');
for (const decision of decisions) {
  lines.push(`- [${decision.id}] ${decision.title}`);
}
if (decisions.length === 0) lines.push('_No decisions._');

lines.push('', '## Blockers');
for (const blocker of blockers) {
  lines.push(`- [${blocker.id}] ${blocker.title}`);
}
if (blockers.length === 0) lines.push('_No blockers._');
```

- [ ] **Step 3: Run tests**

```bash
npm run test tests/unit/use-cases/get-thread-brief.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/use-cases/get-thread-brief.ts tests/unit/use-cases/get-thread-brief.test.ts
git commit -m "feat(brief): include decisions and blockers in thread brief"
```

---

## Task 11: Update user guide

**Files:**

- Modify: `docs/guide/user-guide.md`

- [ ] **Step 1: Add new entity sections**

After section 2.3 (Article), add:

````markdown
### 2.4. Decision (Решение)

**Что это:** зафиксированный архитектурный или процессный выбор.

**Когда создавать:**

- Выбрали технологию, подход или соглашение.
- Нужно сохранить обоснование, чтобы не обсуждать повторно.
- Решение может быть отменено позже — тогда его заменяет новое.

**Пример:**

```bash
node dist/bootstrap/cli.js memory decision add \
  --title "Использовать SQLite FTS5" \
  --body "SQLite уже зависимость. FTS5 достаточно для MVP." \
  --thread <thread-id>
```
````

**Статусы:**

- `active` — действует
- `superseded` — заменено другим решением
- `rejected` — отклонено
- `obsolete` — устарело

### 2.5. Blocker (Препятствие)

**Что это:** препятствие, которое мешает двигаться дальше.

**Когда создавать:**

- Что-то явно блокирует работу.
- Есть временный обход, который стоит зафиксировать.
- Блокер относится к треду или проекту в целом.

**Пример:**

```bash
node dist/bootstrap/cli.js memory blocker add \
  --title "CI падает на better-sqlite3" \
  --impact "Каждый CI-прогон падает на компиляции нативных биндингов." \
  --workaround "Временно запускать тесты только на macOS-раннерах." \
  --thread <thread-id>
```

**Статусы:**

- `active` — активен
- `resolved` — решён
- `obsolete` — устарел

````

- [ ] **Step 2: Update section 2.4 → 2.6 and add commands to quick reference**

Rename `### 2.4. Thread Brief` to `### 2.6. Thread Brief`.

Add to quick reference in section 9:

```bash
# Decisions
node dist/bootstrap/cli.js memory decision add --title "..." --body "..." [--thread <id>]
node dist/bootstrap/cli.js memory decision list [--thread <id>]

# Blockers
node dist/bootstrap/cli.js memory blocker add --title "..." --impact "..." [--workaround "..."] [--thread <id>]
node dist/bootstrap/cli.js memory blocker list [--thread <id>]
node dist/bootstrap/cli.js memory blocker resolve <id>
````

- [ ] **Step 3: Commit**

```bash
git add docs/guide/user-guide.md
git commit -m "docs: document decision and blocker commands"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: End-to-end smoke test**

```bash
node dist/bootstrap/cli.js memory decision add \
  --title "Use existing pattern" \
  --body "Phase 2 follows Phase 1 pattern." \
  --thread mem_20260630_mr_wolf_schema_driven_memory_control_pla_300359 \
  --created-by user:cli

node dist/bootstrap/cli.js memory blocker add \
  --title "Need to rebuild index after adds" \
  --impact "Search does not see new objects until rebuild-index." \
  --thread mem_20260630_mr_wolf_schema_driven_memory_control_pla_300359 \
  --created-by user:cli

node dist/bootstrap/cli.js memory thread brief mem_20260630_mr_wolf_schema_driven_memory_control_pla_300359
node dist/bootstrap/cli.js memory brief
```

Expected: briefs contain the new decision and blocker.

- [ ] **Step 5: Commit any final changes**

```bash
git add -A
git commit -m "chore: final verification for Phase 2 decisions and blockers"
```

---

## Spec Coverage Check

| Spec Requirement                       | Task             |
| -------------------------------------- | ---------------- |
| `decision` schema                      | Task 1           |
| `blocker` schema                       | Task 2           |
| Register `blocker` in constants/config | Task 3           |
| `createDecision` use-case              | Task 4           |
| `createBlocker` use-case               | Task 5           |
| `resolveBlocker` use-case              | Task 6           |
| `memory decision` CLI                  | Task 7           |
| `memory blocker` CLI                   | Task 8           |
| Active blockers in agent brief         | Task 9           |
| Decisions and blockers in thread brief | Task 10          |
| User guide update                      | Task 11          |
| Tests for each use-case                | Tasks 4–6, 9, 10 |

## Placeholder Scan

No TBD, TODO, or vague steps. Every code block contains concrete implementation.

## Type Consistency Check

- `Decision.thread` and `Blocker.thread` are `string | undefined` in schemas.
- CLI passes `options.thread` only when provided.
- Use-cases accept `thread?: string`.
- `resolveBlocker` uses `store.update(id, { status: 'resolved' })`, consistent with `supersedeMemoryObject`.
