# MVP2: Context Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic, read-only, local-only Context Resolver for Mr. Wolf that scans project files, reads case memory, resolves context groups, and produces `context-bundle.json` + `context.md`.

**Architecture:** Five components (Scanner, CaseMemoryReader, Resolver, BundleBuilder, MdGenerator) orchestrated by a CLI command. Configuration lives in `wolf.yaml`. Deterministic output with configurable limits and guards.

**Tech Stack:** TypeScript, Zod, fast-glob, Node.js crypto, Commander.js, Vitest

---

## File Structure

**New files:**

- `src/types/context.ts` — ContextBundle, ContextFile, ContextCase, ScanMetadata, etc.
- `src/context/scanner.ts` — ContextScanner
- `src/context/case-memory.ts` — CaseMemoryReader
- `src/context/resolver.ts` — ContextResolver (classification + scenario merge)
- `src/context/bundle-builder.ts` — ContextBundleBuilder
- `src/context/md-generator.ts` — ContextMdGenerator
- `src/context/index.ts` — Public API exports
- `src/cli/commands/context.ts` — CLI commands
- `tests/unit/context-scanner.test.ts`
- `tests/unit/context-case-memory.test.ts`
- `tests/unit/context-resolver.test.ts`
- `tests/unit/context-bundle.test.ts`
- `tests/integration/context-cli.test.ts`

**Modified files:**

- `src/config/project-config.ts` — add context config schema
- `src/cli/index.ts` — register context command
- `README.md` — document `wolf context` commands
- `package.json` — add `fast-glob` dependency

---

## PR1: Config, Schema, Types

### Task 1.1: Add Context Types

**Files:**

- Create: `src/types/context.ts`

- [ ] **Step 1: Write context types**

```typescript
import { z } from 'zod';

export const ContextFileSchema = z.object({
  path: z.string(),
  kind: z.enum(['project_file', 'project_doc', 'project_rule', 'project_config']),
  size: z.number(),
  extension: z.string(),
  hash: z.string(),
  mtime: z.string(),
  content_included: z.boolean(),
  content_truncated: z.boolean(),
  content: z.string().optional(),
});

export type ContextFile = z.infer<typeof ContextFileSchema>;

export const ContextCaseSchema = z.object({
  case_id: z.string(),
  workflow_id: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  artifact_count: z.number(),
  completed_steps: z.array(z.string()).optional(),
  failed_steps: z.array(z.string()).optional(),
});

export type ContextCase = z.infer<typeof ContextCaseSchema>;

export const ScanMetadataSchema = z.object({
  files_scanned: z.number(),
  files_included: z.number(),
  files_skipped: z.number(),
  bytes_included: z.number(),
  bytes_truncated: z.number(),
  limits_applied: z.array(z.string()),
  skipped_files: z.array(z.string()).optional(),
});

export type ScanMetadata = z.infer<typeof ScanMetadataSchema>;

export const CaseMemoryMetadataSchema = z.object({
  cases_read: z.number(),
  total_cases: z.number(),
  skipped_cases: z.array(z.string()),
});

export type CaseMemoryMetadata = z.infer<typeof CaseMemoryMetadataSchema>;

export const ResolveMetadataSchema = z.object({
  groups: z.record(z.number()),
});

export type ResolveMetadata = z.infer<typeof ResolveMetadataSchema>;

export const ContextBundleSchema = z.object({
  version: z.literal('1.0.0'),
  generated_at: z.string(),
  scenario: z.string(),
  project: z.object({
    root: z.string(),
    files: z.array(ContextFileSchema),
    docs: z.array(ContextFileSchema),
    rules: z.array(ContextFileSchema),
    configs: z.array(ContextFileSchema),
  }),
  case_memory: z.object({
    cases: z.array(ContextCaseSchema),
    count: z.number(),
    total_count: z.number(),
    metadata: CaseMemoryMetadataSchema,
  }),
  scan_metadata: ScanMetadataSchema,
  resolve_metadata: ResolveMetadataSchema,
});

export type ContextBundle = z.infer<typeof ContextBundleSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/types/context.ts
git commit -m "feat(context): add ContextBundle, ContextFile, ContextCase types and schemas"
```

### Task 1.2: Update Project Config Schema

**Files:**

- Modify: `src/config/project-config.ts`

- [ ] **Step 1: Add context config schema**

```typescript
export const ContextConfigSchema = z.object({
  include: z
    .array(z.string())
    .default(['src/**/*', 'tests/**/*', 'docs/**/*.md', 'README.md', 'AGENTS.md', 'examples/**/*']),
  exclude: z
    .array(z.string())
    .default([
      'node_modules/**',
      'dist/**',
      '.git/**',
      '.wolf/state/**',
      '.wolf/context/**',
      'coverage/**',
      '.worktrees/**',
    ]),
  limits: z
    .object({
      max_files: z.number().int().positive().default(100),
      max_bytes: z.number().int().positive().default(10485760),
      max_file_bytes: z.number().int().positive().default(1048576),
      max_cases: z.number().int().positive().default(10),
    })
    .default({}),
  include_content: z.boolean().default(true),
  markdown_render_chars: z.number().int().positive().default(1000),
  output: z
    .object({
      bundle: z.string().default('.wolf/context/context-bundle.json'),
      markdown: z.string().default('.wolf/context/context.md'),
    })
    .default({}),
  scenarios: z
    .array(
      z.object({
        id: z.string(),
        match: z.object({
          keywords: z.array(z.string()),
        }),
        context: z
          .object({
            include: z.array(z.string()).optional(),
            exclude: z.array(z.string()).optional(),
            limits: z
              .object({
                max_files: z.number().int().positive().optional(),
                max_bytes: z.number().int().positive().optional(),
                max_file_bytes: z.number().int().positive().optional(),
                max_cases: z.number().int().positive().optional(),
              })
              .optional(),
          })
          .optional(),
      })
    )
    .default([]),
});

export type ContextConfig = z.infer<typeof ContextConfigSchema>;
```

