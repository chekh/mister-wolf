# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-29
**Commit:** see `git log --oneline -1` for current HEAD
**Branch:** main

## OVERVIEW

Mr. Wolf is a local-first Project Semantic Memory layer for AI coding agents. It persists structured memory objects (lessons, facts, decisions, context) directly in the project repository and makes them searchable, so agents retain context across sessions without becoming an orchestrator.

**Status:** Current: MVP-A complete. MVP-B (Project Scan + Agent Brief) implemented.

## STRUCTURE

```
.
├── src/                    # TypeScript runtime
│   ├── domain/            # memory object schemas, types, write protocol
│   ├── app/use-cases/     # init, add, get, list, search, supersede, rebuild-index
│   ├── ports/             # outbound contracts
│   ├── adapters/fs/       # markdown store, jsonl event log, clock, id generator, initializer
│   ├── adapters/sqlite/   # FTS5 search index
│   ├── adapters/cli/      # thin CLI commands
│   ├── bootstrap/         # cli entry point
│   └── config/            # reserved for future config loader
├── tests/                  # Vitest test suite
│   ├── unit/              # domain, adapters, use cases
│   └── integration/       # end-to-end memory workflow
├── docs/                   # Documentation
│   ├── concept-v3.md       # current Project Semantic Memory concept
│   ├── superpowers/specs/  # design spec
│   ├── superpowers/plans/  # implementation plan
│   └── archive/            # old orchestrator docs, discussions, and specs
├── AGENTS.md              # This file
├── README.md              # Project overview
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript config
└── vitest.config.ts       # Vitest config
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Understand architecture | `docs/superpowers/specs/2026-06-29-project-semantic-memory-core-design.md` | Covers architecture, memory object model, write protocol, MVP roadmap |
| Memory object model | `src/domain/schemas/memory-object-schema.ts` | Zod schemas and TypeScript types for memory objects |
| Write protocol | `src/domain/policies/write-protocol.ts` | Validation and append-only write rules |
| Storage adapter | `src/adapters/fs/markdown-memory-store.ts` | Markdown file persistence for memory objects |
| Event log | `src/adapters/fs/jsonl-event-log.ts` | Append-only JSONL log of memory events |
| Search index | `src/adapters/sqlite/sqlite-search-index.ts` | FTS5 search index over memory objects |
| Use cases | `src/app/use-cases/` | init, add, get, list, search, supersede, rebuild-index |
| CLI commands | `src/adapters/cli/commands/` | Thin command handlers wired to use cases |
| Tests | `tests/` | Vitest suite (unit + integration) |

## CONVENTIONS

- **Language**: All communication in Russian. Code/docs may be bilingual.
- **Status**: Current: MVP-A complete. MVP-B (Project Scan + Agent Brief) implemented.
- **Framework philosophy**: Mr. Wolf augments agents with memory; it does not orchestrate them.
- **TypeScript**: Strict mode, Zod schemas, strong typing throughout.

## FOR AGENTS: USE PROJECT MEMORY

This project uses **Mr. Wolf** — a local-first Project Semantic Memory layer.
See full rules in [`MEMORY.md`](./MEMORY.md).

Quick commands:

```bash
# Search relevant memory before starting work
node dist/bootstrap/cli.js memory search "<topic or task keywords>"

# Add a new memory object when you learn something worth keeping
node dist/bootstrap/cli.js memory add --type lesson --title "..." --body "..."

# Update the agent brief at the end of a significant session
node dist/bootstrap/cli.js memory brief --write
```

## CORE COMMANDS

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm run test:run

# Type check
npm run lint

# Format code
npm run format

# Run checks
npm run check

# Initialize memory in a project
node dist/bootstrap/cli.js memory init

# Add a memory object
node dist/bootstrap/cli.js memory add --type lesson --title "..." --body "..."

# Scan project for external documents to register by reference
node dist/bootstrap/cli.js memory scan

# Generate an agent brief from active memory objects
node dist/bootstrap/cli.js memory brief

# Write the generated brief to AGENTS.md and active-warnings.md
node dist/bootstrap/cli.js memory brief --write

# Rebuild the search index from source files
node dist/bootstrap/cli.js memory rebuild-index

# Search memory objects
node dist/bootstrap/cli.js memory search "..."

# Supersede an older memory object with a newer one
node dist/bootstrap/cli.js memory supersede <old-id> <new-id>
```

## GIT FLOW

```text
main  ←──  dev  ←──  feat/*
main  ←──  dev  ←──  fix/*
main  ←──  dev  ←──  review/*
```

- All development goes through `dev`
- Feature branches: `feat/description`
- Fix branches: `fix/description`
- Review/exploration branches: `review/description`
- Merge to `main` only via `dev`

## ANTI-PATTERNS

- Do not make Mr. Wolf an orchestrator or agent framework.
- Do not treat SQLite as the source of truth; markdown files are the source of truth.
- Do not auto-rebuild the search index on every search; rebuild only when requested or after bulk changes.
- Do not copy user documents into `.wolf/memory`; store summaries, links, or extracted memory objects instead.

## NOTES

- Targets: dev assistant, office assistant, concierge, legal, sales, HR, finance, research.
- MVP roadmap: Core Memory + Search (complete) → Project Scan + Agent Brief (complete) → Case Learning → Memory Governance → Code Linking → Agent Integration (MCP).
- Current: MVP-A (Core Memory + Search) complete.
- MVP-B (Project Scan + Agent Brief) implemented.
