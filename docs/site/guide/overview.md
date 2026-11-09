# What is Mr. Wolf?

**Mr. Wolf is a permanent project organization built from temporary AI assistants, and your point of contact with it.** It connects people, agents, skills, tools, rules and memory into a working process. The goal stays in view while tasks, sessions and models change.

“I solve problems” describes a responsibility: understand the intended outcome, organize the route to it and assess the delivered result against that intent.

## Keep the goal while the work changes

A difficult assignment creates distractions: a broken tool, an unexpected constraint, a tempting side investigation. Wolf separates two distances of attention:

| Level        | Keeps in view                  | Responsibility                                                           |
| ------------ | ------------------------------ | ------------------------------------------------------------------------ |
| Wolf — the lead | Your intent and the final goal | Clarification, success criteria, key decisions, final acceptance — and hands-on work on the goal itself |
| wolf-* executor | One bounded result | Execute the assigned work and return the result or a specific difficulty; no further delegation |


A fresh executor can be replaced without making it responsible for the whole project. Questions travel to the lead holding the needed context; acceptance connects local results back to the goal. Memory carries significant decisions and state across sessions. The lead's own work passes the same independent review. See [Organization](/guide/organization).

## A process connects the parts

A skill supplies a method, a tool performs an operation, a rule sets a boundary, and memory supplies context. The process connects them: what applies now, who acts, when to ask, what counts as enough verification, and what must survive the session.

Mr. Wolf hires an executor for a task directly — by name, from the eight wolf-* specialists. Each executor works from its face (a versioned working methodology) with assigned skills and available tools. The specialization follows the task: research, documents, implementation, testing, review or release work. Executors do not delegate further; a new independent piece of work gets a fresh executor. The current shipped organization is OpenCode-first; general methods do not imply every domain or harness has a ready-made integration.

Useful scripts can be registered as project tools and reused with their contracts. Registering a tool does not execute it. See [Base Set](/guide/base-set) and [Tool economy](/guide/tool-economy).

## Project documents are memory

Requirements, architecture, research, plans and instructions already contain project knowledge. They belong to the project's memory alongside decisions, lessons, working threads and agent faces.

Original documents remain canonical in their own files. Wolf can register document references and retain working state in native memory objects; its search index is a derived aid. Registration does not mean every file is read in full or injected into every session. Context is selected for the work. See [Memory](/guide/memory) and [Bootstrap](/guide/bootstrap).

## The Steward changes future work

Delivery advances the current task. The **Steward** is a separate, cross-cutting role that maintains and improves working methods through an authorized feedback loop. In 3.0.0 the Steward is temporarily out of standard routing — feedback is accepted and recorded, and the role returns in the next release.

- A question can resolve missing context without changing a rule.
- A supported complaint can lead to a new version of an agent's face, with a reason, verification and rollback information.
- Mature compatible lessons can become one aggregate lesson, preserving their useful scope and evidence.
- The current face is delivered to later agent sessions; an already sealed session can retain its earlier version.

This is organizational self-learning and controlled self-mutation: methods and playbooks change, not model weights. A stored lesson alone does not prove a behavior change, and a changed method still needs appropriate validation. See [Steward and learning](/guide/feedback).

## One conversation with a person

You bring the goal, relevant constraints and meaningful decisions. Wolf's methods are intended to clarify your intent, explain choices and integrate executor output into an understandable answer. You should not have to manage executors or decode internal report protocols.

You can ask what was understood, what remains open, why a choice was made or what changed after feedback. These are ordinary parts of the working dialogue. Explain/report skills support that dialogue; they are not a replacement for task evidence. See [Working with Wolf](/guide/working-with-wolf).

## Begin with a useful result

For an initial task, use existing project documents to prepare a short onboarding guide. The same assignment exercises intent, research, writing, verification and retained state without requiring you to learn memory types.

[Start in OpenCode](/guide/getting-started) · [Compare approaches and current scope](/guide/capabilities)
