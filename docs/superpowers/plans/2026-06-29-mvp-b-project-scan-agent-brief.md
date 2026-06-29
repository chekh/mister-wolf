# MVP-B — Project Scan + Agent Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `wolf memory scan` and `wolf memory brief` commands that capture a project snapshot as a memory object and generate an agent brief as a derived artifact.

**Architecture:** Introduce a `context` memory type for factual scan snapshots, add `FileSystem` and `ProjectScanner` ports with an FS-backed heuristic scanner, and implement two thin use-cases (`scan-project`, `generate-agent-brief`) wired into the existing CLI. The agent brief is written to `.wolf/memory/briefs/agent-brief-latest.md` and is not indexed as a memory object.

**Tech Stack:** TypeScript 5, Node 20, Vitest, Commander, Zod, js-yaml, better-sqlite3.

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/domain/memory-types.ts` | Add `context` to `MEMORY_TYPES`. |
| `src/domain/schemas/project-scan-schema.ts` | Zod schema and TypeScript types for `ProjectSnapshot`. |
| `src/ports/file-system.port.ts` | Outbound contract for FS reads. |
| `src/ports/project-scanner.port.ts` | Outbound contract for project scanning. |
| `src/adapters/fs/fs-file-system.ts` | Node.js `fs/promises` implementation of `FileSystem`. |
| `src/adapters/fs/heuristic-project-scanner.ts` | Builds `ProjectSnapshot` from FS metadata and allowlisted files. |
| `src/adapters/fs/project-paths.ts` | Adds `briefsDir()` and `contextDir()` helpers. |
| `src/adapters/fs/fs-project-initializer.ts` | Creates `objects/context/` on `init`. |
| `src/app/use-cases/scan-project.ts` | Orchestrates scanning and saving `project-scan-latest`. |
| `src/app/use-cases/generate-agent-brief.ts` | Assembles `agent-brief-latest.md` from scan + memory. |
| `src/adapters/cli/commands/memory-scan.ts` | CLI command for `memory scan`. |
| `src/adapters/cli/commands/memory-brief.ts` | CLI command for `memory brief`. |
| `src/adapters/cli/cli-entry.ts` | Registers new commands. |
| `src/bootstrap/container.ts` | Wires new adapters. |
| `tests/unit/adapters/heuristic-project-scanner.test.ts` | Scanner unit tests. |
| `tests/unit/use-cases/scan-project.test.ts` | Scan use-case unit tests. |
| `tests/unit/use-cases/generate-agent-brief.test.ts` | Brief use-case unit tests. |
| `tests/integration/mvp-b-workflow.test.ts` | End-to-end `scan` + `brief` integration test. |
| `AGENTS.md`, `README.md`, `docs/concept-v3.md` | Documentation updates. |

---

## Task 1: Add `context` memory type and project paths

**Files:**
- Modify: `src/domain/memory-types.ts:1-8`
- Modify: `src/adapters/fs/project-paths.ts:12-25`
- Modify: `src/adapters/fs/fs-project-initializer.ts:6-33`
- Test: `tests/unit/adapters/project-paths.test.ts`

- [ ] **Step 1: Add `context` to memory types**

```typescript
export const MEMORY_TYPES = [
  'document',
  'decision',
  'lesson',
  'observation',
  'session-summary',
  'open-question',
  'context',
] as const;
```

- [ ] **Step 2: Update type-to-directory mapping**

```typescript
const mapping: Record<MemoryType, string> = {
  decision: 'decisions',
  lesson: 'lessons',
  observation: 'observations',
  'session-summary': 'sessions',
  document: 'documents',
  'open-question': 'questions',
  context: 'context',
};
```

- [ ] **Step 3: Add briefs dir helper to project-paths.ts**

```typescript
export function briefsDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'briefs');
}
```

- [ ] **Step 4: Update initializer to create `objects/context/` and ensure briefs dir**

```typescript
await fs.mkdir(join(objectsDir(baseDir), 'context'), { recursive: true });
```

- [ ] **Step 5: Update `DEFAULT_CONFIG` to include `context` in type list**

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
```

- [ ] **Step 6: Run existing project-paths and initializer tests to ensure no regressions**

Run: `npm run test:run -- tests/unit/adapters/project-paths.test.ts tests/unit/use-cases/init-project-memory.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain/memory-types.ts src/adapters/fs/project-paths.ts src/adapters/fs/fs-project-initializer.ts tests/unit/adapters/project-paths.test.ts
git commit -m "feat(domain): add context memory type and briefs directory"
```

---

