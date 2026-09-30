# Steward Aggregation

Lessons accumulate: session after session, agents record small observations, and delivery starts drowning in near-duplicates. The Steward (the loop's background agent — see [Base Set](/guide/base-set)) condenses mature lessons into aggregates: one generalized lesson replaces a cluster of repeats. **Redistribution, not an overlay** — the aggregate takes over delivery, the sources are retired.

## Triggers

Two event triggers, both a single status line — no daemons:

1. **Cycle completion** — the coordinator runs `wolf recap` after accepting cycle reports; a non-empty aggregation line means a nested Steward call.
2. **Session start** — `wolf call` prints a banner when mature unaggregated lessons exist, so a fresh session (or the owner) sees the debt immediately.

```text
## Стюард: агрегация
неагрегированных уроков: N (зрелых: M) — вызовите Стюарда: opencode run --agent steward
```

"Unaggregated" = an `active` lesson without a **live** incoming `aggregated_in` edge (edges from `rejected`/`archived` aggregates don't count — a rejected cluster returns to the pool and stays visible). A cluster is **mature** — worth showing in the line — when it has ≥ 3 lessons or its oldest lesson is ≥ 7 days old.

## Step 1 — the Steward prepares

The Steward is invoked nested (input: the project). It:

1. picks a cluster of mature lessons by topic/class (an LLM decision; the CLI only offers the detector and `wolf list --type lesson`);
2. creates a generalized lesson with `review_state: proposed` and the body contract: `## Было` (the N sources, id + essence per line) / `## Стало` (the generalization, or an instruction point for a frame, or a proposed rule) / `## Почему` (the class pattern);
3. writes `wolf relation add <aggregate-id> aggregates <source-id>` for every source;
4. carries the sources' `trigger_keywords` into the aggregate — it must trigger everywhere they did.

For a frame mutation the Steward prepares a new proposed playbook version (with an `outcome_of` edge to the causing complaint/lessons); the owner applies it with `wolf supersede`. Nothing auto-applies.

## Step 2 — the owner confirms

The confirmation queue is memory itself: proposed aggregates are visible via `wolf list --type lesson --status proposed`, and `wolf recap` counts them:

```text
предложенных агрегатов: P — wolf aggregate apply <id> для подтверждения
```

The apply command is hidden plumbing (like `think`/`update`):

```bash
wolf aggregate apply <aggregate-id>
```

Atomically, under a lock: the aggregate goes `proposed → active`, every source goes `→ archived` (archiving stops their delivery), and a `memory.aggregated` event lands in the log. Re-running `apply` after a partial failure **finishes the job** — already-archived sources are skipped; a full no-op only happens when everything is already applied. From that moment delivery carries the aggregate instead of the cluster — double delivery is excluded by the same transaction.

**Rejection is free:** `wolf transition <aggregate-id> rejected` — the sources stay `active`, their `aggregated_in` edges stop counting, and the cluster shows up again as unaggregated. A false cluster costs nothing but the Steward's time.

## Does it work? The decay metric

`wolf analytics --view steward` answers the real question — did aggregation reduce the flow of same-class lessons and complaints:

```text
aggregation decay (7d before / after):
aggregate    src  lessons -/+7d  complaints -/+7d
mem_…        4    6 / 0          2 / 0
note: class = free-tag heuristic (>=1 shared tag); upgrade path — pattern_key
```

For every active aggregate: how many new lessons and complaints of the same class (≥ 1 shared tag) appeared in the 7 days before vs after `memory.aggregated`. The class is a free-tag heuristic — the footnote says so honestly; the upgrade path is `pattern_key`. See [Analytics](/guide/cli/analytics).
