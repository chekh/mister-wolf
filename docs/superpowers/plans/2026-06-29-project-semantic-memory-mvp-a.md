# Project Semantic Memory MVP-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the orchestrator codebase with a working Project Semantic Memory layer: domain model, Markdown object storage, JSONL event log, SQLite FTS5 search, and CLI commands `init`, `add`, `get`, `list`, `search`, `rebuild-index`.

**Architecture:** Clean/hexagonal architecture inside a single package. `domain` defines memory objects and invariants. `app/use-cases` orchestrate mutations and queries. `ports` declare outbound contracts. `adapters/fs` and `adapters/sqlite` implement storage and indexing. `adapters/cli` provides thin commands. Markdown files in `.wolf/memory/` are the source of truth; `.wolf/cache/index.sqlite` is a disposable FTS5 index.

**Tech Stack:** TypeScript (strict), Zod, Commander.js, better-sqlite3, js-yaml, vitest.

---

## Task 0: Verify Environment

**Files:**

- Read: `package.json`
- Read: `tsconfig.json`

- [ ] **Step 1: Confirm dependencies**

Check that these are installed:

```bash
npm ls zod commander js-yaml better-sqlite3 uuid
```

Expected: all present with compatible versions. If missing, install:

```bash
npm install zod commander js-yaml better-sqlite3 uuid
npm install -D @types/better-sqlite3 @types/js-yaml @types/uuid vitest typescript prettier
```

- [ ] **Step 2: Confirm test runner**

Run:

```bash
npm run test:run
```

Expected: current tests pass (or no tests found) before cleanup begins.

- [ ] **Step 3: Commit baseline**

```bash
git add -A
git commit -m "chore: baseline before Project Semantic Memory pivot"
```

---

## Task 1: Clean Up Old Code and Create New Structure

**Files:**

- Delete: `src/agent/`, `src/config/`, `src/context/`, `src/kernel/`, `src/model/`, `src/policy/`, `src/state/`, `src/tool/`, `src/workflow/`, `src/wac/`
- Delete: `src/cli/commands/`, `src/cli/index.ts`
- Create directories: `src/domain/`, `src/app/use-cases/`, `src/app/services/`, `src/ports/`, `src/adapters/fs/`, `src/adapters/sqlite/`, `src/adapters/cli/commands/`, `src/bootstrap/`, `src/config/`
- Create: `tests/unit/`, `tests/integration/`

- [ ] **Step 1: Remove old source trees**

```bash
rm -rf src/agent src/config src/context src/kernel src/model src/policy src/state src/tool src/workflow src/wac src/cli
```

Expected: `src/` is empty except for possibly `src/types/` (which should also be removed since types will live in domain).

```bash
rm -rf src/types
```

- [ ] **Step 2: Create new directory tree**

```bash
mkdir -p src/domain/memory-object src/domain/memory-event src/domain/policies src/app/use-cases src/app/services src/ports src/adapters/fs src/adapters/sqlite src/adapters/cli/commands src/bootstrap src/config tests/unit tests/integration
```

Expected: `find src -type d` lists the directories above.

- [ ] **Step 3: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove orchestrator code and scaffold memory architecture"
```

---

## Task 2: Domain Types and Schemas

**Files:**

- Create: `src/domain/memory-types.ts`
- Create: `src/domain/schemas/memory-object-schema.ts`
- Create: `src/domain/schemas/memory-event-schema.ts`
- Create: `src/domain/policies/write-protocol.ts`

- [ ] **Step 1: Write failing test for MemoryObject schema**

Create `tests/unit/domain/memory-object-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MemoryObjectSchema } from '../../../src/domain/schemas/memory-object-schema.js';