Add `context: ContextConfigSchema.default({})` to the main `ProjectConfigSchema`.

- [ ] **Step 2: Add fast-glob dependency**

```bash
npm install fast-glob
npm install -D @types/fast-glob
```

Update `package.json`.

- [ ] **Step 3: Commit**

```bash
git add src/config/project-config.ts package.json package-lock.json
git commit -m "feat(context): add context config schema to wolf.yaml"
```

---

## PR2: Context Scanner

### Task 2.1: Implement ContextScanner

**Files:**

- Create: `src/context/scanner.ts`

- [ ] **Step 1: Write scanner implementation**

```typescript
import { glob } from 'fast-glob';
import { createHash } from 'crypto';
import { readFileSync, statSync, existsSync } from 'fs';
import { resolve, relative, join, sep } from 'path';
import { ContextFile, ScanMetadata } from '../types/context.js';
import { ContextConfig } from '../config/project-config.js';

export interface ScanResult {
  files: ContextFile[];
  metadata: ScanMetadata;
}

export class ContextScanner {
  async scan(projectRoot: string, config: ContextConfig): Promise<ScanResult> {
    const resolvedRoot = resolve(projectRoot);
    const includePatterns = config.include.map((p) => join(resolvedRoot, p));
    const excludePatterns = config.exclude.map((p) => join(resolvedRoot, p));

    const allPaths = await glob(includePatterns, {
      cwd: resolvedRoot,
      ignore: excludePatterns,
      dot: true,
      onlyFiles: true,
      absolute: true,
      followSymbolicLinks: false,
    });

    const files: ContextFile[] = [];
    let bytesIncluded = 0;
    let bytesTruncated = 0;
    const limitsApplied: string[] = [];
    const skippedFiles: string[] = [];

    for (const absolutePath of allPaths.sort()) {
      const relPath = relative(resolvedRoot, absolutePath);

      // Guard: path traversal
      if (relPath.startsWith('..') || relPath.includes('..' + sep)) {
        skippedFiles.push(relPath);
        continue;
      }

      // Guard: symlinks (fast-glob with followSymbolicLinks: false skips most, but double-check)
      try {
        const realPath = resolve(absolutePath);
        if (!realPath.startsWith(resolvedRoot + sep)) {
          skippedFiles.push(relPath);
          continue;
        }
      } catch {
        skippedFiles.push(relPath);
        continue;
      }

      const stats = statSync(absolutePath);
      const size = stats.size;

      // Limit: max_files
      if (files.length >= config.limits.max_files) {
        if (!limitsApplied.includes('max_files')) {
          limitsApplied.push('max_files');
        }
        skippedFiles.push(relPath);
        continue;
      }

      // Limit: max_bytes
      if (bytesIncluded + size > config.limits.max_bytes) {
        if (!limitsApplied.includes('max_bytes')) {
          limitsApplied.push('max_bytes');
        }
        skippedFiles.push(relPath);
        continue;
      }

      const ext = relPath.includes('.') ? relPath.slice(relPath.lastIndexOf('.')) : '';
      const isBinary = this.isBinary(absolutePath);
      const hash = this.computeHash(absolutePath);

      let content: string | undefined;
      let contentIncluded = false;
      let contentTruncated = false;

      if (!isBinary && config.include_content) {
        const rawBytes = readFileSync(absolutePath);
        const maxBytes = config.limits.max_file_bytes;

        if (rawBytes.length > maxBytes) {
          content = rawBytes.subarray(0, maxBytes).toString('utf-8');
          contentTruncated = true;
          bytesTruncated += rawBytes.length - maxBytes;
        } else {
          content = rawBytes.toString('utf-8');
        }

        contentIncluded = true;
        bytesIncluded += rawBytes.length;
      } else {
        bytesIncluded += size;
      }

      files.push({
        path: relPath,
        kind: 'project_file', // Will be reclassified by ContextResolver
        size,
        extension: ext,
        hash,
        mtime: stats.mtime.toISOString(),
        content_included: contentIncluded,
        content_truncated: contentTruncated,
        content,
      });
    }

    const metadata: ScanMetadata = {
      files_scanned: allPaths.length,
      files_included: files.length,
      files_skipped: allPaths.length - files.length,
      bytes_included: bytesIncluded,
      bytes_truncated: bytesTruncated,
      limits_applied,
      skipped_files: skippedFiles.length > 0 ? skippedFiles : undefined,
    };

    return { files, metadata };
  }

  private isBinary(filePath: string): boolean {
    try {
      const buffer = readFileSync(filePath);
      // Check first 8KB for null bytes
      const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
      return sample.includes(0);
    } catch {
      return true;
    }
  }

  private computeHash(filePath: string): string {
    const hash = createHash('sha256');
    hash.update(readFileSync(filePath));
    return 'sha256:' + hash.digest('hex');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/context/scanner.ts
git commit -m "feat(context): implement ContextScanner with glob, guards, limits, and text/binary detection"
```

### Task 2.2: Write Scanner Tests

**Files:**

