# Phase 1: Work Threads, Info Requests, Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `work-thread`, `info-request`, and `article` memory artifact types with create/list/get/thread-brief commands and full test coverage.

**Architecture:** Extend the existing `MemoryObject` model with new types and domain-specific schemas. Add dedicated use-cases for each artifact and a `thread-brief` use-case that assembles context from a thread and its linked info-requests/articles. Wire everything into the existing `wolf memory` CLI namespace using Commander subcommands. Keep SQLite/index out of scope for Phase 1; brief is built by direct file reads.

**Tech Stack:** TypeScript 5, Node 20, Vitest, Commander, Zod, js-yaml, better-sqlite3.

---

## File Map

| File                                                     | Responsibility                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `src/domain/memory-types.ts`                             | Add `work-thread`, `info-request`, `article` to `MEMORY_TYPES`. |
| `src/domain/schemas/memory-object-schema.ts`             | Extend base schema with new type enum values.                   |
| `src/domain/schemas/thread-schema.ts`                    | Zod schema and TypeScript type for `WorkThread`.                |
| `src/domain/schemas/info-request-schema.ts`              | Zod schema and TypeScript type for `InfoRequest`.               |
| `src/domain/schemas/article-schema.ts`                   | Zod schema and TypeScript type for `Article`.                   |
| `src/adapters/fs/project-paths.ts`                       | Add directory mappings for new types.                           |
| `src/adapters/fs/fs-project-initializer.ts`              | Create new object directories on init.                          |
| `src/app/use-cases/create-work-thread.ts`                | Create a `work-thread` object.                                  |
| `src/app/use-cases/create-info-request.ts`               | Create an `info-request` linked to a thread.                    |
| `src/app/use-cases/create-article.ts`                    | Create an `article` optionally linked to a thread and requests. |
| `src/app/use-cases/get-thread-brief.ts`                  | Assemble brief from thread + linked artifacts.                  |
| `src/app/use-cases/list-memory-objects.ts`               | Already exists; may need filter extension.                      |
| `src/adapters/cli/commands/memory-thread.ts`             | CLI subcommand for `wolf memory thread`.                        |
| `src/adapters/cli/commands/memory-info-request.ts`       | CLI subcommand for `wolf memory info-request`.                  |
| `src/adapters/cli/commands/memory-article.ts`            | CLI subcommand for `wolf memory article`.                       |
| `src/adapters/cli/cli-entry.ts`                          | Register new subcommands.                                       |
| `tests/unit/domain/thread-schema.test.ts`                | Schema validation tests.                                        |
| `tests/unit/domain/info-request-schema.test.ts`          | Schema validation tests.                                        |
| `tests/unit/domain/article-schema.test.ts`               | Schema validation tests.                                        |
| `tests/unit/use-cases/create-work-thread.test.ts`        | Use-case tests.                                                 |
| `tests/unit/use-cases/create-info-request.test.ts`       | Use-case tests.                                                 |
| `tests/unit/use-cases/create-article.test.ts`            | Use-case tests.                                                 |
| `tests/unit/use-cases/get-thread-brief.test.ts`          | Brief assembly tests.                                           |
| `tests/integration/thread-info-article-workflow.test.ts` | End-to-end CLI workflow test.                                   |

---

## Task 1: Extend domain types and schemas

**Files:**

- Modify: `src/domain/memory-types.ts:1-9`
- Modify: `src/domain/schemas/memory-object-schema.ts:6`
- Create: `src/domain/schemas/thread-schema.ts`
- Create: `src/domain/schemas/info-request-schema.ts`
- Create: `src/domain/schemas/article-schema.ts`
- Test: `tests/unit/domain/thread-schema.test.ts`
- Test: `tests/unit/domain/info-request-schema.test.ts`
- Test: `tests/unit/domain/article-schema.test.ts`

