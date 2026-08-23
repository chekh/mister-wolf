# Agent Brief: mr-wolf

## Project Snapshot
- Root: .
- Project name: mr-wolf
- Branch: main
- Commit: c93d524
- Generated: 2026-07-03

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
- `CORE_TAXONOMY` (`src/domain/memory-types.ts`) is the canon for all 22 memory types: existence, lifecycle, fields, governance, layout. `.wolf/config.yaml` mirrors the core block (via `wolf taxonomy sync`) and adds project-specific types; code always wins.
- Storage layout v2: objects live in `threads/<thread-id>/<subdir>/` or `shared/<subdir>/`; work threads are `threads/<id>/WORK-THREAD.md`. The store dual-reads the legacy `objects/<type>/` root; writes go only to v2.

## Completed phases
- Phase 0: Core Memory — markdown object store, JSONL event log, `init`/`add`/`list`/`get`/`supersede`.
- Phase 1: Work Threads, Info Requests, Articles — `work-thread`, `info-request`, `article`, `thread brief`.
- Phase 2: Decisions and Blockers — `decision`, `blocker`, `blocker resolve`, brief integration.
- Phase 3: Incremental Indexing + Document Registration — `search` sees new objects immediately; `scan` registers project documents as `document` artifacts by reference.
- Phase 4: Relations and Session Checkpoints — `relations.jsonl`, explicit artifact links, `session-checkpoint` type, `thread diff`.
- Phase 5: Search and Retrieval Improvements — ranking, filters, tag search, stale detection.
- Phase 6: Governance + Flat CLI/MCP Namespace — `rule` type, user-only rule creation, flattened `wolf *` commands and MCP tool names.
- Phase 7: Session Wrap-Up Habit — `session-summary` type, auto-triggered on lifecycle events, manual `wolf session wrap-up` command.
- Phase 8: Schema-Driven Taxonomy + Orchestration Types + Write Reliability — taxonomy via `CORE_TAXONOMY` + `.wolf/config.yaml` (`wolf taxonomy sync/show`), 7 orchestration types (`task-brief`, `report`, `council-question`, `council-opinion`, `synthesis`, `escalation`, `decision-request`) created via `wolf add --type X --set k=v`, document split (`document-ref`/`document-native`), layout v2 migrated (`wolf migrate`), write reliability (memory lock, tolerant JSONL, quarantine via `wolf validate --fix`, SQLITE_BUSY retry).

## Next phase
- Phase 9: Decide from roadmap-v2 or wolf solve/call concept research.

## Active Memory
- [decision] Use decision and blocker types for Phase 2 — Completed.
- [decision] Do not commit `.codegraph/` to the repository — `.codegraph/` is ignored.
- [decision] Use git-flow: all changes through `dev` — create features/fixes as `feat/*` or `fix/*`, merge to `dev`, then to `main`.
- [lesson] Session 2026-06-30: documentation cleanup after pivot; outdated concept docs archived.
- [decision] Incremental indexing — `add`, create-*, `scan`, `supersede`, and `resolve` update the FTS5 index automatically.
- [decision] Canonical relations in `relations.jsonl` — frontmatter mirrors are for readability only.
- [decision] Flat CLI/MCP namespace — Phase 6 replaced `wolf memory ...` with direct `wolf ...` commands and flattened MCP tool names.
- [decision] Rule type requires explicit user request — agents cannot create rules proactively.
- [decision] Session summaries auto-trigger on lifecycle events and via manual `wolf session wrap-up`.
- [decision] Use zod 4 for MCP JSON schema generation — `@modelcontextprotocol/server` alpha.2 requires zod >=4.2.0 to expose tool input schemas via `tools/list`.
- [observation] MCP server fixed — now uses `serveStdio`, zod 4 schemas, and robust line-delimited JSON stdio test.
- [rule] After completing any implementation phase, update AGENTS.md, README.md, MEMORY.md, and any affected docs to keep project memory accurate.

## Open Questions
- Should relation predicates be user-extensible or fixed to the core set?
- Should session checkpoints capture full artifact snapshots or only ids?
- Wolf solve/call concept research (schema-driven taxonomy shipped in Phase 8)?

## Blockers
- None.

## Sources
- Project scan: project-scan-latest
- README.md
- package.json
- Active memory objects: derived from `.wolf/memory/` (layout v2: `threads/**`, `shared/**`)

## Recommended First Steps
1. Review `docs/superpowers/plans/roadmap-v2.md` for the canonical plan.
2. Pick Phase 8 work: schema-driven taxonomy or wolf solve/call concept research.
3. Run `npm run check` before and after changes.
4. After completing any phase, update AGENTS.md, README.md, MEMORY.md, and affected docs.