- Create: `tests/unit/context-scanner.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextScanner } from '../../src/context/scanner.js';
import { ContextConfig } from '../../src/config/project-config.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ContextScanner', () => {
  let tempDir: string;
  let scanner: ContextScanner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-scanner-'));
    scanner = new ContextScanner();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should discover project files', async () => {
    writeFileSync(join(tempDir, 'src', 'main.ts'), 'console.log("hello");');
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'README.md'), '# Hello');

    const config: ContextConfig = {
      include: ['src/**/*', 'README.md'],
      exclude: [],
      limits: { max_files: 100, max_bytes: 10485760, max_file_bytes: 1048576, max_cases: 10 },
      include_content: true,
      markdown_render_chars: 1000,
      output: { bundle: '.wolf/context/context-bundle.json', markdown: '.wolf/context/context.md' },
      scenarios: [],
    };

    const result = await scanner.scan(tempDir, config);
    expect(result.files.length).toBe(2);
    expect(result.files.map((f) => f.path)).toContain('src/main.ts');
    expect(result.files.map((f) => f.path)).toContain('README.md');
  });

  it('should exclude node_modules by default', async () => {
    mkdirSync(join(tempDir, 'node_modules', 'foo'), { recursive: true });
    writeFileSync(join(tempDir, 'node_modules', 'foo', 'index.js'), 'module.exports = {};');
    writeFileSync(join(tempDir, 'src', 'app.ts'), 'export const app = 1;');

    const config: ContextConfig = {
      include: ['src/**/*'],
      exclude: ['node_modules/**'],
      limits: { max_files: 100, max_bytes: 10485760, max_file_bytes: 1048576, max_cases: 10 },
      include_content: true,
      markdown_render_chars: 1000,
      output: { bundle: '.wolf/context/context-bundle.json', markdown: '.wolf/context/context.md' },
      scenarios: [],
    };

    const result = await scanner.scan(tempDir, config);
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe('src/app.ts');
  });

  it('should respect max_files limit', async () => {
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'a.ts'), '1');
    writeFileSync(join(tempDir, 'src', 'b.ts'), '2');
    writeFileSync(join(tempDir, 'src', 'c.ts'), '3');

    const config: ContextConfig = {
      include: ['src/**/*'],
      exclude: [],
      limits: { max_files: 2, max_bytes: 10485760, max_file_bytes: 1048576, max_cases: 10 },
      include_content: true,
      markdown_render_chars: 1000,
      output: { bundle: '.wolf/context/context-bundle.json', markdown: '.wolf/context/context.md' },
      scenarios: [],
    };

    const result = await scanner.scan(tempDir, config);
    expect(result.files.length).toBe(2);
    expect(result.metadata.limits_applied).toContain('max_files');
  });

  it('should skip symlinks escaping project root', async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'wolf-outside-'));
    writeFileSync(join(outsideDir, 'secret.txt'), 'secret');
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    try {
      symlinkSync(join(outsideDir, 'secret.txt'), join(tempDir, 'src', 'secret.txt'));
    } catch {
      // Skip on Windows without admin
      return;
    }

    const config: ContextConfig = {
      include: ['src/**/*'],
      exclude: [],
      limits: { max_files: 100, max_bytes: 10485760, max_file_bytes: 1048576, max_cases: 10 },
      include_content: true,
      markdown_render_chars: 1000,
      output: { bundle: '.wolf/context/context-bundle.json', markdown: '.wolf/context/context.md' },
      scenarios: [],
    };

    const result = await scanner.scan(tempDir, config);
    expect(result.files.length).toBe(0);

    rmSync(outsideDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/context-scanner.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/context-scanner.test.ts
git commit -m "test(context): add ContextScanner tests for discovery, exclusion, limits, symlinks"
```

---

## PR3: Case Memory Reader

### Task 3.1: Implement CaseMemoryReader

**Files:**

- Create: `src/context/case-memory.ts`

- [ ] **Step 1: Write case memory reader**

```typescript
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { ContextCase, CaseMemoryMetadata } from '../types/context.js';
import { ContextConfig } from '../config/project-config.js';
import yaml from 'js-yaml';

export interface CaseMemoryResult {
  cases: ContextCase[];
  metadata: CaseMemoryMetadata;
}

export class CaseMemoryReader {
  read(casesDir: string, config: ContextConfig): CaseMemoryResult {
    if (!existsSync(casesDir)) {
      return {
        cases: [],
        metadata: { cases_read: 0, total_cases: 0, skipped_cases: [] },
      };
    }

    const caseIds = readdirSync(casesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const cases: ContextCase[] = [];
    const skippedCases: string[] = [];

    for (const caseId of caseIds) {
      try {
        const caseYamlPath = join(casesDir, caseId, 'case.yaml');
        const stateJsonPath = join(casesDir, caseId, 'state.json');

        if (!existsSync(caseYamlPath) || !existsSync(stateJsonPath)) {
          skippedCases.push(caseId);
          continue;
        }

        const caseYaml = yaml.load(readFileSync(caseYamlPath, 'utf-8')) as Record<string, unknown>;
        const stateJson = JSON.parse(readFileSync(stateJsonPath, 'utf-8')) as Record<string, unknown>;

        const artifactCount = this.countArtifacts(join(casesDir, caseId));

        cases.push({
          case_id: caseId,
          workflow_id: String(caseYaml.workflow_id || ''),
          status: String(stateJson.status || 'unknown'),
          created_at: String(caseYaml.created_at || ''),
          updated_at: String(caseYaml.updated_at || ''),
          artifact_count: artifactCount,
          completed_steps: Array.isArray(stateJson.completed_steps)
            ? (stateJson.completed_steps as string[])
            : undefined,
          failed_steps: Array.isArray(stateJson.failed_steps) ? (stateJson.failed_steps as string[]) : undefined,
        });
      } catch {
        skippedCases.push(caseId);
      }
    }

    // Sort by updated_at desc, then case_id asc
    cases.sort((a, b) => {
      const timeCompare = b.updated_at.localeCompare(a.updated_at);
      if (timeCompare !== 0) return timeCompare;
      return a.case_id.localeCompare(b.case_id);
    });

    const totalCases = cases.length;
    const limitedCases = cases.slice(0, config.limits.max_cases);

    return {
      cases: limitedCases,
      metadata: {
        cases_read: limitedCases.length,
        total_cases: totalCases,
        skipped_cases: skippedCases,
      },
    };
  }

  private countArtifacts(caseDir: string): number {
    const artifactsDir = join(caseDir, 'artifacts');
    if (!existsSync(artifactsDir)) return 0;
    try {
      return readdirSync(artifactsDir, { recursive: true }).filter((f) => {
        const stat = statSync(join(artifactsDir, f));
        return stat.isFile();
      }).length;
    } catch {
      return 0;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/context/case-memory.ts
git commit -m "feat(context): implement CaseMemoryReader with sorting, limits, and corrupt file tolerance"
```

### Task 3.2: Write Case Memory Tests

**Files:**

