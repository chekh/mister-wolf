# Addressed context and working memory

The state owner loads this on handoff, restoration or saving a substantial result.

## Context by responsibility

The lead (L0) keeps all goal and criteria context and accepts; it runs the bounded delivery,
decisions, parallel ready tasks and integration, or hires an executor (L1) who performs one
finite mandate quickly and returns. Responsibility does not pass down with complexity: the lead
cuts complex work into finite executor TASKs, each tying the owner goal, subtask contribution
and result in one line. Do not assign organization/acceptance skills to an executor by default.
Faces and playbook delivery are unused; the assigned skill arrives in the mandate. An executor
gets the full skill for its action, related rules and exceptions, TASK/RESULT/EVIDENCE and the
tools it needs; ACCEPTANCE and the whole project context stay with the responsible level. Never
re-copy automatically delivered full text. Do not compress a mandatory rule until it loses
meaning: give the exact source and a way to read the dependency.

Separate research needs a question, a tie to a criterion, decision or risk, and a stop
condition. Do not look for "what else to improve" outside the mandate. An executor passes
unexpected complexity or an authority question to the requester instead of choosing further search.
First the requester's decision, context or an existing tool, then one addressed wolf-expert if
needed. A council follows wolf-council on a substantial choice, substantive contradiction or
direct request; no mandatory dead end. Independence and limited rights are checked before
launch. A rule W1–W4 defect goes through wolf-feedback. Advice or mutation changes neither the
goal nor rights.

A goal or thread may combine several sequential or parallel mandates. A mandate marks the
result to accept; a session is one executor instance; a shared thread does not justify continue.
Choose by [division of labor](division-of-labor.md). The lead owns the shared plan and its
integration; the authoring executor returns its assigned result and statuses through the lead.
The lead keeps a short map of mandates, dependencies and verdicts and reads the plan details
it needs for its own decisions. Changing the note owner requires a handoff, not simultaneous
editing.

## Working memory between agents and sessions

A short RESULT is a message. Save in Wolf only the state or result the next agent, checkpoint or
acceptance needs, not every step or tool output. The note owner is the lead, one per task; an
executor without write rights passes content on. Memory is the main exchange route; a working
file outside docs is a fallback when memory is unavailable or for patch or binary data. Create
memory notes with the regular commands, not hand-written files in .wolf; a script is stored as a
file or tool, not a long note.

- note + context: current mandate, question under research, hypothesis, inputs, next step.
- note + history: RESULT, checkpoint, verification or review summary, accepted handoff.
- note + metric: measurements, when really needed for comparison.
- thread: multi-step goal; blocked/waiting_answer is a real thread dependency or question, not
  a mandatory status because an executor returned.
- decision: the option actually chosen by the authorized level. A private command choice or
  hypothesis stays in a working note and creates no project decision.
- lesson: a proven transferable lesson with applicability boundaries and a trigger.
- complaint: a proven W1–W4 rule defect with about/rule/evidence/proposal. Do not use
  lesson/complaint for ordinary status, a bug or tool friction.

For working notes, save memory_class=working, truth_role=proposed_knowledge,
lifetime=short_term, review_state=proposed, status=active explicitly. Strictly one-off context
allows lifetime=session. Here review_state is not a mandate for automatic triage: a working
note, not a proposed lesson or rule. A recorded signal is kept and not lost; it is processed
only through an assigned wolf-steward mandate or the `wolf learn due` queue (learning mode
`suggest`; mode `off` assigns and suggests nothing). A history note
with accepted may reach the shared brief; do not turn a private result into accepted shared
memory. These fields give no TTL, privacy or guaranteed hiding from search. Do not use
facet=proposal without a real structured proposal.

Body: task/thread ID, owner, goal and boundaries, revision, what is done or unknown, evidence,
question or next step. tags serve addressed search. Link the note to the real thread via
related_to, and pass exact IDs plus a short relevant fragment, not the whole brief or archive.
Do not add non-existent task_id/expires_at/thread fields to a note via --set. Mind the worktree
scope; a direct get/brief is not access isolation. Example of a supported path (ID and body are
real, not literal placeholders):

```bash
wolf add --type note --facet history --title "TASK: checkpoint" \
  --body "task/thread, revision, result, evidence, remainder" \
  --tags "working-state" --created-by agent:wolf-developer \
  --set memory_class=working --set truth_role=proposed_knowledge \
  --set lifetime=short_term --set review_state=proposed --set status=active
wolf relation add <note-id> related_to <thread-id>
```

After a confirmed handoff or completion the owner archives only its own or pinned unneeded
working notes of the current task, not another's state or required audit, keeping links and the
required acceptance trace; lifetime alone deletes nothing. A meaningful checkpoint replacement
is a new note plus supersede, not copies per executor. A lesson or complaint is split out only
when its grounds exist; the new card references the original evidence, and the original note is
not renamed into lesson/complaint. The working archive is not an aggregation queue; recorded
experience is processed only through an assigned wolf-steward mandate or the `wolf learn due`
queue (learning mode `suggest`; mode `off` — nothing is assigned or suggested).
