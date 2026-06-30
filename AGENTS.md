# Agent Brief: mr-wolf

## Project Snapshot
- Root: .
- Project name: mr-wolf
- Branch: feat/phase-4
- Commit: 0750ee9
- Generated: 2026-06-30

## What This Project Is
Mr. Wolf

> **"I solve problems."**
>
> Local-first project memory harness for AI coding agents.
>
> Not another agent. A memory substrate for agents.
>
> See `docs/superpowers/specs/2026-06-30-project-memory-harness-base-concept.md` for the base concept.

## Technology Stack
- Languages: json, jsonl, md, ts, yaml
- Key dependencies: better-sqlite3, commander, fast-glob, js-yaml, vitest

## Key Files & Entry Points
- `src/bootstrap/cli.ts` — CLI bootstrap
- `src/adapters/cli/cli-entry.ts` — command registration
- `src/domain/memory-types.ts` — canonical memory type list
- `package.json` — scripts and dependencies
- `tsconfig.json`, `vitest.config.ts` — config

## Architecture Notes
- Ports-and-adapters (hexagonal) architecture.
- `domain` imports nothing.
- `app/use-cases` import `domain` and `ports`.
- `adapters` implement `ports`.
- CLI and MCP are thin inbound adapters.

## Completed phases
- Phase 0: Core Memory — markdown object store, JSONL event log, `init`/`add`/`list`/`get`/`supersede`.
- Phase 1: Work Threads, Info Requests, Articles — `work-thread`, `info-request`, `article`, `thread brief`.
- Phase 2: Decisions and Blockers — `decision`, `blocker`, `blocker resolve`, brief integration.
- Phase 3: Incremental Indexing + Document Registration — `search` sees new objects immediately; `scan` registers project documents as `document` artifacts by reference.
- Phase 4: Relations and Session Checkpoints — `relations.jsonl`, explicit artifact links, `session-checkpoint` type, `thread diff`.

## Next phase
- Phase 5: Search and Retrieval Improvements — ranking, filters, tag search, stale detection.

## Active Memory
- [decision] Use decision and blocker types for Phase 2 — Completed.
- [decision] Do not commit `.codegraph/` to the repository — `.codegraph/` is ignored.
- [decision] Use git-flow: all changes through `dev` — create features/fixes as `feat/*` or `fix/*`, merge to `dev`, then to `main`.
- [lesson] Session 2026-06-30: documentation cleanup after pivot; outdated concept docs archived.
- [decision] Incremental indexing — `add`, create-*, `scan`, `supersede`, and `resolve` update the FTS5 index automatically.
- [decision] Canonical relations in `relations.jsonl` — frontmatter mirrors are for readability only.

## Open Questions
- Should relation predicates be user-extensible or fixed to the core set?
- Should session checkpoints capture full artifact snapshots or only ids?

## Blockers
- None.

## Sources
- Project scan: project-scan-latest
- README.md
- package.json
- Active memory objects: derived from `.wolf/memory/objects/**/*.md`

## Recommended First Steps
1. Review `docs/superpowers/plans/roadmap.md` for the canonical plan.
2. Pick Phase 5 work: ranking, filters, tag search, stale detection.
3. Run `npm run check` before and after changes.