describe('MemoryObjectSchema', () => {
  it('validates a minimal memory object', () => {
    const result = MemoryObjectSchema.safeParse({
      id: 'mem_20260629_router_reconnect_a8f3',
      type: 'lesson',
      title: 'Router reconnect failure mode',
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.82,
      created_at: '2026-06-29T14:00:00Z',
      updated_at: '2026-06-29T14:00:00Z',
      created_by: 'user:chekh',
      schema_version: 1,
      source: { kind: 'manual' },
      related: {},
      tags: ['router'],
      superseded_by: null,
      body: '# Router reconnect failure mode\n\nWe found...',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = MemoryObjectSchema.safeParse({
      id: 'mem_20260629_router_reconnect_a8f3',
      type: 'lesson',
    });
    expect(result.success).toBe(false);
  });
});
```

Run:

```bash
npx vitest run tests/unit/domain/memory-object-schema.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2: Implement memory types and schemas**

Create `src/domain/memory-types.ts`:

```typescript
export type MemoryType = 'document' | 'decision' | 'lesson' | 'observation' | 'session-summary' | 'open-question';

export type MemoryStatus = 'active' | 'superseded';
export type ReviewState = 'accepted' | 'proposed' | 'rejected';
export type Confidence = 'low' | 'medium' | 'high';
export type SourceKind = 'manual' | 'session' | 'file' | 'scan';

export const MEMORY_TYPES: MemoryType[] = [
  'document',
  'decision',
  'lesson',
  'observation',
  'session-summary',
  'open-question',
];
```

Create `src/domain/schemas/memory-object-schema.ts`:

```typescript
import { z } from 'zod';
import { MEMORY_TYPES } from '../memory-types.js';

export const MemoryObjectSchema = z.object({
  id: z.string().min(1),
  type: z.enum(MEMORY_TYPES as [string, ...string[]]),
  title: z.string().min(1),
  status: z.enum(['active', 'superseded']),
  review_state: z.enum(['accepted', 'proposed', 'rejected']),
  confidence: z.enum(['low', 'medium', 'high']),
  importance: z.number().min(0).max(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.string().min(1),
  schema_version: z.number().int().positive().default(1),
  source: z.object({
    kind: z.enum(['manual', 'session', 'file', 'scan']),
    path: z.string().optional(),
    session_id: z.string().optional(),
  }),
  related: z
    .object({
      files: z.array(z.string()).default([]),
      docs: z.array(z.string()).default([]),
      decisions: z.array(z.string()).default([]),
    })
    .default({}),
  tags: z.array(z.string()).default([]),
  superseded_by: z.string().nullable().default(null),
  body: z.string().default(''),
});

export type MemoryObject = z.infer<typeof MemoryObjectSchema>;
```

Run test:

```bash
npx vitest run tests/unit/domain/memory-object-schema.test.ts
```

Expected: PASS.

- [ ] **Step 3: Add memory event schema test and implementation**

Create `tests/unit/domain/memory-event-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MemoryEventSchema } from '../../../src/domain/schemas/memory-event-schema.js';

describe('MemoryEventSchema', () => {
  it('validates a memory.added event', () => {
    const result = MemoryEventSchema.safeParse({
      id: 'evt_20260629_120000_a8f3',
      type: 'memory.added',
      timestamp: '2026-06-29T12:00:00Z',
      actor: 'user:chekh',
      payload: { memory_id: 'mem_20260629_router_reconnect_a8f3' },
    });
    expect(result.success).toBe(true);
  });
});
```

Create `src/domain/schemas/memory-event-schema.ts`:

```typescript
import { z } from 'zod';

export const MemoryEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['memory.added', 'memory.updated', 'memory.superseded']),
  timestamp: z.string().datetime(),
  actor: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

export type MemoryEvent = z.infer<typeof MemoryEventSchema>;
```

Run:

```bash
npx vitest run tests/unit/domain/memory-event-schema.test.ts
```

Expected: PASS.

- [ ] **Step 4: Add write protocol validator**

Create `tests/unit/domain/write-protocol.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateMemoryObject } from '../../../src/domain/policies/write-protocol.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeObject(partial: Partial<MemoryObject> = {}): MemoryObject {
  return {
    id: 'mem_20260629_router_reconnect_a8f3',
    type: 'lesson',
    title: 'Router reconnect failure mode',
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.82,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:chekh',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: ['router'],
    superseded_by: null,
    body: 'We found that...',
    ...partial,
  };
}

describe('validateMemoryObject', () => {
  it('accepts a useful lesson', () => {
    const result = validateMemoryObject(makeObject());
    expect(result.valid).toBe(true);
  });

  it('warns about empty body', () => {
    const result = validateMemoryObject(makeObject({ body: '' }));
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain('Body is empty; memory may not be useful.');
  });
});
```

Create `src/domain/policies/write-protocol.ts`:

```typescript
import { MemoryObject } from '../schemas/memory-object-schema.js';

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateMemoryObject(obj: MemoryObject): ValidationResult {
  const warnings: string[] = [];

  if (!obj.body || obj.body.trim().length === 0) {
    warnings.push('Body is empty; memory may not be useful.');
  }

  if (
    obj.tags.length === 0 &&
    Object.keys(obj.related).every((k) => obj.related[k as keyof typeof obj.related].length === 0)
  ) {
    warnings.push('No tags or related links; memory may be hard to discover.');
  }

  const hasMeaningfulContent =
    obj.body.trim().length > 20 || obj.tags.length > 0 || Object.values(obj.related).some((arr) => arr.length > 0);

  if (!hasMeaningfulContent) {
    warnings.push('Memory object does not appear to contain useful context.');
  }

  return { valid: true, warnings };
}
```

Run:

```bash
npx vitest run tests/unit/domain/write-protocol.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit domain layer**

```bash
git add -A
git commit -m "feat(domain): add memory object, event schemas and write protocol"
```

---

## Task 3: Ports

**Files:**

- Create: `src/ports/memory-store.port.ts`
- Create: `src/ports/event-log.port.ts`
- Create: `src/ports/search-index.port.ts`
- Create: `src/ports/clock.port.ts`
- Create: `src/ports/id-generator.port.ts`

- [ ] **Step 1: Define ports**

Create `src/ports/memory-store.port.ts`:

```typescript
import { MemoryObject } from '../domain/schemas/memory-object-schema.js';

export interface MemoryStore {
  save(object: MemoryObject): Promise<void>;
  get(id: string): Promise<MemoryObject | null>;
  list(filters?: { type?: string; status?: string }): Promise<MemoryObject[]>;
  update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject>;
}
```

Create `src/ports/event-log.port.ts`:

```typescript
import { MemoryEvent } from '../domain/schemas/memory-event-schema.js';

export interface EventLog {
  append(event: MemoryEvent): Promise<void>;
  readAll(): Promise<MemoryEvent[]>;
}
```

Create `src/ports/search-index.port.ts`:

```typescript
import { MemoryObject } from '../domain/schemas/memory-object-schema.js';

export interface SearchResult {
  object: MemoryObject;
  score: number;
}

export interface SearchIndex {
  rebuild(objects: MemoryObject[]): Promise<void>;
  search(query: string, options?: { type?: string; includeSuperseded?: boolean }): Promise<SearchResult[]>;
}
```

Create `src/ports/clock.port.ts`:

```typescript
export interface Clock {
  now(): Date;
}
```

Create `src/ports/id-generator.port.ts`:

```typescript
export interface IdGenerator {
  generateMemoryId(date: Date, slug: string): string;
  generateEventId(date: Date): string;
}
```

- [ ] **Step 2: Commit ports**

```bash
git add -A
git commit -m "feat(ports): define memory store, event log, search index, clock and id generator ports"
```

---

## Task 4: Filesystem Adapters

**Files:**

- Create: `src/adapters/fs/markdown-memory-store.ts`
- Create: `src/adapters/fs/jsonl-event-log.ts`
- Create: `src/adapters/fs/system-clock.ts`
- Create: `src/adapters/fs/hash-id-generator.ts`
- Create: `src/adapters/fs/project-paths.ts`

- [ ] **Step 1: Write failing test for MarkdownMemoryStore**

Create `tests/unit/adapters/markdown-memory-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeObject(id: string, type = 'lesson'): MemoryObject {
  return {
    id,
    type: type as any,
    title: 'Test',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: [],
    superseded_by: null,
    body: 'Body text.',
  };
}

describe('MarkdownMemoryStore', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-memory-'));
    store = new MarkdownMemoryStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves and retrieves a memory object', async () => {
    const obj = makeObject('mem_20260629_test_a8f3');
    await store.save(obj);
    const loaded = await store.get('mem_20260629_test_a8f3');
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Test');
  });
});
```

Run:

```bash
npx vitest run tests/unit/adapters/markdown-memory-store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2: Implement MarkdownMemoryStore**

