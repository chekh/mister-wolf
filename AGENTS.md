# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-29
**Commit:** 33d4f49
**Branch:** main

## OVERVIEW

Universal adaptive agent framework ("Mr. Wolf"). Single-user facade that dynamically assembles internal runtime from configuration: agents, workflows, policies, skills, tools, artifacts.

**Status:** Runtime MVP1A–MVP1C implemented and stable. MVP2 (Context Resolver) planned.

## STRUCTURE

```
.
├── src/                    # TypeScript runtime
│   ├── cli/               # Commander.js CLI commands
│   ├── config/            # YAML loader, Zod validation, project config
│   ├── kernel/            # In-process event bus
│   ├── state/             # File-based persistence + SQLite index
│   ├── types/             # Zod schemas + TypeScript types
│   └── workflow/          # Engine, runners, registry, graph orchestration
├── tests/                  # Vitest test suite
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── examples/               # Example workflows
├── docs/                   # Documentation
│   ├── concept.md         # Full framework concept (Russian, 1476 lines)
│   ├── getting-started.md # Quick start guide
│   ├── workflow-syntax.md # Complete YAML reference
│   └── cli-reference.md   # CLI command reference
├── AGENTS.md              # This file
├── README.md              # Project overview
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript config
└── vitest.config.ts       # Vitest config
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Understand framework | `docs/concept.md` | Russian language. Covers architecture, layers, domain packs, MVP roadmap |
| Workflow syntax | `docs/workflow-syntax.md` | Complete YAML reference with examples |
| CLI reference | `docs/cli-reference.md` | All commands, flags, exit codes |
| Core engine | `src/workflow/engine.ts` | Sequential + graph execution, state machine |
| Graph logic | `src/workflow/graph.ts` | DAG builder, validator, ready queue |
| Runners | `src/workflow/runners/` | echo, shell, manual_gate |
| State storage | `src/state/case-store.ts` | File-based persistence + SQLite index |
| Event bus | `src/kernel/event-bus.ts` | In-process pub/sub |
| Config | `src/config/` | YAML loader, Zod schemas, project config |
| Tests | `tests/` | Vitest suite (unit + integration) |

## CONVENTIONS

- **Language**: All communication in Russian. Code/docs may be bilingual.
- **Status**: Runtime implemented (MVP1A–C). Not concept-only.
- **Framework philosophy**: Runtime = universal kernel. Project logic = external, declarative, replaceable.
- **TypeScript**: Strict mode, Zod schemas, strong typing throughout.

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

# Run CLI
node dist/cli/index.js --help
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

- Do not hardcode domain concepts into core (framework explicitly forbids this)
- Do not expose internal agents to user (single Wolf Agent facade only)
- Policies must override prompt instructions when they conflict

## NOTES

- Framework targets: dev assistant, office assistant, concierge, legal, sales, HR, finance, research
- Proposed repo structure in concept: `core/`, `sdk/`, `adapters/`, `providers/`, `packs/`, `plugins/`, `templates/`
- MVP roadmap: Config+Workflow → Context → Policy → Agent Registry → Model Router → Artifact Plugins → Wolf Facade
- Current: MVP1C (Graph Orchestration) complete
- Next: MVP2 (Context Resolver)