## Task 2: Define `ProjectSnapshot` schema and ports

**Files:**
- Create: `src/domain/schemas/project-scan-schema.ts`
- Create: `src/ports/file-system.port.ts`
- Create: `src/ports/project-scanner.port.ts`
- Test: `tests/unit/domain/project-scan-schema.test.ts`

- [ ] **Step 1: Create `ProjectSnapshot` Zod schema**

```typescript
import { z } from 'zod';

export const ProjectSnapshotSchema = z.object({
  projectName: z.string(),
  root: z.string(),
  branch: z.string().optional(),
  commit: z.string().optional(),
  generatedAt: z.string().datetime(),
  summary: z.object({
    languages: z.array(z.string()),
    entryPoints: z.array(z.string()),
    configFiles: z.array(z.string()),
    dependencies: z.array(z.string()),
    topLevelDirectories: z.array(z.string()),
    fileCount: z.number().int().nonnegative(),
  }),
  files: z.array(
    z.object({
      path: z.string(),
      extension: z.string().optional(),
      size: z.number().int().nonnegative(),
    })
  ),
});

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;
```

- [ ] **Step 2: Create `FileSystem` port**

```typescript
export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface FileSystem {
  listDirectory(path: string): Promise<DirectoryEntry[]>;
  readSmallTextFile(path: string): Promise<string | null>;
  isDirectory(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}
```

- [ ] **Step 3: Create `ProjectScanner` port**

```typescript
import { ProjectSnapshot } from '../domain/schemas/project-scan-schema.js';

export interface ProjectScanner {
  scan(root: string): Promise<ProjectSnapshot>;
}
```

- [ ] **Step 4: Write schema validation test**

```typescript
import { describe, it, expect } from 'vitest';
import { ProjectSnapshotSchema } from '../../../src/domain/schemas/project-scan-schema.js';

describe('ProjectSnapshotSchema', () => {
  it('accepts a valid snapshot', () => {
    const result = ProjectSnapshotSchema.safeParse({
      projectName: 'test',
      root: '.',
      generatedAt: '2026-06-29T14:00:00Z',
      summary: {
        languages: ['typescript'],
        entryPoints: ['src/index.ts'],
        configFiles: ['package.json'],
        dependencies: ['zod'],
        topLevelDirectories: ['src'],
        fileCount: 1,
      },
      files: [{ path: 'src/index.ts', extension: 'ts', size: 42 }],
    });
    expect(result.success).toBe(true);
  });
});
```

Run: `npm run test:run -- tests/unit/domain/project-scan-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/schemas/project-scan-schema.ts src/ports/file-system.port.ts src/ports/project-scanner.port.ts tests/unit/domain/project-scan-schema.test.ts
git commit -m "feat(ports): add FileSystem and ProjectScanner ports with snapshot schema"
```

---

## Task 3: Implement FS adapter

**Files:**
- Create: `src/adapters/fs/fs-file-system.ts`
- Test: `tests/unit/adapters/fs-file-system.test.ts`

- [ ] **Step 1: Implement `FsFileSystem`**

```typescript
import * as fs from 'fs/promises';
import { dirname } from 'path';
import { FileSystem, DirectoryEntry } from '../../ports/file-system.port.js';

const MAX_SMALL_FILE_BYTES = 1024 * 1024;

export class FsFileSystem implements FileSystem {
  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry) => {
        const fullPath = `${path}/${entry.name}`;
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
        };
      })
    );
  }

  async readSmallTextFile(path: string): Promise<string | null> {
    try {
      const stats = await fs.stat(path);
      if (!stats.isFile() || stats.size > MAX_SMALL_FILE_BYTES) return null;
      return await fs.readFile(path, 'utf-8');
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch (err) {
      if (isEnoent(err)) return false;
      throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'ENOENT';
}
```

- [ ] **Step 2: Write FS adapter test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';