- [ ] **Step 1: Add new types to MEMORY_TYPES**

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
] as const;
```

- [ ] **Step 2: Extend MemoryObjectSchema type enum**

Modify `src/domain/schemas/memory-object-schema.ts` line 6:

```typescript
type: z.enum(MEMORY_TYPES),
```

No other change needed; the enum is derived from `MEMORY_TYPES`.

- [ ] **Step 3: Create thread schema**

Create `src/domain/schemas/thread-schema.ts`:

```typescript
import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const WorkThreadSchema = MemoryObjectSchema.extend({
  type: z.literal('work-thread'),
  goal: z.string().min(1),
  current_state: z.string().default(''),
  next_steps: z.array(z.string()).default([]),
});

export type WorkThread = z.infer<typeof WorkThreadSchema>;
```

- [ ] **Step 4: Create info-request schema**

Create `src/domain/schemas/info-request-schema.ts`:

```typescript
import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const InfoRequestSchema = MemoryObjectSchema.extend({
  type: z.literal('info-request'),
  thread: z.string().min(1),
  question: z.string().min(1),
  detour_reason: z.string().min(1),
  needed_for: z.array(z.string()).default([]),
  expected_answer: z.array(z.string()).min(1),
  preliminary_answer: z.string().default(''),
});

export type InfoRequest = z.infer<typeof InfoRequestSchema>;
```

- [ ] **Step 5: Create article schema**

Create `src/domain/schemas/article-schema.ts`:

```typescript
import { z } from 'zod';
import { MemoryObjectSchema } from './memory-object-schema.js';

export const ArticleSchema = MemoryObjectSchema.extend({
  type: z.literal('article'),
  thread: z.string().min(1),
  summary: z.string().min(1),
  answers: z.array(z.string()).default([]),
  supports: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
});

export type Article = z.infer<typeof ArticleSchema>;
```

- [ ] **Step 6: Write schema tests**

Create `tests/unit/domain/thread-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkThreadSchema } from '../../../src/domain/schemas/thread-schema.js';

