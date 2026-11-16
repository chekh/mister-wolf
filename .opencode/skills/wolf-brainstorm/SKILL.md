---
name: wolf-brainstorm
description: "Apply L0 on a new idea, development, a substantial change or a new substantive mandate, including analysis and document preparation, when the understanding of the goal is not yet aligned; before researching the subject, requirements, design and setting up execution. Executors apply the assigned part under an agreed brief without re-interviewing the user."
---
<!-- wolf:rendered base=SKILL.md set=3.1.1 -->

# User intent → shared understanding → the needed result

Apply this to tasks in any domain: development, analysis, organizing work,
preparing materials and other mandates. Establish the intent from the current
context; do not carry over a goal, sources or a way of working from an earlier
example. The result may be a decision, explanation, document or completed
action. Technical requirements and a project folder are needed only for a
matching task.

## Mandatory input and roles

Load the full text before clarifying a new goal. The lead runs the dialogue;
the same lead organizes research, documents and executors. Explain per
wolf-explain within the same dialogue, without a separate agent or reloading
the current skill.

Input: the request, the related context, decisions/constraints in force,
delivered briefs/reports, task/thread IDs where present. Do not substitute the
goal with an old subtask. Continuing agreed, unchanged work needs no new
discovery.

The lead handles metadata. Substantive study of the material and the search for
task facts the lead performs on its own or assigns to an executor. Markdown,
read-only, an "informational question" and "a quick look" create no exception to
the role.

## Choose the depth of the dialogue, keep the goal

| Situation | Action |
| --- | --- |
| The user is looking for an idea/direction | Help make sense of the problem, approaches and consequences; a document or development is not required. |
| A concrete mandate: study, compare, write, fix | Briefly align on the goal/result; then organize the assigned work, without an automatic requirements.md. |
| Substantially different readings | Show the difference with a scenario or assumption and establish the intent. |
| A simple question whose answer is in the delivered context | Answer; do not start a thread or research for form's sake. |

Before expensive research, scaffolding and requirements, show your understanding
of the new goal so the user can correct what matters. Use the delivered
context; if needed, assign a short addressed familiarization pass, not a full
audit. If the goal/result/boundaries are sufficient, continue the assigned work
without ritually waiting for an answer. Clarify a substantial fork before
dependent work; silence does not confirm the unknown. Gates for
requirements/design not yet shown stay in force. Continuing the same goal needs
no re-confirmation.

Distinguish the desired result from the proposed way of obtaining it. Do not
turn a comparison into mandatory unification, advice into an implementation
project, or preparing a document into developing a new system. Breadth of
source material alone does not permit expanding the task or applying the
FULL development process.

## Substantive dialogue instead of a questionnaire

Help the user express what they want to achieve and why. The number of
questions, filled-in fields and a confident tone do not prove understanding.
Do not ask a mandatory two, three or five questions or run a universal
questionnaire.

Build on the context and the latest answer. Choose a useful move: test an
assumption, show a scenario/consequence, propose an approach, expose a
contradiction, object with grounds, or ask. A question is needed when the
answer changes the understanding, the choice or the next action. Do not ask
what is already known and do not require ready-made requirements.

One main idea per turn; usually one substantive question, if needed. Do not
retell the whole dialogue or show your inner churn of doubts. Explain the
options through concrete actions and consequences. Recommend with a reason
and a substantial trade-off. Discuss the user's technical proposals as an
equal; do not agree automatically. Do not present your proposals as their
decisions; the number of alternatives is set by the real choice.

## Research and council

A dialogue does not on its own authorize background research, documents or
hiring agents. Show which question needs checking and why; assign a separate
task to an executor with sources/boundaries, the expected result, a budget and
a stop condition. In already assigned research, do not ask permission for
every reading; return a change of goal or volume for approval first.

Choose sources by the question and the reliability the answer requires; use
the context already delivered. Deepen the search when a specific gap hinders
the result, not for a complete survey of all material. Mark what is unknown;
it does not always require new research. Repository, code and documentation
are possible sources for suitable tasks, not a mandatory route for every
mandate.

Organize a council on explicit request, for a substantial choice between
alternatives or a substantive contradiction. The full canon is wolf-council;
the profiles are in contracts.md. Preserve the independence of first
positions and the expert role's constraints. Return the material
agreement, disagreement and grounds, not a transcript. The participants'
agreement does not prove correctness. Expertise does not expand rights and
does not permit independent research.

## Readiness for the next action

Distinguish agreement with the frame, approval of the requirements and
permission to implement.

Before requirements or implementation, check against the dialogue:

- You can explain the problem, result and benefit in your own words.
- You have taken the boundaries and corrections into account; the user has
  been able to verify the understanding, and the grounds for continuing belong
  to this task.
- Facts, confirmed decisions, proposals and the unknown are distinguishable.
- There is no disagreement that changes the goal, result or the nearest
  expensive step.

If a gap is substantial, continue the dialogue or set an addressed research
task within the agreed mandate. Knowing the whole design in advance is
unnecessary. Do not examine the user or re-approve what has not changed.
After a correction to the goal, update the understanding and the affected
decisions before continuing.

## Exiting the dialogue and preserving context

Continuing and ending without a document/development are both allowed. When
there is something to record and the next step is not chosen, propose: "Shall
we record the conclusions in a document, or move on to requirements?" Do not
repeat this every turn or force two ways out. An explicit choice of action by
the user does not call for the same question again.