describe('FsFileSystem', () => {
  let dir: string;
  let fs: FsFileSystem;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-fs-'));
    fs = new FsFileSystem();
    writeFileSync(join(dir, 'small.txt'), 'hello', 'utf-8');
    mkdirSync(join(dir, 'nested'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists directory entries', async () => {
    const entries = await fs.listDirectory(dir);
    expect(entries.map((e) => e.name).sort()).toEqual(['nested', 'small.txt']);
  });

  it('reads small text files', async () => {
    const content = await fs.readSmallTextFile(join(dir, 'small.txt'));
    expect(content).toBe('hello');
  });

  it('returns null for missing files', async () => {
    const content = await fs.readSmallTextFile(join(dir, 'missing.txt'));
    expect(content).toBeNull();
  });
});
```

Run: `npm run test:run -- tests/unit/adapters/fs-file-system.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/adapters/fs/fs-file-system.ts tests/unit/adapters/fs-file-system.test.ts
git commit -m "feat(adapters): implement FsFileSystem adapter"
```

---

## Task 4: Implement heuristic project scanner

**Files:**
- Create: `src/adapters/fs/heuristic-project-scanner.ts`
- Test: `tests/unit/adapters/heuristic-project-scanner.test.ts`

- [ ] **Step 1: Implement `HeuristicProjectScanner`**

```typescript
import { dirname, join, relative, extname, basename } from 'path';
import { FileSystem } from '../../ports/file-system.port.js';
import { ProjectScanner } from '../../ports/project-scanner.port.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.coverage',
  '.wolf',
  '.codegraph',
  '.worktrees',
]);

const METADATA_FILES = new Set([
  'README.md',
  'package.json',
  'tsconfig.json',
  'vitest.config.ts',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
]);

const CONFIG_FILE_NAMES = new Set([
  'package.json',
  'tsconfig.json',
  'vitest.config.ts',
  'vite.config.ts',
  'jest.config.js',
  'jest.config.ts',
  'tailwind.config.js',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  '.prettierrc',
  '.eslintrc',
]);

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp',
  'mp3', 'mp4', 'wav', 'avi', 'mov',
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'zip', 'tar', 'gz', 'rar', '7z',
  'exe', 'dll', 'so', 'dylib',
  'sqlite', 'db', 'wasm',
]);

const MAX_FILE_BYTES = 1024 * 1024;

export class HeuristicProjectScanner implements ProjectScanner {
  constructor(private fs: FileSystem) {}