describe('WorkThreadSchema', () => {
  it('accepts a valid work thread', () => {
    const result = WorkThreadSchema.safeParse({
      id: 'thread_test',
      type: 'work-thread',
      title: 'Memory Harness',
      status: 'active',
      review_state: 'proposed',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-06-30T10:00:00Z',
      updated_at: '2026-06-30T10:00:00Z',
      created_by: 'agent:test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      body: '',
      goal: 'Build project memory harness',
      current_state: 'Designing core types',
      next_steps: ['Add CLI commands'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a work thread without goal', () => {
    const result = WorkThreadSchema.safeParse({
      id: 'thread_test',
      type: 'work-thread',
      title: 'Memory Harness',
      status: 'active',
      review_state: 'proposed',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-06-30T10:00:00Z',
      updated_at: '2026-06-30T10:00:00Z',
      created_by: 'agent:test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      body: '',
      current_state: '',
      next_steps: [],
    });
    expect(result.success).toBe(false);
  });
});
```

Create similar tests for `InfoRequestSchema` and `ArticleSchema`.

Run:

```bash
npm run test:run -- tests/unit/domain/thread-schema.test.ts tests/unit/domain/info-request-schema.test.ts tests/unit/domain/article-schema.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain/memory-types.ts src/domain/schemas/memory-object-schema.ts src/domain/schemas/thread-schema.ts src/domain/schemas/info-request-schema.ts src/domain/schemas/article-schema.ts tests/unit/domain/thread-schema.test.ts tests/unit/domain/info-request-schema.test.ts tests/unit/domain/article-schema.test.ts
git commit -m "feat(domain): add work-thread, info-request, article schemas"
```

---

## Task 2: Update storage paths and initializer

**Files:**

- Modify: `src/adapters/fs/project-paths.ts:12-26`
- Modify: `src/adapters/fs/fs-project-initializer.ts:25-31`
- Test: `tests/unit/adapters/project-paths.test.ts`

- [ ] **Step 1: Add directory mappings for new types**

Modify `src/adapters/fs/project-paths.ts`:

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
};
```

- [ ] **Step 2: Create directories on init**

Modify `src/adapters/fs/fs-project-initializer.ts`:

```typescript
await fs.mkdir(join(objectsDir(baseDir), 'threads'), { recursive: true });
await fs.mkdir(join(objectsDir(baseDir), 'info-requests'), { recursive: true });
await fs.mkdir(join(objectsDir(baseDir), 'articles'), { recursive: true });
```

- [ ] **Step 3: Run existing tests**

```bash
npm run test:run -- tests/unit/adapters/project-paths.test.ts tests/unit/use-cases/init-project-memory.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/adapters/fs/project-paths.ts src/adapters/fs/fs-project-initializer.ts
git commit -m "feat(fs): add storage paths and initializer dirs for new artifact types"
```

---

## Task 3: Implement create-work-thread use-case

**Files:**

- Create: `src/app/use-cases/create-work-thread.ts`
- Test: `tests/unit/use-cases/create-work-thread.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/use-cases/create-work-thread.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWorkThread } from '../../../src/app/use-cases/create-work-thread.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createWorkThread', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-thread-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a work thread with required fields', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const result = await createWorkThread(
      { store, log, clock, idGen },
      { title: 'Memory Harness', goal: 'Build durable project memory', createdBy: 'agent:test' }
    );

    expect(result.object.type).toBe('work-thread');
    expect(result.object.title).toBe('Memory Harness');
    expect(result.object.goal).toBe('Build durable project memory');
    expect(result.object.status).toBe('active');
    expect(result.object.review_state).toBe('proposed');

    const saved = await store.get(result.object.id);
    expect(saved).not.toBeNull();
    expect(saved?.type).toBe('work-thread');
  });
});
```

Run:

```bash
npm run test:run -- tests/unit/use-cases/create-work-thread.test.ts
```

Expected: FAIL — `createWorkThread` not found.

- [ ] **Step 2: Implement use-case**

Create `src/app/use-cases/create-work-thread.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { WorkThread } from '../../domain/schemas/thread-schema.js';

export interface CreateWorkThreadInput {
  title: string;
  goal: string;
  currentState?: string;
  nextSteps?: string[];
  createdBy: string;
}

export interface CreateWorkThreadResult {
  object: WorkThread;
}

export async function createWorkThread(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: CreateWorkThreadInput
): Promise<CreateWorkThreadResult> {
  const now = deps.clock.now();
  const object: WorkThread = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'work-thread',
    title: input.title,
    status: 'active',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.6,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    goal: input.goal,
    current_state: input.currentState || '',
    next_steps: input.nextSteps || [],
  };

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

- [ ] **Step 3: Run test to verify it passes**

```bash
npm run test:run -- tests/unit/use-cases/create-work-thread.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/use-cases/create-work-thread.ts tests/unit/use-cases/create-work-thread.test.ts
git commit -m "feat(use-cases): implement create-work-thread"
```

---

## Task 4: Implement create-info-request use-case

**Files:**

- Create: `src/app/use-cases/create-info-request.ts`
- Test: `tests/unit/use-cases/create-info-request.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/use-cases/create-info-request.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createInfoRequest } from '../../../src/app/use-cases/create-info-request.js';
import { createWorkThread } from '../../../src/app/use-cases/create-work-thread.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createInfoRequest', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-ireq-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates an info request linked to a thread', async () => {
    const thread = await createWorkThread(
      { store, log, clock, idGen },
      {
        title: 'Memory Harness',
        goal: 'Build memory',
        createdBy: 'agent:test',
      }
    );

    const result = await createInfoRequest(
      { store, log, clock, idGen },
      {
        title: 'Where to store relations?',
        thread: thread.object.id,
        question: 'Should relations live in relations.jsonl or SQLite?',
        detourReason: 'Storage comparison would derail behavior design session.',
        neededFor: ['decision:relation-storage'],
        expectedAnswer: ['Comparison of options with recommendation'],
        preliminaryAnswer: 'Likely relations.jsonl for MVP source of truth.',
        createdBy: 'agent:test',
      }
    );

    expect(result.object.type).toBe('info-request');
    expect(result.object.thread).toBe(thread.object.id);
    expect(result.object.status).toBe('open');
  });

  it('rejects an info request with missing required fields', async () => {
    const thread = await createWorkThread(
      { store, log, clock, idGen },
      {
        title: 'Memory Harness',
        goal: 'Build memory',
        createdBy: 'agent:test',
      }
    );

    await expect(
      createInfoRequest(
        { store, log, clock, idGen },
        {
          title: 'Bad request',
          thread: thread.object.id,
          question: 'Question?',
          detourReason: '',
          neededFor: [],
          expectedAnswer: [],
          createdBy: 'agent:test',
        }
      )
    ).rejects.toThrow();
  });
});
```

Run:

```bash
npm run test:run -- tests/unit/use-cases/create-info-request.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement use-case**

