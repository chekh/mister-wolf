# Mr. Wolf Solve / Call: Memory-Assisted Problem Repair UX

**Status:** Draft for review
**Scope:** Product / UX / Architecture concept
**Topic:** Configurable magic commands for diagnosing memory-related agent failures and injecting corrected project memory back into AI working sessions.

---

## 1. Purpose

Mr. Wolf is a local-first project memory harness for AI-assisted development. Its core value is not to act as another agent, orchestrator, workflow engine, or model runtime. Its value is to preserve, structure, connect, and recall project knowledge across AI sessions.

This document introduces two complementary UX concepts:

```text
wolf solve
wolf call
```

These commands are intended to improve the day-to-day usability of Mr. Wolf when AI agents repeatedly make the same mistakes, follow stale instructions, ignore recent decisions, or lose important project context between sessions.

The core idea:

```text
wolf solve = prepare a focused memory-based solve context for a clean AI session
wolf call  = return a compact corrective memory injection to an active working session
```

Mr. Wolf does not perform the reasoning itself. It provides the right project memory to the reasoning agent.

---

## 2. Problem

AI-assisted development sessions often degrade in predictable ways.

An agent may:

```text
follow outdated instructions
use deprecated commands
ignore current project rules
repeat a mistake already corrected earlier
reference historical documents as if they are current
miss a recent decision
confuse archived plans with active plans
receive too much irrelevant memory
fail to understand the current thread state
```

The user then has to repeatedly explain the same correction:

```text
Do not use this command.
That document is old.
This decision superseded the previous one.
Use the new workflow.
Read the current rule.
That was already resolved.
```

This wastes tokens, creates frustration, and pollutes the active working session with meta-discussion.

The problem is not always that the agent is weak. Often the project memory itself is:

```text
stale
conflicting
incomplete
too noisy
missing an active rule
missing a supersession relation
missing a compact handoff instruction
```

Mr. Wolf should help diagnose and repair this memory problem.

---

## 3. Design Principle

The critical boundary:

```text
Mr. Wolf does not think instead of the agent.
Mr. Wolf gives the thinking agent the right memory.
```

Or, in product terms:

```text
Wolf does not run the work.
Wolf prepares the memory needed to solve the work.
```

Therefore `wolf solve` must not become:

```text
an agent orchestrator
a workflow engine
a model router
an autonomous repair bot
a code execution engine
a task runner
```

Instead, `wolf solve` should become:

```text
a scenario-driven solve-pack generator for clean AI sessions
```

And `wolf call` should become:

```text
a compact memory injection command for active working sessions
```

---

## 4. UX Story

### 4.1. Working Session Failure

A developer is working with an AI coding agent. The agent repeatedly uses an old command:

```text
get
```

But this command has already been deprecated. The current rule is to use entity-specific commands.

The user keeps correcting the agent:

```text
Do not use get. Use thread get / article get / info-request get.
```

But the agent continues to repeat the mistake.

At this point, the user should not have to debug memory problems inside the already polluted working session.

Instead, the user opens a clean session and asks Mr. Wolf:

```bash
wolf solve "агент выполняет команду get которая давно запрещена приходится повторять инструкцию каждый раз"
```

Mr. Wolf retrieves the relevant project memory:

```text
old rules
new rules
decisions
articles
session checkpoints
documents
relations
historical references
```

Then it produces a focused **Solve Pack** for the clean AI session.

The agent in that clean session analyzes the memory, writes a repair article, creates or updates a rule, adds supersession relations, and prepares a compact call injection.

The user then returns to the original working session and says:

```text
Слушай Wolf.
```

or runs:

```bash
wolf call --for get
```

The working agent receives a short corrective context injection and continues without a long explanation.

---

## 5. Core Commands

## 5.1. `wolf solve`

`wolf solve` is a magic command for memory-assisted problem diagnosis.

It accepts a messy natural-language problem description:

```bash
wolf solve "agent keeps using deprecated get command"
```

The command should not directly solve the problem by itself.

Instead, it should:

```text
classify the likely problem scenario
retrieve relevant memory
assemble a focused solve context
state what the AI session should analyze
define the required output artifacts
optionally save the solve request into memory
```

### Correct interpretation

```text
wolf solve = prepare memory for solving a problem
```

### Incorrect interpretation

```text
wolf solve = autonomously solve the task
wolf solve = run agents
wolf solve = execute code changes
wolf solve = orchestrate workflows
wolf solve = mutate memory without review
```

---

## 5.2. `wolf call`

