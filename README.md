# Mr. Wolf

![Mr. Wolf logo](docs/Mr.%20Wolf.png)

> **"I solve problems."**
>
> Local-first Project Semantic Memory layer for AI coding agents.
>
> Not another agent. A memory substrate for agents.
>
> See [Project Memory Harness — Base Concept](docs/superpowers/specs/2026-06-30-project-memory-harness-base-concept.md) for the full architecture and concept.

## Status

Phases 0–8 are implemented: Core Memory, Work Threads / Info Requests / Articles, Decisions / Blockers, Incremental Indexing / Document Registration, Relations / Session Checkpoints, Search / Retrieval Improvements, Governance + Flat Namespace, Session Wrap-Up Habit, and Schema-Driven Taxonomy + Orchestration Types + Write Reliability.

Next: **Phase 9 — Decide from roadmap-v2 or wolf solve/call concept research**.

## Quick Start

```bash
npm install
npm run build
node dist/bootstrap/cli.js init
node dist/bootstrap/cli.js add --type lesson --title "First lesson" --body "What we learned"
node dist/bootstrap/cli.js search "lesson"
```

## Commands

### Core memory

- `wolf init` — initialize Mr. Wolf memory in the project.
- `wolf add` — add a memory object. Supports `--tags`, `--confidence`, `--importance`. Search sees it immediately.
- `wolf list` — list memory objects, optionally filtered by type, status, or stale objects.
- `wolf get <id>` — retrieve a single memory object by ID.
- `wolf search <query>` — full-text search over memory objects.
- `wolf supersede <old-id> <new-id>` — mark an older memory object as superseded.
- `wolf rebuild-index` — rebuild the SQLite FTS5 index from markdown source files.

### Phase 1: threads, info requests, articles

- `wolf thread create` — create a work thread.
- `wolf thread list` — list work threads.
- `wolf thread brief <id>` — show a thread brief.
- `wolf info-request create` — create an info request linked to a thread.
- `wolf info-request list` — list info requests.
- `wolf article add` — add an article linked to a thread.
- `wolf article list` — list articles.

### Phase 2: decisions and blockers

- `wolf decision add` — add a decision.
- `wolf decision list` — list decisions.
- `wolf blocker add` — add a blocker.
- `wolf blocker list` — list blockers.
- `wolf blocker resolve <id>` — resolve a blocker.

### Phase 3: scan and document registration

- `wolf scan` — scan the project, save a snapshot context object, and register discovered project documents as `document` artifacts by reference.
- `wolf brief` — generate an agent brief from the latest scan and active memory.

### Phase 4: relations and checkpoints

- `wolf decision add --based-on <artifact-id>` — link a decision to supporting artifacts.
- `wolf blocker resolve <id> --by <artifact-id>` — record what resolved a blocker.
- `wolf session checkpoint --thread <thread-id>` — create a session checkpoint for a thread.
- `wolf thread diff <thread-id> --since <checkpoint-id>` — show changes since a checkpoint.

### Phase 5: search and retrieval improvements

- `wolf search <query> --type <type> --status <status> --tag <tag> --confidence <level> --min-importance <n> --max-importance <n> --created-after <iso> --created-before <iso> --limit <n>` — full-text search with filters and ranking.
- `wolf list --stale` — list memory objects not updated in the last 30 days.

### Phase 6: governance and flat namespace

- `wolf rule add --title "..." --body "..." --scope project|global` — add a rule.
- `wolf rule list` — list rules.

### Phase 7: session wrap-up habit

- `wolf session wrap-up --title "..." --tags tag1,tag2` — manually create a session summary of recent events.
- Session summaries are auto-created after resolving a blocker, terminal transitions, superseding an object, creating a decision, or creating an article.

### Phase 8: schema-driven taxonomy, orchestration types, reliability

- `wolf taxonomy sync` — regenerate `memory_types.core` in `.wolf/config.yaml` from the code canon (`CORE_TAXONOMY`). `artifact_sources` and `memory_types.project` are preserved.
- `wolf taxonomy show` — print the effective taxonomy (core + project types).
- `wolf add --type task-brief --set executor=executor-lead,priority=high` — create any of the 7 orchestration types (`task-brief`, `report`, `council-question`, `council-opinion`, `synthesis`, `escalation`, `decision-request`) via generic creation with extra fields validated by the type declaration.
- `wolf migrate` — one-time migration of legacy `objects/<type>/` into layout v2 (`threads/<tid>/<subdir>/` + `shared/<subdir>/`) with document split (`document-ref`/`document-native`). Dry-run by default; `--apply` performs it. Idempotent.
- `wolf validate [--fix]` — health check: taxonomy drift, layout leftovers, broken objects, events/relations JSONL, index freshness, stale locks. Exit 1 on errors. `--fix` quarantines broken object files into `.wolf/memory/quarantine/`.
- `wolf council tally --question-id <id> --quorum N --threshold X` — count council votes from `council-opinion` objects linked by `answers` relations.
- `wolf council synthesize --question-id <id> --recommendation "..."` — create a `synthesis` object linked `based_on` every opinion.

**Storage layout v2:** objects live in `.wolf/memory/threads/<thread-id>/<subdir>/` (or `shared/<subdir>/` when not tied to a thread); work threads are stored as `threads/<id>/WORK-THREAD.md`. The store reads both v2 and the legacy `objects/` root, but writes only to v2.

**No config.yaml? No problem:** without `.wolf/config.yaml` everything works on the built-in defaults — all 22 core types from `CORE_TAXONOMY`. The config file is a generated mirror plus a place for project-specific types.

## Testing

### Unit & integration tests

```bash
npm run check          # format + lint + vitest + build (~60s)
npm run test:run       # vitest only
```

### End-to-end (black-box CLI)

```bash
npm run e2e            # build + vitest on tests/e2e/**/*.e2e.ts (several minutes)
```

The E2E suite exercises the compiled CLI via `spawnSync` — no source imports. Six scenarios:

1. **Lifecycle** — init → thread → task-brief → report → relation → transition → auto session-summary
2. **Council** — question → opinions → tally winner → synthesis
3. **Reliability** — broken object file (validate + quarantine); broken relations.jsonl line
4. **Generic add** — all 21 non-deprecated types create with correct initial lifecycle status
5. **Migration** — 5 legacy objects migrate from `objects/` to layout v2, idempotent, searchable
6. **MCP stdio** — JSON-RPC `tools/list` returns registered tools

**Known UX gap:** relations cannot be created via CLI (`wolf relation add` is not yet implemented). The E2E suite works around this by writing a temporary `.mjs` script that imports `recordRelation` from `dist/` and runs it in a separate process.

E2E is excluded from `npm run check` because it requires a full build and spawns subprocesses, making it significantly slower (~minutes vs ~60s).

## Documentation

- [Base concept](docs/superpowers/specs/2026-06-30-project-memory-harness-base-concept.md) — architecture and concept
- [Roadmap](docs/superpowers/plans/roadmap-v2.md) — current phases and backlog
- [User guide](docs/user-guide.md) — Phase 4 commands and workflow (Russian)
- [Docs index](docs/README.md) — specs, plans, and archived materials
- [wolf-experiment](wolf-experiment/HANDOFF.md) — archived multi-agent orchestration experiment (Wolf → Executor → Workers, Council Mode): empirical boundaries of hierarchy vs flat agents; see HANDOFF.md (Russian)

## Development

```bash
npm install
npm run check       # format check + lint + tests + build
npm run format      # format code with Prettier
npm run lint        # type check with TypeScript
npm run test:run    # run tests once
npm run build       # compile TypeScript
```

## License

MIT © 2026 chekh
