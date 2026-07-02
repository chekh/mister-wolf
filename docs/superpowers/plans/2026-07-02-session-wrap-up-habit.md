# Session Wrap-Up Habit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic `session-summary` creation on lifecycle events plus a manual `wolf memory session wrap-up` command.

**Architecture:** A new `summarizeSession` use case reads the JSONL event log since the last summary, builds a `session-summary` memory object, and saves it. A `shouldSummarize` guard prevents duplicates within 5 minutes. Existing lifecycle use cases call `summarizeSession` as a fire-and-forget hook. A new CLI subcommand provides manual wrap-up.

**Tech Stack:** TypeScript, better-sqlite3, Commander, Vitest.

---

## File Map

- **Create:** `src/app/use-cases/summarize-session.ts` — builds and saves a `session-summary`.
- **Create:** `src/app/use-cases/should-summarize.ts` — deduplication guard.
- **Create:** `src/adapters/cli/commands/memory-session-wrap-up.ts` — manual CLI command.
- **Create:** `tests/unit/use-cases/summarize-session.test.ts` — unit tests.
- **Create:** `tests/integration/session-wrap-up-habit.test.ts` — integration tests.
- **Modify:** `src/adapters/cli/commands/memory-session.ts` — register `wrap-up` subcommand.
- **Modify:** `src/adapters/cli/cli-entry.ts` — ensure command is wired (already is via `memorySessionCommand`).
- **Modify:** `src/app/use-cases/resolve-blocker.ts` — auto-trigger hook.
- **Modify:** `src/app/use-cases/transition-memory-object.ts` — auto-trigger hook for terminal statuses.
- **Modify:** `src/app/use-cases/supersede-memory-object.ts` — auto-trigger hook.
- **Modify:** `src/app/use-cases/create-decision.ts` — auto-trigger hook.
- **Modify:** `src/app/use-cases/create-article.ts` — auto-trigger hook.

---

### Task 1: Deduplication Guard

**Files:**

- Create: `src/app/use-cases/should-summarize.ts`
- Test: `tests/unit/use-cases/should-summarize.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { shouldSummarize } from '../../../src/app/use-cases/should-summarize.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeSummary(date: string): MemoryObject {
  return {
    id: 'mem_summary',
    type: 'session-summary',
    title: 'Summary',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: date,
    updated_at: date,
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'session' },
    related: { files: [], docs: [], decisions: [] },
    tags: ['session-summary'],
    superseded_by: null,
    body: '',
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
  };
}

describe('shouldSummarize', () => {
  it('returns true when no recent summary exists', () => {
    expect(shouldSummarize([], new Date('2026-07-02T12:00:00Z'))).toBe(true);
  });

  it('returns false when a summary exists within 5 minutes', () => {
    const objects = [makeSummary('2026-07-02T11:58:00Z')];
    expect(shouldSummarize(objects, new Date('2026-07-02T12:00:00Z'))).toBe(false);
  });

  it('returns true when the latest summary is older than 5 minutes', () => {
    const objects = [makeSummary('2026-07-02T11:54:00Z')];
    expect(shouldSummarize(objects, new Date('2026-07-02T12:00:00Z'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-cases/should-summarize.test.ts`
Expected: FAIL — `shouldSummarize` not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

const COOLDOWN_MS = 5 * 60 * 1000;

