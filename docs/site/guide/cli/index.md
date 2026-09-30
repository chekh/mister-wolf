# CLI Reference

Quick index of `wolf` commands: the visible surface plus advanced plumbing (hidden from `--help`). Each row links to the command's reference entry; group headings link to the section pages.

Playbook delivery for opencode agents — the `wolf-router` plugin injecting the current playbook into the system prompt — is documented separately: [Router](/guide/router).

## Memory

| Command                                                      | What it does                                          | Page                        |
| ------------------------------------------------------------ | ----------------------------------------------------- | --------------------------- |
| [`wolf add`](/guide/cli/memory#wolf-add)                     | Add a memory object                                   | [Memory](/guide/cli/memory) |
| [`wolf list`](/guide/cli/memory#wolf-list)                   | List memory objects                                   | [Memory](/guide/cli/memory) |
| [`wolf get`](/guide/cli/memory#wolf-get)                     | Get a memory object by id                             | [Memory](/guide/cli/memory) |
| [`wolf search`](/guide/cli/memory#wolf-search)               | Search memory objects (FTS over the SQLite index)     | [Memory](/guide/cli/memory) |
| [`wolf edit`](/guide/cli/memory#wolf-edit)                   | Edit title and/or body of a memory object             | [Memory](/guide/cli/memory) |
| [`wolf archive`](/guide/cli/memory#wolf-archive)             | Archive a memory object                               | [Memory](/guide/cli/memory) |
| [`wolf supersede`](/guide/cli/memory#wolf-supersede)         | Supersede a memory object with another (plumbing)     | [Memory](/guide/cli/memory) |
| [`wolf transition`](/guide/cli/memory#wolf-transition)       | Transition a memory object to a new status (plumbing) | [Memory](/guide/cli/memory) |
| [`wolf rebuild-index`](/guide/cli/memory#wolf-rebuild-index) | Rebuild the SQLite search index (plumbing)            | [Memory](/guide/cli/memory) |
| [`wolf update`](/guide/cli/memory#wolf-update)               | Update triage fields of a memory object (plumbing)    | [Memory](/guide/cli/memory) |

## Sessions & Context

| Command                                                    | What it does                                                                    | Page                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`wolf scan`](/guide/cli/sessions-context#wolf-scan)       | Scan the project and save a context snapshot (plumbing)                         | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf brief`](/guide/cli/sessions-context#wolf-brief)     | Generate the agent brief from the latest scan and memory                        | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf recap`](/guide/cli/sessions-context#wolf-recap)     | Summarize active project memory: rules, threads, blockers, questions, decisions | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf call`](/guide/cli/sessions-context#wolf-call)       | Get active call injections (cold-start)                                         | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf session`](/guide/cli/sessions-context#wolf-session) | Session summaries (plumbing)                                                    | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf diff`](/guide/cli/sessions-context#wolf-diff)       | Show thread changes since a checkpoint (plumbing)                               | [Sessions & Context](/guide/cli/sessions-context) |
| [`wolf solve`](/guide/cli/sessions-context#wolf-solve)     | Build a solve pack for a memory problem (plumbing)                              | [Sessions & Context](/guide/cli/sessions-context) |

## Work Management

| Command                                                                                                                                   | What it does                                                                        | Page                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| [`wolf thread`](/guide/cli/work-management#wolf-thread)                                                                                   | Manage work threads                                                                 | [Work Management](/guide/cli/work-management) |
| [`wolf decision`](/guide/cli/work-management#wolf-decision)                                                                               | Manage decisions                                                                    | [Work Management](/guide/cli/work-management) |
| [`wolf rule`](/guide/cli/work-management#wolf-rule)                                                                                       | Manage rules                                                                        | [Work Management](/guide/cli/work-management) |
| [`wolf lesson`](/guide/cli/memory#wolf-add), [`wolf complaint`](/guide/cli/memory#wolf-add), [`wolf note`](/guide/cli/memory#wolf-add), … | Type namespaces generated from the taxonomy: `add`, `list` with type-specific flags | [Memory](/guide/cli/memory)                   |
| [`wolf relation`](/guide/cli/work-management#wolf-relation)                                                                               | Manage relations between memory objects                                             | [Work Management](/guide/cli/work-management) |
| [`wolf complain`](/guide/cli/work-management#wolf-complain)                                                                               | File a complaint about a rule/playbook/agent                                        | [Work Management](/guide/cli/work-management) |

## Thinking

| Command                                                | What it does                                                 | Page                                    |
| ------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------- |
| [`wolf think`](/guide/cli/thinking-council#wolf-think) | Structured thinking sequences (goal → thoughts → conclusion) | [Thinking](/guide/cli/thinking-council) |

## Analytics

| Command                                                             | What it does                                                                                                        | Page                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [`wolf analytics`](/guide/cli/analytics#wolf-analytics)             | Effectiveness analytics: ledgers, funnel, agents, steward view, councils, outliers, experiment readiness, campaigns | [Analytics](/guide/cli/analytics) |
| [`wolf task-eval`](/guide/cli/analytics#hidden-synonyms-deprecated) | Record a task verdict into the signal log — acceptance metrics, coverage (hidden plumbing)                          | [Analytics](/guide/cli/analytics) |

## Platform & Maintenance

| Command                                                | What it does                                                                                       | Page                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`wolf init`](/guide/cli/platform#wolf-init)           | Initialize Mr. Wolf memory for this project (interactive in TTY; non-interactive requires --model) | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf bootstrap`](/guide/cli/platform#wolf-bootstrap) | Scan the project and draft starting memory: proposed rules, document-refs, work thread             | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf mcp`](/guide/cli/platform#wolf-mcp)             | Start the MCP server (stdio)                                                                       | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf scaffold`](/guide/cli/platform#wolf-scaffold)   | Scaffold opencode frame (agent\|skill\|command) + playbook in Wolf memory                          | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf tool`](/guide/cli/platform#wolf-tool)           | Tool librarian: register/list/use/expose/deprecate/revive                                          | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf taxonomy`](/guide/cli/platform#wolf-taxonomy)   | Manage memory taxonomy                                                                             | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf migrate`](/guide/cli/platform#wolf-migrate)     | One-time migration: `objects/<type>/` → `threads/<tid>/<subdir>/` + `shared/`                      | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf validate`](/guide/cli/platform#wolf-validate)   | Validate memory store integrity                                                                    | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf doctor`](/guide/cli/platform#wolf-doctor)       | Check all registered projects: binary vs schema version, platform configs, prune dead entries      | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf sync`](/guide/cli/platform#wolf-sync)           | Re-render the wolf base set (stamped files only; memory untouched)                                 | [Platform & Maintenance](/guide/cli/platform) |
| [`wolf upgrade`](/guide/cli/platform#wolf-upgrade)     | Upgrade the global wolf installation to the latest npm version                                     | [Platform & Maintenance](/guide/cli/platform) |