Create `src/app/use-cases/create-info-request.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { InfoRequest, InfoRequestSchema } from '../../domain/schemas/info-request-schema.js';

export interface CreateInfoRequestInput {
  title: string;
  thread: string;
  question: string;
  detourReason: string;
  neededFor?: string[];
  expectedAnswer: string[];
  preliminaryAnswer?: string;
  createdBy: string;
}

export interface CreateInfoRequestResult {
  object: InfoRequest;
}

export async function createInfoRequest(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: CreateInfoRequestInput
): Promise<CreateInfoRequestResult> {
  if (!input.detourReason.trim()) throw new Error('detour_reason is required');
  if (input.expectedAnswer.length === 0) throw new Error('expected_answer must contain at least one item');

  const now = deps.clock.now();
  const object: InfoRequest = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'info-request',
    title: input.title,
    status: 'open',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    thread: input.thread,
    question: input.question,
    detour_reason: input.detourReason,
    needed_for: input.neededFor || [],
    expected_answer: input.expectedAnswer,
    preliminary_answer: input.preliminaryAnswer || '',
  };

  InfoRequestSchema.parse(object);

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

- [ ] **Step 3: Run test to verify it passes**

```bash
npm run test:run -- tests/unit/use-cases/create-info-request.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/use-cases/create-info-request.ts tests/unit/use-cases/create-info-request.test.ts
git commit -m "feat(use-cases): implement create-info-request"
```

---

## Task 5: Implement create-article use-case

**Files:**

- Create: `src/app/use-cases/create-article.ts`
- Test: `tests/unit/use-cases/create-article.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/use-cases/create-article.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createArticle } from '../../../src/app/use-cases/create-article.js';
import { createWorkThread } from '../../../src/app/use-cases/create-work-thread.js';
import { createInfoRequest } from '../../../src/app/use-cases/create-info-request.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('createArticle', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-article-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates an article linked to a thread and requests', async () => {
    const thread = await createWorkThread(
      { store, log, clock, idGen },
      {
        title: 'Memory Harness',
        goal: 'Build memory',
        createdBy: 'agent:test',
      }
    );
    const request = await createInfoRequest(
      { store, log, clock, idGen },
      {
        title: 'Where to store relations?',
        thread: thread.object.id,
        question: 'Should relations live in relations.jsonl or SQLite?',
        detourReason: 'Comparison would derail session.',
        expectedAnswer: ['Recommendation'],
        createdBy: 'agent:test',
      }
    );

    const result = await createArticle(
      { store, log, clock, idGen },
      {
        title: 'Relations Storage Recommendation',
        thread: thread.object.id,
        summary: 'Use relations.jsonl as canonical MVP store.',
        body: '## Answer\n\nrelations.jsonl is canonical; SQLite indexes it later.',
        answers: [request.object.id],
        createdBy: 'agent:test',
      }
    );

    expect(result.object.type).toBe('article');
    expect(result.object.thread).toBe(thread.object.id);
    expect(result.object.answers).toContain(request.object.id);
  });
});
```

Run:

```bash
npm run test:run -- tests/unit/use-cases/create-article.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement use-case**