  async scan(root: string): Promise<ProjectSnapshot> {
  const files: ProjectSnapshot['files'] = [];
  const languages = new Set<string>();
  const configFiles = new Set<string>();
  const topLevelDirectories = new Set<string>();
  const counters = { fileCount: 0 };

  await this.walk(root, root, files, languages, configFiles, topLevelDirectories, counters);

  const packageJson = await this.readPackageJson(root);
  const entryPoints = this.detectEntryPoints(root, packageJson, files);
  const dependencies = this.extractDependencies(packageJson);
  const projectName = packageJson?.name ?? basename(root);

  return {
    projectName,
    root: '.',
    branch: await this.currentBranch(root),
    commit: await this.currentCommit(root),
    generatedAt: new Date().toISOString(),
    summary: {
      languages: [...languages].sort(),
      entryPoints: entryPoints.sort(),
      configFiles: [...configFiles].sort(),
      dependencies: dependencies.sort(),
      topLevelDirectories: [...topLevelDirectories].sort(),
      fileCount: counters.fileCount,
    },
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

private async walk(
  root: string,
  current: string,
  files: ProjectSnapshot['files'],
  languages: Set<string>,
  configFiles: Set<string>,
  topLevelDirectories: Set<string>,
  counters: { fileCount: number }
): Promise<void> {
    const entries = await this.fs.listDirectory(current);
    for (const entry of entries) {
      const rel = relative(root, entry.path);
      const depth = rel.split('/').length;

      if (entry.isDirectory) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (depth === 1) topLevelDirectories.add(entry.name);
        await this.walk(root, entry.path, files, languages, configFiles, topLevelDirectories, counters);
      } else {
        if (entry.size > MAX_FILE_BYTES) continue;
        const ext = extname(entry.name).slice(1).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        files.push({ path: rel, extension: ext || undefined, size: entry.size });
        counters.fileCount++;
        if (ext) languages.add(ext);
        if (CONFIG_FILE_NAMES.has(entry.name)) configFiles.add(rel);
      }
    }
  }

  private async readPackageJson(root: string): Promise<Record<string, unknown> | null> {
    const raw = await this.fs.readSmallTextFile(join(root, 'package.json'));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private detectEntryPoints(
    root: string,
    packageJson: Record<string, unknown> | null,
    files: ProjectSnapshot['files']
  ): string[] {
    const entries: string[] = [];
    if (packageJson) {
      if (typeof packageJson.main === 'string') entries.push(packageJson.main);
      const bin = packageJson.bin;
      if (typeof bin === 'string') entries.push(bin);
      if (typeof bin === 'object' && bin !== null) {
        for (const value of Object.values(bin)) {
          if (typeof value === 'string') entries.push(value);
        }
      }
    }
    const candidates = ['src/index.ts', 'src/index.js', 'src/bootstrap/cli.ts', 'src/bootstrap/cli.js'];
    for (const candidate of candidates) {
      if (files.some((f) => f.path === candidate)) entries.push(candidate);
    }
    return [...new Set(entries)];
  }

  private extractDependencies(packageJson: Record<string, unknown> | null): string[] {
    if (!packageJson) return [];
    const deps = [
      ...(Object.keys((packageJson.dependencies as Record<string, unknown>) ?? {})),
      ...(Object.keys((packageJson.devDependencies as Record<string, unknown>) ?? {})),
    ];
    return [...new Set(deps)];
  }

  private async currentBranch(root: string): Promise<string | undefined> {
    const head = await this.fs.readSmallTextFile(join(root, '.git', 'HEAD'));
    if (!head) return undefined;
    const refMatch = head.match(/ref: refs\/heads\/(\S+)/);
    return refMatch?.[1];
  }

  private async currentCommit(root: string): Promise<string | undefined> {
    const head = await this.fs.readSmallTextFile(join(root, '.git', 'HEAD'));
    if (!head) return undefined;
    const refMatch = head.match(/ref: (\S+)/);
    if (refMatch) {
      const commit = await this.fs.readSmallTextFile(join(root, '.git', refMatch[1]));
      return commit?.trim() ?? undefined;
    }
    return head.trim();
  }
}
```

Note: `fileCount` is incremented inside `walk` and must be captured; refactor to use a mutable counter object if closure scope becomes awkward.

- [ ] **Step 2: Write scanner unit test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';

describe('HeuristicProjectScanner', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-scan-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ignores node_modules and returns sorted metadata', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'node_modules', 'foo'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test-proj', dependencies: { zod: '^3' } }), 'utf-8');
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}', 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# Test', 'utf-8');

    const scanner = new HeuristicProjectScanner(new FsFileSystem());
    const snapshot = await scanner.scan(dir);

    expect(snapshot.projectName).toBe('test-proj');
    expect(snapshot.summary.languages).toContain('ts');
    expect(snapshot.summary.dependencies).toContain('zod');
    expect(snapshot.files.map((f) => f.path)).not.toContain(expect.stringContaining('node_modules'));
    expect(snapshot.files).toEqual(snapshot.files.slice().sort((a, b) => a.path.localeCompare(b.path)));
  });
});
```

Run: `npm run test:run -- tests/unit/adapters/heuristic-project-scanner.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/adapters/fs/heuristic-project-scanner.ts tests/unit/adapters/heuristic-project-scanner.test.ts
git commit -m "feat(adapters): implement heuristic project scanner"
```

---

## Task 5: Implement `scan-project` use-case

**Files:**
- Create: `src/app/use-cases/scan-project.ts`
- Test: `tests/unit/use-cases/scan-project.test.ts`

- [ ] **Step 1: Write failing test for `scan-project`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanProject } from '../../../src/app/use-cases/scan-project.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('scanProject', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-scan-case-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'scan-test' }), 'utf-8');
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}', 'utf-8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves a context object with id project-scan-latest', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const scanner = new HeuristicProjectScanner(new FsFileSystem());

    await scanProject({ store, log, clock, idGen, scanner }, dir);

    const saved = await store.get('project-scan-latest');
    expect(saved).not.toBeNull();
    expect(saved?.type).toBe('context');
    expect(saved?.review_state).toBe('accepted');
    expect(saved?.body).toContain('## Repository');

    const events = await log.readAll();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
