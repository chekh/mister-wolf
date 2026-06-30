# Mr. Wolf — Roadmap

> Canonical development roadmap. Supersedes the old MVP-A/B breakdown in `docs/archive/concept-v3.md` and the draft phases in `docs/superpowers/specs/2026-06-30-project-memory-harness-base-concept.md`.

## Completed phases

| Phase | Focus                                                                                                                  | Status                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 0     | Project Semantic Memory pivot: markdown objects, YAML frontmatter, JSONL events, `init`/`add`/`list`/`get`/`supersede` | Completed                                                                                                      |
| 1     | Work threads, info requests, articles: `thread`/`info-request`/`article` types, `thread brief`                         | Completed                                                                                                      |
| 2     | Decisions and blockers: `decision`/`blocker` types, `blocker resolve`, brief integration                               | Completed                                                                                                      |
| 3     | Incremental indexing + document registration                                                                           | `search` sees new objects immediately; `scan` registers project documents as `document` artifacts by reference | Completed |
| 4     | Relations and session checkpoints                                                                                      | `relations.jsonl`, explicit artifact links, `session-checkpoint` type, `thread diff`                           | Completed |
| 5     | Search and retrieval improvements                                                                                      | Ranking, filters, tag search, `memory list --stale`                                                            | Completed |

## Next phase

| Phase | Focus      | Goal                                                                              |
| ----- | ---------- | --------------------------------------------------------------------------------- |
| 6     | Governance | `memory_class`, `truth_role`, `lifetime`, validation rules, lifecycle transitions |

## Backlog

| Phase | Focus        | Notes                                    |
| ----- | ------------ | ---------------------------------------- |
| 7     | Integrations | MCP server, IDE/CI hooks, export formats |

## Active blockers

None.
