# Design Spec: MVP-B — Project Scan + Agent Brief

**Date:** 2026-06-29
**Status:** Draft for review
**Topic:** Add project scanning and agent brief generation to Mr. Wolf.

---

## 1. Purpose

MVP-B gives Mr. Wolf the ability to "see" the project: capture a structured snapshot of the repository (Project Scan) and generate a concise brief that an agent can read before starting work (Agent Brief).

This is a minimal increment. Scope is intentionally narrow; advanced context assembly, token budgets, session logs, and drift detection are deferred.

---

## 2. Scope

### 2.1. In Scope

- `wolf memory scan` — scan the file-system structure of the project and persist a snapshot as a `context` memory object with fixed id `project-scan-latest`.
- `wolf memory brief` — generate/update `agent-brief-latest.md` from the latest scan plus active, accepted memory objects.
- New memory type: `context`.
- New ports: `FileSystem`, `ProjectScanner`.
- New adapters: `fs-file-system`, `heuristic-project-scanner`.
- New use-cases: `scan-project`, `generate-agent-brief`.
- New CLI commands: `memory scan`, `memory brief`.
- Update `AGENTS.md` and `README.md` with new commands and MVP-B status.

### 2.2. Out of Scope

- Task-specific brief filtering (`--task`, `--budget`, `--startup`).
- Session/daily logs.
- Structured case state (`case.json`).
- Drift detection (`check-drift`).
- Evidence fields on memory objects.
- AST-based code analysis.
- External LLM integration.
- Interactive brief editing in CLI.

---

## 3. Memory Type `context`

`context` is added to `MEMORY_TYPES` in `src/domain/memory-types.ts`.

Directory mapping:

| Type      | Directory                    |
|-----------|------------------------------|
| `context` | `objects/context/`           |

Used for:

- `project-scan-latest` — factual repository snapshot.
- `agent-brief-latest` — generated agent-facing brief.

Review state policy:

- Scan objects are `accepted` because they contain factual metadata.
- Brief objects are `proposed` because they contain interpretation/assembly that a human may want to review.

---

## 4. Project Scan

### 4.1. Memory Object Format

Frontmatter follows the standard `MemoryObjectSchema`:

```yaml
---
id: project-scan-latest
type: context
title: Project scan for mister-wolf
status: active
review_state: accepted
confidence: high
importance: 0.7
created_at: 2026-06-29T14:00:00Z
updated_at: 2026-06-29T14:00:00Z
created_by: agent:mr-wolf
schema_version: 1
source:
  kind: scan
  path: /Users/chekh/Development/mister-wolf
related: {}
tags:
  - scan
superseded_by: null
body: ""
---
```

### 4.2. Body Structure

Body is structured Markdown:

```markdown
# Project Scan: {projectName}

## Repository
- Root: /Users/chekh/Development/mister-wolf
- Branch: main
- Commit: ea0e676

## Summary
- Languages: TypeScript, JavaScript
- Entry points: src/bootstrap/cli.ts
- Config files: package.json, tsconfig.json, vitest.config.ts
- Dependencies: zod, commander, better-sqlite3, vitest
- Top-level directories: src, tests, docs
- File count: 42

## Files
| Path | Extension | Size (bytes) |
|------|-----------|--------------|
| ...  | ...       | ...          |
```

### 4.3. Scanner Rules

- Respect `.gitignore`.
- Always ignore: `node_modules/`, `.git/`, `dist/`, `coverage/`, `.wolf/`, `.codegraph/`, `.worktrees/`.
- Skip binary files and files larger than 1 MB.
- Do not read file contents; collect only metadata, paths, and key strings.
- Never log secrets, API keys, or `.env` contents.

### 4.4. Heuristics

- **Languages:** derived from file extensions.
- **Entry points:** from `package.json` `main`/`bin`, then `src/index.*`, then `src/bootstrap/*`.
- **Config files:** known names (`package.json`, `tsconfig.json`, `vitest.config.ts`, etc.).
- **Dependencies:** from `package.json` `dependencies`/`devDependencies`, or equivalent in other ecosystems.
- **Top-level directories:** direct children of project root after filtering.
- **File count:** total number of files scanned.

---

## 5. Agent Brief

### 5.1. Memory Object Format

Frontmatter follows the standard `MemoryObjectSchema`:

```yaml
---
id: agent-brief-latest
type: context
title: Agent brief for mister-wolf
status: active
review_state: proposed
confidence: medium
importance: 0.8
created_at: 2026-06-29T14:00:00Z
updated_at: 2026-06-29T14:00:00Z
created_by: agent:mr-wolf
schema_version: 1
source:
  kind: scan
  path: /Users/chekh/Development/mister-wolf
related: {}
tags:
  - brief
superseded_by: null
body: ""
---
```