`wolf call` returns a compact operational memory injection.

It is used in an active working session, not in a deep analysis session.

Example:

```bash
wolf call --for get
```

Possible output:

```text
Mr. Wolf instruction:

Do not use deprecated top-level `get`.

Use entity-specific commands instead:
- wolf thread get <id>
- wolf info-request get <id>
- wolf article get <id>

This instruction supersedes older guidance that mentioned top-level `get`.
Relevant rule: rule_cli_entity_get_20260703.
```

The output should be short, direct, and suitable for pasting into an AI coding session.

The purpose:

```text
Inject the smallest corrective memory needed for the agent to continue correctly.
```

---

## 6. Difference Between `solve`, `call`, `recall`, and `doctor`

These commands should not overlap conceptually.

### `wolf recall`

General project or thread context.

```text
Where are we?
What is relevant right now?
What should the agent know before starting work?
```

### `wolf solve`

Focused memory package for a specific problem.

```text
What memory is needed to analyze this behavioral/project-memory problem?
```

### `wolf call`

Compact instruction for an active session.

```text
What small correction should the current agent receive right now?
```

### `wolf doctor`

Technical health check.

```text
Are files valid?
Does the index exist?
Are schemas valid?
Are links broken?
```

### Summary

```text
doctor = filesystem/schema/index health
recall = general project context
solve  = memory-assisted problem analysis package
call   = compact corrective injection
```

---

## 7. Solve Pack

The main output of `wolf solve` is a **Solve Pack**.

A Solve Pack is a structured Markdown package intended for a clean AI session.

It should contain:

```text
problem statement
scenario classification
relevant memory objects
suspected issue types
constraints
required analysis
required output artifacts
suggested memory changes
```

Example:

```markdown
# Mr. Wolf Solve Pack

## Problem

Agent keeps using deprecated top-level `get`, even though it was forbidden.

## What to Analyze

Determine whether project memory contains stale or conflicting guidance that causes the agent to keep using `get`.

## Relevant Memory

### Active Rules

- rule_cli_entity_get_20260703
- rule_old_get_usage_20260628

### Related Decisions

- decision_cli_entity_commands_20260702

### Related Articles

- article_phase1_cli_contract_20260701

### Recent Checkpoints

- checkpoint_memory_phase1_audit_20260703

## Suspected Issue Types

- stale-instruction
- conflicting-memory
- missing-call-injection

## Required Output

Produce a memory repair result with:

1. Diagnosis.
2. Which memory objects are stale or conflicting.
3. Which objects should be superseded.
4. New or updated rule text.
5. A short `wolf call` injection for future sessions.
6. Exact memory artifacts to create or update.

## Constraints

- Do not change project code.
- Do not invent facts not present in memory.
- Preserve old documents as history where useful.
- Prefer superseding over deleting.
- Do not create a workflow engine or agent orchestration logic.
```

The Solve Pack should be useful even if the session starts with no prior context.

---

## 8. Configurable Solve Scenarios

`wolf solve` should not be implemented as one opaque magic function.

It should use configurable problem scenarios.

A solve scenario defines:

```text
what symptoms it handles
what memory types to retrieve
what checks to perform
what issue types to detect
what output artifacts to request
what safe repair actions may be proposed
```

This keeps the system extensible without turning it into an agent framework.

---

## 8.1. Example Scenario: Stale Instruction

```yaml
id: stale-instruction
title: Agent follows outdated instruction
description: Detects cases where the agent keeps following old guidance that should no longer be active.

symptoms:
  - agent keeps doing forbidden action
  - deprecated command is still used
  - user repeats the same correction
  - old documentation is treated as current instruction

retrieve:
  include_types:
    - rule
    - decision
    - article
    - session-checkpoint
    - document
  search_terms_from_problem: true

checks:
  - conflicting_active_guidance
  - superseded_object_still_recalled
  - newer_rule_exists_without_supersedes_relation
  - deprecated_command_mentioned_in_active_memory

solve_pack:
  required_analysis:
    - Find stale instructions.
    - Find newer conflicting rules or decisions.
    - Determine what should be superseded.
    - Draft a compact call injection.
  required_outputs:
    - diagnosis article
    - proposed rule update
    - supersedes relation
    - call-injection

safety:
  auto_apply:
    - create_call_injection
    - add_relation
  require_review:
    - mark_superseded
    - change_active_rule
    - supersede_decision
```

---

## 8.2. Example Scenario: Missing Rule