Create `src/adapters/fs/project-paths.ts`:

```typescript
import { join } from 'path';
import { MemoryType } from '../../domain/memory-types.js';

export function memoryDir(baseDir: string): string {
  return join(baseDir, '.wolf', 'memory');
}

export function objectsDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'objects');
}

export function objectDirForType(baseDir: string, type: MemoryType): string {
  const mapping: Record<MemoryType, string> = {
    decision: 'decisions',
    lesson: 'lessons',
    observation: 'observations',
    'session-summary': 'sessions',
    document: 'documents',
    'open-question': 'questions',
  };
  return join(objectsDir(baseDir), mapping[type]);
}

export function objectPath(baseDir: string, type: MemoryType, id: string): string {
  return join(objectDirForType(baseDir, type), `${id}.md`);
}

export function eventsPath(baseDir: string): string {
  return join(memoryDir(baseDir), 'events.jsonl');
}

export function cacheDir(baseDir: string): string {
  return join(baseDir, '.wolf', 'cache');
}

export function indexPath(baseDir: string): string {
  return join(cacheDir(baseDir), 'index.sqlite');
}

export function configPath(baseDir: string): string {
  return join(baseDir, '.wolf', 'config.yaml');
}
```

Create `src/adapters/fs/markdown-memory-store.ts`:

```typescript
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import { objectPath, objectsDir } from './project-paths.js';

export class MarkdownMemoryStore implements MemoryStore {
  constructor(private baseDir: string) {}

  async save(object: MemoryObject): Promise<void> {
    const path = objectPath(this.baseDir, object.type, object.id);
    mkdirSync(dirname(path), { recursive: true });
    const { body, ...frontmatter } = object;
    const content = `---\n${yaml.dump(frontmatter)}---\n\n${body}`;
    writeFileSync(path, content, 'utf-8');
  }

  async get(id: string): Promise<MemoryObject | null> {
    const candidates = this.findFiles(id);
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      const parsed = this.parseFile(path);
      if (parsed && parsed.id === id) return parsed;
    }
    return null;
  }

  async list(filters?: { type?: string; status?: string }): Promise<MemoryObject[]> {
    const root = objectsDir(this.baseDir);
    if (!existsSync(root)) return [];

    const results: MemoryObject[] = [];
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      const files = readdirSync(join(root, dir.name)).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const parsed = this.parseFile(join(root, dir.name, file));
        if (!parsed) continue;
        if (filters?.type && parsed.type !== filters.type) continue;
        if (filters?.status && parsed.status !== filters.status) continue;
        results.push(parsed);
      }
    }
    return results;
  }

  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Memory object not found: ${id}`);
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    await this.save(updated);
    return updated;
  }

  private findFiles(id: string): string[] {
    const root = objectsDir(this.baseDir);
    if (!existsSync(root)) return [];
    const files: string[] = [];
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      files.push(join(root, dir.name, `${id}.md`));
    }
    return files;
  }

  private parseFile(path: string): MemoryObject | null {
    try {
      const content = readFileSync(path, 'utf-8');
      const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
      if (!match) return null;
      const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
      const body = match[2] || '';
      return MemoryObjectSchema.parse({ ...frontmatter, body });
    } catch {
      return null;
    }
  }
}
```

Run test:

```bash
npx vitest run tests/unit/adapters/markdown-memory-store.test.ts
```

Expected: PASS.

- [ ] **Step 3: Implement JSONL event log**

Create `tests/unit/adapters/jsonl-event-log.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';

function makeEvent(id: string) {
  return {
    id,
    type: 'memory.added' as const,
    timestamp: '2026-06-29T12:00:00Z',
    actor: 'user:test',
    payload: { memory_id: 'mem_1' },
  };
}