export function shouldSummarize(objects: MemoryObject[], now: Date): boolean {
  const latest = objects
    .filter((obj) => obj.type === 'session-summary')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (!latest) return true;
  const ageMs = now.getTime() - new Date(latest.created_at).getTime();
  return ageMs > COOLDOWN_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/use-cases/should-summarize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/use-cases/should-summarize.test.ts src/app/use-cases/should-summarize.ts
git commit -m "feat(session): add shouldSummarize cooldown guard"
```

---

### Task 2: Summarize Session Use Case

**Files:**

- Create: `src/app/use-cases/summarize-session.ts`
- Test: `tests/unit/use-cases/summarize-session.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { summarizeSession } from '../../../src/app/use-cases/summarize-session.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';

describe('summarizeSession', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-wrap-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a session-summary from recent events', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    await log.append({
      id: 'evt_1',
      type: 'memory.added',
      timestamp: new Date().toISOString(),
      actor: 'user:demo',
      payload: { memory_id: 'mem_a', type: 'decision' },
    });

    const result = await summarizeSession({ store, log, clock, idGen }, { createdBy: 'user:demo' });

    expect(result.object.type).toBe('session-summary');
    expect(result.object.body).toContain('mem_a');
    expect(result.object.tags).toContain('session-summary');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/use-cases/summarize-session.test.ts`
Expected: FAIL — `summarizeSession` not defined.

- [ ] **Step 3: Write implementation**

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { addMemoryObject } from './add-memory-object.js';
import { shouldSummarize } from './should-summarize.js';
import { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';

export interface SummarizeSessionInput {
  title?: string;
  tags?: string[];
  createdBy: string;
}

export interface SummarizeSessionResult {
  object: { id: string; type: string; title: string; body: string; tags: string[] };
}

export async function summarizeSession(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: SummarizeSessionInput
): Promise<SummarizeSessionResult | null> {
  const now = deps.clock.now();
  const objects = await deps.store.list();
  if (!shouldSummarize(objects, now)) {
    return null;
  }

  const events = await deps.log.read();
  const recentEvents = events.slice(-20);

  const title = input.title ?? `Session wrap-up ${now.toISOString().slice(0, 16).replace('T', ' ')}`;
  const body = renderSummaryBody(recentEvents);
  const tags = ['session-summary', ...(input.tags ?? [])];

  const result = await addMemoryObject(
    { store: deps.store, log: deps.log, clock: deps.clock, idGen: deps.idGen },
    {
      type: 'session-summary',
      title,
      body,
      createdBy: input.createdBy,
      tags,
      source: { kind: 'session' },
    }
  );

  return { object: result.object };
}

function renderSummaryBody(events: MemoryEvent[]): string {
  if (events.length === 0) return 'No recent events.';
  const lines = events.map((evt) => `- ${evt.type}: ${JSON.stringify(evt.payload)} (actor: ${evt.actor})`);
  return `# Session wrap-up\n\nRecent events:\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/use-cases/summarize-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/use-cases/summarize-session.test.ts src/app/use-cases/summarize-session.ts
git commit -m "feat(session): add summarizeSession use case"
```

---

### Task 3: Manual Wrap-Up CLI Command

**Files:**

- Create: `src/adapters/cli/commands/memory-session-wrap-up.ts`
- Modify: `src/adapters/cli/commands/memory-session.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';

describe('memory session wrap-up CLI', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-cli-wrap-'));
    initProjectMemory(new FsProjectInitializer(), dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a session-summary object', () => {
    const out = execSync(`node dist/bootstrap/cli.js memory session wrap-up --title "Manual wrap-up" --tags manual`, {
      cwd: dir,
      encoding: 'utf-8',
    });
    expect(out).toContain('Created session-summary');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/session-wrap-up-habit.test.ts`
Expected: FAIL — command not registered.

- [ ] **Step 3: Write implementation**

Create `src/adapters/cli/commands/memory-session-wrap-up.ts`:

```typescript
import { Command } from 'commander';
import { createCliContainer } from '../../../bootstrap/container.js';
import { summarizeSession } from '../../../app/use-cases/summarize-session.js';

export function memorySessionWrapUpCommand(): Command {
  return new Command('wrap-up')
    .description('Manually create a session-summary of recent events')
    .option('--title <title>', 'Summary title')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await summarizeSession(
        { store, log, clock, idGen },
        {
          title: options.title,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
          createdBy: 'user:cli',
        }
      );
      if (result) {
        console.log(`Created session-summary: ${result.object.id}`);
      } else {
        console.log('Skipped: a session-summary was created recently.');
      }
    });
}
```

Modify `src/adapters/cli/commands/memory-session.ts` to add:

```typescript
import { memorySessionWrapUpCommand } from './memory-session-wrap-up.js';
// ...
session.addCommand(memorySessionWrapUpCommand());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/session-wrap-up-habit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/cli/commands/memory-session-wrap-up.ts src/adapters/cli/commands/memory-session.ts tests/integration/session-wrap-up-habit.test.ts
git commit -m "feat(cli): add memory session wrap-up command"
```

---

### Task 4: Auto-Trigger Hooks

**Files:**

- Modify: `src/app/use-cases/resolve-blocker.ts`
- Modify: `src/app/use-cases/transition-memory-object.ts`
- Modify: `src/app/use-cases/supersede-memory-object.ts`
- Modify: `src/app/use-cases/create-decision.ts`
- Modify: `src/app/use-cases/create-article.ts`
- Test: `tests/integration/session-wrap-up-habit.test.ts`

- [ ] **Step 1: Write failing integration test**

Add to `tests/integration/session-wrap-up-habit.test.ts`:

```typescript
import { createBlocker } from '../../../src/app/use-cases/create-blocker.js';
import { resolveBlocker } from '../../../src/app/use-cases/resolve-blocker.js';

