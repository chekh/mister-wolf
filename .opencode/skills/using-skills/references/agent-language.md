<!-- wolf:rendered base=agent-language.md set=3.1.2 -->
# Wolf internal agent language specification

**Status:** versioned council extension; observation stage. Base specification approved by the owner (2026-11-04, decision mem_20261104_vnutrenniy_yazyk_wolf_etap_nablyudeniya_19ed1f; frame and rationale — docs/dev/2026-11-04-agent-language/pre-requirements.md).

**Purpose:** refines terms and usage rules of the internal agent language (agents are AI assistants carrying out project tasks through fixed message forms). Message forms — the mandatory fields (slots) per utterance type — are defined normatively in contracts.md and not repeated here. The expert and synthesis profiles for the council come from the owner's mandate of 2026-11-05; earlier forms do not change. Vocabulary is fixed at delivery and does not mutate within a session; gaps go through LANGUAGE.

## Coverage boundaries

Covers only utterances that change work state: mandates, reports, verdicts, handoffs, complaints, proposals, status transitions. The descriptive zone is free: discussions, explanations and reasoning stay plain text (the frame is two-layer). Situations no form covers fall to the escape utterance (R6).

## Session-language decision mechanics

The session language decision is recorded, not inferred: after the first user
message run `wolf add --type decision --title "Session language: <lang>"`; on an
explicit language change record the new decision and immediately run
`wolf supersede <old-id> <new-id>` — exactly one language decision stays active.
The user's message language wins over host or platform language defaults. Normative
text: AGENTS.md, "Session language".

## Terms

Definitions follow the contracts in force (contracts.md, complaints.md) and the owner's decision frame; each term gets a gloss on first use.

- **TASK** — a mandate to an executor: the core (mandatory elements) plus fields of the applicable profile (implement | review | research | expert). Full slot composition — contracts.md.
- **RESULT** — the executor's report in its role's form. Implement-profile statuses: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED. DONE means ready for review, not acceptance.
- **DONE ≠ ACCEPTED** — different utterances at different levels: DONE reports readiness for review; ACCEPTED is the designated acceptance owner's decision on acceptance results (the lead accepts the executor's result within its mandate; the owner where its decision is provided for).
- **EVIDENCE** — confirmation of a claim/criterion: command or procedure, cwd, revision, exit/status, result; composition — contracts.md.
- **ACCEPTANCE** — checking each criterion against evidence plus the acceptance owner's verdict: ACCEPTED | PARTIAL | REJECTED | INCONCLUSIVE. Independent review verdict: APPROVED | CHANGES_REQUIRED | INCONCLUSIVE.
- **SCOPE** — the boundary of what is permitted: what the task includes and what is forbidden; for review, SCOPE is verification coverage.
- **LIMITS/GAPS** — what was not verified, where data is missing or risk remains; missing data does not equal zero or success.
- **BLOCKED** — status: work cannot continue without an external input or decision.
- **NEEDS_CONTEXT** — status: a mandatory mandate input is missing; requested, not guessed.
- **HANDOFF** — a record of work handoff (result, responsibility, open questions) between executors or sessions.
- **VERDICT** — the final decision of a verification or acceptance, in one of the listed statuses, with evidence.
- **COMPLAINT** — about a rule (skill/frame/memory rule), not a single case; filed via wolf-feedback as a memory object (fields rule/evidence/proposal; defect class — kind: technical|behavioral). Subject LANGUAGE: see its complaints section.
- **PROPOSAL** — an improvement or change with rationale.
- **TRANSITION** — moving a work object to a new status along permitted transitions.

## Expertise and synthesis

An expert's position is a reasoned answer within the lens, not a review VERDICT; a synthesis recommendation is a proposal to the responsible party, not an ACCEPTANCE. EVIDENCE confirms the grounds, an assumption is accepted conditionally, the unknown goes to LIMITS/GAPS. Agreement among experts does not make an assumption a fact. Reconsideration conditions state which data would change it. A proposed verification does not authorise running it; the lead sets it separately within its mandate. Expert and synthesis RESULT profiles and v2 fields are normatively defined in contracts.md. `ready | insufficient_evidence` denotes a synthesis outcome, not new memory statuses.

## Usage rules R1–R6

- **R1** — one concept, one name.
- **R2** — anaphora is banned (references such as "the same as above", "this task"); references go by identifier with a version, e.g. T-42@v2.
- **R3** — full delivery: the language document arrives with the skills in full; partial delivery is not provided for.
- **R4** — a human receives ordinary language; terms carry a gloss on first use.
- **R5** — DONE ≠ ACCEPTED: the executor reports readiness for review; recognition of the result is the designated acceptance owner's decision (see the definition above).
- **R6** — escape: free text marked "outside the contract" for situations the form does not cover.

## Rule on misunderstanding

If the meaning is clear, continue; if missing information affects the action, ask rather than guess. Non-compliance leaves the level no worse than today: compliance brings brevity and precision, not a penalty.

## Examples (conditional, illustrative, not templates)

1. TASK→RESULT exchange:
   TASK: "T-7@v1: update the command reference in guides/cli.md — add a section on sync. Verification: the section appears in the table of contents. Limit: 6 calls."
   RESULT: "T-7 DONE: section added; verification passed (the table of contents contains sync); no deviations."
2. Verdict and acceptance:
   VERDICT: "T-7 APPROVED: no findings." ACCEPTANCE: "T-7 ACCEPTED: both criteria confirmed by evidence."
3. LANGUAGE complaint:
   COMPLAINT (subject LANGUAGE): rule: "LANGUAGE/ambiguous-definition — the definition of DONE allows reading as final acceptance"; evidence: "in task X a RESULT with status DONE was accepted without review, and no review took place"; proposal: "refine the DONE definition with an example".