```yaml
id: missing-rule
title: Repeated correction without active rule
description: Detects when the user keeps repeating an instruction that should be stored as an active project rule.

symptoms:
  - user repeats the same instruction
  - agent keeps missing a project convention
  - no active rule exists for the behavior

retrieve:
  include_types:
    - rule
    - article
    - decision
    - session-checkpoint
  search_terms_from_problem: true

checks:
  - no_active_rule_found
  - repeated_correction_found_in_checkpoints
  - related_article_exists_without_rule

solve_pack:
  required_analysis:
    - Determine whether a durable rule is missing.
    - Draft a concise active rule.
    - Explain which memories support the rule.
    - Draft a compact call injection.
  required_outputs:
    - new rule proposal
    - supporting article or rationale
    - call-injection
```

---

## 8.3. Example Scenario: Conflicting Memory

```yaml
id: conflicting-memory
title: Conflicting project memory
description: Detects cases where multiple active memories give incompatible guidance.

symptoms:
  - project memory says two incompatible things
  - agent alternates between old and new guidance
  - two decisions appear active
  - rule conflicts with decision

retrieve:
  include_types:
    - rule
    - decision
    - article
    - document
  search_terms_from_problem: true

checks:
  - multiple_active_decisions
  - active_rule_conflicts_with_decision
  - accepted_article_conflicts_with_active_rule
  - missing_supersedes_relation

solve_pack:
  required_analysis:
    - Identify conflicting memories.
    - Determine which memory is authoritative.
    - Recommend supersession or needs-review status.
    - Draft a corrective call injection if needed.
  required_outputs:
    - conflict diagnosis
    - proposed supersession relation
    - proposed rule or decision update
    - optional info-request if evidence is insufficient
```

---

## 8.4. Example Scenario: Noisy Recall

```yaml
id: noisy-recall
title: Recall returns too much stale or irrelevant context
description: Detects when general recall or thread brief includes old, historical, or irrelevant memory.

symptoms:
  - recall output is too long
  - agent receives old documents
  - historical notes appear as current instructions
  - obsolete memory is still prominent

retrieve:
  include_types:
    - rule
    - decision
    - article
    - document
    - session-checkpoint
  search_terms_from_problem: true

checks:
  - historical_document_included_without_warning
  - superseded_memory_in_recall
  - too_many_low-relevance_items
  - missing_lifetime_metadata

solve_pack:
  required_analysis:
    - Identify noisy memory sources.
    - Determine which objects should be historical or superseded.
    - Recommend recall filtering or ranking adjustments.
    - Draft compact call injection if the agent needs immediate correction.
  required_outputs:
    - noisy recall diagnosis
    - proposed metadata updates
    - optional recall policy update
```

---

## 8.5. Example Scenario: Broken Handoff

```yaml
id: broken-handoff
title: New session does not understand current project state
description: Detects when a new agent session cannot reconstruct the current state from memory.

symptoms:
  - new session does not understand current goal
  - current state is unclear
  - too many open questions
  - session checkpoint is stale
  - thread brief is incomplete

retrieve:
  include_types:
    - work-thread
    - session-checkpoint
    - info-request
    - article
    - decision
    - blocker
    - rule
  search_terms_from_problem: true

checks:
  - stale_checkpoint
  - outdated_thread_current_state
  - too_many_open_info_requests
  - unresolved_blockers_without_summary
  - missing_next_steps

solve_pack:
  required_analysis:
    - Determine why handoff is weak.
    - Update current state and next steps.
    - Recommend checkpoint or thread brief improvements.
    - Draft a compact call injection for future sessions.
  required_outputs:
    - updated thread summary
    - session checkpoint
    - optional call-injection
```

---

## 9. Memory Artifacts

The solve/call system should reuse existing memory concepts wherever possible.

Avoid adding unnecessary new domain types.

---

## 9.1. Avoid Adding `problem` as a Canonical Type

A problem description is usually ephemeral input.

It should not automatically become a first-class persistent object.

Bad direction:

```text
type: problem
```

This risks turning Mr. Wolf into a task tracker or issue system.

Better direction:

```text
problem text is input to wolf solve
```

If persistence is needed, save it as an existing object type.

Possible mappings:

```text
info-request kind=memory-repair
article kind=diagnosis
rule
relation
call-injection
repair-plan
```

---

## 9.2. `info-request` as Memory Repair Request

A solve request can be stored as an `info-request` with a specific kind:

