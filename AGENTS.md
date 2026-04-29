# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-28
**Commit:** 3164a99
**Branch:** main

## OVERVIEW

Universal adaptive agent framework ("Mr. Wolf"). Single-user facade that dynamically assembles internal runtime from configuration: agents, workflows, policies, skills, tools, artifacts. Currently concept stage — no runtime implementation yet.

## STRUCTURE

```
.
├── docs/
│   ├── concept.md      # Full framework concept (Russian, 1476 lines)
│   └── Mr. Wolf.png    # Project logo
├── .opencode/          # OpenCode plugin config
│   └── package.json    # Depends on @opencode-ai/plugin
├── README.md           # Placeholder
└── LICENSE             # MIT
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Understand framework | `docs/concept.md` | Russian language. Covers architecture, layers, domain packs, MVP roadmap |
| Project config | `.opencode/package.json` | OpenCode plugin dependency only |
| Legal | `LICENSE` | MIT, copyright 2026 chekh |

## CONVENTIONS

- **Language**: All communication in Russian. Code/docs may be bilingual.
- **Status**: Concept/repository stage. No source code, tests, or build system yet.
- **Framework philosophy**: Runtime = universal kernel. Project logic = external, declarative, replaceable.

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
- MVP roadmap has 7 stages: Config+Workflow → Context → Policy → Agent Registry → Model Router → Artifact Plugins → Wolf Facade
- No build/dev commands defined yet — project is documentation-only
