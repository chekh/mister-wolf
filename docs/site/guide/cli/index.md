# CLI Reference

Quick index of all 37 `wolf` commands. Each row links to the command's reference entry; group headings link to the section pages.

## Memory

| Command                                                      | What it does                                        | Page                        |
| ------------------------------------------------------------ | --------------------------------------------------- | --------------------------- |
| [`wolf add`](/guide/cli/memory#wolf-add)                     | Add a memory object                                 | [Memory](/guide/cli/memory) |
| [`wolf list`](/guide/cli/memory#wolf-list)                   | List memory objects                                 | [Memory](/guide/cli/memory) |
| [`wolf get`](/guide/cli/memory#wolf-get)                     | Get a memory object by id                           | [Memory](/guide/cli/memory) |
| [`wolf search`](/guide/cli/memory#wolf-search)               | Search memory objects (FTS over the SQLite index)   | [Memory](/guide/cli/memory) |
| [`wolf supersede`](/guide/cli/memory#wolf-supersede)         | Supersede a memory object with another              | [Memory](/guide/cli/memory) |
| [`wolf transition`](/guide/cli/memory#wolf-transition)       | Transition a memory object to a new status          | [Memory](/guide/cli/memory) |
| [`wolf rebuild-index`](/guide/cli/memory#wolf-rebuild-index) | Rebuild the SQLite search index from memory objects | [Memory](/guide/cli/memory) |

## Sessions & Context

| Command                                                      | What it does                                                                    | Page                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`wolf scan`](/guide/cli/sessions-context#wolf-scan)         | Scan the project and save a context snapshot                                    | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf brief`](/guide/cli/sessions-context#wolf-brief)       | Generate the agent brief from the latest scan and memory                        | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf recap`](/guide/cli/sessions-context#wolf-recap)       | Summarize active project memory: rules, threads, blockers, questions, decisions | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf call`](/guide/cli/sessions-context#wolf-call)         | Get active call injections (cold-start)                                         | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf insights`](/guide/cli/sessions-context#wolf-insights) | Heuristic pattern analysis over project memory (Level 1, no LLM)                | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf session`](/guide/cli/sessions-context#wolf-session)   | Manage sessions and checkpoints                                                 | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf diff`](/guide/cli/sessions-context#wolf-diff)         | Show thread changes since a checkpoint                                          | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf solve`](/guide/cli/sessions-context#wolf-solve)       | Build a solve pack for a memory problem                                         | [Sessions & Context](/guide/cli/sessions-context) |

## Work Management

| Command                                                             | What it does                            | Page                                          |
| ------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| [`wolf thread`](/guide/cli/work-management#wolf-thread)             | Manage work threads                     | [Work Management](/guide/cli/work-management) |
| [`wolf decision`](/guide/cli/work-management#wolf-decision)         | Manage decisions                        | [Work Management](/guide/cli/work-management) |
| [`wolf blocker`](/guide/cli/work-management#wolf-blocker)           | Manage blockers                         | [Work Management](/guide/cli/work-management) |
| [`wolf info-request`](/guide/cli/work-management#wolf-info-request) | Manage info requests                    | [Work Management](/guide/cli/work-management) |
| [`wolf article`](/guide/cli/work-management#wolf-article)           | Manage articles                         | [Work Management](/guide/cli/work-management) |
| [`wolf rule`](/guide/cli/work-management#wolf-rule)                 | Manage rules                            | [Work Management](/guide/cli/work-management) |
| [`wolf relation`](/guide/cli/work-management#wolf-relation)         | Manage relations between memory objects | [Work Management](/guide/cli/work-management) |

## Thinking & Council

| Command                                                    | What it does                                                 | Page                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| [`wolf think`](/guide/cli/thinking-council#wolf-think)     | Structured thinking sequences (goal → thoughts → conclusion) | [Thinking & Council](/guide/cli/thinking-council) |
| [`wolf council`](/guide/cli/thinking-council#wolf-council) | Council operations                                           | [Thinking & Council](/guide/cli/thinking-council) |

## Learning

| Command                                                        | What it does                                                                           | Page                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| [`wolf learn`](/guide/cli/learning#wolf-learn)                 | Self-learning loop: pattern digest, signal-log health, draft propose/validate/activate | [Learning](/guide/cli/learning) |
| [`wolf effectiveness`](/guide/cli/learning#wolf-effectiveness) | Memory effectiveness panel: rules holdout, tool economy, delivery, noise, routing      | [Learning](/guide/cli/learning) |
| [`wolf complain`](/guide/cli/learning#wolf-complain)           | Record a complaint about agent/methodology behavior                                    | [Learning](/guide/cli/learning) |

## Platform & Maintenance

| Command                                                | What it does                                                                                  | Page                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`wolf init`](/guide/cli/platform#wolf-init)           | Initialize Mr. Wolf memory for this project (idempotent, non-interactive)                     | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf bootstrap`](/guide/cli/platform#wolf-bootstrap) | Scan the project and draft starting memory: proposed rules, document-refs, work thread        | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf mcp`](/guide/cli/platform#wolf-mcp)             | Start the MCP server (stdio)                                                                  | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf scaffold`](/guide/cli/platform#wolf-scaffold)   | Scaffold opencode frame (agent\|skill\|command) + playbook in Wolf memory                     | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf tool`](/guide/cli/platform#wolf-tool)           | Tool librarian: register/list/use/expose/deprecate/revive                                     | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf taxonomy`](/guide/cli/platform#wolf-taxonomy)   | Manage memory taxonomy                                                                        | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf migrate`](/guide/cli/platform#wolf-migrate)     | One-time migration: `objects/<type>/` → `threads/<tid>/<subdir>/` + `shared/`                 | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf validate`](/guide/cli/platform#wolf-validate)   | Validate memory store integrity                                                               | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf doctor`](/guide/cli/platform#wolf-doctor)       | Check all registered projects: binary vs schema version, platform configs, prune dead entries | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf run`](/guide/cli/platform#wolf-run)             | Run opencode with the model from the Wolf routing object; log weighted token cost             | [Platform & Maintenance](/guide/cli/platform) |