```

Run: `npm run test:run -- tests/unit/use-cases/scan-project.test.ts`
Expected: FAIL — `scanProject` not found.

- [ ] **Step 2: Implement `scan-project.ts`**

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { ProjectScanner } from '../../ports/project-scanner.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';

export interface ScanProjectResult {
  object: MemoryObject;
  snapshot: ProjectSnapshot;
}

export async function scanProject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; scanner: ProjectScanner },
  root: string
): Promise<ScanProjectResult> {
  const snapshot = await deps.scanner.scan(root);
  const now = deps.clock.now();
  const object: MemoryObject = {
    id: 'project-scan-latest',
    type: 'context',
    title: `Project scan for ${snapshot.projectName}`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.7,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: 'agent:mr-wolf',
    schema_version: 1,
    source: { kind: 'scan', path: snapshot.root },
    related: { files: [], docs: [], decisions: [] },
    tags: ['scan'],
    superseded_by: null,
    body: renderScanBody(snapshot),
  };

  await deps.store.save(object);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor: object.created_by,
    payload: { memory_id: object.id, type: object.type },
  });

  return { object, snapshot };
}

function renderScanBody(snapshot: ProjectSnapshot): string {
  const lines: string[] = [
    `# Project Scan: ${snapshot.projectName}`,
    '',
    '## Repository',
    `- Root: ${snapshot.root}`,
    `- Project name: ${snapshot.projectName}`,
  ];
  if (snapshot.branch) lines.push(`- Branch: ${snapshot.branch}`);
  if (snapshot.commit) lines.push(`- Commit: ${snapshot.commit}`);
  lines.push(
    '',
    '## Summary',
    `- Languages: ${snapshot.summary.languages.join(', ') || 'none'}`,
    `- Entry points: ${snapshot.summary.entryPoints.join(', ') || 'none'}`,
    `- Config files: ${snapshot.summary.configFiles.join(', ') || 'none'}`,
    `- Dependencies: ${snapshot.summary.dependencies.join(', ') || 'none'}`,
    `- Top-level directories: ${snapshot.summary.topLevelDirectories.join(', ') || 'none'}`,
    `- File count: ${snapshot.summary.fileCount}`,
    '',
    '## Files',
    '| Path | Extension | Size (bytes) |',
    '|------|-----------|--------------|'
  );
  for (const file of snapshot.files) {
    lines.push(`| ${file.path} | ${file.extension ?? ''} | ${file.size} |`);
  }
  return lines.join('\n');
}
```

Note: import `ProjectSnapshot` type instead of using `ReturnType<typeof parse>`.

- [ ] **Step 3: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/use-cases/scan-project.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/use-cases/scan-project.ts tests/unit/use-cases/scan-project.test.ts
git commit -m "feat(use-cases): implement scan-project use-case"
```

---

## Task 6: Implement `generate-agent-brief` use-case

**Files:**
- Create: `src/app/use-cases/generate-agent-brief.ts`
- Test: `tests/unit/use-cases/generate-agent-brief.test.ts`

- [ ] **Step 1: Write failing test for `generate-agent-brief`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateAgentBrief } from '../../../src/app/use-cases/generate-agent-brief.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';

describe('generateAgentBrief', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-brief-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a brief markdown file from a scan and memory', async () => {
    const store = new MarkdownMemoryStore(dir);
    const fs = new FsFileSystem();
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'brief-test', description: 'A test project' }), 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# Brief Test\n\nThis project tests brief generation.', 'utf-8');
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}', 'utf-8');

    const scanner = new (await import('../../../src/adapters/fs/heuristic-project-scanner.js')).HeuristicProjectScanner(fs);
    const snapshot = await scanner.scan(dir);

    await addMemoryObject({ store, log: { append: async () => {}, readAll: async () => [] } as any, clock, idGen }, {
      type: 'decision',
      title: 'Use TypeScript',
      body: 'Strict TypeScript everywhere.',
      createdBy: 'user:test',
    });

    const brief = await generateAgentBrief({ store, fs, clock }, dir, snapshot);

    expect(brief).toContain('# Agent Brief: brief-test');
    expect(brief).toContain('## Active Memory');
    expect(brief).toContain('Use TypeScript');

    const written = readFileSync(join(dir, '.wolf', 'memory', 'briefs', 'agent-brief-latest.md'), 'utf-8');
    expect(written).toContain('# Agent Brief: brief-test');
  });
});
```

Run: `npm run test:run -- tests/unit/use-cases/generate-agent-brief.test.ts`
Expected: FAIL — `generateAgentBrief` not found.

- [ ] **Step 2: Implement `generate-agent-brief.ts`**

```typescript
import { join } from 'path';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { FileSystem } from '../../ports/file-system.port.js';
import { Clock } from '../../ports/clock.port.js';
import { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';
import { briefsDir } from '../../adapters/fs/project-paths.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export interface GenerateAgentBriefResult {
  content: string;
  path: string;
}

export async function generateAgentBrief(
  deps: { store: MemoryStore; fs: FileSystem; clock: Clock },
  root: string,
  snapshot: ProjectSnapshot
): Promise<GenerateAgentBriefResult> {
  const memoryObjects = await deps.store.list({ status: 'active' });
  const acceptedMemory = memoryObjects
    .filter((obj) => obj.review_state === 'accepted' && obj.type !== 'context')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 10);

  const openQuestions = memoryObjects
    .filter((obj) => obj.type === 'open-question' && obj.status === 'active')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const description = await buildProjectDescription(deps.fs, root, snapshot);
  const content = renderBrief(snapshot, description, acceptedMemory, openQuestions);

  const briefPath = join(briefsDir(root), 'agent-brief-latest.md');
  await deps.fs.writeFile(briefPath, content);

  return { content, path: briefPath };
}

