<!-- wolf:rendered base=contracts.md set=3.1.1 -->
# Mandate and evidence

The lead loads this before composing a TASK; the executor gets the applicable norms in the mandate.

`execution` in a TASK sets model/variant/mode and budget through the existing launch mechanism, not a new configuration schema. The role hierarchy is not a reasoning scale. Routine work is execute; a narrow unresolved question is solve, which never widens the mandate. Use a sufficient available mode; never raise it yourself or read an in-text request as confirmation of an actual setting. Every call has a finite limit; without one, return within 8 tool calls (pilot default). Two steps without progress mean a return to the requester, who picks another approach. A new conclusion, a counterexample or an error found in an earlier check justifies revision, even with unchanged data.

Density standard|draft is a separate axis of the same execution block, distinct from execute|solve, FULL/LITE/FIX, role, model and variant. The requester or user chooses it; a missing field means standard; no new configuration schema. In draft the executor shortens the visible service record (retellings, duplicate summaries, actions without concrete basis) while keeping decision grounds. Substantial uncertainty widens the addressed investigation or verification, or raises a question to the requester; never a short unjustified answer. Mandatory verifications, rights, acceptance independence and security still apply; FULL/LITE/FIX and execute/solve do not depend on density. The RESULT records the density used; acceptance compares observed actions, evidence and result, not the draft label.

A tool failure is not automatically a product bug and does not trigger full wolf-debug: one meaningful workaround in scope, then FRICTION or a constraint, and back to the requester. Re-running a read or verification is justified by changed inputs, new evidence or a specific uncovered mandatory criterion.

## Handoff contracts

### TASK core

The core is mandatory for any mandate; each item is a verifiable prescription, not a comma-separated list. A profile (below) adds to it, never replaces it.

- `task_id` — subtask identifier, distinct from the session id; report and evidence are checked against it.
- Goal and expected result — what must come out, in one verifiable statement.
- AC — acceptance criteria, each answerable "confirmed" or not.
- Scope and authority — what the work includes and what is forbidden (writing, hiring agents, commits), where working material lives.
- Inputs and assigned skill — which norms and files to read, what process to follow; a missing mandatory input is requested, not guessed.
- `ACTIVE_CONSTRAINTS` — constraints in force: short "what applies → source/basis" lines (a memory rule or decision with an ID, a document with a revision). If absent, none apply beyond general norms; no need to restate all project rules.
- `DECISIONS[]` — task decisions affecting current work: `D-id`, what was decided (one line), why and what was rejected, basis or source. One line per decision, not a discussion history. If absent, none exist.
- Verification — exact commands or procedures the executor runs, and the expected result.
- Finite budget and stop/return — the work limit and conditions for an immediate return to the requester.
- Expected RESULT — the report form for the role, with allowed statuses and verdicts.

Core invariants: no applicable core field may be omitted; an unknown mandatory input is requested explicitly (`NEEDS_CONTEXT`), never stubbed. Omitting an inapplicable profile field is not a mandate defect. ACTIVE_CONSTRAINTS and DECISIONS[] are passed when in force: their absence states that none apply, not a missing field.

### Task profiles

The `implement | review | research | expert` profile adds fields to the core. An inapplicable field is omitted, not stubbed; a mandate without it is correct.

