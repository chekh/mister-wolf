# Memory Model

Since 2.13 Wolf's taxonomy is **seven types** — down from 26. The point is not renaming but redistributing responsibility:

- **7 types instead of 26.** Deciding where to write something is now a one-second choice, not a taxonomy exam.
- A **facet** is the character of a record, chosen from a closed list at add time. Free input is rejected; facets exist only on notes.
- **Colors are highlighting only.** They mark facets in terminal output and never carry meaning by themselves.
- **`note` is the universal type.** Anything that is not a rule, lesson, decision, thread, complaint or tool is a note with a facet.
- `blocker`, `info-request` and `open-question` are **no longer types** — they are statuses of a thread.

## The seven types

| Type        | What it represents                                     | Where it lives (thread / shared) | Lifecycle                                                            | Fields beyond the basics                                                                             |
| ----------- | ------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `rule`      | a standing instruction the agent follows               | — / `shared/rules`               | active, superseded, obsolete, proposed, accepted, rejected, archived | `scope` (project\|global), `applies_to`, `trigger`, `trigger_keywords`                               |
| `lesson`    | a pitfall or practice that should resurface later      | `lessons/` / `lessons/`          | full set (active, open, resolved, stale, conflicting, paused, …)     | `trigger_keywords`                                                                                   |
| `decision`  | a chosen option and the alternatives it beat           | `decisions/` / `decisions/`      | active, superseded, rejected, obsolete                               | `thread` (optional)                                                                                  |
| `thread`    | multi-step work in progress                            | `threads/<tid>/WORK-THREAD.md`   | active, paused, blocked, waiting_answer, open, completed, archived   | `goal` (required), `current_state`, `next_steps`                                                     |
| `complaint` | a filed complaint about a rule or playbook             | `notes/` / `shared/complaints`   | open, resolved, rejected, archived                                   | `about`, `rule`, `evidence`, `proposal`, `triage`, `resolution`, `dispatch_ages`, `corroborations`   |
| `tool`      | a registered script for reuse                          | — / `shared/tools`               | candidate, active, deprecated, archived                              | `name`, `script_path`, `language`, `contract_*`, `usage_count`, `last_used_at`, `deprecation_reason` |
| `note`      | everything else: observation, context, metric, history | `notes/` / `shared/notes`        | full set                                                             | `facet` (enum, required at add)                                                                      |

## Which type do I need?

| Situation                                                               | Write          |
| ----------------------------------------------------------------------- | -------------- |
| "The agent must always do X" (or never do X)                            | `rule`         |
| "I hit a pitfall — others should not repeat it"                         | `lesson`       |
| "We chose Y over Z"                                                     | `decision`     |
| "Multi-step work is underway"                                           | `thread`       |
| "Something is wrong with a rule or playbook"                            | `complaint`    |
| "Registering a script for reuse"                                        | `tool`         |
| Everything else — an observation, context, a metric, a piece of history | `note` + facet |

## Facets

A facet is the **character of a record**. The default vocabulary is closed — seven values: `howto`, `pitfall`, `context`, `metric`, `history`, `legacy`, `constraint`.

| Facet        | Character of the record         |
| ------------ | ------------------------------- |
| `howto`      | a proven way to do something    |
| `pitfall`    | a trap to avoid                 |
| `context`    | background the reader needs     |
| `metric`     | a number worth tracking         |
| `history`    | how things came to be           |
| `legacy`     | outdated but still load-bearing |
| `constraint` | a boundary to respect           |

Mechanics:

- A facet is **picked from a list** at add time (`--facet`); free input is rejected, and the error enumerates the valid values: `Error: Invalid facet "x" for type "note" (valid values: …)`.
- `facet` is **required for `note`** and **forbidden for every other type**.
- The vocabulary is configurable: `facets.character` in `.wolf/config.yaml` accepts 7–10 values — see [Configuration](/guide/configuration).

## Facet colors

In `list`, `search` and `call` output, facets are colorized — **highlighting only**, never a channel of meaning:

- `howto` green, `pitfall` red, `context` blue, `metric` yellow, `history` magenta, `legacy` dim gray, `constraint` cyan.
- Colors render **only in an interactive terminal (TTY)**. Piped and other non-TTY output — what agents consume — is flat text automatically.
- `NO_COLOR` and `WOLF_NO_COLOR` disable them.
- The color map is static in the code, not a config option; custom facets from `facets.character` render without color.

## Thread statuses: blocked, waiting_answer, open

The former types `blocker`, `info-request` and `open-question` are statuses of a `thread` now:

| Status           | Meaning                                     |
| ---------------- | ------------------------------------------- |
| `blocked`        | the thread waits for an external resolution |
| `waiting_answer` | the thread has asked a question upstream    |
| `open`           | an open question with no addressee          |

Resolution goes to `active` (work resumes) or to `archived` (abandoned). The substance — impact and workaround for a block, the text of a question — lives in a note inside the thread with a matching facet.

## Reading pre-2.13 data

An existing installation keeps working without any migration — old data is read through aliases:

- old frontmatter types are displayed as their new equivalents following the migration map (`blocker` → `note` + facet `pitfall`, and so on);
- the old directories (`documents/`, `sessions/`, `councils/`, `escalations/`, `calls/`, `playbooks/`, `blockers/`) remain read roots; the first update of an object moves it to its new path.

The full map and the migration flow: [Migration to 2.13](/guide/migration-2.13).

## Examples

```bash
# everyday capture: a note with a facet
wolf add --type note --facet pitfall \
  --title "SQLite WAL breaks on NFS mounts" \
  --body "WAL needs shared memory; keep the index on local disk." \
  --tags "sqlite,ops"

# multi-step work: a thread (goal is required)
wolf thread add --title "Release 2.13" \
  --goal "Ship the taxonomy wave" \
  --current-state "Docs in progress" \
  --next-steps "finish memory guide,run checks"

# a lesson that should resurface on related work
wolf add --type lesson \
  --title "Run wolf search before writing new scripts" \
  --body "A similar script often already exists in tool memory." \
  --set trigger_keywords="[script,tool,rewrite]" --confidence medium

# facet is a first-class filter
wolf list --type note --facet pitfall
```

Full flag lists: [CLI reference](/guide/cli/memory).