describe('JsonlEventLog', () => {
  let dir: string;
  let log: JsonlEventLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-events-'));
    log = new JsonlEventLog(join(dir, 'events.jsonl'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends and reads events', async () => {
    await log.append(makeEvent('evt_1'));
    await log.append(makeEvent('evt_2'));
    const events = await log.readAll();
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt_1');
  });
});
```

Create `src/adapters/fs/jsonl-event-log.ts`:

```typescript
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { EventLog } from '../../ports/event-log.port.js';
import { MemoryEvent, MemoryEventSchema } from '../../domain/schemas/memory-event-schema.js';

export class JsonlEventLog implements EventLog {
  constructor(private path: string) {}

  async append(event: MemoryEvent): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    const validated = MemoryEventSchema.parse(event);
    appendFileSync(this.path, JSON.stringify(validated) + '\n', 'utf-8');
  }

  async readAll(): Promise<MemoryEvent[]> {
    if (!existsSync(this.path)) return [];
    const content = readFileSync(this.path, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    return lines.map((line) => MemoryEventSchema.parse(JSON.parse(line)));
  }
}
```

Run:

```bash
npx vitest run tests/unit/adapters/jsonl-event-log.test.ts
```

Expected: PASS.

- [ ] **Step 4: Implement clock and id generator**

Create `src/adapters/fs/system-clock.ts`:

```typescript
import { Clock } from '../../ports/clock.port.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
```

Create `src/adapters/fs/hash-id-generator.ts`:

```typescript
import { createHash } from 'crypto';
import { IdGenerator } from '../../ports/id-generator.port.js';

export class HashIdGenerator implements IdGenerator {
  generateMemoryId(date: Date, slug: string): string {
    const base = `${this.datePart(date)}_${this.slugify(slug)}`;
    const hash = this.shortHash(base + date.toISOString());
    return `mem_${base}_${hash}`;
  }

  generateEventId(date: Date): string {
    const hash = this.shortHash(date.toISOString() + Math.random().toString());
    return `evt_${this.datetimePart(date)}_${hash}`;
  }

  private datePart(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private datetimePart(date: Date): string {
    return date.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 40);
  }

  private shortHash(input: string): string {
    return createHash('sha256').update(input).digest('hex').substring(0, 6);
  }
}
```

Create `tests/unit/adapters/hash-id-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';

describe('HashIdGenerator', () => {
  it('generates stable memory id', () => {
    const gen = new HashIdGenerator();
    const date = new Date('2026-06-29T14:00:00Z');
    const id = gen.generateMemoryId(date, 'Router reconnect failure mode');
    expect(id).toMatch(/^mem_20260629_router_reconnect_failure_mode_[a-f0-9]{6}$/);
  });
});
```

Run:

```bash
npx vitest run tests/unit/adapters/hash-id-generator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit filesystem adapters**

```bash
git add -A
git commit -m "feat(adapters): add markdown memory store, jsonl event log, clock and id generator"
```

---

## Task 5: Use Cases

**Files:**

- Create: `src/app/use-cases/init-project-memory.ts`
- Create: `src/app/use-cases/add-memory-object.ts`
- Create: `src/app/use-cases/get-memory-object.ts`
- Create: `src/app/use-cases/list-memory-objects.ts`
- Create: `src/app/use-cases/supersede-memory-object.ts`

- [ ] **Step 1: Test and implement init-project-memory**

Create `tests/unit/use-cases/init-project-memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';

describe('initProjectMemory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-init-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates .wolf directories and config', async () => {
    await initProjectMemory(dir);
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'config.yaml'))).toBe(true);
  });
});
```

Create `src/app/use-cases/init-project-memory.ts`:

```typescript
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { memoryDir, objectsDir, cacheDir, configPath } from '../../adapters/fs/project-paths.js';

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
search:
  default_limit: 20
`;

export async function initProjectMemory(baseDir: string): Promise<void> {
  mkdirSync(memoryDir(baseDir), { recursive: true });
  mkdirSync(objectsDir(baseDir), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'decisions'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'lessons'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'observations'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'sessions'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'documents'), { recursive: true });
  mkdirSync(join(objectsDir(baseDir), 'questions'), { recursive: true });
  mkdirSync(join(memoryDir(baseDir), 'briefs'), { recursive: true });
  mkdirSync(cacheDir(baseDir), { recursive: true });
  writeFileSync(configPath(baseDir), DEFAULT_CONFIG, 'utf-8');
}
```

Run:

```bash
npx vitest run tests/unit/use-cases/init-project-memory.test.ts
```

Expected: PASS.

- [ ] **Step 2: Test and implement add-memory-object**

Create `tests/unit/use-cases/add-memory-object.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('addMemoryObject', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-add-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves a lesson and appends an event', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const result = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Router reconnect failure mode',
        body: 'We found...',
        createdBy: 'user:chekh',
        tags: ['router'],
      }
    );

    expect(result.object.id).toMatch(/^mem_/);
    const loaded = await store.get(result.object.id);
    expect(loaded).not.toBeNull();

    const events = await log.readAll();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('memory.added');
  });
});
```

Create `src/app/use-cases/add-memory-object.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { validateMemoryObject } from '../../domain/policies/write-protocol.js';

export interface AddMemoryObjectInput {
  type: MemoryObject['type'];
  title: string;
  body?: string;
  createdBy: string;
  tags?: string[];
  related?: MemoryObject['related'];
  confidence?: MemoryObject['confidence'];
  importance?: number;
  source?: MemoryObject['source'];
  reviewState?: MemoryObject['review_state'];
}

export interface AddMemoryObjectResult {
  object: MemoryObject;
  warnings: string[];
}