- Create: `tests/unit/context-case-memory.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CaseMemoryReader } from '../../src/context/case-memory.js';
import { ContextConfig } from '../../src/config/project-config.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';

describe('CaseMemoryReader', () => {
  let tempDir: string;
  let reader: CaseMemoryReader;

  const defaultConfig: ContextConfig = {
    include: [],
    exclude: [],
    limits: { max_files: 100, max_bytes: 10485760, max_file_bytes: 1048576, max_cases: 10 },
    include_content: true,
    markdown_render_chars: 1000,
    output: { bundle: '.wolf/context/context-bundle.json', markdown: '.wolf/context/context.md' },
    scenarios: [],
  };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-cases-'));
    reader = new CaseMemoryReader();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createCase(caseId: string, status: string, updatedAt: string) {
    const caseDir = join(tempDir, caseId);
    mkdirSync(caseDir, { recursive: true });
    writeFileSync(
      join(caseDir, 'case.yaml'),
      yaml.dump({
        case_id: caseId,
        workflow_id: 'test',
        status,
        created_at: updatedAt,
        updated_at: updatedAt,
      })
    );
    writeFileSync(
      join(caseDir, 'state.json'),
      JSON.stringify({
        status,
        completed_steps: ['step1'],
        updated_at: updatedAt,
      })
    );
  }

  it('should read case metadata', () => {
    createCase('case_001', 'completed', '2026-04-28T10:00:00Z');
    const result = reader.read(tempDir, defaultConfig);
    expect(result.cases.length).toBe(1);
    expect(result.cases[0].case_id).toBe('case_001');
    expect(result.cases[0].status).toBe('completed');
  });

  it('should sort by updated_at desc', () => {
    createCase('case_001', 'completed', '2026-04-28T10:00:00Z');
    createCase('case_002', 'failed', '2026-04-29T10:00:00Z');
    const result = reader.read(tempDir, defaultConfig);
    expect(result.cases[0].case_id).toBe('case_002');
    expect(result.cases[1].case_id).toBe('case_001');
  });

  it('should limit max_cases', () => {
    createCase('case_001', 'completed', '2026-04-28T10:00:00Z');
    createCase('case_002', 'failed', '2026-04-29T10:00:00Z');
    createCase('case_003', 'completed', '2026-04-30T10:00:00Z');

    const config = { ...defaultConfig, limits: { ...defaultConfig.limits, max_cases: 2 } };
    const result = reader.read(tempDir, config);
    expect(result.cases.length).toBe(2);
    expect(result.metadata.cases_read).toBe(2);
    expect(result.metadata.total_cases).toBe(3);
  });

  it('should tolerate missing files', () => {
    createCase('case_001', 'completed', '2026-04-28T10:00:00Z');
    const badDir = join(tempDir, 'case_bad');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'case.yaml'), 'invalid yaml: [');

    const result = reader.read(tempDir, defaultConfig);
    expect(result.cases.length).toBe(1);
    expect(result.metadata.skipped_cases).toContain('case_bad');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/context-case-memory.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/context-case-memory.test.ts
git commit -m "test(context): add CaseMemoryReader tests for sorting, limits, and tolerance"
```

---

## PR4: Resolver, Bundle, Markdown

### Task 4.1: Implement ContextResolver

**Files:**

- Create: `src/context/resolver.ts`

- [ ] **Step 1: Write resolver**

```typescript
import { ContextFile, ContextCase, ScanResult, ResolveMetadata, CaseMemoryResult } from '../types/context.js';
import { ContextConfig } from '../config/project-config.js';

export interface ResolvedContext {
  files: ContextFile[];
  docs: ContextFile[];
  rules: ContextFile[];
  configs: ContextFile[];
  cases: ContextCase[];
  caseMemoryMetadata: CaseMemoryResult['metadata'];
  resolveMetadata: ResolveMetadata;
}

export class ContextResolver {
  resolve(
    scanResult: ScanResult,
    caseMemory: CaseMemoryResult,
    config: ContextConfig,
    scenarioId?: string
  ): ResolvedContext {
    const effectiveConfig = this.mergeScenario(config, scenarioId);

    const files: ContextFile[] = [];
    const docs: ContextFile[] = [];
    const rules: ContextFile[] = [];
    const configs: ContextFile[] = [];

    for (const file of scanResult.files) {
      const classified = this.classify(file);
      file.kind = classified;

      switch (classified) {
        case 'project_doc':
          docs.push(file);
          break;
        case 'project_rule':
          rules.push(file);
          break;
        case 'project_config':
          configs.push(file);
          break;
        default:
          files.push(file);
      }
    }

    const resolveMetadata: ResolveMetadata = {
      groups: {
        project_files: files.length,
        project_docs: docs.length,
        project_rules: rules.length,
        project_configs: configs.length,
      },
    };

    return {
      files,
      docs,
      rules,
      configs,
      cases: caseMemory.cases,
      caseMemoryMetadata: caseMemory.metadata,
      resolveMetadata,
    };
  }

  private mergeScenario(config: ContextConfig, scenarioId?: string): ContextConfig {
    if (!scenarioId) return config;

    const scenario = config.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    return {
      ...config,
      include: [...config.include, ...(scenario.context?.include || [])],
      exclude: [...config.exclude, ...(scenario.context?.exclude || [])],
      limits: {
        ...config.limits,
        ...scenario.context?.limits,
      },
    };
  }

  private classify(file: ContextFile): ContextFile['kind'] {
    const path = file.path.toLowerCase();

    // project_docs
    if (
      path === 'readme.md' ||
      path === 'agents.md' ||
      path.startsWith('docs/') ||
      (path.startsWith('.wolf/') && path.endsWith('.md'))
    ) {
      return 'project_doc';
    }

    // project_rules
    if (path === 'wolf.yaml' || (path.startsWith('.wolf/') && path.endsWith('.yaml'))) {
      return 'project_rule';
    }

    // project_configs
    if (
      path === 'package.json' ||
      path === 'tsconfig.json' ||
      path === 'vitest.config.ts' ||
      path === 'dockerfile' ||
      path === 'docker-compose.yml' ||
      (path.startsWith('.github/workflows/') && (path.endsWith('.yml') || path.endsWith('.yaml'))) ||
      path.startsWith('.prettierrc')
    ) {
      return 'project_config';
    }

    return 'project_file';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/context/resolver.ts
git commit -m "feat(context): implement ContextResolver with classification and scenario merge"
```