Create `src/app/use-cases/create-article.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { Article, ArticleSchema } from '../../domain/schemas/article-schema.js';

export interface CreateArticleInput {
  title: string;
  thread: string;
  summary: string;
  body: string;
  answers?: string[];
  supports?: string[];
  evidence?: string[];
  createdBy: string;
}

export interface CreateArticleResult {
  object: Article;
}

export async function createArticle(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: CreateArticleInput
): Promise<CreateArticleResult> {
  const now = deps.clock.now();
  const object: Article = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'article',
    title: input.title,
    status: 'proposed',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.6,
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
    summary: input.summary,
    answers: input.answers || [],
    supports: input.supports || [],
    evidence: input.evidence || [],
  };

  ArticleSchema.parse(object);

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

- [ ] **Step 3: Run test to verify it passes**

```bash
npm run test:run -- tests/unit/use-cases/create-article.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/use-cases/create-article.ts tests/unit/use-cases/create-article.test.ts
git commit -m "feat(use-cases): implement create-article"
```

---

## Task 6: Implement get-thread-brief use-case

**Files:**

- Create: `src/app/use-cases/get-thread-brief.ts`
- Test: `tests/unit/use-cases/get-thread-brief.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/use-cases/get-thread-brief.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWorkThread } from '../../../src/app/use-cases/create-work-thread.js';
import { createInfoRequest } from '../../../src/app/use-cases/create-info-request.js';
import { createArticle } from '../../../src/app/use-cases/create-article.js';
import { getThreadBrief } from '../../../src/app/use-cases/get-thread-brief.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('getThreadBrief', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-brief-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('assembles a brief with thread, open requests, and articles', async () => {
    const thread = await createWorkThread(
      { store, log, clock, idGen },
      {
        title: 'Memory Harness',
        goal: 'Build memory',
        currentState: 'Designing types',
        nextSteps: ['Add CLI'],
        createdBy: 'agent:test',
      }
    );
    const request = await createInfoRequest(
      { store, log, clock, idGen },
      {
        title: 'Where to store relations?',
        thread: thread.object.id,
        question: 'Relations storage?',
        detourReason: 'Derails session.',
        expectedAnswer: ['Recommendation'],
        createdBy: 'agent:test',
      }
    );
    const article = await createArticle(
      { store, log, clock, idGen },
      {
        title: 'Relations Storage Recommendation',
        thread: thread.object.id,
        summary: 'Use relations.jsonl.',
        body: '## Answer\n\nrelations.jsonl is canonical.',
        answers: [request.object.id],
        createdBy: 'agent:test',
      }
    );

    const brief = await getThreadBrief({ store }, thread.object.id);

    expect(brief.thread.id).toBe(thread.object.id);
    expect(brief.openInfoRequests.map((r) => r.id)).toContain(request.object.id);
    expect(brief.articles.map((a) => a.id)).toContain(article.object.id);
    expect(brief.rendered).toContain('Memory Harness');
    expect(brief.rendered).toContain('Where to store relations?');
    expect(brief.rendered).toContain('Relations Storage Recommendation');
  });
});
```

Run:

```bash
npm run test:run -- tests/unit/use-cases/get-thread-brief.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement use-case**

