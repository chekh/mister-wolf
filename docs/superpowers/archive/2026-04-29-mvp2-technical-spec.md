# MVP2: Context Resolver — Technical Specification

**Date:** 2026-04-29  
**Status:** Draft → Ready for Implementation  
**Depends on:** MVP1C (Graph Orchestration)  
**Next:** MVP3 (Policy Engine)

---

## 1. Overview

MVP2 implements a deterministic, read-only, local-only Context Resolver for Mr. Wolf. It scans the project filesystem, discovers relevant files, documentation, configuration, and local case history, then produces a structured context bundle and a human-readable `context.md`.

The Context Resolver is a **standalone tool**. It does not require workflow execution, does not call external APIs, and does not use LLMs. It is deterministic: the same project state produces the same bundle (modulo `generated_at`).

---

## 2. Goals

- Provide a reproducible way to collect project context before workflow execution.
- Support scenario-specific context inclusion/exclusion without LLM classification.
- Respect configurable limits (file count, total bytes, per-file bytes, case count).
- Guard against path traversal, symlink escapes, and self-ingestion.
- Produce both machine-readable (`context-bundle.json`) and human-readable (`context.md`) output.

---

## 3. Scope

### In Scope

| Feature                  | Description                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Project file discovery   | Scan project root with include/exclude glob patterns                                                               |
| Project docs discovery   | `README.md`, `AGENTS.md`, `docs/**/*.md`                                                                           |
| Project rules discovery  | `wolf.yaml`, `.wolf/**/*.md`, `.wolf/**/*.yaml`                                                                    |
| Project config discovery | `package.json`, `tsconfig.json`, `vitest.config.ts`, `Dockerfile`, `docker-compose.yml`, `.github/workflows/*.yml` |
| Case memory (read-only)  | Read local `.wolf/state/cases` metadata; no LLM summarization                                                      |
| Scenario overrides       | Keyword-based scenario matching; scenario-specific include/exclude/limits                                          |
| Structured bundle output | `.wolf/context/context-bundle.json` with bounded text content                                                      |
| Markdown output          | `.wolf/context/context.md` human/LLM-readable rendered context                                                     |
| CLI commands             | `wolf context scan`, `wolf context build`, `wolf context build --scenario <id>`, `--json`                          |
| Events                   | `context.scan.started`, `context.scan.completed`, `context.case_memory.read`, `context.bundle.created`             |
| Guards                   | Path traversal prevention, symlink root boundary, hidden dir exclusion, self-ingestion exclusion                   |

### Out of Scope

| Feature                     | Reason                                       |
| --------------------------- | -------------------------------------------- |
| Email / Calendar / CRM      | External systems, require auth               |
| Web search                  | External API, non-deterministic              |
| External knowledge base     | Out of local filesystem scope                |
| Vector DB / semantic search | Requires embedding model; too heavy for MVP2 |
| LLM summarization           | Non-deterministic; deferred to future MVP    |
| Remote docs / URLs          | External I/O                                 |
| MCP / A2A integrations      | Protocol integrations out of scope           |
| Memory layer (learning)     | Read-only deterministic scope only           |
| Binary file content         | Metadata only; content excluded              |

---

## 4. Architecture

### Component Diagram

```text
wolf context build [--scenario <id>]
  │
  ├─► ContextScanner.scan(cwd, config)
  │     → ScanResult { files: ContextFile[], metadata: ScanMetadata }
  │
  ├─► CaseMemoryReader.read(casesDir, config)
  │     → CaseMemory { cases: ContextCase[], metadata: CaseMemoryMetadata }
  │
  ├─► ContextResolver.resolve(scanResult, caseMemory, config)
  │     → ResolvedContext { groups: ContextGroup[], metadata: ResolveMetadata }
  │
  ├─► ContextBundleBuilder.build(resolved, config)
  │     → writes .wolf/context/context-bundle.json
  │
  └─► ContextMdGenerator.generate(bundle)
        → writes .wolf/context/context.md
```

### Component Responsibilities