export async function addMemoryObject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  input: AddMemoryObjectInput
): Promise<AddMemoryObjectResult> {
  const now = deps.clock.now();
  const object: MemoryObject = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: input.type,
    title: input.title,
    body: input.body || '',
    status: 'active',
    review_state: input.reviewState ?? (input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted'),
    confidence: input.confidence ?? 'medium',
    importance: input.importance ?? 0.5,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: input.source ?? { kind: 'manual' },
    related: input.related ?? { files: [], docs: [], decisions: [] },
    tags: input.tags ?? [],
    superseded_by: null,
  };

  const validation = validateMemoryObject(object);
  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor: input.createdBy,
    payload: { memory_id: object.id, type: object.type },
  });

  return { object, warnings: validation.warnings };
}
```

Run:

```bash
npx vitest run tests/unit/use-cases/add-memory-object.test.ts
```

Expected: PASS.

- [ ] **Step 3: Test and implement get/list/supersede**

Create `src/app/use-cases/get-memory-object.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export async function getMemoryObject(store: MemoryStore, id: string): Promise<MemoryObject | null> {
  return store.get(id);
}
```

Create `src/app/use-cases/list-memory-objects.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export interface ListMemoryObjectsFilters {
  type?: string;
  status?: string;
}

export async function listMemoryObjects(
  store: MemoryStore,
  filters?: ListMemoryObjectsFilters
): Promise<MemoryObject[]> {
  return store.list(filters);
}
```

Create `src/app/use-cases/supersede-memory-object.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';

export async function supersedeMemoryObject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator },
  oldId: string,
  newId: string
): Promise<void> {
  const now = deps.clock.now();
  await deps.store.update(oldId, { status: 'superseded', superseded_by: newId });
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.superseded',
    timestamp: now.toISOString(),
    actor: 'system:wolf',
    payload: { old_id: oldId, new_id: newId },
  });
}
```

Create `tests/unit/use-cases/supersede-memory-object.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { supersedeMemoryObject } from '../../../src/app/use-cases/supersede-memory-object.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('supersedeMemoryObject', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-super-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('marks old object as superseded and logs event', async () => {
    const oldObj = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Old',
        createdBy: 'user:test',
      }
    );
    const newObj = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'New',
        createdBy: 'user:test',
      }
    );

    await supersedeMemoryObject({ store, log, clock, idGen }, oldObj.object.id, newObj.object.id);

    const loaded = await store.get(oldObj.object.id);
    expect(loaded?.status).toBe('superseded');
    expect(loaded?.superseded_by).toBe(newObj.object.id);

    const events = await log.readAll();
    expect(events.some((e) => e.type === 'memory.superseded')).toBe(true);
  });
});
```

Run:

```bash
npx vitest run tests/unit/use-cases/supersede-memory-object.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit use cases**

```bash
git add -A
git commit -m "feat(app): add init, add, get, list and supersede use cases"
```

---

## Task 6: CLI

**Files:**

- Create: `src/adapters/cli/cli-entry.ts`
- Create: `src/adapters/cli/commands/memory-init.ts`
- Create: `src/adapters/cli/commands/memory-add.ts`
- Create: `src/adapters/cli/commands/memory-list.ts`
- Create: `src/adapters/cli/commands/memory-get.ts`
- Modify: `package.json` bin entry if needed.

- [ ] **Step 1: Implement CLI commands**

Create `src/adapters/cli/commands/memory-init.ts`:

```typescript
import { Command } from 'commander';
import { initProjectMemory } from '../../../app/use-cases/init-project-memory.js';

export function memoryInitCommand(): Command {
  return new Command('init').description('Initialize Mr. Wolf memory for this project').action(async () => {
    await initProjectMemory(process.cwd());
    console.log('Project memory initialized.');
  });
}
```

Create `src/adapters/cli/commands/memory-add.ts`:

```typescript
import { Command } from 'commander';
import { addMemoryObject } from '../../../app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../fs/jsonl-event-log.js';
import { SystemClock } from '../../fs/system-clock.js';
import { HashIdGenerator } from '../../fs/hash-id-generator.js';
import { eventsPath } from '../../fs/project-paths.js';

export function memoryAddCommand(): Command {
  return new Command('add')
    .description('Add a memory object')
    .requiredOption('--type <type>', 'Memory type')
    .requiredOption('--title <title>', 'Title')
    .option('--body <body>', 'Body text')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const baseDir = process.cwd();
      const store = new MarkdownMemoryStore(baseDir);
      const log = new JsonlEventLog(eventsPath(baseDir));
      const result = await addMemoryObject(
        { store, log, clock: new SystemClock(), idGen: new HashIdGenerator() },
        {
          type: options.type,
          title: options.title,
          body: options.body,
          createdBy: options.createdBy,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
        }
      );
      console.log(`Created memory object: ${result.object.id}`);
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.warn(`Warning: ${warning}`);
        }
      }
    });
}
```

Create `src/adapters/cli/commands/memory-list.ts`:

```typescript
import { Command } from 'commander';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { MarkdownMemoryStore } from '../../fs/markdown-memory-store.js';

export function memoryListCommand(): Command {
  return new Command('list')
    .description('List memory objects')
    .option('--type <type>', 'Filter by type')
    .option('--status <status>', 'Filter by status', 'active')
    .action(async (options) => {
      const store = new MarkdownMemoryStore(process.cwd());
      const objects = await listMemoryObjects(store, { type: options.type, status: options.status });
      for (const obj of objects) {
        console.log(`${obj.id} [${obj.type}] ${obj.title}`);
      }
    });
}
```

