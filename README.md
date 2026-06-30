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

Phases 0–5 are implemented: Core Memory, Work Threads / Info Requests / Articles, Decisions / Blockers, Incremental Indexing / Document Registration, Relations / Session Checkpoints, and Search / Retrieval Improvements.

Next: **Phase 6 — Governance**.

## Quick Start

```bash
npm install
npm run build
node dist/bootstrap/cli.js memory init
node dist/bootstrap/cli.js memory add --type lesson --title "First lesson" --body "What we learned"
node dist/bootstrap/cli.js memory search "lesson"
```

## Commands

### Core memory

- `wolf memory init` — initialize Mr. Wolf memory in the project.
- `wolf memory add` — add a memory object (lesson, decision, observation, etc.). Search sees it immediately.
- `wolf memory list` — list memory objects, optionally filtered by type, status, or stale objects.
- `wolf memory get <id>` — retrieve a single memory object by ID.
- `wolf memory search <query>` — full-text search over memory objects.
- `wolf memory supersede <old-id> <new-id>` — mark an older memory object as superseded.
- `wolf memory rebuild-index` — rebuild the SQLite FTS5 index from markdown source files.

### Phase 1: threads, info requests, articles

- `wolf memory thread create` — create a work thread.
- `wolf memory thread list` — list work threads.
- `wolf memory thread brief <id>` — show a thread brief.
- `wolf memory info-request create` — create an info request linked to a thread.
- `wolf memory info-request list` — list info requests.
- `wolf memory article add` — add an article linked to a thread.
- `wolf memory article list` — list articles.

### Phase 2: decisions and blockers

- `wolf memory decision add` — add a decision.
- `wolf memory decision list` — list decisions.
- `wolf memory blocker add` — add a blocker.
- `wolf memory blocker list` — list blockers.
- `wolf memory blocker resolve <id>` — resolve a blocker.

### Phase 3: scan and document registration

- `wolf memory scan` — scan the project, save a snapshot context object, and register discovered project documents as `document` artifacts by reference.
- `wolf memory brief` — generate an agent brief from the latest scan and active memory.

### Phase 4: relations and checkpoints

- `wolf memory decision add --based-on <artifact-id>` — link a decision to supporting artifacts.
- `wolf memory blocker resolve <id> --by <artifact-id>` — record what resolved a blocker.
- `wolf memory session checkpoint --thread <thread-id>` — create a session checkpoint for a thread.
- `wolf memory thread diff <thread-id> --since <checkpoint-id>` — show changes since a checkpoint.

### Phase 5: search and retrieval improvements

- `wolf memory search <query> --type <type> --status <status> --tag <tag> --confidence <level> --min-importance <n> --max-importance <n> --created-after <iso> --created-before <iso> --limit <n>` — full-text search with filters and ranking.
- `wolf memory list --stale` — list memory objects not updated in the last 30 days.

## Documentation

- [Base concept](docs/superpowers/specs/2026-06-30-project-memory-harness-base-concept.md) — architecture and concept
- [Roadmap](docs/superpowers/plans/roadmap.md) — current phases and backlog
- [User guide](docs/user-guide.md) — Phase 4 commands and workflow (Russian)
- [Docs index](docs/README.md) — specs, plans, and archived materials

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
