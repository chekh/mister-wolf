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
- `wolf memory brief` — generate/update `.wolf/memory/briefs/agent-brief-latest.md` from the latest scan plus active, accepted memory objects.
- New memory type: `context` (used only for factual project snapshots, not for briefs).
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

| Type      | Directory          |
| --------- | ------------------ |
| `context` | `objects/context/` |

Used for:

- `project-scan-latest` — factual repository snapshot.

`context` is **not** used for generated briefs, task-specific contexts, session logs, or cases. It is reserved for factual, generated project context snapshots.

Review state policy:

- Scan objects are `accepted` because they contain factual metadata.

For MVP-B, `project-scan-latest` is a mutable generated context object. It is not treated as immutable curated memory. Each update still appends a `memory.updated` event. Historical scan versions are deferred.

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
  path: '.'
related: {}
tags:
  - scan
superseded_by: null
body: ''
---
```

### 4.2. Body Structure

Body is structured Markdown:

```markdown
# Project Scan: {projectName}

## Repository

- Root: .
- Project name: mister-wolf
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
| ---- | --------- | ------------ |
| ...  | ...       | ...          |
```

### 4.3. Scanner Rules

- Respect `.gitignore`.
- Always ignore: `node_modules/`, `.git/`, `dist/`, `.coverage/`, `.wolf/`, `.codegraph/`, `.worktrees/`.
- Skip binary files and files larger than 1 MB.
- Do not read arbitrary file contents. Only allowlisted small metadata files may be read:
  - `README.md`
  - `package.json`
  - `tsconfig.json`
  - `vitest.config.ts`
  - `pyproject.toml`
  - `Cargo.toml`
  - `go.mod`
- Never read `.env`, secrets, API keys, lockfiles, binary files, or files over 1 MB.
- Output must be deterministic: files, tags, dependencies, top-level directories sorted; timestamps controlled through the `Clock` port.

### 4.4. Heuristics

- **Languages:** derived from file extensions.
- **Entry points:** from `package.json` `main`/`bin`, then `src/index.*`, then `src/bootstrap/*`.
- **Config files:** known names (`package.json`, `tsconfig.json`, `vitest.config.ts`, etc.).
- **Dependencies:** from `package.json` `dependencies`/`devDependencies`, or equivalent in other ecosystems. Lockfiles are noted by presence only, not read.
- **Top-level directories:** direct children of project root after filtering.
- **File count:** total number of files scanned.
- **Project name:** from `package.json` name, then directory name.

---

## 5. Agent Brief

Agent Brief is **not** a memory object. It is a generated artifact assembled from memory objects and the latest project scan.

Storage:

```text
.wolf/memory/briefs/agent-brief-latest.md
```

It is overwritten on each `wolf memory brief` run. It is not indexed as a memory object by default. A `brief.generated` event may be appended to `events.jsonl` for audit purposes.

### 5.1. File Format

Plain Markdown file (no YAML frontmatter):

```markdown
# Agent Brief: {projectName}

## Project Snapshot

- Root: .
- Project name: mister-wolf
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

{up to 10 most recent active + accepted memory objects, sorted by `updated_at` descending. `context` objects are excluded.}

## Open Questions

{active memory objects of type `open-question`.}

## Sources

- Project scan: project-scan-latest
- README.md
- package.json
- Active memory objects: {count}

## Limitations

- This brief is generated from the latest scan and accepted active memory.
- It may be incomplete if the scan is outdated.

## Recommended First Steps

- Read docs/concept-v3.md
- Read AGENTS.md
- Run npm run check
```

### 5.2. Inputs

- Latest `project-scan-latest` object.
- Active, accepted memory objects (`status: active`, `review_state: accepted`), excluding `type: context`.
- `README.md` and package metadata for project description.

### 5.3. Output Behavior

- `wolf memory brief` prints the generated brief to stdout and saves it to `.wolf/memory/briefs/agent-brief-latest.md`.
- To view the saved brief: `cat .wolf/memory/briefs/agent-brief-latest.md` (future: `wolf memory brief --show`).

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
  readSmallTextFile(path: string): Promise<string | null>;
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
- `generate-agent-brief` depends on `MemoryStore`, `FileSystem`, `Clock`. It writes directly to `.wolf/memory/briefs/agent-brief-latest.md` and optionally appends a `brief.generated` event to `EventLog`.

---

## 7. CLI Interface

```bash
# Scan the current project and persist a snapshot
node dist/bootstrap/cli.js memory scan

# Generate/update the agent brief
node dist/bootstrap/cli.js memory brief

# View the saved brief
cat .wolf/memory/briefs/agent-brief-latest.md
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
- `wolf memory brief` creates/updates `.wolf/memory/briefs/agent-brief-latest.md`, prints it to stdout, and does not index it as a memory object.
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