- `implement` adds: repo/workspace, `base_sha`, write allowlist, permitted read areas, dependencies, links to design/test-plan, and drops nothing from the core. RESULT: `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`.
- `review` adds: the revision under review, the assigned lens, the norm and the evidence set. It needs no `base_sha`, write allowlist or worktree. RESULT: `SUMMARY/VERDICT/FINDINGS/SCOPE/LIMITS/EVIDENCE`; verdicts `APPROVED | CHANGES_REQUIRED | INCONCLUSIVE`.
- `research` adds: the question under investigation, the answer criterion, the revision of the document or source, search boundaries and the stop condition. It needs no `base_sha` or write allowlist. RESULT: `FINDINGS/CONFIDENCE/GAPS`, separating source, fact, conclusion and hypothesis.
- `expert` adds: the question posed, the subject lens, shared facts and revision, permitted sources and addressed verification operations. Rights are read-and-answer only; the core "Verification" field does not permit running the system or an experiment. RESULT: a position or recommendation plus `claims/evidence/assumptions/confidence/risks/failure_conditions/counterexamples`; a substantial unknown or needed verification goes to `LIMITS`. Confidence is low|medium|high with a rationale, not a numeric probability. The first RESULT line names the actual `channel` (`tool-enabled` | `packet-only` | `denied`) — a channel state, not an intent; when `channel != tool-enabled`, `isolation_limits` is mandatory and names facts not confirmed by reading (a synthesis requirement, not validation of the recording schema). `channel` does not change RESULT statuses. No mandatory input — `NEEDS_CONTEXT`. Inputs complete but no position — a completed expertise whose textual outcome is "insufficient grounds", with `LIMITS` and no invented claims. This is no new status enum and no valid opinion with claims=[]. The organizer keeps such an answer as the absence of a formed position.

### RESULT synthesis profile

The organizer returns `accepted_claims/rejected_alternatives/unresolved_dissent/required_validation/confidence` and the outcome `ready | insufficient_evidence`. It is a recommendation outcome, not a memory status or an acceptance VERDICT. In ready, accepted_claims must be non-empty; in insufficient_evidence it may be empty, with an explanation and the needed verification mandatory. The current version's supported write-path validates the stored form; this rule does not change the v2 schema. Accepted_claims are grounds chosen for the recommendation, not accepted decisions. Opinion, recommendation and decision of an authorized participant are different results. Only an accepted decision is passed into `DECISIONS[]` with its source and constraints. A need for verification is not a TASK to run it. Old RESULT profiles and their mandatory slots do not change; wolf-council defines the full organizer procedure.

The default handoff is a message; the requester names exact permitted output files, if needed, and where temporary work outside documentation goes. Responsibility for the plan and coverage stays with the requester.

### Contract vocabulary

Terms are defined statically; definitions describe no mechanism behavior and cite no missing commands or fields. The `RESULT`/`EVIDENCE`/`ACCEPTANCE` forms in force are detailed and follow the table; the table gives term meaning only.

| Term | Meaning |
| --- | --- |
| TASK | A mandate to an executor: the ten-element core plus applicable profile fields. |
| RESULT | The executor's report in its role's form: status or verdict, changes, boundaries. |
| EVIDENCE | Confirmation of a claim/AC: command or procedure, cwd, revision, exit, result. |
| ACCEPTANCE | Checking each AC against evidence and the lead's final acceptance verdict. |
| SCOPE | Task boundaries: what is included and what is forbidden. In a wolf-reviewer report, `SCOPE` is review coverage, not task boundaries. |
| LIMITS/GAPS | What is unverified, where data is missing or risk remains; missing data does not equal zero or success. |

RESULT: task_id, DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED, changes, verifications and evidence, deviations, remaining risks. DONE means ready for review, not accepted.
EVIDENCE: claim/AC, command or procedure, cwd, revision, dirty-state digest when present, relevant environment, time, exit/status, result and a reference to existing confirmation (log, tool output, CI artifact). A separate log file is not required. Do not invent missing fields.
ACCEPTANCE: for each AC, confirmed/not confirmed, current evidence, independent review, constraints; the lead's final verdict: ACCEPTED | PARTIAL | REJECTED | INCONCLUSIVE.

Keep contracts in messages and addressed Wolf notes; file fallback follows the working-memory rules above. Add no Wolf commands or types without a separate implementation. Keep traces of complaints and verdicts in the permitted channel; if recording is unavailable, pass them to the requester.

Terms and usage rules of the internal agent language: see agent-language.md; message forms (slots) remain normative here.