| Component              | Responsibility                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextScanner`       | Walk project directory tree, apply include/exclude patterns, collect file metadata, detect text vs binary, read bounded text content                                                                |
| `CaseMemoryReader`     | Read `.wolf/state/cases/*/case.yaml` and `state.json`, collect safe metadata, tolerate missing/corrupt files, sort by `updated_at desc` then `case_id asc`, derive `artifact_count` from `outputs/` |
| `ContextResolver`      | Classify scanned files into groups (`project_files`, `project_docs`, `project_rules`, `project_configs`), merge with case memory, apply scenario overrides                                          |
| `ContextBundleBuilder` | Serialize resolved context into `context-bundle.json` with deterministic ordering                                                                                                                   |
| `ContextMdGenerator`   | Render bundle into human-readable `context.md` with sections, summaries, and per-file renderer truncation                                                                                           |
| `ContextCLI`           | Parse CLI args, load config, orchestrate components, emit events, handle output modes                                                                                                               |

---

## 5. Data Model

### ContextBundle (top-level)

```typescript
interface ContextBundle {
  version: '1.0.0';
  generated_at: string; // ISO 8601
  scenario: string; // "default" or scenario id
  project: {
    root: string;
    files: ContextFile[];
    docs: ContextFile[];
    rules: ContextFile[];
    configs: ContextFile[];
  };
  case_memory: {
    cases: ContextCase[];
    count: number;
    total_count: number;
    metadata: CaseMemoryMetadata;
  };
  scan_metadata: ScanMetadata;
  resolve_metadata: ResolveMetadata;
}
```

### ContextFile

```typescript
interface ContextFile {
  path: string; // Relative to project root
  kind: 'project_file' | 'project_doc' | 'project_rule' | 'project_config';
  size: number; // Bytes
  extension: string;
  hash: string; // sha256 of raw file bytes for all files, including binary
  mtime: string; // ISO 8601
  content_included: boolean;
  content_truncated: boolean;
  content?: string; // Present if content_included
}
```

### ContextCase

```typescript
interface ContextCase {
  case_id: string;
  workflow_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  artifact_count: number;
  completed_steps?: string[];
  failed_steps?: string[];
}
```

### CaseMemoryMetadata

```typescript
interface CaseMemoryMetadata {
  cases_read: number;
  total_cases: number;
  skipped_cases: string[];
}
```

### ResolveMetadata

```typescript
interface ResolveMetadata {
  groups: Record<string, number>; // e.g. { project_files: 12, project_docs: 3 }
}
```

### ScanMetadata

```typescript
interface ScanMetadata {
  files_scanned: number;
  files_included: number;
  files_skipped: number;
  bytes_included: number;
  bytes_truncated: number;
  limits_applied: string[];
  skipped_files?: string[]; // Paths of files skipped due to limits
}
```

---

## 6. Configuration

### wolf.yaml additions

```yaml
context:
  include:
    - 'src/**/*'
    - 'tests/**/*'
    - 'docs/**/*.md'
    - 'README.md'
    - 'AGENTS.md'
    - 'examples/**/*'
  exclude:
    - 'node_modules/**'
    - 'dist/**'
    - '.git/**'
    - '.wolf/state/**'
    - '.wolf/context/**'
    - 'coverage/**'
    - '.worktrees/**'
  limits:
    max_files: 100
    max_bytes: 10485760 # 10MB total
    max_file_bytes: 1048576 # 1MB per file (byte limit, not character limit)
    max_cases: 10
  include_content: true # Default: include text content
  markdown_render_chars: 1000 # Fixed per-file char limit for context.md renderer (MVP2)
  output:
    bundle: '.wolf/context/context-bundle.json'
    markdown: '.wolf/context/context.md'

  scenarios:
    - id: dev
      match:
        keywords: ['code', 'bug', 'test', 'review']
      context:
        include:
          - 'src/**/*.ts'
          - 'tests/**/*.ts'
          - 'package.json'
        exclude:
          - 'docs/archive/**'
    - id: docs
      match:
        keywords: ['doc', 'guide', 'readme', 'tutorial']
      context:
        include:
          - 'docs/**/*.md'
          - 'README.md'
          - 'AGENTS.md'
        exclude:
          - 'src/**'
          - 'tests/**'
```

### Scenario Merge Semantics

1. **Global include/exclude** form the base set.
2. **Scenario include** is appended to global include (OR semantics).
3. **Scenario exclude** is appended to global exclude (AND semantics).
4. **Scenario limits** override global limits only for keys explicitly set in the scenario.
5. If no scenario is active, global config is used as-is.

---

## 7. File Classification Rules

`ContextResolver` classifies each included file into exactly one group using deterministic rules (first match wins):

| Group             | Patterns                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project_docs`    | `README.md`, `AGENTS.md`, `docs/**/*.md`, `.wolf/**/*.md`                                                                                                                      |
| `project_rules`   | `wolf.yaml`, `.wolf/**/*.yaml` (excluding `.wolf/state/**`)                                                                                                                    |
| `project_configs` | `package.json`, `tsconfig.json`, `vitest.config.ts`, `Dockerfile`, `docker-compose.yml`, `.github/workflows/*.yml`, `.github/workflows/*.yaml`, `.prettierrc`, `.prettierrc.*` |
| `project_files`   | Everything else included                                                                                                                                                       |