Create `src/app/use-cases/get-thread-brief.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { WorkThread } from '../../domain/schemas/thread-schema.js';
import { InfoRequest } from '../../domain/schemas/info-request-schema.js';
import { Article } from '../../domain/schemas/article-schema.js';

export interface ThreadBrief {
  thread: WorkThread;
  openInfoRequests: InfoRequest[];
  answeredInfoRequests: InfoRequest[];
  articles: Article[];
  rendered: string;
}

export async function getThreadBrief(deps: { store: MemoryStore }, threadId: string): Promise<ThreadBrief> {
  const all = await deps.store.list();
  const thread = all.find((o) => o.id === threadId && o.type === 'work-thread') as WorkThread | undefined;
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  const requests = all.filter(
    (o) => o.type === 'info-request' && (o as InfoRequest).thread === threadId
  ) as InfoRequest[];
  const articles = all.filter((o) => o.type === 'article' && (o as Article).thread === threadId) as Article[];

  const openInfoRequests = requests.filter((r) => r.status === 'open');
  const answeredInfoRequests = requests.filter((r) => r.status === 'resolved' || r.status === 'archived');

  const rendered = renderBrief(thread, openInfoRequests, answeredInfoRequests, articles);

  return {
    thread,
    openInfoRequests,
    answeredInfoRequests,
    articles,
    rendered,
  };
}

function renderBrief(
  thread: WorkThread,
  openInfoRequests: InfoRequest[],
  answeredInfoRequests: InfoRequest[],
  articles: Article[]
): string {
  const lines: string[] = [
    `# Thread: ${thread.title}`,
    '',
    '## Goal',
    thread.goal,
    '',
    '## Current State',
    thread.current_state || '_No current state._',
    '',
    '## Next Steps',
    ...(thread.next_steps.length > 0 ? thread.next_steps.map((s) => `- ${s}`) : ['_No next steps._']),
    '',
    '## Open Info Requests',
  ];

  for (const req of openInfoRequests) {
    lines.push(`- [${req.id}] ${req.title}`);
    lines.push(`  ${req.question}`);
  }
  if (openInfoRequests.length === 0) lines.push('_No open info requests._');

  lines.push('', '## Articles');
  for (const article of articles) {
    lines.push(`- [${article.id}] ${article.title}`);
    lines.push(`  ${article.summary}`);
  }
  if (articles.length === 0) lines.push('_No articles._');

  lines.push('', '## Answered Info Requests');
  for (const req of answeredInfoRequests) {
    lines.push(`- [${req.id}] ${req.title}`);
  }
  if (answeredInfoRequests.length === 0) lines.push('_No answered info requests._');

  return lines.join('\n');
}
```

- [ ] **Step 3: Run test to verify it passes**

```bash
npm run test:run -- tests/unit/use-cases/get-thread-brief.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/use-cases/get-thread-brief.ts tests/unit/use-cases/get-thread-brief.test.ts
git commit -m "feat(use-cases): implement get-thread-brief"
```

---

## Task 7: Add CLI commands

**Files:**

- Create: `src/adapters/cli/commands/memory-thread.ts`
- Create: `src/adapters/cli/commands/memory-info-request.ts`
- Create: `src/adapters/cli/commands/memory-article.ts`
- Modify: `src/adapters/cli/cli-entry.ts`
- Test: `tests/integration/thread-info-article-workflow.test.ts`

- [ ] **Step 1: Implement memory-thread command**

Create `src/adapters/cli/commands/memory-thread.ts`:

```typescript
import { Command } from 'commander';
import { createWorkThread } from '../../../app/use-cases/create-work-thread.js';
import { getThreadBrief } from '../../../app/use-cases/get-thread-brief.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryThreadCommand(): Command {
  const thread = new Command('thread').description('Manage work threads');

  thread
    .command('create')
    .description('Create a work thread')
    .requiredOption('--title <title>', 'Thread title')
    .requiredOption('--goal <goal>', 'Thread goal')
    .option('--current-state <state>', 'Current state', '')
    .option('--next-steps <steps>', 'Comma-separated next steps')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await createWorkThread(
        { store, log, clock, idGen },
        {
          title: options.title,
          goal: options.goal,
          currentState: options.currentState,
          nextSteps: options.nextSteps ? options.nextSteps.split(',').map((s: string) => s.trim()) : [],
          createdBy: options.createdBy,
        }
      );
      console.log(`Created work thread: ${result.object.id}`);
    });

  thread
    .command('list')
    .description('List work threads')
    .action(async () => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'work-thread' });
      for (const obj of objects) {
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  thread
    .command('brief')
    .description('Generate a brief for a work thread')
    .argument('<thread-id>', 'Thread id')
    .action(async (threadId) => {
      const { store } = createCliContainer(process.cwd());
      const brief = await getThreadBrief({ store }, threadId);
      console.log(brief.rendered);
    });

  return thread;
}
```

- [ ] **Step 2: Implement memory-info-request command**

Create `src/adapters/cli/commands/memory-info-request.ts`:

```typescript
import { Command } from 'commander';
import { createInfoRequest } from '../../../app/use-cases/create-info-request.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryInfoRequestCommand(): Command {
  const infoRequest = new Command('info-request').description('Manage info requests');

  infoRequest
    .command('create')
    .description('Create an info request')
    .requiredOption('--title <title>', 'Request title')
    .requiredOption('--thread <thread-id>', 'Parent thread id')
    .requiredOption('--question <question>', 'Question to answer')
    .requiredOption('--detour-reason <reason>', 'Why this derails the main session')
    .requiredOption('--expected-answer <answers>', 'Comma-separated expected answer items')
    .option('--needed-for <items>', 'Comma-needed items')
    .option('--preliminary-answer <answer>', 'Preliminary answer', '')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await createInfoRequest(
        { store, log, clock, idGen },
        {
          title: options.title,
          thread: options.thread,
          question: options.question,
          detourReason: options.detourReason,
          expectedAnswer: options.expectedAnswer.split(',').map((s: string) => s.trim()),
          neededFor: options.neededFor ? options.neededFor.split(',').map((s: string) => s.trim()) : [],
          preliminaryAnswer: options.preliminaryAnswer,
          createdBy: options.createdBy,
        }
      );
      console.log(`Created info request: ${result.object.id}`);
    });

  infoRequest
    .command('list')
    .description('List info requests')
    .option('--thread <thread-id>', 'Filter by thread')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'info-request' });
      for (const obj of objects) {
        if (options.thread && (obj as { thread: string }).thread !== options.thread) continue;
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  return infoRequest;
}
```

- [ ] **Step 3: Implement memory-article command**

Create `src/adapters/cli/commands/memory-article.ts`:

```typescript
import { Command } from 'commander';
import { createArticle } from '../../../app/use-cases/create-article.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryArticleCommand(): Command {
  const article = new Command('article').description('Manage articles');

  article
    .command('add')
    .description('Add an article')
    .requiredOption('--title <title>', 'Article title')
    .requiredOption('--thread <thread-id>', 'Parent thread id')
    .requiredOption('--summary <summary>', 'Article summary')
    .requiredOption('--body <body>', 'Article body')
    .option('--answers <ids>', 'Comma-separated answered info-request ids')
    .option('--supports <items>', 'Comma-supported items')
    .option('--evidence <items>', 'Comma-separated evidence items')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await createArticle(
        { store, log, clock, idGen },
        {
          title: options.title,
          thread: options.thread,
          summary: options.summary,
          body: options.body,
          answers: options.answers ? options.answers.split(',').map((s: string) => s.trim()) : [],
          supports: options.supports ? options.supports.split(',').map((s: string) => s.trim()) : [],
          evidence: options.evidence ? options.evidence.split(',').map((s: string) => s.trim()) : [],
          createdBy: options.createdBy,
        }
      );
      console.log(`Created article: ${result.object.id}`);
    });

  article
    .command('list')
    .description('List articles')
    .option('--thread <thread-id>', 'Filter by thread')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'article' });
      for (const obj of objects) {
        if (options.thread && (obj as { thread: string }).thread !== options.thread) continue;
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  return article;
}
```

- [ ] **Step 4: Register commands in CLI entry**

Modify `src/adapters/cli/cli-entry.ts`:

```typescript
import { memoryThreadCommand } from './commands/memory-thread.js';
import { memoryInfoRequestCommand } from './commands/memory-info-request.js';
import { memoryArticleCommand } from './commands/memory-article.js';
```

And add:

```typescript
memory.addCommand(memoryThreadCommand());
memory.addCommand(memoryInfoRequestCommand());
memory.addCommand(memoryArticleCommand());
```

- [ ] **Step 5: Write integration test**

Create `tests/integration/thread-info-article-workflow.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawnSync } from 'child_process';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');

