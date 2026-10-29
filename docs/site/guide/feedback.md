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

The triage tree (duplicate / need-info / fix-instruction / steward-mutation / reject / obsolete) gains one rule: a **behavioral** complaint that was resolved with a "secured" outcome goes down the steward-mutation branch — the dispatcher makes a nested Steward call with the complaint id and the artifact id. The Steward then mutates the playbook through memory — since 2.17 as a new face version (`wolf face new`), every version carrying its mutation record (reason, minimal change, boundaries, examples, verification, rollback) — never the stamped file.

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

**The Steward prepares and applies the aggregate autonomously.** Each aggregate no longer requires user approval. `proposed` is a staging state before validation, not a manual confirmation queue. Each nested invocation handles one small semantic cluster and reports the outcome and remaining work to the coordinator.

1. Select only active, unaggregated `lesson` objects. Working `note` objects with `context`, `history` or `metric` facets are excluded even when `review_state` is `proposed`. Complaint triage separately selects `complaint/open`.
2. Maturity alone does not establish a common lesson. Preserve applicability bounds, exceptions, evidence and counterexamples; do not combine incompatible scopes. Report a skipped cluster when no useful generalization exists.
3. Create a `lesson` with `status: proposed`, attribution `agent:steward`, the `## Before` / `## After` / `## Why` body contract, applicable trigger keywords and exact `aggregates` links to the source lessons. Use the corresponding localized section names from the delivered runtime template.
4. Immediately before applying, validate types, IDs, scope and freshness: only lesson sources, no self-links, missing objects or competing aggregate. This preflight matters because the existing apply command archives linked objects without validating their types. The coordinator must not dispatch overlapping aggregations concurrently.
5. The Steward runs `wolf aggregate apply <aggregate-id> --created-by agent:steward` and verifies the active aggregate, archived sources and result. Updates run under a lock but are not a filesystem transaction. Retry the same ID after partial failure; a completed repeat is a no-op, not a new aggregate.

Sources are retained. Unsafe clusters are skipped with a reason rather than an approval request. Automatic lesson aggregation does not authorize product decisions, new rules, face mutations or complaint closure. Face changes remain a separate authorized G17 workflow with `outcome_of`; the owner retains `wolf face restore` and `wolf face breakglass`.

**Does it work? The decay metric.** `wolf analytics --view steward` answers the real question — did aggregation reduce the flow of same-class lessons and complaints: for every active aggregate, how many new lessons and complaints of the same class (≥ 1 shared tag) appeared in the 7 days before vs after `memory.aggregated`. The class is a free-tag heuristic; the upgrade path is `pattern_key` — see [Analytics](/guide/cli/analytics).

Honest status: rule mutation through the Steward is proven in PoC #3; the organization-learning effect (fewer same-class lessons and complaints over time) is a **target, validating (E1d)** — see [maturity](https://github.com/chekh/mister-wolf/blob/main/docs/concept/maturity.md).

## Why relations and not fields

The outcome is a graph edge, not a column: any memory object can be the artifact of a complaint, and the complaint stays linkable from both sides (`outcome` / `outcome_of`). This is the same pattern as `complain`/`complained_by` — the loop is plain memory, queryable with `wolf relation list` and honest in `wolf recap`.
