# Memory Model

This page is the single source of truth for Wolf's memory taxonomy.

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

## Appendix: Object lifecycle

Every object carries a status from a union of **18 statuses** — the 16 general ones plus `blocked` and `waiting_answer`, which are thread-specific (see [Thread statuses](#thread-statuses-blocked-waiting_answer-open)):

`active`, `open`, `resolved`, `stale`, `conflicting`, `superseded`, `archived`, `paused`, `completed`, `answered`, `rejected`, `obsolete`, `proposed`, `accepted`, `candidate`, `deprecated`, `blocked`, `waiting_answer`.

Transitions (mirroring `ALLOWED_TRANSITIONS` in the code; the effective set for a type is this matrix intersected with the type's declared lifecycle):

| From                                                            | To                                                                                                                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active`                                                        | `stale`, `superseded`, `archived`, `conflicting`, `completed`, `resolved`, `obsolete`, `answered`, `deprecated`, `paused`, `blocked`, `waiting_answer`, `open` |
| `open`                                                          | `resolved`, `rejected`, `archived`, `answered`, `active`                                                                                                       |
| `resolved` / `completed` / `answered` / `rejected` / `obsolete` | `archived`                                                                                                                                                     |
| `stale`                                                         | `active`, `archived`                                                                                                                                           |
| `conflicting`                                                   | `active`, `archived`                                                                                                                                           |
| `paused`                                                        | `active`, `archived`                                                                                                                                           |
| `blocked`                                                       | `active`, `archived` — thread: work resumes or the thread is dropped                                                                                           |
| `waiting_answer`                                                | `active`, `archived` — thread: the answer arrived or the question is withdrawn                                                                                 |
| `proposed`                                                      | `accepted`, `rejected`, `archived`                                                                                                                             |
| `accepted`                                                      | `active`, `obsolete`, `archived`                                                                                                                               |
| `candidate`                                                     | `active`, `deprecated`, `archived`                                                                                                                             |
| `deprecated`                                                    | `active`, `archived` (tool revival)                                                                                                                            |
| `superseded` / `archived`                                       | terminal — no transitions                                                                                                                                      |

For a `thread` (lifecycle: `active`, `paused`, `blocked`, `waiting_answer`, `open`, `completed`, `archived`) the effective transitions are: `active` → `paused` / `blocked` / `waiting_answer` / `open` / `completed` / `archived`; `paused` / `blocked` / `waiting_answer` / `open` → `active` or `archived`; `completed` → `archived`.

Moving an object:

```bash
wolf transition mem_001 accepted        # explicit transition (default actor: user:cli)
wolf supersede mem_001 mem_002          # mem_001 replaced by mem_002
wolf get mem_001 --latest               # follow the superseded_by chain to the current object
```

`wolf supersede` validates both ids, marks the old object `status: superseded` with `superseded_by: <newId>`, writes a `memory.superseded` event (actor `system:wolf`) and reindexes. `superseded` and `archived` are terminal — the only way "back" is a new object.

### Status glyphs

A status is always read from the node shape plus its label — color is only secondary reinforcement. The same eight glyphs are used across the docs, the CLI and the home terminal:

| Glyph                                                                                                                         | Status      | Meaning                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------- |
| <span class="wolf-glyph wg-active" aria-hidden="true">──●</span>                                                              | ACTIVE      | live, in force                        |
| <span class="wolf-glyph wg-verified" aria-hidden="true">──✓</span>                                                            | ACCEPTED    | checked against evidence              |
| <span class="wolf-glyph wg-proposed" aria-hidden="true">──◆</span>                                                            | PROPOSED    | draft, awaiting review                |
| <span class="wolf-glyph wg-blocked" aria-hidden="true">──×</span>                                                             | OPEN        | needs attention — blockers, questions |
| <span class="wolf-glyph wg-stale" aria-hidden="true">──○</span>                                                               | STALE       | no recent payoff, decay candidate     |
| <span class="wolf-glyph wg-superseded" aria-hidden="true"><span class="wg-old">○──</span><span class="wg-new">●</span></span> | SUPERSEDED  | replaced by newer, chain              |
| <span class="wolf-glyph wg-archived" aria-hidden="true">──□</span>                                                            | ARCHIVED    | terminal, kept for history            |
| <span class="wolf-glyph wg-conflict" aria-hidden="true">●╱●</span>                                                            | CONFLICTING | two objects claim the same truth      |

## Appendix: Governance axes

Three axes keep accumulated knowledge honest:

| Axis           | Values                                                            | Meaning                                                            |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `memory_class` | `working` \| `canonical`                                          | working state vs established canon                                 |
| `truth_role`   | `proposed_knowledge` \| `accepted_knowledge` \| `source_of_truth` | epistemic weight; `agent:*` actors default to `proposed_knowledge` |
| `lifetime`     | `long_term` \| `short_term` \| `session`                          | how long the object should matter                                  |

Together with the lifecycle this is what keeps stale knowledge visible and superseded knowledge reachable but out of the way — and nothing agent-written poses as source of truth by default.

## Appendix: Injections

`wolf call` is the cold-start mechanism that delivers relevant knowledge into a session:

1. **Base:** all active `call-injection` objects — the pre-2.13 type or its 2.13 form, a note with `alias_origin: call-injection`.
2. **Topic mode** (`--for <topic>`): trigger_keywords matched against topic tokens, with an FTS fallback over the index (limit 10). Active `lesson` and `rule` objects with matching trigger_keywords join in. If nothing matches, a fallback delivers up to 3 rules without keyword match.
3. **Thread mode** (`--thread <id>`): adds all active rules with `scope: project` plus the active blockers of that thread.
4. **Ranking:** blocks are ordered by `finalScore` (importance, confidence, recency of `updated_at`).
5. **Budget:** `--compact` without a number caps delivery at 1200 chars; `--compact <n>` caps at N; without the flag there is no limit. Anything over budget is truncated.
6. **Result:** `{ blocks, truncated, deliveredIds }`.

```bash
wolf call                       # everything active
wolf call --for vitest          # topic-matched injections
wolf call --thread mem_20260831_docs --compact   # thread mode, 1200-char budget
```

The same mechanics power agent-side delivery: MCP-exposed memory plus platform integrations keep a session from starting blind.