```yaml
---
type: info-request
kind: memory-repair
title: Agent keeps using deprecated get
question: Why does the agent keep using deprecated top-level get?
detour_reason: Analyzing stale project memory would derail the active development session.
needed_for:
  - Prevent repeated agent behavior failure
  - Create a durable memory correction
expected_answer:
  - Diagnosis
  - Relevant stale/conflicting memory objects
  - Proposed rule or relation changes
  - Compact call injection
status: open
---
```

This preserves the existing model:

```text
info-request = what knowledge is missing
article      = prepared answer
decision     = accepted project decision
rule         = durable behavioral constraint
```

---

## 9.3. `repair-plan`

A repair plan is useful when `wolf solve` proposes changes to memory.

A repair plan is reviewable and auditable.

Example:

```yaml
---
id: repair_deprecated_get_20260703
type: memory-repair-plan
status: proposed
problem: 'Agent keeps using deprecated top-level get.'
detected_issue_types:
  - stale-instruction
  - conflicting-memory
affected_objects:
  - rule_old_get_usage_20260628
  - rule_cli_entity_get_20260703
  - article_phase1_cli_contract_20260701
proposed_actions:
  - action: mark_superseded
    target: rule_old_get_usage_20260628
    superseded_by: rule_cli_entity_get_20260703
  - action: create_call_injection
    title: Do not use deprecated top-level get
  - action: add_relation
    from: rule_cli_entity_get_20260703
    relation: supersedes
    to: rule_old_get_usage_20260628
created_at: 2026-07-03T00:00:00Z
---
```

The repair plan should not be automatically applied unless explicitly requested.

---

## 9.4. `call-injection`

A call injection is a compact, active instruction intended for direct use in an AI session.

It is not a full rule, not an article, and not a decision.

It is an operational patch.

Example:

```yaml
---
id: call_deprecated_get_20260703
type: call-injection
status: active
scope: project
trigger:
  problem: agent uses deprecated top-level get command
  keywords:
    - get
    - deprecated command
    - entity-specific get
related_objects:
  - rule_cli_entity_get_20260703
  - rule_old_get_usage_20260628
  - repair_deprecated_get_20260703
max_tokens: 300
created_at: 2026-07-03T00:00:00Z
---
```

Body:

```text
Do not use deprecated top-level `get`.

Use entity-specific commands:
- wolf thread get <id>
- wolf info-request get <id>
- wolf article get <id>

The old top-level `get` guidance is superseded.
Follow rule_cli_entity_get_20260703.
```

---

## 10. Relationship Between Rule and Call Injection

A rule is durable project memory.

A call injection is short-lived or operational context.

### Rule

```text
longer
has rationale
can link to decisions and articles
can be reviewed
can be superseded
part of project policy/memory
```

### Call Injection

```text
short
imperative
ready to paste into session
usually 100–300 tokens
only includes what the current agent needs
derived from rules/decisions/articles
```

Example:

```text
Rule = The canonical CLI model uses entity-specific get commands.
Call Injection = Do not use deprecated top-level get. Use wolf thread get / article get / info-request get.
```

---

## 11. Command Design

## 11.1. Basic Solve

```bash
wolf solve "agent keeps using deprecated get command"
```

Expected behavior:

```text
select likely scenario
retrieve relevant memory
render Solve Pack
do not mutate memory
```

---

## 11.2. Save Solve Request

```bash
wolf solve "agent keeps using deprecated get command" --save
```

Expected behavior:

```text
create info-request kind=memory-repair
include problem statement
include relevant memory references
include expected answer contract
print path/id of created request
```

---

## 11.3. Generate Solve Pack for Specific Agent

```bash
wolf solve "agent keeps using deprecated get command" --for opencode
```

Expected behavior:

```text
render Solve Pack in a form suitable for OpenCode
include instructions on how to write result back to Mr. Wolf memory
```

Potential targets:

```text
opencode
claude-code
cursor
generic
markdown
json
```

---

## 11.4. Create Repair Plan

```bash
wolf solve "agent keeps using deprecated get command" --plan
```

Expected behavior:

```text
create memory-repair-plan
do not apply risky actions
print proposed actions
```

---

## 11.5. Apply Repair Plan

```bash
wolf repair apply repair_deprecated_get_20260703
```

Expected behavior:

```text
apply reviewed safe actions
refuse dangerous actions unless explicitly confirmed
update affected memory
rebuild derived index if needed
```

---

## 11.6. Call

```bash
wolf call
```

Expected behavior:

```text
print active project-level call injections
```

---

## 11.7. Topic-Specific Call

```bash
wolf call --for get
```

Expected behavior:

```text
find active call injections related to get
print compact instruction
```

