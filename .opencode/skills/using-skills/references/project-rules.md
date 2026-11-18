<!-- wolf:rendered base=project-rules.md set=3.2.0 -->
# Project documents and work structure

Loaded by the lead or an executor when choosing the work location, mode and document profile.

## Stage documentation set

In FULL, docs/dev/<date>-<feat>/ holds the goal package in the declared order:
pre-requirements.md → requirements.md → change-request.md → design.md → test-plan.md →
plan.md. It serves later stages, not a working directory.

pre-requirements.md comes first: intent, frame, accepted decisions and open questions before
formal requirements; it approves no requirements. change-request.md holds package change
requests and is append-only; its CR-<YYYY-MM-DD>-NN number is package-local. It is a separate
document, not a "Change log (CR)" section of requirements.md, which covers changes to the
requirements. Change flow: finding → change-request → pre-requirements/requirements → design →
test-plan → plan.

The lead embeds subtask conclusions: decisions into the design.md ADR, state and verifications
into plan.md/test-plan.md; significant memory uses the standard channel. By default an executor
returns RESULT/findings/review as a message. A file-creation right must name the exact path and
purpose; directory permission is not enough. An explicit instruction to update the main document
applies within the assigned section. A wolf-brainstorm discussion ends with pre-requirements.md
in the same goal's folder: the standard first package document, yet on its own it neither starts
the package nor means approved requirements. One fact has one canonical place; other documents
carry a reference and needed context.

Additions are standalone post-stage documents of value, such as a migration-guide or final
research. Before creating one, the lead states in the existing plan/brief its path,
reader/purpose, reason for a separate document and who keeps it current. Check first whether an
existing section suffices; not every TASK or round needs a new file. A document resource such
as a diagram is acceptable only when clearly needed, with an exact TASK path. Keep the agreed
set and formats; return a scope-changing question to the lead. Create no separate file registry.

Keep private report-*, decisions-*, checkpoint, drafts, logs and executable scripts out of
docs/dev, including tmp/reports. Working files stay in the assigned area outside documentation;
temporary experiments go to tmp. Permanent scripts/tests go to the standard scripts/tests or the
tooling library per project profile. Before cleanup or handoff, save needed evidence and
unfinished state durably outside documentation. A tmp reference is not saved evidence. Do not
delete others' or earlier files automatically.

### Readability of project documents

Write for a reader who must understand, verify, approve or carry out the document: purpose or
result first, then conditions and grounds. Keep the accepted document schema.

Separate independent parts with real Markdown blocks: blank lines, paragraphs, subheadings,
lists. One line break is not a new paragraph. A long list item does not replace structure.

Make CRs, ADRs and long tasks navigable by their source IDs and names. Separate independent
acceptance criteria and options; keep numbers, conditions, exceptions, statuses and grounds.
Add no new IDs, mandatory sections or graphics.

On a mandated editorial pass, hand the finished version to a wolf-document-readability executor.
Do not load the full writer skill for every answer or add a parallel final edit; a writer
handoff does not release the author from accuracy.

## A new goal and the work thread

On a real development or product-change request, L0 checks existing threads and the goal; the
same goal keeps its thread. For a new independent goal without a suitable thread, create one with
a supported memory mechanism, for example `wolf thread add` with title and goal; note the actual
ID. Do not create a thread for every clarification, greeting or status question.

Give the executor the thread ID, goal, known constraints and assigned skill. The lead or requester
sets FULL/LITE/FIX before choosing the document profile. Until the agreed move to formalization,
create no requirements.md or downstream templates. At the user's choice, wolf-brainstorm may
produce pre-requirements.md in the same goal's folder; it does not mean approved requirements.

In FULL the executor uses `wolf scaffold artifact <slug>`; the command creates the package in
docs/dev/<date>-<slug>/ in the same declared order. If the folder exists (from wolf-brainstorm,
for example), the command does a top-up: it adds only missing documents and does not overwrite existing ones. FIX is the --fix
profile (requirements.md + plan.md) when it suits the task; LITE is a sufficient brief. Link
documents and accepted decisions to the thread in an existing supported way; invent no schema
fields. If memory tools are unavailable, state the constraint and hand the record to the
executor; the discussion may continue, but do not claim the thread was created.

## Project scale and profile

FULL means several components, new contracts, migrations or substantial risks. LITE is a local
reversible change without new contracts. FIX is a confirmed defect with a reproduction and a
verification. The lead or requester sets the mode. Follow the scale-error protocol: if LITE/FIX turns
up new contracts, a second component or a non-obvious cause, stop the affected work and return to
the lead for review; only the lead or requester changes the mode. Do not extend scope yourself. Do
not re-approve approved work unless substantial conditions change.

Determine the base branch, package manager, setup, targeted/full checks, worktree policy
and commit/push/merge rights from AGENTS.md, configuration, lockfile and CI. Do not assume npm,
Vitest or main. On a conflict, check the actual CI and request only the missing decision; create
no new configuration schema automatically.