For a dialogue about future development, when keeping the outcome is chosen,
assign recording `pre-requirements.md` in `docs/dev/<date>-<slug>/` next to
the future documents of the same goal: intent/benefit, boundaries, accepted
decisions with grounds, alternatives, proposals and open questions. This is
the first document of the package, not a temporary report or a new memory
type. Verify the folder, the owner and the write/claim rights; with a single
outcome, do not create the other package documents. A separate CLI
profile/auto-registration is not delivered by this skill. After the
requirements are approved, requirements.md defines the actual behavior; what
remains here is the intent. Working traces are addressed note/context/history
per using-skills, without new statuses or lessons/complaints for drafts.

For other tasks, choose the result and its storage place by their purpose and
the project's rules; do not create docs/dev and pre-requirements.md
automatically.

Hand on the goal, decisions/constraints, substantial rejected alternatives
with reasons and the unknown — not a transcript and a repeated interview.
For an assigned analysis or steering, pass the executor exactly this result
and its criteria, without a new requirements package. For independent
development, the lead verifies/creates one real thread; if recording is
unavailable, the lead states the constraint and assigns recording to an
executor. Link the kept outcome to the thread in a supported way.

When moving to formalizing development, FULL provides requirements.md, LITE
an approved brief; the lead sets the mode. Aligning the intent does not
approve requirements, design or implementation not yet written. The rules
below then apply.

## Documents per the standard template

Apply this section and the requirement gates below when the chosen transition
is to development requirements. For discussion, analysis and other mandates
they are not a mandatory continuation of the dialogue. Apply the council
contract only when a council is actually held.

Before recording full requirements, the lead sets the mode and appoints the
responsible party for the folder. For a new folder in FULL, run
wolf scaffold artifact <slug>. The command creates the package in the order
pre-requirements.md → requirements.md → change-request.md → design.md →
test-plan.md → plan.md; empty downstream templates are not approved documents.
For a confirmed FIX, wolf scaffold artifact <slug> --fix is suitable
(requirements.md + plan.md); LITE does not require the full package.

Check the command's availability before choosing a fallback. If the folder
already exists, verify it belongs to the same goal and continue it; do not
create a duplicate. For a folder with pre-requirements.md, call wolf scaffold
artifact: the command performs a top-up — it adds only missing documents and
never overwrites the discussion's outcome or the previous files. If the
command is unavailable, prepare only the missing documents from the exact
template of the installed version, keeping the previous files. If the
generator is unavailable, use the exact template of the installed version from
an available verified source. If the template is unavailable, keep the draft
and the constraint; do not declare an arbitrary format standard. L0 assigns
document recording to an executor.

For FULL, keep the frontmatter slug/title/status/created and the seven
sections:

1. Context and problem.
2. Scope.
3. Glossary.
4. Functional requirements.
5. Non-functional requirements (NFR).
6. Constraints and assumptions.
7. Change log (CR).

A template comment or a stub is not a completed requirement. Keep a section
that does not apply, with a brief rationale. Write the requirements in the
owner's language, explaining the necessary terms. For a REQ, keep the ID,
history, condition/behavior, rationale, AC, priority and source; for an NFR —
the constraint, a measurable AC and the source. Do not add a new metadata
schema as text alone.

Mark the unresolved explicitly. Record the unknown in the suitable section
and the working brief; do not hide it behind a placeholder in approved.
Creating the folder and recording requirements is artifact organization, not
product implementation. Link the actual paths and substantial decisions to
the thread with supported fields/references.

## Verification and approval

7. Check atomicity, compatibility, negative scenarios, the success metric and
   the chosen profile's exact structure. If wolf doctor is available, use it
   via an executor; the absence of linter remarks does not replace
   verification of the meaning and all sections.
8. Hand the requirements to wolf-review within the volume provided for. Present
   the user with a single package of substantial decisions and open
   questions. Keep an approval already given for exactly these requirements
   as the basis, without a repeated gate; do not mark approved with an
   unconfirmed scope; a generic "fine" does not approve a new or changed
   scope.
9. Exit: a thread ID or an explicit recording constraint, the mode, the
   path/brief, the version, the structure verification result, REQ/NFR/AC,
   unresolved questions and the grounds for approval. Do not claim a resource
   was created or a verification performed just because the plan records it.

## Transition gate

The problem, scope, AC and constraints are understood; the structure
is followed; substantial questions are resolved or explicitly block the next
stage. After FULL approval, hand over to wolf-design. LITE allows execution
against an approved brief with AC and verifications when a separate design is
not needed. Document commits are made only by the authorized requester with a
permission in force. Do not write product implementation code here.

## Changing requirements

Keep the CR: what changes, the reason, the affected IDs, the approval grounds
and the downstream artifacts. Return the design/plan/test-plan and the
related verdicts for re-verification by impact. Do not quietly fix an approved
AC. Separate roadmap triage from the feature's requirements: a candidate has
one primary status and place, the decision's source and the reason for
rejection/postponement.

## Councils and choosing a decision

wolf-council defines how independent positions are organized; the
expert/synthesis profiles are in contracts.md. Do not duplicate the scheme here.
An opinion is not a review verdict, and a synthesis is not the owner's decision;
insufficient data is allowed. A research mandate is drawn up separately.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "I already understand the request" | Verify the intent, success and the substantial unknowns; do not fake loading. |
| "Plan first, requirements along the way" | A new goal goes through brainstorming before planning. |
| "I will create the folder the way I am used to" | Use the standard generator or the exact verified template. |
| "A thread will appear from the scaffold by itself" | Creating documents and a thread are different actions; check both. |
| "I invoked the skill manually — the rest is a normal dialogue" | Go through the mandatory steps and check the exit. |
| "Even the obvious must be asked" | After the intent is aligned, do not run an extra interview for form's sake. |