### Content Inclusion Rules

- `include_content: true` (default): text files under `max_file_bytes` get content included.
- Binary files: `content_included: false`, only metadata.
- Files over `max_file_bytes`: `content_included: true`, `content_truncated: true`. Content is read up to `max_file_bytes` bytes and decoded as UTF-8. Truncation is byte-based, not character-based.
- Text detection: check if file contains null bytes; if yes → binary.

---

## 8. Scenario Handling

### Matching

Scenario matching is **deterministic keyword-based**. No LLM classifier.

```typescript
function matchScenario(scenarios: Scenario[], input: string): Scenario | null {
  for (const scenario of scenarios) {
    const inputLower = input.toLowerCase();
    const matches = scenario.match.keywords.some((k) => inputLower.includes(k.toLowerCase()));
    if (matches) return scenario;
  }
  return null;
}
```

### Usage

- `wolf context build` → no scenario matching (uses default/global config).
- `wolf context build --scenario dev` → uses scenario `dev` directly.
- Future: workflow `execution.scenario` or CLI arg can trigger automatic matching.

---

## 9. Limits & Guards

### Limits

| Limit            | Default | Behavior when exceeded                                                            |
| ---------------- | ------- | --------------------------------------------------------------------------------- |
| `max_files`      | 100     | Stop including new files; record remainder in `skipped_files`                     |
| `max_bytes`      | 10MB    | Stop including new files when total bytes would exceed; record in `skipped_files` |
| `max_file_bytes` | 1MB     | Truncate file content; mark `content_truncated: true`                             |
| `max_cases`      | 10      | Read only most recent N cases by `updated_at`                                     |

### Guards

| Guard              | Implementation                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path traversal     | Config paths (include, exclude, output) must not be absolute and must not escape project root after normalization. Scanned file paths are always stored relative to project root. Any resolved candidate path outside project root is skipped. |
| Symlink escape     | Resolve symlinks; if resolved path is outside project root → skip                                                                                                                                                                              |
| Hidden dirs        | Exclude dirs starting with `.` unless explicitly in include patterns. `.github` and `.wolf` paths are explicitly included by default config, except `.wolf/state/**` and `.wolf/context/**` which are always excluded.                         |
| Self-ingestion     | Exclude `.wolf/context/**` and `.wolf/state/**` by default                                                                                                                                                                                     |
| Binary files       | Detect null bytes; skip content, include metadata only                                                                                                                                                                                         |
| Corrupt case files | Tolerate missing `case.yaml` or unreadable `state.json`; skip and report in metadata                                                                                                                                                           |
| Case sorting       | Cases sorted by `updated_at` descending, then `case_id` ascending; `max_cases` applied after sorting                                                                                                                                           |

---

## 10. CLI Commands

### `wolf context scan`

Scan files without persisting bundle. Useful for dry-run and inspection.

```bash
wolf context scan
# → scans files (metadata only, no content)
# → prints summary / JSON
# → does not persist bundle

wolf context scan --scenario dev
# → applies scenario overrides for dry-run preview
# → metadata only, no content

wolf context build
# → scans files with content
# → reads case memory
# → resolves groups
# → writes context-bundle.json
# → writes context.md

wolf context build --scenario dev
# → applies scenario overrides
# → exact scenario id match; exits with code 1 if id not found
```

### `wolf context build`

Full build: scan, read case memory, resolve, write bundle + markdown.

```bash
wolf context build
# → writes .wolf/context/context-bundle.json
# → writes .wolf/context/context.md

wolf context build --scenario dev
# → applies scenario overrides

wolf context build --json
# → writes files AND outputs JSON summary with written paths
```

### Exit Codes

| Code | Meaning                                           |
| ---- | ------------------------------------------------- |
| 0    | Success                                           |
| 1    | Error (invalid config, path traversal, I/O error) |

---

## 11. Events

| Event                      | When                      | Payload                                                  |
| -------------------------- | ------------------------- | -------------------------------------------------------- |
| `context.scan.started`     | Before scanning           | `{ root, scenario }`                                     |
| `context.scan.completed`   | After scanning            | `{ files_scanned, files_included, bytes_included }`      |
| `context.case_memory.read` | After reading case memory | `{ cases_read, total_cases, skipped_cases }`             |
| `context.bundle.created`   | After writing bundle      | `{ bundle_path, markdown_path, file_count, byte_count }` |

