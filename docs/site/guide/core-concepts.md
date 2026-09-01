# Core Concepts

## Memory objects

Everything Wolf stores is a **memory object**: a plain markdown file under `.wolf/memory/` with an id like `mem_20260831_…`, a type, a lifecycle status, attribution (creator actor), tags, confidence and importance. Objects are created via `wolf add`, the type-specific commands (`wolf decision add`, `wolf blocker add`, …) or the MCP tools — all surfaces write to the same store.

Because objects are files:

- they version with your repo if you commit `.wolf/`;
- they are greppable and diffable;
- a SQLite FTS index over them powers `wolf search` (`wolf rebuild-index` rebuilds it).

## Object types

25 types total (24 active + 1 deprecated). The `wolf add --type` flag accepts the 24 active ones.

| Type                 | Purpose                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `decision`           | Decisions; lifecycle active → superseded/rejected/obsolete; decay fields                                                  |
| `lesson`             | Lessons; `trigger_keywords` + draft fields (pattern*key, evidence, holdout*\*)                                            |
| `observation`        | Observations; complaint fields (about, complaint, semantic, trigger) — the `wolf complain` channel                        |
| `session-summary`    | Session outcomes; threads/sessions                                                                                        |
| `open-question`      | Open questions; default status `open`                                                                                     |
| `context`            | Context notes                                                                                                             |
| `work-thread`        | Work threads; special layout `threads/<tid>/WORK-THREAD.md`; fields: goal (required), current_state, next_steps           |
| `info-request`       | Information requests; question, detour_reason, expected_answer (required)                                                 |
| `article`            | Articles (knowledge); proposed → accepted                                                                                 |
| `blocker`            | Blockers; `impact` field required                                                                                         |
| `session-checkpoint` | Session checkpoints                                                                                                       |
| `rule`               | Rules; scope (project\|global), draft fields + decay fields                                                               |
| `document-ref`       | Reference to an external document; requires `source.path`                                                                 |
| `document-native`    | Native document                                                                                                           |
| `task-brief`         | Task brief; executor, priority (required)                                                                                 |
| `report`             | Report                                                                                                                    |
| `council-question`   | Council: a question put to the vote                                                                                       |
| `council-opinion`    | Council: an opinion with a vote                                                                                           |
| `synthesis`          | Council: a synthesis with a recommendation                                                                                |
| `escalation`         | Escalation                                                                                                                |
| `decision-request`   | Request for a decision                                                                                                    |
| `call-injection`     | Injections delivered by `wolf call`; fields: trigger_keywords, related_objects                                            |
| `playbook`           | Playbook; steps, owner_skill, version (required)                                                                          |
| `tool`               | "Tool as memory"; default status `candidate`; name, script_path, language (required); script body lives in `.wolf/tools/` |
| `document`           | **Deprecated** legacy type                                                                                                |

<WolfObject type="LESSON" status="accepted" id="mem_20260901_4b7c21" note="stored in .wolf/memory/">
Integration tests need an isolated Redis instance — checked against a red/green run.
</WolfObject>

## Lifecycle

Every object has one of **16 statuses**: `active`, `open`, `resolved`, `stale`, `conflicting`, `superseded`, `archived`, `paused`, `completed`, `answered`, `rejected`, `obsolete`, `proposed`, `accepted`, `candidate`, `deprecated`.

<WolfObject type="DECISION" status="active" id="mem_20260831_8c1e77" note="stored in .wolf/memory/">
Trunk-based flow: main is the source of truth, work happens in task worktrees, releases are tagged.
</WolfObject>

Valid transitions (the effective set for a type is this matrix intersected with the type's declared lifecycle):

| From                                                            | To                                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `active`                                                        | `stale`, `superseded`, `archived`, `conflicting`, `completed`, `resolved`, `obsolete`, `answered`, `deprecated` |
| `open`                                                          | `resolved`, `rejected`, `archived`, `answered`                                                                  |
| `resolved` / `completed` / `answered` / `rejected` / `obsolete` | `archived`                                                                                                      |
| `stale`                                                         | `active`, `archived`                                                                                            |
| `conflicting`                                                   | `active`, `archived`                                                                                            |
| `paused`                                                        | `active`, `archived`                                                                                            |
| `proposed`                                                      | `accepted`, `rejected`, `archived`                                                                              |
| `accepted`                                                      | `active`, `obsolete`, `archived`                                                                                |
| `candidate`                                                     | `active`, `deprecated`, `archived`                                                                              |
| `deprecated`                                                    | `active`, `archived` (tool revival)                                                                             |
| `superseded`                                                    | _(terminal — no transitions)_                                                                                   |
| `archived`                                                      | _(terminal — no transitions)_                                                                                   |

Moving an object:

```bash
wolf transition mem_001 accepted        # explicit transition (default actor: user:cli)
wolf supersede mem_001 mem_002          # mem_001 replaced by mem_002
wolf get mem_001 --latest               # follow the superseded_by chain to the current object
```

`wolf supersede` validates both ids, marks the old object `status: superseded` with `superseded_by: <newId>`, writes a `memory.superseded` event (actor `system:wolf`) and reindexes. `superseded` and `archived` are terminal — the only way "back" is a new object.

<WolfObject type="DECISION" status="superseded" id="mem_20260831_8c1e77" note="superseded by mem_20260831_9d2f10 → wolf get --latest follows the chain">
Earlier revision of the same decision — kept for history, out of the way by default.
</WolfObject>

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

## Governance axes

Three axes keep accumulated knowledge honest:

| Axis           | Values                                                            | Meaning                                                            |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `memory_class` | `working` \| `canonical`                                          | working state vs established canon                                 |
| `truth_role`   | `proposed_knowledge` \| `accepted_knowledge` \| `source_of_truth` | epistemic weight; `agent:*` actors default to `proposed_knowledge` |
| `lifetime`     | `long_term` \| `short_term` \| `session`                          | how long the object should matter                                  |

Together with the lifecycle this is what prevents P4 (memory grows, value drops): stale knowledge becomes visible, superseded knowledge stays reachable but out of the way, and nothing agent-written poses as source of truth by default.

## Daily workflows

The type-specific commands wrap the common flows:

```bash
# Decisions
wolf decision add --title "Use worktrees for docs work" --body "Trunk-based; work happens in .worktrees/<task>."
wolf decision list --thread <thread-id>

# Blockers
wolf blocker add --title "CI blocked" --impact "No releases" --workaround "Run tests locally"
wolf blocker resolve <id> --by <artifact-id>

# Rules (user-created only)
wolf rule add --title "Search before writing scripts" --body "Run wolf tool list / search first." --scope project
wolf rule list

# Work threads
wolf thread create --title "Docs site" --goal "Ship the VitePress site" --next-steps "write pages,build,deploy"
wolf thread brief <thread-id>
wolf session checkpoint --thread <thread-id>
wolf diff <thread-id> --since <checkpoint-id>
```

## Injections

`wolf call` is the cold-start mechanism that delivers relevant knowledge into a session:

1. **Base:** all active `call-injection` objects.
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