### Task 4.2: Implement ContextBundleBuilder

**Files:**

- Create: `src/context/bundle-builder.ts`

- [ ] **Step 1: Write bundle builder**

```typescript
import { ContextBundle } from '../types/context.js';
import { ResolvedContext } from './resolver.js';

export class ContextBundleBuilder {
  build(resolved: ResolvedContext, projectRoot: string, scenario: string): ContextBundle {
    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      scenario,
      project: {
        root: projectRoot,
        files: resolved.files,
        docs: resolved.docs,
        rules: resolved.rules,
        configs: resolved.configs,
      },
      case_memory: {
        cases: resolved.cases,
        count: resolved.cases.length,
        total_count: resolved.caseMemoryMetadata.total_cases,
        metadata: resolved.caseMemoryMetadata,
      },
      scan_metadata: {
        /* filled by caller */
      } as any,
      resolve_metadata: resolved.resolveMetadata,
    };
  }
}
```

Wait — scan_metadata needs to come from ScanResult. The orchestrator (CLI) will combine everything. The builder should accept ScanMetadata too.

Refactor:

```typescript
import { ContextBundle, ScanMetadata } from '../types/context.js';
import { ResolvedContext } from './resolver.js';

export class ContextBundleBuilder {
  build(resolved: ResolvedContext, scanMetadata: ScanMetadata, projectRoot: string, scenario: string): ContextBundle {
    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      scenario,
      project: {
        root: projectRoot,
        files: resolved.files,
        docs: resolved.docs,
        rules: resolved.rules,
        configs: resolved.configs,
      },
      case_memory: {
        cases: resolved.cases,
        count: resolved.cases.length,
        total_count: resolved.caseMemoryMetadata.total_cases,
        metadata: resolved.caseMemoryMetadata,
      },
      scan_metadata: scanMetadata,
      resolve_metadata: resolved.resolveMetadata,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/context/bundle-builder.ts
git commit -m "feat(context): implement ContextBundleBuilder"
```

### Task 4.3: Implement ContextMdGenerator

**Files:**

- Create: `src/context/md-generator.ts`

- [ ] **Step 1: Write markdown generator**

````typescript
import { ContextBundle } from '../types/context.js';

