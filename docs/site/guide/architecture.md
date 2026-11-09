# Architecture

Wolf connects agents, skills, tools, rules and project memory through a working process. The two-level organization keeps the original goal in view while individual sessions and executors change. A separate improvement loop lets experience change the methodology delivered to future sessions — the Steward behind it is temporarily paused in 3.0.0.

This page is for contributors and integration authors. For the working roles, start with [Organization](/guide/organization); for face versions and delivery, see [Delivery & Trust](/guide/delivery).

## Two connected loops

| Loop        | Responsibility                                                                        | Persistent result                                           |
| ----------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Delivery    | Wolf owns intent and acceptance and performs part of the work itself; wolf-* executors complete bounded work | Task state, decisions, reports and checkpoints              |
| Improvement | Authorized feedback is processed and faces versioned through the governed loop (the Steward is temporarily paused in 3.0.0) | Updated methodology, reasons for change and version history |

The organization is an operating protocol supported by agent frames and platform permissions. A written instruction is not proof that every boundary is enforced in code. Council execution and automatic policy scheduling must not be inferred from their architectural descriptions.

## Sources of truth

Project documents are part of project memory: requirements, designs, plans and reports retain their canonical files. Wolf registers references and relates them to work; it does not automatically copy every document into every prompt.

Native Wolf objects live in `.wolf/memory/` as Markdown with YAML frontmatter. The taxonomy has 8 core types: `rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `face`, `note`. See [Memory Model](/guide/memory) for lifecycle and scope.

The package's `templates/` is the source for stamped frames, skills, commands and plugins. Faces are versioned memory objects; package updates do not silently replace active project methodology. A tool card references canonical project source files. SQLite indexes and generated platform files are derived artifacts, with different update rules from the source files they describe.

## Code boundaries

| Location               | Responsibility                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `src/domain/`          | Memory schemas, taxonomy, lifecycle rules, policies and pure calculations                |
| `src/app/use-cases/`   | Application operations such as bootstrap, memory search, aggregation and face versioning |
| `src/ports/`           | Interfaces for stores, indexes, files, locks, clocks and other dependencies              |
| `src/adapters/fs/`     | Markdown storage and JSONL event/signal logs                                             |
| `src/adapters/sqlite/` | Rebuildable full-text search index                                                       |
| `src/adapters/cli/`    | Command parsing and user-facing output                                                   |
| `src/adapters/mcp/`    | MCP exposure of application operations                                                   |
| `src/bootstrap/`       | Dependency composition and CLI/MCP entry points                                          |
| `templates/base/`      | Shared agent frames, skills, commands and seeded playbooks                               |
| `templates/opencode/`  | OpenCode-specific delivery plugins                                                       |

A CLI command or MCP request reaches an application use case, which operates through ports. Adapters provide filesystem and index implementations. Platform integrations depend on Wolf; the domain does not depend on OpenCode session internals.

## Files and recovery

| Path                                  | Purpose                                         |
| ------------------------------------- | ----------------------------------------------- |
| `.wolf/config.yaml`                   | Project configuration                           |
| `.wolf/memory/`                       | Native memory objects and work threads          |
| `.wolf/memory/relations.jsonl`        | Relations between objects                       |
| `.wolf/memory/events.jsonl`           | Memory event history                            |
| `.wolf/cache/index.sqlite`            | Search index; rebuild with `wolf rebuild-index` |
| `.wolf/metrics/session-metrics.jsonl` | Local usage and feedback signals                |
| `.wolf/router.log`                    | OpenCode playbook delivery decisions            |

Linked worktrees share the common memory root, while rendered platform files remain local to each worktree. Scope filtering is limited to the delivery path described in [Read Isolation](/guide/read-isolation); a worktree is not a private copy of all memory.

## Operational limits

Checkpoints preserve the meaning and state needed to resume work. They do not provide an execution engine with leases, heartbeats or automatic crash recovery. Local storage does not mean local model inference: the selected provider still receives the context sent by the harness.

Active learning consists of lesson capture and authorized face mutations; Steward aggregation is temporarily paused in 3.0.0. Automatic decay and the Council runtime are development directions, not current execution guarantees. Current implementation details remain in the source and [CLI reference](/guide/cli/); the [concept and maturity records](https://github.com/chekh/mister-wolf/tree/main/docs/concept) preserve design history and status.
