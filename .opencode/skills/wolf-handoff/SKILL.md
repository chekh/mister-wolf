---
name: wolf-handoff
description: "Apply before a session or executor change, near-loss of context, a long stop, or resuming work from saved state."
---
<!-- wolf:rendered base=SKILL.md set=3.1.2 -->

# State handoff

## Mandatory input

Before a handoff, distinguish a new task from continuing the previous one; keep the existing task/thread ID. Handoffs run within the mandate in force; an executor returns a checkpoint to the lead. Do not rely on chat inheritance: saved links and uncommitted work must be truly available to the successor.

Load the assigned skill in full before executing it. Track mandatory items in an available tracker or the working brief; add no new memory statuses. Pass an unavailable action to the responsible level.

A handoff is gate G2 per `wolf-git` and §9 of the policy.

## Choosing the action

The lead (L0) first applies the full canon
using-skills/references/division-of-labor.md: a new delivery and a replace of the previous
mandate differ. Whoever hired an executor performs the replace;
the owner initiates handoff of its own role. The executor returns a checkpoint
and a request to the lead; it does not hire a successor. The order below works
within the previous rights. Tool.task does not guarantee resetting
the parent's context — check platform capabilities.

## Snapshot

Before handoff, the transferring side saves the checkpoint as an addressed working Wolf
note/history per using-skills, linked to the active thread; current context is note/context.
First reconcile an existing checkpoint: create no duplicates per call.
File fallback outside docs applies when memory/file data is unavailable; do not create a new
checkpoint/report in docs/dev per session. The executor passes
the state as a message to the lead; the lead ensures the files' durability and availability,
including needed tmp materials, before session close/workplace cleanup.
A snapshot does not become a project document automatically. Contents:
- task/thread ID, goal, AC, scope, current responsible party;
- base/current revision, cwd, branch/worktree, dirty/untracked, patch, or other available restore;
- done and remaining work, dependencies, a pending external outcome;
- known spend/remaining mandate budget and the delivery's overall limit; mark unknowns
  explicitly — a new session does not zero the budget; state text, not new Wolf fields;
- task constraints in force (`ACTIVE_CONSTRAINTS`) and active skills/policies — IDs/versions;
- accepted decisions (`DECISIONS[]`: D-id, the decision in one line, why, grounds/source) — only those affecting continuation;
- verifications with evidence and validity scope;
- hypotheses and failed experiments, questions and blockers;
- the next safe step, rights, and actions the user already permitted.

Do not copy the whole chat, code, or secrets. Links must be accessible to the successor — verify. A sufficient snapshot matters more than assuming wolf call will deliver any note.

## Handing off ownership

1. Record the snapshot revision and location. If recording is unavailable, the transferring side passes it to the lead, not bypassing permissions.
2. With the mechanism in force, stop or revoke the old executor's right to record; check unfinished tools/processes. Unknown outcome: establish state first.
3. The lead passes the successor a TASK (per the core canon and mandate profile in using-skills), the snapshot, and available sources. Without a technical lock, set a single protocol-level owner and mark the constraint explicitly.
4. The successor confirms goal, revision, dirty-state, and next step, checking memory/plan against fact. A mismatch → NEEDS_CONTEXT, not blind continuation.
5. Only after confirmation mark the handoff complete and report the ID/status to the responsible level.

## Constraints

A handoff does not raise rights or permit unsolicited external actions. A new session does not fix a wrong plan alone. On drift, check the error's source and the snapshot's sufficiency, not just shrink the text. A skill/process update does not substitute the instructions of an agent already working mid-TASK.

## Transition gate

The handoff is complete after a sufficient snapshot is saved, a single recording owner is set, and the successor confirms goal, actual state, next step. The old and new executor must not keep recording at the same time. Unavailable technical locking must be explicitly replaced by a protocol-level constraint.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "A new session will fix everything" | Check plan and snapshot sufficiency. |
| "wolf call will find any needed note" | Pass direct accessible links and versions. |
| "We will start a new thread to continue" | First restore the existing thread of the same goal. |

For your tools, using-skills/references/project-tools.md applies on handoff:
a script needed for the continuation must not remain the only copy in tmp; the lead preserves
it and its card before the executor closes. Do not recreate a tool instead of checking
the existing one is available. Closing an unneeded session does not delete evidence/working copies.
