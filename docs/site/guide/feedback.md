# Learning Loop

Agents drift: a rule stops fitting reality, a playbook step misfires, an agent keeps repeating a mistake. The learning loop is how a fix becomes permanent — **fix → secure → deliver → pay off**. Every stage lives in memory, so the loop is auditable end to end. Complaints are how the organization repairs its own rules: each recorded outcome changes what the next session reads and how it behaves.

```bash
wolf complain --about executor-lead --rule "…" --evidence "…" --proposal "…"
```

## File a complaint

`wolf complain` writes a `complaint` memory object (status `open`). The target is `--about`: an agent id, `skill:<name>`, or an existing mem-id (a rule or playbook object).

Complaints have a **kind**, recorded in the object:

- `behavioral` — the target is an agent or a skill: the fix is a playbook/frame mutation, which belongs to [Steward aggregation](#steward-aggregation);
- `technical` — the target is a memory object: the fix is a normal edit, supersede or transition.

The kind defaults to a heuristic by `--about` (agent id or `skill:*` → behavioral, mem-id → technical); `--kind technical|behavioral` overrides it — the owner is always right. Complaints recorded before 2.14 have no kind and display `—`.

## Record the outcome

A resolved complaint must leave a trace of **what came of it**. The closing executor records an outcome relation right after `resolved`/`completed`:

| Outcome  | Relation                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secured  | `wolf relation add <artifact-id> outcome_of <complaint-id>` — the artifact is the rule/lesson/playbook version or mutation that the complaint produced |
| Rejected | `wolf relation add <complaint-id> outcome rejected`                                                                                                    |
| Deferred | `wolf relation add <complaint-id> outcome deferred`                                                                                                    |

Both directions are visible in one command:

```bash
wolf relation list --of <complaint-id>
```

The discipline is protocol, not code: nothing forces the executor to write the edge — but `wolf recap` keeps the debt visible (the block below is verbatim CLI output; the CLI prints this heading in Russian):

```text
## Контур поправок
жалоб без исхода: K
```

Resolved complaints without an outgoing `outcome` edge are counted there. The counter is the loop's dashboard: it should trend to zero.

## Escalation: behavioral → Steward

The triage tree (duplicate / need-info / fix-instruction / steward-mutation / reject / obsolete) gains one rule: a **behavioral** complaint that was resolved with a "secured" outcome goes down the steward-mutation branch — the dispatcher makes a nested Steward call with the complaint id and the artifact id. The Steward then mutates the playbook through memory (`wolf supersede`), never the stamped file.

Technical complaints follow the existing path: the dispatch queue with `dispatch_ages` and the SLA.

## Steward aggregation {#steward-aggregation}

Lessons accumulate: session after session, agents record small observations, and delivery starts drowning in near-duplicates. The Steward — the loop's background agent (see [Base Set](/guide/base-set)) — condenses mature lessons into aggregates: one generalized lesson replaces a cluster of repeats. Redistribution, not an overlay: the aggregate takes over delivery, the sources are retired.

The Steward's faces — Mentor, Librarian, Archivist — and the frame/face/mutator split are described in [Delivery & Trust](/guide/delivery).

**Triggers** — two event triggers, both a single status line, no daemons:

1. **Cycle completion** — the coordinator runs `wolf recap` after accepting cycle reports; a non-empty aggregation line means a nested Steward call.
2. **Session start** — `wolf call` prints a banner when mature unaggregated lessons exist, so a fresh session (or the owner) sees the debt immediately.

```text
## Стюард: агрегация
неагрегированных уроков: N (зрелых: M) — вызовите Стюарда: opencode run --agent steward
```

"Unaggregated" = an `active` lesson without a **live** incoming `aggregated_in` edge (edges from `rejected`/`archived` aggregates don't count — a rejected cluster returns to the pool and stays visible). A cluster is **mature** — worth showing in the line — when it has ≥ 3 lessons or its oldest lesson is ≥ 7 days old.

**Step 1 — the Steward prepares.** The Steward is invoked nested (input: the project). It:

1. picks a cluster of mature lessons by topic/class (an LLM decision; the CLI only offers the detector and `wolf list --type lesson`);
2. creates a generalized lesson with `review_state: proposed` and the body contract: `## Было` (the sources, id + essence per line) / `## Стало` (the generalization, an instruction point for a frame, or a proposed rule) / `## Почему` (the class pattern);
3. writes `wolf relation add <aggregate-id> aggregates <source-id>` for every source;
4. carries the sources' `trigger_keywords` into the aggregate — it must trigger everywhere they did.

For a frame mutation the Steward prepares a new proposed playbook version (with an `outcome_of` edge to the causing complaint/lessons); the owner applies it with `wolf supersede`. Nothing auto-applies.

**Step 2 — the owner confirms.** The confirmation queue is memory itself: proposed aggregates are visible via `wolf list --type lesson --status proposed` and counted in `wolf recap`. Applying is one command, `wolf aggregate apply <aggregate-id>`: atomically, under a lock, the aggregate goes `proposed → active`, every source goes `→ archived`, and a `memory.aggregated` event lands in the log — double delivery is excluded by the same transaction. A repeated `apply` after a partial failure finishes the job. **Rejection is free:** `wolf transition <aggregate-id> rejected` — the sources stay `active`, the cluster shows up again as unaggregated; a false cluster costs nothing but the Steward's time.

**Does it work? The decay metric.** `wolf analytics --view steward` answers the real question — did aggregation reduce the flow of same-class lessons and complaints: for every active aggregate, how many new lessons and complaints of the same class (≥ 1 shared tag) appeared in the 7 days before vs after `memory.aggregated`. The class is a free-tag heuristic; the upgrade path is `pattern_key` — see [Analytics](/guide/cli/analytics).

Honest status: rule mutation through the Steward is proven in PoC #3; the organization-learning effect (fewer same-class lessons and complaints over time) is a **target, validating (E1d)** — see [maturity](https://github.com/chekh/mister-wolf/blob/main/docs/concept/maturity.md).

## Why relations and not fields

The outcome is a graph edge, not a column: any memory object can be the artifact of a complaint, and the complaint stays linkable from both sides (`outcome` / `outcome_of`). This is the same pattern as `complain`/`complained_by` — the loop is plain memory, queryable with `wolf relation list` and honest in `wolf recap`.