Create `src/adapters/cli/commands/memory-get.ts`:

```typescript
import { Command } from 'commander';
import { getMemoryObject } from '../../../app/use-cases/get-memory-object.js';
import { MarkdownMemoryStore } from '../../fs/markdown-memory-store.js';

export function memoryGetCommand(): Command {
  return new Command('get')
    .description('Get a memory object by id')
    .argument('<id>', 'Memory object id')
    .action(async (id) => {
      const store = new MarkdownMemoryStore(process.cwd());
      const obj = await getMemoryObject(store, id);
      if (!obj) {
        console.error(`Memory object not found: ${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify(obj, null, 2));
    });
}
```

Create `src/adapters/cli/cli-entry.ts`:

```typescript
import { Command } from 'commander';
import { memoryInitCommand } from './commands/memory-init.js';
import { memoryAddCommand } from './commands/memory-add.js';
import { memoryListCommand } from './commands/memory-list.js';
import { memoryGetCommand } from './commands/memory-get.js';

export function createCli(): Command {
  const program = new Command('wolf');
  program.version('0.2.0');

  const memory = new Command('memory');
  memory.addCommand(memoryInitCommand());
  memory.addCommand(memoryAddCommand());
  memory.addCommand(memoryListCommand());
  memory.addCommand(memoryGetCommand());

  program.addCommand(memory);
  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createCli().parse();
}
```

- [ ] **Step 2: Add CLI entry point**

Create `src/bootstrap/cli.ts`:

```typescript
import { createCli } from '../adapters/cli/cli-entry.js';

createCli().parse();
```

Verify `package.json` has:

```json
"bin": {
  "wolf": "./dist/bootstrap/cli.js"
}
```

If not, modify it.

- [ ] **Step 3: Build and smoke-test CLI**

```bash
npm run build
node dist/bootstrap/cli.js memory init
node dist/bootstrap/cli.js memory add --type lesson --title "Test lesson" --body "Test body" --tags test
node dist/bootstrap/cli.js memory list
node dist/bootstrap/cli.js memory get <id-from-list>
```

Expected: commands work and produce files in `.wolf/memory/`.

- [ ] **Step 4: Commit CLI**

```bash
git add -A
git commit -m "feat(cli): add memory init, add, list and get commands"
```

---

## Task 7: SQLite Search Index

**Files:**

- Create: `src/adapters/sqlite/sqlite-schema.ts`
- Create: `src/adapters/sqlite/sqlite-search-index.ts`

- [ ] **Step 1: Test SQLite search index**

Create `tests/unit/adapters/sqlite-search-index.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeObject(id: string, title: string, body: string): MemoryObject {
  return {
    id,
    type: 'lesson',
    title,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: ['router'],
    superseded_by: null,
    body,
  };
}

describe('SQLiteSearchIndex', () => {
  let dir: string;
  let index: SQLiteSearchIndex;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-idx-'));
    index = new SQLiteSearchIndex(join(dir, 'index.sqlite'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds object by body text', async () => {
    await index.rebuild([
      makeObject('mem_1', 'Router', 'reconnect failure mode'),
      makeObject('mem_2', 'Auth', 'token rotation'),
    ]);
    const results = await index.search('reconnect');
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe('mem_1');
  });
});
```

Run:

```bash
npx vitest run tests/unit/adapters/sqlite-search-index.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2: Implement SQLite search index**

Create `src/adapters/sqlite/sqlite-schema.ts`:

```typescript
export const SQLITE_SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(
    memory_id,
    type,
    title,
    body,
    tags,
    status,
    review_state
  );

  CREATE TABLE IF NOT EXISTS memory_meta (
    memory_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    review_state TEXT NOT NULL,
    importance REAL NOT NULL,
    created_at TEXT NOT NULL
  );
`;
```

Create `src/adapters/sqlite/sqlite-search-index.ts`:

```typescript
import Database from 'better-sqlite3';
import { SearchIndex, SearchResult } from '../../ports/search-index.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { SQLITE_SCHEMA } from './sqlite-schema.js';

export class SQLiteSearchIndex implements SearchIndex {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(SQLITE_SCHEMA);
  }

  async rebuild(objects: MemoryObject[]): Promise<void> {
    this.db.exec('DELETE FROM memory_search; DELETE FROM memory_meta;');

    const insertSearch = this.db.prepare(
      'INSERT INTO memory_search (memory_id, type, title, body, tags, status, review_state) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertMeta = this.db.prepare(
      'INSERT INTO memory_meta (memory_id, type, status, review_state, importance, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const rebuild = this.db.transaction(() => {
      for (const obj of objects) {
        insertSearch.run(obj.id, obj.type, obj.title, obj.body, obj.tags.join(','), obj.status, obj.review_state);
        insertMeta.run(obj.id, obj.type, obj.status, obj.review_state, obj.importance, obj.created_at);
      }
    });

    rebuild();
  }

  async search(query: string, options?: { type?: string; includeSuperseded?: boolean }): Promise<SearchResult[]> {
    let sql = `
      SELECT s.memory_id, s.type, s.title, s.body, s.tags, s.status, s.review_state,
             rank, m.importance, m.created_at
      FROM memory_search s
      JOIN memory_meta m ON s.memory_id = m.memory_id
      WHERE memory_search MATCH ?
    `;
    const params: (string | number)[] = [query];

    if (!options?.includeSuperseded) {
      sql += ` AND s.status = 'active'`;
    }
    if (options?.type) {
      sql += ` AND s.type = ?`;
      params.push(options.type);
    }

    sql += ` ORDER BY rank`;

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => ({
      object: {
        id: row.memory_id,
        type: row.type,
        title: row.title,
        body: row.body,
        status: row.status,
        review_state: row.review_state,
        confidence: 'medium',
        importance: row.importance,
        created_at: row.created_at,
        updated_at: row.created_at,
        created_by: 'unknown',
        schema_version: 1,
        source: { kind: 'manual' },
        related: { files: [], docs: [], decisions: [] },
        tags: row.tags ? row.tags.split(',') : [],
        superseded_by: null,
      },
      score: row.rank,
    }));
  }
}
```

Run:

```bash
npx vitest run tests/unit/adapters/sqlite-search-index.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit search index**