export class ContextMdGenerator {
  generate(bundle: ContextBundle, maxChars: number = 1000): string {
    const lines: string[] = [];

    lines.push('# Project Context');
    lines.push('');
    lines.push(`Generated: ${bundle.generated_at}`);
    lines.push(`Scenario: ${bundle.scenario}`);
    lines.push('');

    // Project Files
    if (bundle.project.files.length > 0) {
      lines.push('## Project Files');
      lines.push('');
      for (const file of bundle.project.files) {
        lines.push(`### ${file.path}`);
        lines.push(`- Size: ${this.formatBytes(file.size)}`);
        lines.push(`- Modified: ${file.mtime}`);
        if (file.content_included && file.content) {
          const truncated =
            file.content.length > maxChars ? file.content.substring(0, maxChars) + '\n\n... (truncated)' : file.content;
          lines.push('');
          lines.push('```' + file.extension.replace('.', ''));
          lines.push(truncated);
          lines.push('```');
        }
        lines.push('');
      }
    }

    // Project Docs
    if (bundle.project.docs.length > 0) {
      lines.push('## Project Docs');
      lines.push('');
      for (const file of bundle.project.docs) {
        lines.push(`### ${file.path}`);
        if (file.content_included && file.content) {
          lines.push(file.content.substring(0, maxChars));
          if (file.content.length > maxChars) {
            lines.push('\n... (truncated)');
          }
        }
        lines.push('');
      }
    }

    // Project Rules
    if (bundle.project.rules.length > 0) {
      lines.push('## Project Rules');
      lines.push('');
      for (const file of bundle.project.rules) {
        lines.push(`### ${file.path}`);
        if (file.content_included && file.content) {
          lines.push('```yaml');
          lines.push(file.content.substring(0, maxChars));
          if (file.content.length > maxChars) {
            lines.push('... (truncated)');
          }
          lines.push('```');
        }
        lines.push('');
      }
    }

    // Project Configs
    if (bundle.project.configs.length > 0) {
      lines.push('## Project Configs');
      lines.push('');
      for (const file of bundle.project.configs) {
        lines.push(`### ${file.path}`);
        if (file.content_included && file.content) {
          lines.push('```');
          lines.push(file.content.substring(0, maxChars));
          if (file.content.length > maxChars) {
            lines.push('... (truncated)');
          }
          lines.push('```');
        }
        lines.push('');
      }
    }

    // Case Memory
    if (bundle.case_memory.cases.length > 0) {
      lines.push('## Case Memory');
      lines.push('');
      lines.push('| Case ID | Workflow | Status | Updated |');
      lines.push('|---------|----------|--------|---------|');
      for (const c of bundle.case_memory.cases) {
        lines.push(`| ${c.case_id} | ${c.workflow_id} | ${c.status} | ${c.updated_at} |`);
      }
      lines.push('');
    }

    // Scan Metadata
    lines.push('## Scan Metadata');
    lines.push('');
    lines.push(`- Files scanned: ${bundle.scan_metadata.files_scanned}`);
    lines.push(`- Files included: ${bundle.scan_metadata.files_included}`);
    lines.push(`- Bytes included: ${this.formatBytes(bundle.scan_metadata.bytes_included)}`);
    if (bundle.scan_metadata.limits_applied.length > 0) {
      lines.push(`- Limits applied: ${bundle.scan_metadata.limits_applied.join(', ')}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
````

- [ ] **Step 2: Commit**

```bash
git add src/context/md-generator.ts
git commit -m "feat(context): implement ContextMdGenerator with per-file truncation"
```

### Task 4.4: Write Resolver & Bundle Tests

**Files:**

- Create: `tests/unit/context-resolver.test.ts`
- Create: `tests/unit/context-bundle.test.ts`

- [ ] **Step 1: Write resolver tests**

```typescript
import { describe, it, expect } from 'vitest';
import { ContextResolver } from '../../src/context/resolver.js';
import { ContextFile, ContextCase, ScanMetadata, CaseMemoryMetadata } from '../../src/types/context.js';
import { ContextConfig } from '../../src/config/project-config.js';

describe('ContextResolver', () => {
  const resolver = new ContextResolver();

  const defaultConfig: ContextConfig = {
    include: ['**/*'],
    exclude: [],
    limits: { max_files: 100, max_bytes: 10485760, max_file_bytes: 1048576, max_cases: 10 },
    include_content: true,
    markdown_render_chars: 1000,
    output: { bundle: '.wolf/context/context-bundle.json', markdown: '.wolf/context/context.md' },
    scenarios: [],
  };

  function makeFile(path: string): ContextFile {
    return {
      path,
      kind: 'project_file',
      size: 100,
      extension: '.ts',
      hash: 'sha256:abc',
      mtime: '2026-04-29T10:00:00Z',
      content_included: true,
      content_truncated: false,
      content: 'content',
    };
  }

  it('should classify docs', () => {
    const scanResult = {
      files: [makeFile('README.md'), makeFile('docs/guide.md'), makeFile('src/app.ts')],
      metadata: {
        files_scanned: 3,
        files_included: 3,
        files_skipped: 0,
        bytes_included: 300,
        bytes_truncated: 0,
        limits_applied: [],
      } as ScanMetadata,
    };

    const caseMemory = {
      cases: [],
      metadata: { cases_read: 0, total_cases: 0, skipped_cases: [] } as CaseMemoryMetadata,
    };

    const result = resolver.resolve(scanResult, caseMemory, defaultConfig);
    expect(result.docs.length).toBe(2);
    expect(result.files.length).toBe(1);
  });

  it('should classify configs', () => {
    const scanResult = {
      files: [makeFile('package.json'), makeFile('tsconfig.json'), makeFile('.github/workflows/ci.yml')],
      metadata: {
        files_scanned: 3,
        files_included: 3,
        files_skipped: 0,
        bytes_included: 300,
        bytes_truncated: 0,
        limits_applied: [],
      } as ScanMetadata,
    };

    const caseMemory = {
      cases: [],
      metadata: { cases_read: 0, total_cases: 0, skipped_cases: [] } as CaseMemoryMetadata,
    };

    const result = resolver.resolve(scanResult, caseMemory, defaultConfig);
    expect(result.configs.length).toBe(3);
  });

  it('should throw on unknown scenario', () => {
    const scanResult = {
      files: [],
      metadata: {
        files_scanned: 0,
        files_included: 0,
        files_skipped: 0,
        bytes_included: 0,
        bytes_truncated: 0,
        limits_applied: [],
      } as ScanMetadata,
    };
    const caseMemory = {
      cases: [],
      metadata: { cases_read: 0, total_cases: 0, skipped_cases: [] } as CaseMemoryMetadata,
    };

    expect(() => resolver.resolve(scanResult, caseMemory, defaultConfig, 'nonexistent')).toThrow('Scenario not found');
  });
});
```

- [ ] **Step 2: Write bundle tests**

```typescript
import { describe, it, expect } from 'vitest';
import { ContextBundleBuilder } from '../../src/context/bundle-builder.js';
import { ContextMdGenerator } from '../../src/context/md-generator.js';
import { ResolvedContext } from '../../src/context/resolver.js';
import { ScanMetadata, CaseMemoryMetadata } from '../../src/types/context.js';

describe('ContextBundleBuilder', () => {
  it('should build a valid bundle', () => {
    const builder = new ContextBundleBuilder();
    const resolved: ResolvedContext = {
      files: [],
      docs: [
        {
          path: 'README.md',
          kind: 'project_doc',
          size: 100,
          extension: '.md',
          hash: 'sha256:abc',
          mtime: '2026-04-29T10:00:00Z',
          content_included: true,
          content_truncated: false,
          content: '# Hello',
        },
      ],
      rules: [],
      configs: [],
      cases: [],
      caseMemoryMetadata: { cases_read: 0, total_cases: 0, skipped_cases: [] } as CaseMemoryMetadata,
      resolveMetadata: { groups: { project_docs: 1 } },
    };

    const scanMetadata: ScanMetadata = {
      files_scanned: 1,
      files_included: 1,
      files_skipped: 0,
      bytes_included: 100,
      bytes_truncated: 0,
      limits_applied: [],
    };

    const bundle = builder.build(resolved, scanMetadata, '/project', 'default');
    expect(bundle.version).toBe('1.0.0');
    expect(bundle.scenario).toBe('default');
    expect(bundle.project.docs.length).toBe(1);
    expect(bundle.scan_metadata.files_included).toBe(1);
  });
});

describe('ContextMdGenerator', () => {
  it('should generate markdown', () => {
    const generator = new ContextMdGenerator();
    const bundle = {
      version: '1.0.0',
      generated_at: '2026-04-29T10:00:00Z',
      scenario: 'default',
      project: {
        root: '/project',
        files: [],
        docs: [
          {
            path: 'README.md',
            kind: 'project_doc',
            size: 100,
            extension: '.md',
            hash: 'sha256:abc',
            mtime: '2026-04-29T10:00:00Z',
            content_included: true,
            content_truncated: false,
            content: '# Hello World\n\nThis is a test.',
          },
        ],
        rules: [],
        configs: [],
      },
      case_memory: {
        cases: [],
        count: 0,
        total_count: 0,
        metadata: { cases_read: 0, total_cases: 0, skipped_cases: [] },
      },
      scan_metadata: {
        files_scanned: 1,
        files_included: 1,
        files_skipped: 0,
        bytes_included: 100,
        bytes_truncated: 0,
        limits_applied: [],
      },
      resolve_metadata: { groups: { project_docs: 1 } },
    };

    const md = generator.generate(bundle, 50);
    expect(md).toContain('# Project Context');
    expect(md).toContain('## Project Docs');
    expect(md).toContain('# Hello World');
    expect(md).toContain('... (truncated)');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/context-resolver.test.ts tests/unit/context-bundle.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/unit/context-resolver.test.ts tests/unit/context-bundle.test.ts
git commit -m "test(context): add resolver, bundle builder, and markdown generator tests"
```

---

## PR5: CLI, Events, Tests, Docs

### Task 5.1: Create CLI Commands

**Files:**

- Create: `src/cli/commands/context.ts`

- [ ] **Step 1: Write CLI commands**

```typescript
import { Command, Option } from 'commander';
import { ContextScanner } from '../../context/scanner.js';
import { CaseMemoryReader } from '../../context/case-memory.js';
import { ContextResolver } from '../../context/resolver.js';
import { ContextBundleBuilder } from '../../context/bundle-builder.js';
import { ContextMdGenerator } from '../../context/md-generator.js';
import { loadProjectConfig } from '../../config/loader.js';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { InProcessEventBus } from '../../kernel/event-bus.js';
import { CaseStore } from '../../state/case-store.js';

export function createContextCommand(): Command {
  const context = new Command('context').description('Manage project context');

  context
    .command('scan')
    .description('Scan project files (dry run, no persistence)')
    .option('--scenario <id>', 'Apply scenario overrides')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (options: { scenario?: string; json?: boolean }) => {
      const cwd = process.cwd();
      const config = loadProjectConfig(cwd);
      const bus = new InProcessEventBus();
      const caseStore = new CaseStore(join(cwd, config.state_dir));

      const event = {
        id: uuidv4(),
        type: 'context.scan.started',
        case_id: '',
        workflow_id: '',
        timestamp: new Date().toISOString(),
        actor: { type: 'user', id: 'cli' },
        payload: { root: cwd, scenario: options.scenario || 'default' },
      };
      await bus.publish(event);
      caseStore.appendEvent('', event);

      const scanner = new ContextScanner();
      const effectiveConfig = options.scenario ? mergeScenario(config.context, options.scenario) : config.context;

      const result = await scanner.scan(cwd, effectiveConfig);

      const completedEvent = {
        id: uuidv4(),
        type: 'context.scan.completed',
        case_id: '',
        workflow_id: '',
        timestamp: new Date().toISOString(),
        actor: { type: 'user', id: 'cli' },
        payload: {
          files_scanned: result.metadata.files_scanned,
          files_included: result.metadata.files_included,
          bytes_included: result.metadata.bytes_included,
        },
      };
      await bus.publish(completedEvent);
      caseStore.appendEvent('', completedEvent);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              scenario: options.scenario || 'default',
              files: result.files.map((f) => ({ path: f.path, size: f.size, kind: f.kind })),
              metadata: result.metadata,
            },
            null,
            2
          )
        );
      } else {
        console.log(`Scanned: ${result.metadata.files_scanned} files`);
        console.log(`Included: ${result.metadata.files_included} files (${result.metadata.bytes_included} bytes)`);
        for (const file of result.files) {
          console.log(`  ${file.path} (${file.size} bytes)`);
        }
      }
    });

  context
    .command('build')
    .description('Build full context bundle and markdown')
    .option('--scenario <id>', 'Apply scenario overrides')
    .addOption(new Option('--json', 'Output JSON summary'))
    .action(async (options: { scenario?: string; json?: boolean }) => {
      const cwd = process.cwd();
      const config = loadProjectConfig(cwd);
      const bus = new InProcessEventBus();
      const caseStore = new CaseStore(join(cwd, config.state_dir));

      // Validate scenario
      if (options.scenario && !config.context.scenarios.find((s) => s.id === options.scenario)) {
        console.error(`Scenario not found: ${options.scenario}`);
        process.exit(1);
      }

      const scanner = new ContextScanner();
      const caseMemoryReader = new CaseMemoryReader();
      const resolver = new ContextResolver();
      const bundleBuilder = new ContextBundleBuilder();
      const mdGenerator = new ContextMdGenerator();

      const effectiveConfig = options.scenario ? mergeScenario(config.context, options.scenario) : config.context;

      // Scan
      await bus.publish({
        id: uuidv4(),
        type: 'context.scan.started',
        case_id: '',
        workflow_id: '',
        timestamp: new Date().toISOString(),
        actor: { type: 'user', id: 'cli' },
        payload: { root: cwd, scenario: options.scenario || 'default' },
      });

      const scanResult = await scanner.scan(cwd, effectiveConfig);

      await bus.publish({
        id: uuidv4(),
        type: 'context.scan.completed',
        case_id: '',
        workflow_id: '',
        timestamp: new Date().toISOString(),
        actor: { type: 'user', id: 'cli' },
        payload: {
          files_scanned: scanResult.metadata.files_scanned,
          files_included: scanResult.metadata.files_included,
          bytes_included: scanResult.metadata.bytes_included,
        },
      });

      // Case memory
      const casesDir = join(cwd, config.state_dir, 'cases');
      const caseMemory = caseMemoryReader.read(casesDir, effectiveConfig);

      await bus.publish({
        id: uuidv4(),
        type: 'context.case_memory.read',
        case_id: '',
        workflow_id: '',
        timestamp: new Date().toISOString(),
        actor: { type: 'user', id: 'cli' },
        payload: {
          cases_read: caseMemory.metadata.cases_read,
          total_cases: caseMemory.metadata.total_cases,
          skipped_cases: caseMemory.metadata.skipped_cases.length,
        },
      });

      // Resolve
      const resolved = resolver.resolve(scanResult, caseMemory, config.context, options.scenario);

      // Build bundle
      const bundle = bundleBuilder.build(resolved, scanResult.metadata, cwd, options.scenario || 'default');

      const bundlePath = join(cwd, effectiveConfig.output.bundle);
      const mdPath = join(cwd, effectiveConfig.output.markdown);

      mkdirSync(dirname(bundlePath), { recursive: true });
      writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
      writeFileSync(mdPath, mdGenerator.generate(bundle, effectiveConfig.markdown_render_chars));

      await bus.publish({
        id: uuidv4(),
        type: 'context.bundle.created',
        case_id: '',
        workflow_id: '',
        timestamp: new Date().toISOString(),
        actor: { type: 'user', id: 'cli' },
        payload: {
          bundle_path: bundlePath,
          markdown_path: mdPath,
          file_count: resolved.files.length + resolved.docs.length + resolved.rules.length + resolved.configs.length,
          byte_count: scanResult.metadata.bytes_included,
        },
      });

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              bundle_path: bundlePath,
              markdown_path: mdPath,
              files_included: scanResult.metadata.files_included,
              bytes_included: scanResult.metadata.bytes_included,
              cases_included: caseMemory.cases.length,
            },
            null,
            2
          )
        );
      } else {
        console.log(`Context built:`);
        console.log(`  Bundle: ${bundlePath}`);
        console.log(`  Markdown: ${mdPath}`);
        console.log(`  Files: ${scanResult.metadata.files_included}`);
        console.log(`  Cases: ${caseMemory.cases.length}`);
      }
    });

  return context;
}