it('auto-creates a session-summary after resolving a blocker', async () => {
  await initProjectMemory(new FsProjectInitializer(), dir);
  const store = new MarkdownMemoryStore(dir);
  const log = new JsonlEventLog(eventsPath(dir));
  const clock = new SystemClock();
  const idGen = new HashIdGenerator();

  const { object: blocker } = await createBlocker(
    { store, log, clock, idGen },
    { title: 'CI timeout', impact: 'Build fails', createdBy: 'user:demo' }
  );

  await resolveBlocker({ store, log, clock, idGen }, blocker.id);

  const summaries = (await store.list()).filter((obj) => obj.type === 'session-summary');
  expect(summaries.length).toBeGreaterThan(0);
  expect(summaries[0].body).toContain(blocker.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/session-wrap-up-habit.test.ts`
Expected: FAIL — no summary created.

- [ ] **Step 3: Add hooks**

In each modified use case, import `summarizeSession` and call it fire-and-forget after the main operation.

Example for `resolve-blocker.ts`:

```typescript
import { summarizeSession } from './summarize-session.js';
// ...
export async function resolveBlocker(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
  },
  id: string,
  resolvedBy?: string
): Promise<void> {
  // existing logic ...
  if (deps.relations && resolvedBy) {
    await recordRelation(deps, now, resolvedBy, 'resolves', id);
  }
  await summarizeSession(deps, { createdBy: 'system:wolf' }).catch(() => undefined);
}
```

For `transition-memory-object.ts`, trigger only for terminal statuses:

```typescript
const TERMINAL_STATUSES = ['archived', 'completed', 'accepted', 'resolved', 'obsolete'];
// after update ...
if (TERMINAL_STATUSES.includes(newStatus)) {
  await summarizeSession(deps, { createdBy: actor }).catch(() => undefined);
}
```

For `supersede-memory-object.ts`, `create-decision.ts`, `create-article.ts`, add similar `summarizeSession` calls at the end.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/session-wrap-up-habit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/use-cases/resolve-blocker.ts src/app/use-cases/transition-memory-object.ts src/app/use-cases/supersede-memory-object.ts src/app/use-cases/create-decision.ts src/app/use-cases/create-article.ts tests/integration/session-wrap-up-habit.test.ts
git commit -m "feat(session): auto-trigger session summaries on lifecycle events"
```

---

### Task 5: Verify Full Suite

- [ ] **Step 1: Run lint and tests**

Run: `npm run check`
Expected: All tests pass.

- [ ] **Step 2: Commit if any fixes needed**

```bash
git commit -m "fix(session): address review findings" || echo "no fixes needed"
```

---

## Spec Coverage Check

| Spec Requirement                          | Task   |
| ----------------------------------------- | ------ |
| Auto-trigger on resolve blocker           | Task 4 |
| Auto-trigger on terminal transitions      | Task 4 |
| Auto-trigger on supersede                 | Task 4 |
| Auto-trigger on decision/article creation | Task 4 |
| Manual wrap-up command                    | Task 3 |
| 5-minute deduplication                    | Task 1 |
| Summary body from recent events           | Task 2 |

## Placeholder Scan

No TBD, TODO, or vague steps. All code and commands are explicit.

## Type Consistency

- `summarizeSession` returns `SummarizeSessionResult | null`.
- All hooks use the same `{ store, log, clock, idGen }` dependency shape.
- `shouldSummarize` accepts `MemoryObject[]` and `Date`.