function runCli(args: string, cwd: string): { stdout: string; stderr: string } {
  const result = spawnSync('node', [cliPath, ...args.split(' ')], { cwd, encoding: 'utf-8' });
  if (result.error) throw result.error;
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('Thread / Info Request / Article workflow', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-tia-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates thread, request, article, and brief end-to-end', () => {
    runCli('memory init', dir);

    const threadOut = runCli('memory thread create --title "Memory Harness" --goal "Build durable memory"', dir);
    const threadId = threadOut.stdout.match(/Created work thread: (\S+)/)?.[1];
    expect(threadId).toBeDefined();

    const requestOut = runCli(
      `memory info-request create --title "Where to store relations?" --thread ${threadId} --question "Relations storage?" --detour-reason "Derails session" --expected-answer "Recommendation"`,
      dir
    );
    const requestId = requestOut.stdout.match(/Created info request: (\S+)/)?.[1];
    expect(requestId).toBeDefined();

    const articleOut = runCli(
      `memory article add --title "Relations Storage Recommendation" --thread ${threadId} --summary "Use relations.jsonl" --body "## Answer\n\nrelations.jsonl is canonical." --answers ${requestId}`,
      dir
    );
    const articleId = articleOut.stdout.match(/Created article: (\S+)/)?.[1];
    expect(articleId).toBeDefined();

    const briefOut = runCli(`memory thread brief ${threadId}`, dir);
    expect(briefOut.stdout).toContain('Memory Harness');
    expect(briefOut.stdout).toContain('Where to store relations?');
    expect(briefOut.stdout).toContain('Relations Storage Recommendation');
  });
});
```

- [ ] **Step 6: Build and run integration test**

```bash
npm run build
npm run test:run -- tests/integration/thread-info-article-workflow.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/adapters/cli/commands/memory-thread.ts src/adapters/cli/commands/memory-info-request.ts src/adapters/cli/commands/memory-article.ts src/adapters/cli/cli-entry.ts tests/integration/thread-info-article-workflow.test.ts
git commit -m "feat(cli): add thread, info-request, article commands"
```

---

## Task 8: Final verification and documentation

**Files:**

- Modify: `AGENTS.md`
- Modify: `MEMORY.md` <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->

- [ ] **Step 1: Run full check**

```bash
npm run check
```

Expected: PASS

- [ ] **Step 2: Update AGENTS.md commands**

Add to `AGENTS.md` CORE COMMANDS:

```bash
# Create a work thread
node dist/bootstrap/cli.js memory thread create --title "..." --goal "..."

# Create an info request
node dist/bootstrap/cli.js memory info-request create --title "..." --thread <thread-id> --question "..." --detour-reason "..." --expected-answer "..."

# Add an article
node dist/bootstrap/cli.js memory article add --title "..." --thread <thread-id> --summary "..." --body "..."

# Show thread brief
node dist/bootstrap/cli.js memory thread brief <thread-id>
```

- [ ] **Step 3: Update MEMORY.md** <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->

Add Phase 1 workflow section referencing thread → info-request → article chain.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md MEMORY.md <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->
git commit -m "docs: document Phase 1 thread, info-request, article commands"
```

---

## Self-Review Checklist

- [ ] Spec coverage: work-thread, info-request, article, thread-brief all have tasks.
- [ ] No placeholders: every step has code/commands/expected output.
- [ ] Type consistency: `InfoRequest`, `Article`, `WorkThread` schemas match use-cases.
- [ ] CLI namespace consistent: all commands under `wolf memory`.
- [ ] Storage paths updated for new types.
- [ ] Tests cover happy path and at least one validation failure.
- [ ] Integration test demonstrates end-to-end workflow.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-30-phase-1-thread-info-article.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach do you prefer?