async function buildProjectDescription(fs: FileSystem, root: string, snapshot: ProjectSnapshot): Promise<string> {
  const readme = await fs.readSmallTextFile(join(root, 'README.md'));
  if (readme) {
    const paragraphs = readme.split(/\n\n+/).map((p) => p.trim().replace(/^#+\s*/, '')).filter((p) => p.length > 0);
    const first = paragraphs.slice(0, 2).join(' ');
    if (first.length > 20) return first;
  }
  if (snapshot.summary.dependencies.length > 0) {
    return `${snapshot.projectName} is a project built with ${snapshot.summary.languages.join(', ')} and key dependencies including ${snapshot.summary.dependencies.slice(0, 5).join(', ')}.`;
  }
  return `${snapshot.projectName} is a software project.`;
}

function renderBrief(
  snapshot: ProjectSnapshot,
  description: string,
  activeMemory: MemoryObject[],
  openQuestions: MemoryObject[]
): string {
  const lines: string[] = [
    `# Agent Brief: ${snapshot.projectName}`,
    '',
    '## Project Snapshot',
    `- Root: ${snapshot.root}`,
    `- Project name: ${snapshot.projectName}`,
  ];
  if (snapshot.branch) lines.push(`- Branch: ${snapshot.branch}`);
  if (snapshot.commit) lines.push(`- Commit: ${snapshot.commit}`);
  lines.push(`- Generated: ${snapshot.generatedAt}`, '');

  lines.push('## What This Project Is', description, '');
  lines.push('## Technology Stack', `- Languages: ${snapshot.summary.languages.join(', ') || 'none'}`, `- Key dependencies: ${snapshot.summary.dependencies.slice(0, 10).join(', ') || 'none'}`, '');
  lines.push('## Key Files & Entry Points', ...snapshot.summary.entryPoints.map((ep) => `- ${ep}`), ...snapshot.summary.configFiles.map((cf) => `- ${cf} (config)`), '');
  lines.push('## Architecture Notes', renderArchitectureNotes(snapshot), '');

  lines.push('## Active Memory');
  for (const obj of activeMemory) {
    lines.push(`- [${obj.type}] ${obj.title}`);
    if (obj.body) lines.push(`  ${obj.body.split('\n')[0].slice(0, 120)}`);
  }
  if (activeMemory.length === 0) lines.push('_No active accepted memory._');
  lines.push('');

  lines.push('## Open Questions');
  for (const q of openQuestions) {
    lines.push(`- ${q.title}`);
    if (q.body) lines.push(`  ${q.body.split('\n')[0].slice(0, 120)}`);
  }
  if (openQuestions.length === 0) lines.push('_No open questions._');
  lines.push('');

  lines.push(
    '## Sources',
    '- Project scan: project-scan-latest',
    '- README.md',
    '- package.json',
    `- Active memory objects: ${activeMemory.length}`,
    '',
    '## Limitations',
    '- This brief is generated from the latest scan and accepted active memory.',
    '- It may be incomplete if the scan is outdated.',
    '',
    '## Recommended First Steps',
    '- Read docs/concept-v3.md',
    '- Read AGENTS.md',
    '- Run npm run check',
    ''
  );

  return lines.join('\n');
}

function renderArchitectureNotes(snapshot: ProjectSnapshot): string {
  const dirs = snapshot.summary.topLevelDirectories;
  const notes: string[] = [];
  if (dirs.includes('src')) {
    const hasPorts = snapshot.files.some((f) => f.path.includes('/ports/'));
    const hasAdapters = snapshot.files.some((f) => f.path.includes('/adapters/'));
    if (hasPorts && hasAdapters) notes.push('Project appears to use a ports-and-adapters architecture.');
  }
  if (notes.length === 0) notes.push('No strong architecture signals detected from directory layout.');
  return notes.join(' ');
}
```

Note: `FileSystem` port currently lacks `writeFile`. Add it now or use direct `fs/promises` write inside the use-case. Prefer adding `writeFile` to the port in Task 3/7.

- [ ] **Step 3: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/use-cases/generate-agent-brief.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/use-cases/generate-agent-brief.ts tests/unit/use-cases/generate-agent-brief.test.ts
git commit -m "feat(use-cases): implement generate-agent-brief use-case"
```

---

## Task 7: Add `writeFile` to `FileSystem` port and adapter

**Files:**
- Modify: `src/ports/file-system.port.ts`
- Modify: `src/adapters/fs/fs-file-system.ts`
- Modify: `src/app/use-cases/generate-agent-brief.ts` (remove direct fs/promises fallback)
- Test: `tests/unit/adapters/fs-file-system.test.ts`

- [ ] **Step 1: Add `writeFile` to port**

```typescript
export interface FileSystem {
  listDirectory(path: string): Promise<DirectoryEntry[]>;
  readSmallTextFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}
```

- [ ] **Step 2: Implement `writeFile` in `FsFileSystem`**

```typescript
async writeFile(path: string, content: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, content, 'utf-8');
}
```

- [ ] **Step 3: Update brief use-case to use port method**

Remove the `fs/promises` fallback and call `deps.fs.writeFile(briefPath, content)`.

- [ ] **Step 4: Add FS writeFile test**

```typescript
it('writes a file', async () => {
  const target = join(dir, 'out.txt');
  await fs.writeFile(target, 'written');
  expect(readFileSync(target, 'utf-8')).toBe('written');
});
```

Run: `npm run test:run -- tests/unit/adapters/fs-file-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ports/file-system.port.ts src/adapters/fs/fs-file-system.ts src/app/use-cases/generate-agent-brief.ts tests/unit/adapters/fs-file-system.test.ts
git commit -m "feat(ports): add writeFile to FileSystem port"
```

---

## Task 8: Add CLI commands and wire container

**Files:**
- Modify: `src/bootstrap/container.ts`
- Create: `src/adapters/cli/commands/memory-scan.ts`
- Create: `src/adapters/cli/commands/memory-brief.ts`
- Modify: `src/adapters/cli/cli-entry.ts`
- Test: `tests/integration/mvp-b-workflow.test.ts`

- [ ] **Step 1: Wire new adapters in container**

```typescript
import { FsFileSystem } from '../adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../adapters/fs/heuristic-project-scanner.js';

export function createCliContainer(baseDir: string) {
  const fs = new FsFileSystem();
  return {
    store: new MarkdownMemoryStore(baseDir),
    log: new JsonlEventLog(eventsPath(baseDir)),
    index: new SQLiteSearchIndex(indexPath(baseDir)),
    clock: new SystemClock(),
    idGen: new HashIdGenerator(),
    initializer: new FsProjectInitializer(),
    fs,
    scanner: new HeuristicProjectScanner(fs),
  };
}
```

- [ ] **Step 2: Implement `memory-scan.ts` CLI command**

```typescript
import { Command } from 'commander';
import { scanProject } from '../../../app/use-cases/scan-project.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryScanCommand(): Command {
  return new Command('scan')
    .description('Scan the project and save a context snapshot')
    .action(async () => {
      const { store, log, clock, idGen, scanner } = createCliContainer(process.cwd());
      const result = await scanProject({ store, log, clock, idGen, scanner }, process.cwd());
      console.log(`Project scan saved: ${result.object.id}`);
    });
}
```

- [ ] **Step 3: Implement `memory-brief.ts` CLI command**

```typescript
import { Command } from 'commander';
import { generateAgentBrief } from '../../../app/use-cases/generate-agent-brief.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { scanProject } from '../../../app/use-cases/scan-project.js';

export function memoryBriefCommand(): Command {
  return new Command('brief')
    .description('Generate the agent brief from the latest scan and memory')
    .action(async () => {
      const { store, log, clock, idGen, scanner, fs } = createCliContainer(process.cwd());
      const scanResult = await scanProject({ store, log, clock, idGen, scanner }, process.cwd());
      const { content, path } = await generateAgentBrief({ store, fs, clock }, process.cwd(), scanResult.snapshot);
      console.log(content);
      console.error(`\nBrief saved to: ${path}`);
    });
}
```

- [ ] **Step 4: Register commands in `cli-entry.ts`**

```typescript
import { memoryScanCommand } from './commands/memory-scan.js';
import { memoryBriefCommand } from './commands/memory-brief.js';

memory.addCommand(memoryScanCommand());
memory.addCommand(memoryBriefCommand());
```

- [ ] **Step 5: Write integration test for MVP-B workflow**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

describe('MVP-B workflow', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mvpb-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'mvpb-test', dependencies: { zod: '^3' } }), 'utf-8');
    writeFileSync(join(dir, 'README.md'), '# MVP-B Test\n\nTesting scan and brief.', 'utf-8');
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}', 'utf-8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('initializes, scans, and generates a brief', () => {
    execSync('node dist/bootstrap/cli.js memory init', { cwd: dir });
    const scanOut = execSync('node dist/bootstrap/cli.js memory scan', { cwd: dir, encoding: 'utf-8' });
    expect(scanOut).toContain('project-scan-latest');
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'context', 'project-scan-latest.md'))).toBe(true);

    const briefOut = execSync('node dist/bootstrap/cli.js memory brief', { cwd: dir, encoding: 'utf-8' });
    expect(briefOut).toContain('# Agent Brief: mvpb-test');
    expect(existsSync(join(dir, '.wolf', 'memory', 'briefs', 'agent-brief-latest.md'))).toBe(true);
  });
});
```

- [ ] **Step 6: Build project and run integration test**

Run:
```bash
npm run build
npm run test:run -- tests/integration/mvp-b-workflow.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/bootstrap/container.ts src/adapters/cli/commands/memory-scan.ts src/adapters/cli/commands/memory-brief.ts src/adapters/cli/cli-entry.ts tests/integration/mvp-b-workflow.test.ts
git commit -m "feat(cli): wire memory scan and brief commands"
```

---

## Task 9: Ensure search index excludes briefs and rebuild works

**Files:**
- Modify: `src/adapters/fs/markdown-memory-store.ts` (no change needed if briefs are outside `objects/`)
- Modify: `src/app/use-cases/rebuild-memory-index.ts` (no change needed)
- Test: `tests/unit/use-cases/rebuild-memory-index.test.ts`

- [ ] **Step 1: Verify `rebuild-memory-index` only indexes `objects/`**

The existing `MarkdownMemoryStore.list()` reads only `objectsDir(baseDir)` subdirectories. Since briefs live in `.wolf/memory/briefs/`, they are not indexed.

- [ ] **Step 2: Add regression test**

```typescript
it('does not index files outside objects directory', async () => {
  // create a brief file directly and ensure rebuild ignores it
});
```

This can be a lightweight assertion in the existing rebuild test or a separate test.

- [ ] **Step 3: Run rebuild tests**

Run: `npm run test:run -- tests/unit/use-cases/rebuild-memory-index.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/unit/use-cases/rebuild-memory-index.test.ts
git commit -m "test(index): ensure briefs are not indexed as memory objects"
```

---

## Task 10: Documentation updates

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/concept-v3.md`

