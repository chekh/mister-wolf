# Feedback Loop

Agents drift: a rule stops fitting reality, a playbook step misfires, an agent keeps repeating a mistake. The feedback loop is how a fix becomes permanent — **fix → secure → deliver → pay off**. Every stage lives in memory, so the loop is auditable end to end.

```bash
wolf complain --about executor-lead --rule "…" --evidence "…" --proposal "…"
```

## File a complaint

`wolf complain` writes a `complaint` memory object (status `open`). The target is `--about`: an agent id, `skill:<name>`, or an existing mem-id (a rule or playbook object).

Complaints have a **kind**, recorded in the object:

- `behavioral` — the target is an agent or a skill: the fix is a playbook/frame mutation, which belongs to the [Steward](/guide/steward);
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

The discipline is protocol, not code: nothing forces the executor to write the edge — but `wolf recap` keeps the debt visible:

```text
## Контур поправок
жалоб без исхода: K
```

Resolved complaints without an outgoing `outcome` edge are counted there. The counter is the loop's dashboard: it should trend to zero.

## Escalation: behavioral → Steward

The triage tree (duplicate / need-info / fix-instruction / steward-mutation / reject / obsolete) gains one rule: a **behavioral** complaint that was resolved with a "secured" outcome goes down the steward-mutation branch — the dispatcher makes a nested Steward call with the complaint id and the artifact id. The Steward then mutates the playbook through memory (`wolf supersede`), never the stamped file.

Technical complaints follow the existing path: the dispatch queue with `dispatch_ages` and the SLA.

## Why relations and not fields

The outcome is a graph edge, not a column: any memory object can be the artifact of a complaint, and the complaint stays linkable from both sides (`outcome` / `outcome_of`). This is the same pattern as `complain`/`complained_by` — the loop is plain memory, queryable with `wolf relation list` and honest in `wolf recap`.