---

## 12. Output Format

### context-bundle.json

Pretty-printed JSON with deterministic key ordering. Content is included inline for text files.

### context.md

Markdown document with the following sections:

```markdown
# Project Context

Generated: 2026-04-29T13:00:00Z
Scenario: dev

## Project Files

### src/workflow/engine.ts

- Size: 12.4 KB
- Modified: 2026-04-29

\`\`\`typescript
// content truncated to 1000 chars
...
\`\`\`

## Project Docs

## Project Rules

## Project Configs

## Case Memory

| Case ID  | Workflow | Status    | Updated    |
| -------- | -------- | --------- | ---------- |
| case_001 | review   | completed | 2026-04-28 |

## Scan Metadata

- Files scanned: 47
- Files included: 23
- Bytes included: 1.0 MB
- Limits applied: max_files=100
```

---

## 13. Acceptance Criteria

### Functional

- [ ] `wolf context scan` lists discovered file metadata without writing to disk or reading content.
- [ ] `wolf context scan --json` outputs valid JSON with metadata only (no file content) and writes nothing.
- [ ] `wolf context scan --scenario dev` applies scenario overrides for dry-run preview.
- [ ] `wolf context build` writes `context-bundle.json` and `context.md` to `.wolf/context/`.
- [ ] `wolf context build --json` outputs JSON summary with written paths.
- [ ] `wolf context build --scenario dev` applies scenario-specific include/exclude/limits; exact id match, exits 1 if not found.
- [ ] Bundle includes bounded text content for text files under `max_file_bytes`.
- [ ] Binary files appear in bundle as metadata only (`content_included: false`).
- [ ] Case memory includes metadata from local `.wolf/state/cases` without LLM summarization.
- [ ] Scenario matching uses deterministic keyword matching (no LLM).

### Guards & Safety

- [ ] Path traversal via `..` is rejected.
- [ ] Symlinks escaping project root are skipped.
- [ ] `.wolf/context/**` is excluded from scan by default.
- [ ] Hidden directories (starting with `.`) are excluded unless explicitly included.
- [ ] Corrupt or missing case files are tolerated; skipped cases reported in metadata.
- [ ] Total bytes and file count limits are enforced.

### Determinism & Reproducibility

- [ ] Same filesystem state produces deterministic bundle content (including mtimes; `generated_at` varies).
- [ ] File hash is SHA-256 of raw file bytes for all files, including binary.
- [ ] Files are sorted deterministically (alphabetically by path).

### Tests

- [ ] Unit tests for `ContextScanner` (include/exclude, limits, guards).
- [ ] Unit tests for `CaseMemoryReader` (tolerance, limits, sorting).
- [ ] Unit tests for `ContextResolver` (classification, scenario merge).
- [ ] Unit tests for `ContextBundleBuilder` and `ContextMdGenerator`.
- [ ] Integration tests for CLI (`scan`, `build`, `--scenario`, `--json`).
- [ ] All tests pass in Docker (`docker run --rm mister-wolf:test`).

---

## 14. Implementation Plan

Split into 5 PRs for incremental delivery:

| PR      | Focus                      | Components                                                                                          |
| ------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| **PR1** | Config, Schema, Types      | `wolf.yaml` context section, Zod schemas, TypeScript types, config loader updates                   |
| **PR2** | Context Scanner            | `ContextScanner`, glob matching, guards, limits, text/binary detection, metadata/content collection |
| **PR3** | Case Memory Reader         | `CaseMemoryReader`, case metadata extraction, corrupt file tolerance, sorting by `updated_at desc`  |
| **PR4** | Resolver, Bundle, Markdown | `ContextResolver` (classification + scenario merge), `ContextBundleBuilder`, `ContextMdGenerator`   |
| **PR5** | CLI, Events, Tests, Docs   | `wolf context` commands, event emission, integration tests, README/docs updates                     |

---

## 15. Dependencies

- `glob` or `fast-glob` for pattern matching
- `crypto` (Node.js built-in) for SHA-256 hashing
- `fs`, `path` for filesystem operations
- Existing: `js-yaml`, `zod`, `commander`

---

## 16. Notes

- The Context Resolver does not modify project files. It is strictly read-only.
- Output directory `.wolf/context/` may be added to `.gitignore` by users.
- Future MVPs may extend the bundle format; version `1.0.0` leaves room for backward-compatible additions.
- Scenario keyword matching is intentionally simple. Future versions may add regex or rule-based matching.