---

## 11.8. Thread-Specific Call

```bash
wolf call --thread <thread-id>
```

Expected behavior:

```text
print call injections, active rules, and warnings relevant to the thread
```

---

## 11.9. Compact Call

```bash
wolf call --for get --compact
```

Expected behavior:

```text
return <= 300 tokens
suitable for direct paste into an active AI session
```

---

## 12. Safety Model

`wolf solve` should be safe by default.

Default behavior:

```text
read memory
assemble context
propose actions
do not mutate memory
```

Potentially safe actions:

```text
create solve request
create proposed repair plan
create proposed call injection
add non-destructive relation
mark object as needs-review
```

Risky actions:

```text
mark accepted decision as superseded
change active rule
mark document obsolete
delete anything
rewrite existing article
change recall policy
```

Risky actions require explicit review and confirmation.

Important rule:

```text
Prefer superseding over deleting.
Preserve historical memory.
Do not destroy project history.
```

---

## 13. Agent Workflow

The intended workflow has two separate AI sessions.

---

## 13.1. Active Working Session

The user works with an agent on the main task.

The agent starts making a repeated behavioral mistake.

The user does not debug the memory issue inside this session.

Instead, the user records the symptom.

---

## 13.2. Clean Solve Session

The user opens a clean session and runs:

```bash
wolf solve "<symptom>"
```

The clean agent receives the Solve Pack.

It analyzes the retrieved memory and writes the result back to Mr. Wolf as structured memory artifacts:

```text
diagnosis article
new or updated rule
supersession relation
call-injection
optional repair-plan
```

---

## 13.3. Return to Working Session

The user returns to the active working session and says:

```text
Слушай Wolf.
```

or provides:

```bash
wolf call --for <topic>
```

The working agent receives a compact injection and continues.

---

## 14. “Listen to Wolf” Agent Rule

Project instructions should include a convention such as:

```text
When the user says "listen to Wolf", "слушай Wolf", or asks you to follow Wolf,
run `wolf call` or use the available Mr. Wolf memory call tool.

Treat the returned call injection as active project guidance.

Do not ignore it unless it conflicts with code, tests, or explicitly newer user instructions.
```

For OpenCode or similar tools, Mr. Wolf can generate this rule:

```bash
wolf install-agent-rules --target opencode
```

Possible output:

```text
At the start of a task, use `wolf recall` if project context is unclear.

When the user says "listen to Wolf", run `wolf call` and follow the returned active injections.

When you repeatedly receive the same correction, suggest creating a `wolf solve` request.

Do not treat historical memory as current instruction.

Prefer active rules and accepted decisions over archived articles or old checkpoints.
```

---

## 15. MVP Scope

The first implementation should be narrow.

### In Scope

```text
wolf solve "<problem>"
scenario registry
two scenarios:
  stale-instruction
  missing-rule
retrieval of relevant memory
Solve Pack markdown output
--save option creating info-request kind=memory-repair
call-injection artifact type
wolf call
wolf call --for <topic>
compact call output
README workflow
AGENTS.md convention
tests for stale instruction scenario
```

### Out of Scope

```text
LLM inside Mr. Wolf
agent orchestration
model routing
automatic code edits
web UI
dashboard
cross-project memory repair
complex workflow DSL
automatic risky memory mutations
full policy engine
```

---

## 16. MVP Acceptance Criteria

The MVP is acceptable when the following scenario works.

### Given

Memory contains:

```text
old active rule says "use get"
newer memory says "top-level get is deprecated"
no supersedes relation
no call-injection
```

### When

```bash
wolf solve "agent keeps using get even though it is forbidden" --save
```

### Then

Mr. Wolf:

```text
detects stale-instruction scenario
retrieves old and new relevant memory
creates info-request kind=memory-repair
renders Solve Pack
asks the AI session to produce:
  diagnosis
  proposed rule
  supersedes relation
  call-injection
```

### When the clean AI session writes the repair result

It creates:

```text
diagnosis article
active replacement rule or proposed rule
supersedes relation
call-injection
```

### When

```bash
wolf call --for get
```

### Then

Mr. Wolf returns a compact instruction:

```text
Do not use deprecated top-level get.
Use entity-specific get commands.
Older guidance mentioning get is superseded.
```

---

## 17. Tests

Minimum tests:

```text
solve selects stale-instruction scenario for deprecated command symptom
solve retrieves relevant rule/article/decision objects
solve renders Solve Pack with required sections
solve --save creates info-request kind=memory-repair
call-injection artifact can be created and listed
wolf call --for topic returns relevant injection
wolf call --compact respects token/length budget
old stale rule does not appear as active instruction in call output
```

