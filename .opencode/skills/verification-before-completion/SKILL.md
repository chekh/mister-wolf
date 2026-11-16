---
name: verification-before-completion
description: "Apply before asserting readiness, a fix, passing verifications, successful integration or acceptance; also when in doubt about the currency of provided evidence."
---
<!-- wolf:rendered base=SKILL.md set=3.1.2 -->

# Evidence before the claim

## Mandatory input

Before "done", "fixed" or "verified", state the claim and find supporting evidence. Verify the completed scope, not a broader imagined one. The lead reconciles the package and git metadata; the lead or an assigned executor runs it. If a current verification exists and its scope fits, use it; do not run tests per message.

Distinguish mandatory requirements from conditional ones; carry out a conditional one when its grounds are present.


## Gate

1. Name the exact claim: which AC is met, which tests passed, which symptom is eliminated.
2. Pick evidence that actually supports it: a diff supports the change, not correctness; exit 0 of one command does not support all requirements.
3. Check the version, dirty-state, inputs, dependencies and substantial environment. Run the missing verification with an available executor role. The lead verifies ACCEPTANCE and renders the verdict; the lead or an assigned executor runs it independently.
4. Read the result, exit code, skips and warnings; save EVIDENCE from using-skills. Do not treat partial output as full success.
5. Report the verified properties and constraints. Not confirmed → not confirmed; verification unavailable → INCONCLUSIVE, not "it should work".

## Currency

The result stays applicable while verified code, material dependencies, data or environment are unchanged. A new message/session does not invalidate evidence on its own. After changes, repeat affected verifications; before integration, verify the combined state. Without exact dirty-state correspondence, rerun the verification.

Evidence contains claim/AC, command/procedure, cwd, revision, time, exit/status, result and a link to the existing confirmation; a separate log file is optional; with a dirty-tree — a digest of related files/patch, including untracked. Mark missing fields, do not invent them. Do not include secrets in evidence.

## Delivery composition

Before acceptance, new docs/dev files (including untracked) are reconciled with main documents and justified plan/brief additions. Private reports/logs/scripts are not part of stage documentation. Integrate what is useful, keep needed evidence durably outside documentation; do not confirm acceptance while extraneous new files remain. Do not delete previous/foreign files automatically. The executor reports the deviation to the requester and runs no project cleanup on its own.

## Sufficiency per the mandate

A configuration description is supported by sources; a working-deployment claim requires verification of execution. Do not run the second for the first unless the mandate or mandatory policy requires it. Do not substitute the request for actual operability with a single read. A neighboring unknown does not widen the claim; a substantial gap in it remains a constraint.

## Scale of verification

A targeted verification supports only its own scope; a full gate — the properties of its set. NFRs need corresponding measurements. Manual verification is allowed with a reproducible protocol and known constraints. Do not run the full suite on every answer when a valid result exists.

## Stop after evidence

Check the sufficiency of evidence once per claim. A repeat is due on changed inputs, a new failure or a concrete uncovered criterion. A persuasive narrative is not evidence; an already-read current log needs no rerun. An unverified property constrains exactly its own claim; do not cancel a proven defect or an independently confirmed property.

## Acceptance package

For each AC: confirmed/not confirmed, evidence, revision; then independent review, deviations, unresolved risks and a recovery plan if needed. The executor hands the package to the lead, who renders ACCEPTED | PARTIAL | REJECTED | INCONCLUSIVE. Before the verdict, the acceptance owner reconciles the evidence's revision and dirty-digest with the actual state (e.g., git rev-parse HEAD); evidence without a revision is stale by default. The executor's report is not evidence.

In the plan, [x] is set by the task's acceptance owner, usually the lead, after the stipulated verification and review; it records evidence/revision. A verified task does not mean the whole delivery is integrated or accepted. Do not announce success based on someone else's confidence or the commit count.

## Transition gate

Exhausting the limit does not confirm readiness. Name partial/limits directly.

A claim is allowed only in the confirmed scope. Incomplete or stale evidence requires verification or a constrained conclusion. The RESULT uses its own contract, and the acceptance verdict — ACCEPTED/PARTIAL/REJECTED/INCONCLUSIVE; do not mix these vocabularies. Explain the constraint to the user via wolf-explain.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "The executor is confident" | Read the verification result and applicability scope. |
| "The tests passed on a previous commit" | Match the verified and current state. |
| "A PR was created — the task is fully implemented" | PR creation, merge and publication are confirmed separately. |