### 5.2. Body Structure

```markdown
# Agent Brief: {projectName}

## Project Snapshot
- Root: /Users/chekh/Development/mister-wolf
- Branch: main
- Commit: ea0e676
- Generated: 2026-06-29T14:00:00Z

## What This Project Is
{2-3 sentences from README first paragraphs; fallback to package metadata description.}

## Technology Stack
{languages and key dependencies}

## Key Files & Entry Points
{list from scan}

## Architecture Notes
{heuristic notes based on `src/` structure, e.g. ports/adapters pattern.}

## Active Memory
{up to 10 most recent active + accepted memory objects, sorted by `updated_at` descending.}

## Open Questions
{active memory objects of type `open-question`.}

## Recommended First Steps
- Read docs/concept-v3.md
- Read AGENTS.md
- Run npm run check
```

### 5.3. Inputs

- Latest `project-scan-latest` object.
- Active, accepted memory objects (`status: active`, `review_state: accepted`).
- `README.md` and package metadata for project description.

### 5.4. Output Behavior

- `wolf memory brief` prints the generated brief to stdout and saves it as `agent-brief-latest.md`.
- To view the saved brief: `wolf memory get agent-brief-latest`.

---

## 6. Architecture

### 6.1. New Files

```text
src/
├── domain/
│   ├── memory-types.ts                    # add 'context'
│   └── schemas/
│       └── project-scan-schema.ts         # ProjectSnapshot types
├── ports/
│   ├── file-system.port.ts
│   └── project-scanner.port.ts
├── adapters/fs/
│   ├── fs-file-system.ts
│   └── heuristic-project-scanner.ts
├── app/use-cases/
│   ├── scan-project.ts
│   └── generate-agent-brief.ts
└── adapters/cli/commands/
    ├── memory-scan.ts
    └── memory-brief.ts
```

### 6.2. Port Interfaces

```typescript
// ports/file-system.port.ts
export interface FileSystem {
  listDirectory(path: string): Promise<DirectoryEntry[]>;
  readFile(path: string): Promise<string | null>;
  isDirectory(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

// ports/project-scanner.port.ts
export interface ProjectScanner {
  scan(root: string): Promise<ProjectSnapshot>;
}
```

### 6.3. Dependency Rules

- `domain` imports nothing from `app`, `ports`, or `adapters`.
- `app` imports `domain` and `ports` only.
- `adapters` import `ports` (and `app` DTOs where needed).
- `bootstrap` wires everything.
- CLI commands import only use-cases or the container.

### 6.4. Use-Case Dependencies

- `scan-project` depends on `ProjectScanner`, `MemoryStore`, `EventLog`, `Clock`, `IdGenerator`.
- `generate-agent-brief` depends on `MemoryStore`, `EventLog`, `Clock`, `IdGenerator`.

---

## 7. CLI Interface

```bash
# Scan the current project and persist a snapshot
node dist/bootstrap/cli.js memory scan

# Generate/update the agent brief
node dist/bootstrap/cli.js memory brief

# View the saved brief
node dist/bootstrap/cli.js memory get agent-brief-latest
```

No required arguments. Both commands operate relative to the current working directory as the project root.

---

## 8. Testing Strategy

- **Unit:** `heuristic-project-scanner` on a temporary directory — verify filtering, language detection, entry-point detection.
- **Unit:** `generate-agent-brief` with an in-memory `MemoryStore` — verify brief structure with a known scan and memory objects.
- **Integration:** `memory scan` followed by `memory brief` in a real `.wolf/` directory — verify end-to-end workflow and file output.
- **Typecheck + lint:** `npm run check` must pass.

---

## 9. Documentation Updates

- Update `AGENTS.md` with `memory scan` and `memory brief` commands and MVP-B status.
- Update `README.md` command reference.
- Update `docs/concept-v3.md` roadmap to mark MVP-B as in progress.

---

## 10. Acceptance Criteria

- `npm run check` passes without errors.
- `wolf memory scan` creates a valid `context` object at `.wolf/memory/objects/context/project-scan-latest.md`.
- `wolf memory brief` creates a valid `context` object at `.wolf/memory/objects/context/agent-brief-latest.md` and prints it to stdout.
- Scan ignores `node_modules`, `.git`, `.wolf`, binary files, and files >1 MB.
- Tests cover the scanner, use-cases, and CLI commands.

---

## 11. Open Questions / Deferred

- `--task` and token-budget aware brief generation.
- Session/daily logs as raw memory tier.
- Structured case state (`case.json`).
- Drift detection between git history and memory.
- Evidence fields before accepting agent-created memory.

---

## 12. Status

**Design approved pending spec review.** Next step is writing the implementation plan.