```bash
git add -A
git commit -m "feat(search): add SQLite FTS5 search index adapter"
```

---

## Task 8: Search Use Case and CLI

**Files:**

- Create: `src/app/use-cases/search-memory.ts`
- Create: `src/app/use-cases/rebuild-memory-index.ts`
- Create: `src/adapters/cli/commands/memory-search.ts`
- Create: `src/adapters/cli/commands/memory-rebuild-index.ts`

- [ ] **Step 1: Test search-memory use case**

Create `tests/unit/use-cases/search-memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { searchMemory } from '../../../src/app/use-cases/search-memory.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath, indexPath } from '../../../src/adapters/fs/project-paths.js';

describe('searchMemory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-search-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns objects matching query', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const index = new SQLiteSearchIndex(indexPath(dir));

    await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Router reconnect failure mode',
        body: 'We found that reconnect fails when...',
        createdBy: 'user:test',
        tags: ['router'],
      }
    );

    await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Auth token rotation',
        body: 'Tokens rotate every hour.',
        createdBy: 'user:test',
      }
    );

    const results = await searchMemory({ store, index }, 'reconnect');
    expect(results).toHaveLength(1);
    expect(results[0].object.title).toBe('Router reconnect failure mode');
  });
});
```

Run:

```bash
npx vitest run tests/unit/use-cases/search-memory.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Implement search and rebuild use cases**

Create `src/app/use-cases/rebuild-memory-index.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';

export async function rebuildMemoryIndex(deps: { store: MemoryStore; index: SearchIndex }): Promise<void> {
  const objects = await deps.store.list();
  await deps.index.rebuild(objects);
}
```

Create `src/app/use-cases/search-memory.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex, SearchResult } from '../../ports/search-index.port.js';

export interface SearchMemoryInput {
  query: string;
  type?: string;
  includeSuperseded?: boolean;
}

export async function searchMemory(
  deps: { store: MemoryStore; index: SearchIndex },
  input: SearchMemoryInput
): Promise<SearchResult[]> {
  return deps.index.search(input.query, {
    type: input.type,
    includeSuperseded: input.includeSuperseded,
  });
}
```

Run:

```bash
npx vitest run tests/unit/use-cases/search-memory.test.ts
```

Expected: PASS.

- [ ] **Step 3: Add search and rebuild-index CLI commands**

Create `src/adapters/cli/commands/memory-search.ts`:

```typescript
import { Command } from 'commander';
import { searchMemory } from '../../../app/use-cases/search-memory.js';
import { MarkdownMemoryStore } from '../../fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../sqlite/sqlite-search-index.js';
import { indexPath } from '../../fs/project-paths.js';

export function memorySearchCommand(): Command {
  return new Command('search')
    .description('Search memory objects')
    .argument('<query>', 'Search query')
    .option('--type <type>', 'Filter by type')
    .option('--include-superseded', 'Include superseded objects', false)
    .action(async (query, options) => {
      const baseDir = process.cwd();
      const store = new MarkdownMemoryStore(baseDir);
      const index = new SQLiteSearchIndex(indexPath(baseDir));
      const results = await searchMemory(
        { store, index },
        {
          query,
          type: options.type,
          includeSuperseded: options.includeSuperseded,
        }
      );
      for (const result of results) {
        console.log(`${result.object.id} [${result.object.type}] ${result.object.title}`);
      }
    });
}
```

Create `src/adapters/cli/commands/memory-rebuild-index.ts`:

```typescript
import { Command } from 'commander';
import { rebuildMemoryIndex } from '../../../app/use-cases/rebuild-memory-index.js';
import { MarkdownMemoryStore } from '../../fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../sqlite/sqlite-search-index.js';
import { indexPath } from '../../fs/project-paths.js';

export function memoryRebuildIndexCommand(): Command {
  return new Command('rebuild-index')
    .description('Rebuild the SQLite search index from memory objects')
    .action(async () => {
      const baseDir = process.cwd();
      const store = new MarkdownMemoryStore(baseDir);
      const index = new SQLiteSearchIndex(indexPath(baseDir));
      await rebuildMemoryIndex({ store, index });
      console.log('Index rebuilt.');
    });
}
```

Update `src/adapters/cli/cli-entry.ts` to register them:

```typescript
import { Command } from 'commander';
import { memoryInitCommand } from './commands/memory-init.js';
import { memoryAddCommand } from './commands/memory-add.js';
import { memoryListCommand } from './commands/memory-list.js';
import { memoryGetCommand } from './commands/memory-get.js';
import { memorySearchCommand } from './commands/memory-search.js';
import { memoryRebuildIndexCommand } from './commands/memory-rebuild-index.js';