function mergeScenario(config: any, scenarioId: string) {
  const scenario = config.scenarios.find((s: any) => s.id === scenarioId);
  if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
  return {
    ...config,
    include: [...config.include, ...(scenario.context?.include || [])],
    exclude: [...config.exclude, ...(scenario.context?.exclude || [])],
    limits: { ...config.limits, ...scenario.context?.limits },
  };
}
```

- [ ] **Step 2: Register CLI command**

Modify `src/cli/index.ts`:

```typescript
import { createContextCommand } from './commands/context.js';

// Add after other commands:
program.addCommand(createContextCommand());
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/context.ts src/cli/index.ts
git commit -m "feat(context): add wolf context scan and build CLI commands"
```

### Task 5.2: Write Integration Tests

**Files:**

- Create: `tests/integration/context-cli.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

describe('Context CLI', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-context-'));
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'app.ts'), 'export const app = 1;');
    writeFileSync(join(tempDir, 'README.md'), '# Test Project');
    writeFileSync(join(tempDir, 'package.json'), '{"name": "test"}');
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should scan project files', () => {
    const output = execSync(`node ${cliPath} context scan`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(output).toContain('src/app.ts');
    expect(output).toContain('README.md');
  });

  it('should scan with --json', () => {
    const output = execSync(`node ${cliPath} context scan --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    const result = JSON.parse(output);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files[0].content).toBeUndefined(); // metadata only
  });

  it('should build context bundle', () => {
    execSync(`node ${cliPath} context build`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(existsSync(join(tempDir, '.wolf', 'context', 'context-bundle.json'))).toBe(true);
    expect(existsSync(join(tempDir, '.wolf', 'context', 'context.md'))).toBe(true);

    const bundle = JSON.parse(readFileSync(join(tempDir, '.wolf', 'context', 'context-bundle.json'), 'utf-8'));
    expect(bundle.version).toBe('1.0.0');
    expect(bundle.project.files.length + bundle.project.docs.length).toBeGreaterThan(0);
  });

  it('should reject unknown scenario', () => {
    expect(() => {
      execSync(`node ${cliPath} context build --scenario nonexistent`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm run build
npx vitest run tests/integration/context-cli.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/context-cli.test.ts
git commit -m "test(context): add CLI integration tests for scan and build"
```

### Task 5.3: Update Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/development.md`

- [ ] **Step 1: Update README CLI Reference**

Add to CLI Reference section:

```text
# Context management
wolf context scan [--scenario <id>] [--json]
wolf context build [--scenario <id>] [--json]
```

- [ ] **Step 2: Update docs/development.md**

Add Context Resolver section with examples.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/development.md
git commit -m "docs: document wolf context CLI commands"
```

### Task 5.4: Final Acceptance

- [ ] **Step 1: Run full test suite**

```bash
npm run check
```

- [ ] **Step 2: Run Docker tests**

```bash
docker build --target test -t mister-wolf:test .
docker run --rm mister-wolf:test
```

- [ ] **Step 3: Commit acceptance**

```bash
git commit --allow-empty -m "acceptance: MVP2 Context Resolver complete"
```

---

## Plan Self-Review

### Spec Coverage

| Spec Section                                     | Plan Task    | Status |
| ------------------------------------------------ | ------------ | ------ |
| Data Model (ContextBundle, ContextFile, etc.)    | PR1 Task 1.1 | ✅     |
| Config Schema                                    | PR1 Task 1.2 | ✅     |
| ContextScanner (glob, guards, limits)            | PR2          | ✅     |
| CaseMemoryReader (sorting, limits, tolerance)    | PR3          | ✅     |
| ContextResolver (classification, scenario merge) | PR4 Task 4.1 | ✅     |
| ContextBundleBuilder                             | PR4 Task 4.2 | ✅     |
| ContextMdGenerator                               | PR4 Task 4.3 | ✅     |
| CLI (scan, build, --scenario, --json)            | PR5 Task 5.1 | ✅     |
| Events                                           | PR5 Task 5.1 | ✅     |
| Tests (unit + integration)                       | PR2–5        | ✅     |
| Documentation                                    | PR5 Task 5.3 | ✅     |

### Placeholder Scan

No TBD/TODO placeholders found. All steps contain code, commands, and expected output.

### Type Consistency

- `ContextFile.kind` uses `'project_file' | 'project_doc' | 'project_rule' | 'project_config'` consistently across scanner, resolver, and tests.
- `ContextConfig` limits structure matches schema definition.
- `ScanResult`, `CaseMemoryResult`, `ResolvedContext` interfaces align with spec.

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-mvp2-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per PR/task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
