---
name: wolf-debug
description: "Apply on a defect, unexpected behavior, a failing test, build or verification, a repeated tool failure; before attempting to fix an unknown cause."
---
<!-- wolf:rendered base=SKILL.md set=3.2.0 -->

# Systematic debugging

## Mandatory input

First, separate the observation from the hypothesis. The lead investigates
on its own or assigns the investigation to an executor within the assigned scope.
Before fixing, reproduce the defect or gather data that allows verifying the
hypothesis. Track the observation, the experiment and the result in a log. For
ongoing damage, use the "Incident" section, without presenting stabilization as
the found cause.

Distinguish mandatory requirements from conditional ones; carry out a
conditional one when its grounds are present.


## First, the suitable way to help

Clarify whether cause investigation, applying a known fix or stabilization is
assigned. Before expensive diagnostics, ask the requester/context holder about a
known failure, an accepted decision or a ready tool, if the answer would
change the route. No prior failure is needed. Find an available quick fact
yourself. A working workaround does not prove the cause; continue the assigned
investigation to sufficient evidence or an honest constraint. A neighboring
defect does not start a new cycle.

## Scale of diagnostics

The lead organizes the full cycle. An executor receives one diagnostic
question/discriminating experiment with inputs, the expected evidence, a
verification and a finite limit. A negative experiment result is a result too;
the requester picks the next hypothesis. If it must be picked before the run —
return the question immediately. Assign a full fix only after sufficient
grounds, as a separate short mandate. The steps below belong to their own
assigned stage; an executor need not go through the whole
root-cause → architecture → implementation cycle. Unexpected complexity →
return, even if time remains. Two failures are not a mandatory quota before
going back to the requester.

## Process

1. Record the symptom, the expected behavior, the revision, the environment, the
   frequency, the exact steps and the original log. If it does not reproduce —
   keep the observation and gather data; do not declare the cause established.
2. Check the recent changes and a working counterpart. Read the contracts and
   dependencies related to the problem; do not require reading a large unrelated
   reference in full.
3. Trace the inputs/outputs at the suspected boundaries. Log minimal metadata
   with secrets/PII redacted; do not print the environment or the payload in
   full. Diagnostic changes must have a cleanup. Do not put temporary
   scripts/logs into docs/dev; a permanent verification goes into the standard
   tests/scripts per scope. Preserve the needed evidence before the cleanup.
4. Keep a compact working log in the assigned scope/memory, not a separate
   docs/dev document: hypothesis, evidence for/against, discriminating
   experiment, result, next step. Consider alternatives; each experiment changes
   one substantial variable or explicitly describes the related changes.
5. Pin down the confirmed cause with a reproducible verification. Carry out
   the fix per test-driven-development; check the original scenario, the
   regressions and the important interactions.
6. On completion, state the root cause, the fix, the evidence, the residual
   risks and the temporary diagnostics removed. Record a lesson only when reuse
   is possible and with an applicability scope.

## Repeats and escalation

An executor does not iterate over unknown fixes: carry out the assigned
experiment or an obvious local correction, then return evidence/remainder/
question. A new method, hypothesis or dependency requires the requester's
decision. Two steps without progress or the limit (8 calls when none is set)
also end the call, without a false DONE. After 2 assigned failed fixes, the
requester revisits the reproduction, the inputs and the plan; this is not
evidence of an architecture defect. A failure does not extend the executor's
independence or start a council automatically.

## Means and help

Do not automatically turn repeated tool friction into a product defect. The
requester first checks the tool library for a ready tool and its contract; the
executor applies the permitted means handed over or returns FRICTION. A
universal workaround/new script is a separate permitted task with a verification
and registration via the existing wolf tool register, not unauthorized work by a
reviewer. wolf tool use — accounting, not launching.

If there is no next discriminating experiment or the decision is outside the
mandate, the executor passes the requester the question, the evidence, what was
ruled out and what would unblock the answer. The requester first decides
on its own/clarifies the input/uses a ready tool; for a precisely located gap in
positions — one wolf-expert. A council goes by wolf-council on a substantial
choice/contradiction or a direct request, without mandatory failures. The needed
experiment remains a separate assigned action outside the council. A defect in a
common rule is recorded via wolf-feedback after complaint triage; the signal is
not lost and is processed through an assigned wolf-steward mandate or the
`wolf learn due` queue (suggest mode; in off mode nothing is assigned or
suggested). An
expert's answer is not an established cause; assigned verifications are needed.

## Incident

With ongoing damage, a reversible containment within the mandate is allowed
first: a rollback, disabling a feature or limiting the load. Record the
permission, the action and the way back; do not call this eliminating the cause.
Irreversible or external actions require a permission in force. After
stabilization, continue the investigation.

## Unknown outcome

If only the symptoms are confirmed, state the INCONCLUSIVE conclusion in the
research report (the task's RESULT follows its own contract): what was
investigated, the rejected hypotheses, the missing data and the next
verification. Retry/timeout — a deliberate mitigation with verifications and
observability, not evidence of the absence of a cause.

## Transition gate

A fix counts as confirmed after the original defect has been reproduced and the
cause and the regressions have been verified on the current state. If only the
symptoms are known, the research conclusion is INCONCLUSIVE; in the RESULT, use
a supported task status and state this constraint separately. After repeated
failures, change the grounds of the investigation, not only the retry
parameters.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "Looks like a timeout, I will raise it" | First distinguish the cause from temporary damage reduction. |
| "Several fixes will speed up the search" | An experiment must discriminate between hypotheses. |
| "The third try will surely work" | Check the model of the cause and request an independent examination. |

## Applied techniques

If a specific technique is needed, read references/techniques.md: root-cause
tracing, boundary diagnostics, finding the polluting test and waiting on a
condition. A technique does not widen the diagnostic question and is not a
mandatory audit. For a question, FRICTION or W1–W4, use wolf-feedback within
your role.