Additional tests:

```text
missing-rule scenario detects no active rule
solve does not mutate memory by default
repair plan does not apply risky actions automatically
call output includes provenance
call output excludes historical-only memory unless relevant
```

---

## 18. Product Positioning

This feature can become a central differentiator for Mr. Wolf.

Most memory tools answer:

```text
What do we remember?
```

Mr. Wolf can answer:

```text
Why is our memory causing the agent to behave incorrectly?
What should be repaired?
What small correction should the current session receive?
```

Product formula:

```text
When the agent keeps making the same mistake, do not explain it again.
Ask Wolf to repair the project memory, then call Wolf back into the working session.
```

Short version:

```text
wolf solve fixes memory.
wolf call injects the fix.
```

More precise version:

```text
wolf solve prepares a scenario-driven Solve Pack for a clean AI session.
wolf call returns the smallest corrective project-memory injection for the active session.
```

---

## 19. Why This Fits Mr. Wolf

This feature fits the project because it strengthens the memory harness idea.

It does not require Mr. Wolf to become:

```text
an agent
an orchestrator
a workflow automation platform
a model router
a universal assistant
```

Instead, it deepens Mr. Wolf’s role as:

```text
local-first project memory
memory quality system
context repair layer
agent handoff support
semantic memory debugger
```

The strongest positioning:

```text
Mr. Wolf does not just remember.
Mr. Wolf keeps project memory sane.
```

---

## 20. Implementation Notes

Potential modules:

```text
src/domain/memory/solve-scenario.ts
src/domain/memory/call-injection.ts
src/domain/memory/repair-plan.ts

src/app/memory/build-solve-pack.ts
src/app/memory/create-memory-repair-request.ts
src/app/memory/get-call-injections.ts

src/adapters/cli/memory-solve.ts
src/adapters/cli/memory-call.ts
src/adapters/cli/memory-repair.ts

.mrwolf/solve-scenarios/
  stale-instruction.yaml
  missing-rule.yaml
```

Important rule:

```text
Scenario definitions are not agent workflows.
They are memory retrieval and repair guidance recipes.
```

The first implementation should be mostly deterministic:

```text
problem text → scenario match → memory retrieval → Solve Pack output
```

LLM-based scenario classification can be added later, but should not be required for the core system to work.

---

## 21. Open Questions

1. Should `call-injection` be a first-class memory type, or should it be represented as a special `rule` subtype?
2. Should `repair-plan` be persisted from the first MVP, or should `solve --save` initially create only `info-request kind=memory-repair`?
3. Should `wolf call` include only call injections, or also active rules and accepted decisions?
4. Should `wolf solve` support project-wide scenarios before thread-specific scenarios?
5. Should solve scenarios live in `.mrwolf/solve-scenarios/` or in package defaults with project overrides?
6. Should `wolf call --compact` enforce a hard character/token budget?
7. Should “listen to Wolf” be installed into AGENTS.md automatically?

---

## 22. Recommended First PR

Title:

```text
feat: add solve pack and call injection UX
```

Scope:

```text
1. Add solve scenario registry.
2. Add two built-in scenarios:
   - stale-instruction
   - missing-rule
3. Add `wolf solve "<problem>"`.
4. Render Solve Pack markdown.
5. Add `wolf solve --save` to create info-request kind=memory-repair.
6. Add call-injection artifact.
7. Add `wolf call --for <topic>`.
8. Add AGENTS.md convention for “listen to Wolf”.
9. Add tests for deprecated `get` scenario.
10. Add README workflow example.
```

Do not include:

```text
LLM integration
automatic repair application
web UI
MCP expansion
cross-project memory
agent orchestration
```

---

## 23. Final Summary

The proposed UX is:

```text
wolf solve "<problem>"
```

to prepare a focused memory-based Solve Pack for a clean AI session, and:

```text
wolf call --for <topic>
```

to inject the resulting corrected memory back into the active working session.

This creates a powerful loop:

```text
agent fails repeatedly
user asks Wolf in clean session
Wolf provides relevant memory
agent writes memory repair
Wolf stores corrected memory
working session receives compact call injection
agent continues correctly
```

This is the right kind of magic for Mr. Wolf.

It improves UX without turning the project into an agent orchestrator.

It makes Mr. Wolf not just a memory store, but a system for keeping project memory accurate, actionable, and usable by AI agents.