export function createCli(): Command {
  const program = new Command('wolf');
  program.version('0.2.0');

  const memory = new Command('memory');
  memory.addCommand(memoryInitCommand());
  memory.addCommand(memoryAddCommand());
  memory.addCommand(memoryListCommand());
  memory.addCommand(memoryGetCommand());
  memory.addCommand(memorySearchCommand());
  memory.addCommand(memoryRebuildIndexCommand());

  program.addCommand(memory);
  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createCli().parse();
}
```

- [ ] **Step 4: Smoke test search CLI**

```bash
npm run build
node dist/bootstrap/cli.js memory init
node dist/bootstrap/cli.js memory add --type lesson --title "Router reconnect" --body "Reconnect fails under load" --tags router
node dist/bootstrap/cli.js memory rebuild-index
node dist/bootstrap/cli.js memory search "reconnect"
```

Expected: search returns the created object.

- [ ] **Step 5: Commit search integration**

```bash
git add -A
git commit -m "feat(search): add search and rebuild-index use cases and CLI commands"
```

---

## Task 9: Integration Tests

**Files:**

- Create: `tests/integration/memory-workflow.test.ts`

- [ ] **Step 1: Write end-to-end test**

Create `tests/integration/memory-workflow.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../src/app/use-cases/init-project-memory.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { searchMemory } from '../../src/app/use-cases/search-memory.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { rebuildMemoryIndex } from '../../src/app/use-cases/rebuild-memory-index.js';
import { eventsPath, indexPath } from '../../src/adapters/fs/project-paths.js';

describe('Memory workflow', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-e2e-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('initializes, adds a lesson, rebuilds index, and searches', async () => {
    await initProjectMemory(dir);
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects'))).toBe(true);

    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const { object } = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'lesson',
        title: 'Avoid mutable shared state',
        body: 'Shared mutable state caused the router bug.',
        createdBy: 'user:test',
        tags: ['architecture'],
      }
    );

    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'lessons', `${object.id}.md`))).toBe(true);

    const index = new SQLiteSearchIndex(indexPath(dir));
    await rebuildMemoryIndex({ store, index });

    const results = await searchMemory({ store, index }, { query: 'mutable shared state' });
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe(object.id);

    const eventLog = readFileSync(eventsPath(dir), 'utf-8');
    expect(eventLog).toContain('memory.added');
  });
});
```

Run:

```bash
npx vitest run tests/integration/memory-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit integration tests**

```bash
git add -A
git commit -m "test(integration): add end-to-end memory workflow test"
```

---

## Task 10: Final Checks and Documentation

**Files:**

- Modify: `README.md`
- Modify: `package.json` (description, scripts if needed)
- Create: `docs/concept-v3.md`

- [ ] **Step 1: Update README**

Replace the top of `README.md` with:

````markdown
# Mr. Wolf

> **"I solve problems."**
>
> Local-first Project Semantic Memory layer for AI coding agents.
>
> Not another agent. A memory substrate for agents.

## Status

Pivot in progress. MVP-A (Core Memory + Search) is being implemented.

## Quick Start

```bash
npm install
npm run build
node dist/bootstrap/cli.js memory init
node dist/bootstrap/cli.js memory add --type lesson --title "First lesson" --body "What we learned"
node dist/bootstrap/cli.js memory rebuild-index
node dist/bootstrap/cli.js memory search "lesson"
```
````

````

Remove obsolete sections about workflow engine, runners, gates, policy, agents, model providers. Keep only installation, development commands, and license.

- [ ] **Step 2: Update package.json description**

Change `"description"` to:

```json
"description": "Mr. Wolf — local-first Project Semantic Memory layer for AI coding agents"
````

- [ ] **Step 3: Archive old docs**

Move obsolete docs into archive:

```bash
mkdir -p docs/archive docs/superpowers/archive
mv docs/concept-v2.md docs/concept-v2-summary.md docs/concept-v2-open-questions.md docs/archive/
mv docs/getting-started.md docs/workflow-syntax.md docs/cli-reference.md docs/development.md docs/archive/
mv docs/superpowers/specs/2026-04-28-mr-wolf-framework-design.md docs/superpowers/specs/2026-04-28-mvp1a-technical-spec.md docs/superpowers/specs/2026-04-28-mvp1b-technical-spec.md docs/superpowers/specs/2026-04-29-mvp1c-technical-spec.md docs/superpowers/specs/2026-04-29-mvp2-technical-spec.md docs/superpowers/specs/2026-04-29-mvp3-technical-spec.md docs/superpowers/specs/2026-04-30-mvp4-technical-spec.md docs/superpowers/specs/2026-04-30-mvp6-technical-spec.md docs/superpowers/specs/2026-05-01-mvp5-technical-spec.md docs/superpowers/specs/2026-05-01-mvp7-technical-spec.md docs/superpowers/archive/
```

- [ ] **Step 4: Run all checks**

```bash
npm run check
```

Expected: format check, type check, tests, and build all pass.

- [ ] **Step 5: Commit final documentation**

```bash
git add -A
git commit -m "docs: rewrite README for Project Semantic Memory pivot and archive obsolete docs"
```

---

## Self-Review Checklist

- [ ] Spec coverage: every requirement in the design spec maps to at least one task.
- [ ] Placeholder scan: no TBD, TODO, or vague steps remain.
- [ ] Type consistency: `MemoryObject`, `MemoryEvent`, ports, and use-case signatures match across tasks.
- [ ] CLI commands tested manually in a temp directory.
- [ ] All tests pass with `npm run test:run`.
- [ ] `npm run check` passes.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-project-semantic-memory-mvp-a.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
