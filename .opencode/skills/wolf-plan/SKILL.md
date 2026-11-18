---
name: wolf-plan
description: "Apply before decomposing an approved solution into executable tasks, before handing work to executors, or when an existing plan's dependencies and composition change."
---
<!-- wolf:rendered base=SKILL.md set=3.2.0 -->

# Design → tasks

## Mandatory input

Before planning, check thread, mode, current requirements, active change-request.md entries, design, and grounds of approval. The lead assigns planning and accepts the overall plan; an executor may prepare an assigned part, never own the overall plan. In FULL, fill in the folder's plan.md: tasks as checkboxes with task_id, links to design and baseline. In LITE/FIX, use the allowed brief; do not create the whole package for formality. The plan author does not start implementation in this skill.

Distinguish mandatory requirements from conditional; carry out conditionals when their premise applies.
Track applicable obligations in the existing TASK/tracker; do not create new memory statuses; pass an unavailable mandatory action to the responsible level.

## Input and output

Input: approved requirements/design or an allowed LITE/FIX brief; baseline SHA, project profile, known test-plan. Output: plan.md or a TASK list with dependencies and integration points. The planning author does not perform implementation.

## Scale of the mandate

Before splitting, load using-skills/references/division-of-labor.md unless it
has been delivered. Plan within your TASK boundaries: distributing a common goal
across deliveries, or a delivery's internal finite tasks.
In the first case the lead prepares constrained briefs with criteria,
inputs, dependencies/readiness conditions, shared-resource boundaries, budget,
and a technical-integration owner. Mandates use the existing TASK core
and frame without a new profile; a short summary and links go to the role's REPORT.
The lead makes the mandates; a planning executor hires nobody.

A delivery boundary is a finished result acceptable on its own, not the whole
goal/thread or session. Separate deliveries get fresh executors even sequentially.
Do not split small related work across files/stages; a delivery's internal plan
may include related stages, reviews, fixes in one mandate.
An accepted plan-only mandate result does not permit delivery execution.

## Process

Ready nodes start right after prerequisites, not the whole wave.
Check shared databases, ports, test environments, other resources: different files do not guarantee independence.
Lens-based reviews and independent tests may run in parallel on one revision.
Integrate results in small batches; verify interactions on a shared revision.

1. Check input versions. Map each REQ/NFR to a task and verification; record gaps before execution.
2. Split the work by results and responsibility. Task size is set by independent verification and available context, not a mandatory 2–5 minutes.
3. For each task, fill in a TASK from using-skills per the core canon and mandate profile; do not duplicate the field list, refer to the canon. Allow reading affected code and consumers; absent session history does not mean reading is forbidden.
4. Specify sufficiently precise actions and symbols, not full implementation code. Examples are allowed for an ambiguous contract but do not duplicate design. Do not prescribe exact test code instead of the verifiable property.
5. Build dependencies. Allow parallelism only for independent outputs, isolated writes, and a defined integration owner. Serialize shared contracts and migrations.
6. For TASK outputs, specify a message or exact file/section; assign the temporary area outside documentation. For an extra stage document, state purpose, reader, owner right in the plan, without a separate registry. Add a separate integration task: combining order, interaction verification, the full gate, conflict-resolution rules. Specify intermediate checkpoints for long-running work.
7. Reconcile the plan with the test-plan: scenarios enter the matching tasks, NFRs have measurements, tests run via project commands. FULL execution starts only after that.
8. Carry out self-review and the assigned independent review. Fix a plan error with re-verifying affected dependencies.

## Planning by certainty

Detail what is already executable; first resolve a route-changing unknown —
with a question to the context holder, a ready source, or a limited probe.
Do not write a detailed implementation chain on an unverified assumption. Mark dependent
tasks conditional in the plan text, without a new memory status; after an answer, change
only the affected part. Do not split an obvious simple result to grow the task count.

## Tracking

Write tasks as checkboxes with task_id. `[x]` is set by the task's acceptance owner — usually the lead — after checking the result and necessary reviews, recording revision/evidence and integration status nearby. A commit or checkbox alone does not prove acceptance. The overall plan is changed by the lead, not parallel executors.

On resumption compare `[x]` with code, evidence, and verdicts; a mismatch returns the task to verification. Do not repeat already confirmed actions automatically.

## Handoff

On moving to execution, wolf-execute applies: the lead executes a ready node itself or hires a fresh executor for a finite mandate. Unavailable dispatching is a
concrete owner constraint, not implementation deferral. Do not ask the user to choose an internal mechanism without substantial effect on cost, risk, or preferences.

## Transition gate

The plan is ready for execution after dependencies are checked, design conformance confirmed, test-plan agreed, and necessary review done. Document states and approval grounds must match current versions. The lead organizes execution per wolf-execute; the assigned executor applies it for a finite mandate. Implementation is not part of planning.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "A plan is a list of files" | Every task has a goal, verifiable result, inputs, dependencies. |
| "We will add tests after implementation" | Link verifications to tasks before start. |
| "Executors will split the shared work themselves" | The overall plan and integration order belong to the lead. |