- [ ] **Step 1: Update `AGENTS.md` commands section**

Add under CORE COMMANDS:

```bash
# Scan project and save snapshot
node dist/bootstrap/cli.js memory scan

# Generate agent brief
node dist/bootstrap/cli.js memory brief
```

Update status note to: `Current: MVP-A complete. MVP-B (Project Scan + Agent Brief) in progress.`

- [ ] **Step 2: Update `README.md` command reference**

Add:

```bash
wolf memory scan     # Capture project snapshot
wolf memory brief    # Generate agent brief
```

- [ ] **Step 3: Update `docs/concept-v3.md` roadmap**

Mark Phase 4 and Phase 5 as in progress:

```text
| 4    | Project Scan              | `scan` registers external docs and project snapshots — **in progress** |
| 5    | Agent Brief (MVP-B)       | `brief`, `brief --write`, agent context export — **in progress** |
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md docs/concept-v3.md
git commit -m "docs: document MVP-B scan and brief commands"
```

---

## Task 11: Final verification

**Files:** all changed files.

- [ ] **Step 1: Run formatter and linter**

Run: `npm run check`
Expected: PASS

- [ ] **Step 2: Add memory object for MVP-B**

```bash
node dist/bootstrap/cli.js memory add --type lesson --title "MVP-B design approved" --body "MVP-B adds wolf memory scan and wolf memory brief. Scan is a context memory object; brief is a generated artifact in .wolf/memory/briefs/."
```

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "chore(mvp-b): final fixes and formatting"
```

---

## Self-Review Checklist

- [ ] **Spec coverage:** every requirement from the MVP-B design spec has a corresponding task.
- [ ] **Placeholder scan:** no TBD/TODO/"implement later" in the plan.
- [ ] **Type consistency:** `ProjectSnapshot`, `MemoryObject`, `FileSystem`, `ProjectScanner` signatures match across tasks.
- [ ] **No brief indexing:** briefs live outside `objects/` and are not indexed.
- [ ] **Deterministic scan:** files, languages, dependencies, directories sorted.
- [ ] **Git workflow:** commits are small and focused.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-29-mvp-b-project-scan-agent-brief.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach do you prefer?
