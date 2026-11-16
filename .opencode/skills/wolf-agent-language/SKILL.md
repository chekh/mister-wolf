---
name: wolf-agent-language
description: "Internal TASK/RESULT/QUESTION/BLOCKED/UPDATE/FINDING and handoff between agents."
---
<!-- wolf:rendered base=SKILL.md set=3.1.2 -->

# Internal agent language

The vocabulary is stable; only a skill-owner decision extends it. Answer humans in plain language. Slots are compact;
the explanation inside is precise plain text. Use a task ID and revision, not "as above".
Full contracts and mandate profiles — using-skills/references/contracts.md.

## TASK

`TASK <id>@<version> kind=<implement|research|design|review|test|expert|writing|release>`
- GOAL: the result and contribution to the user goal.
- INPUT: addressed documents/memory with versions, baseline, applicable norms.
- SCOPE: write scope, what is forbidden, adjacent owners, overall contract.
- CHECK: readiness criteria and verifications.
- EXECUTION: available agent/model/variant, finite budget, stop/return, working directory.
- STATE: where mini-plan/result live if needed; Git rights; essentials only.
Do not invent technical settings or IDs. On repeat add `REUSE: the concrete grounds`
and the corrective-return number. Fields need not be long; no special data — "none".
The RESULT form follows the mandate profile in contracts.md (implement/review/research/expert).

## RESULT and state

`RESULT <id> DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED`
`OUT: the result; REV: a SHA or digest/dirty-state; CHECK: evidence; OPEN: remainder/the question`
For a detailed report, link to working memory, not a message copy.
DONE means readiness for review; ACCEPTED comes from the designated acceptance owner.

`QUESTION <id>: NEED / WHY / BLOCKS` — ask before costly intent reconstruction.
`BLOCKED <id>: CAUSE / OUT / UNBLOCK` — preserve what is achieved.
`UPDATE <id>@vN: CHANGE / AFFECTS / EFFECTIVE_REV` — a change for dependent tasks;
not permission to change accepted requirements.

## Evidence and remarks

`EVIDENCE E-id: CLAIM / REV / METHOD(command, cwd, or source) / OUTCOME / LIMITS`
`FINDING F-id: KIND(defect|risk|question|suggestion) / CRITERION / CONDITIONS /
EVIDENCE / IMPACT / BLOCKING(grounds)`.
Review: VERDICT APPROVED|CHANGES_REQUIRED|INCONCLUSIVE; COVERAGE and LIMITS.
Acceptance: ACCEPTANCE ACCEPTED|PARTIAL|REJECTED|INCONCLUSIVE per AC/evidence.
Expert: POSITION / CLAIMS+EVIDENCE / ASSUMPTIONS / ALTERNATIVES / LIMITS / RECONSIDER_IF.
Synthesis: AGREEMENT / DISAGREEMENT / RECOMMENDATION / LIMITS / DECISION_OWNER.
Outside the format — "outside the contract" and a short explanation; formalism does not block meaning.
