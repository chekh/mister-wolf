---
name: wolf-memory
description: "Addressed reading and saving of a TASK, mini-plan, result, decision or handoff in Wolf memory."
---
<!-- wolf:rendered base=SKILL.md set=3.1.2 -->


# Use the existing memory

Do not change the code, taxonomy or schema fields. Documents are canonical
in their sources; the index is derived. Work through the existing CLI/MCP;
take exact syntax from the installed help at the first unknown action;
invent no commands/fields.

| Material | Write as |
|---|---|
| Goal and state of multi-step work | thread |
| TASK/mini-plan, current inputs | note/context |
| RESULT, checkpoint, review, handoff | note/history |
| An accepted substantial decision | decision with a document reference |
| Confirmed portable experience | lesson |
| An instruction defect | complaint |

Working notes take the supported fields: memory_class=working,
truth_role=proposed_knowledge, lifetime=short_term (or session),
review_state=proposed, status=active. TASK ID, owner, dependencies, branch,
checks, stop-condition go in the body, not as new schema fields. The
relation to a thread is the supported related_to; the help gives the
syntax. A multi-step mandate needs a mini-plan; for a short TASK its CHECK
is enough. The report stores result, SHA/digest, evidence refs, LIMITS,
remainder, next step. Do not save every tool call or full reasoning.
One canonical current pointer; historical results are not rewritten under a
new verdict.

At start, a stateless L0 finds the current thread and related
rules/decisions in an addressed way; a sufficient brief is allowed once, not
per TASK. L1 reads the passed IDs/versions, not the whole brief or archive.
Do not create a thread per question or child TASK. L0 maintains the general
map; executors maintain their records; no concurrent writing of one object.
By default L1 returns a RESULT; L0 saves only what matters. Before a
worktree, check the actual memory root; a .wolf branch copy does not prove
shared memory. Do not commit derived SQLite/secrets against project rules. If
recording is impossible — return the limitation and save via the agreed
fallback; do not claim the write happened. Faces/face and playbook delivery
are unused.
