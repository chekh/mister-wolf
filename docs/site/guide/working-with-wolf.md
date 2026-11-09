# Working with Wolf

Talk to Wolf about the outcome you need. The lead connects that intent to the agent organization; you do not need to manage individual executors.

## Give an outcome and the constraints that matter

For example:

> Prepare a guide for a newcomer to this project. Use the current documents. Include setup, the first useful task and where to ask for help. Keep it concise, and verify the commands you can safely run.

Wolf should establish what success means and ask when a missing answer changes the route or result. Its intent-dialogue method is contextual; a fixed questionnaire is not the goal. You can correct its understanding before execution or when new information appears.

The supplied organization assigns bounded tasks to wolf-* executors and integrates their results. Missing access, model capability or permissions must remain an explicit limitation, rather than an invented completed action.

## Understand a choice or check progress

Useful requests include:

- “Explain why this route helps achieve my goal.”
- “What is complete, what is blocked, and which decision do you need from me?”
- “Show how the result meets the agreed criteria.”

These are examples of ordinary conversation, not additional CLI commands. Wolf should explain actions, reasons and consequences in human language, without pasting internal protocols or hidden reasoning.

## Continue later

Ask Wolf to preserve the significant state before stopping a long assignment. A checkpoint should identify the goal, completed work, decisions, open issues and the next step. It cannot preserve findings that were never recorded.

In a fresh session, ask to continue the named task. Wolf can use the saved thread and references, check which evidence still applies and resume unfinished work. If the environment or source revision changed, some validation may be necessary. This is semantic continuity, not automatic recovery of a killed process.

## Correct the current result or improve the method

Tell Wolf what happened and what you expected:

> You repeated the whole investigation instead of asking me about the missing requirement. Correct the current plan and check whether the working method needs changing.

A local execution error calls for a correction. A missing decision calls for a question. A defect in a rule can be filed as a complaint; in 3.0.0 the Steward that applies method mutations is temporarily paused, and complaints are accepted and recorded until its return. You do not need to classify it first; Wolf's feedback methods distinguish the routes. [The learning loop](/guide/feedback) explains the subsequent changes and limits.

Ask for the affected method, reason for change, version and validation. The owner can inspect face versions and use authorized restore operations; [Delivery & Trust](/guide/delivery) explains when a changed face reaches a session.

## What you control today

The CLI provides memory lookup, face history/restore operations, upgrade diffs and analytics. Wolf can explain these artifacts as part of the dialogue; permissions and your installed version still apply. A dedicated graphical control console is a future direction, not a current interface.

For exact operations use the [CLI reference](/guide/cli/). For installation or a first task, use [Getting Started](/guide/getting-started).
