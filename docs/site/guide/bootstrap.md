# Introduce Wolf to a project

Bootstrap prepares a starting understanding of an existing project. You do not need to classify its memory by hand: the command scans the project, registers document references and proposes initial conventions for review.

## What happens

`wolf init` creates the project's memory structure. `wolf bootstrap` then:

1. Scans project files and documents.
2. Drafts conventions from available facts: detected languages, a check command, document locations.
3. Saves those rules as low-confidence `proposed` objects.
4. Opens or reuses the onboarding thread and prints its ID and next steps.

Proposed conventions are not active instructions. A language detected from file extensions is not a verified stack description; a command from `package.json` may need project-specific correction.

## Begin with a dialogue

After [installation](/guide/getting-started), run in the project:

```bash
wolf bootstrap
```

Then ask Mr. Wolf in the configured agent environment:

> Review the bootstrap findings with me. Explain the proposed project conventions, ask about anything material that is missing, and help finish onboarding.

The command itself does not invoke an LLM and nothing starts automatically. The assistant organizes the review under the project's permissions; method changes follow the authorized feedback route — in 3.0.0 the Steward behind it is temporarily paused, and signals are recorded until its return. In memory-only mode, use your connected assistant or review the drafts with the CLI.

## What to confirm

You should recognize the project purpose, authoritative documents and required verification. Correct substantive errors; you do not need to memorize the object types. Ask the assistant to explain the outcome in ordinary language and identify any unresolved convention.

For manual inspection:

```bash
wolf list --type rule --status proposed
wolf list --type document-ref
wolf list --type thread
```

Use the actual rule and thread IDs printed by these commands or the bootstrap brief. Accepted rules and active rules are distinct lifecycle states. Review the intended scope before activation; finish the onboarding thread only after its remaining questions have been handled or explicitly deferred. See [Memory Model](/guide/memory) and [CLI memory commands](/guide/cli/memory) for editing and transitions.

## Completion and repeating the command

A useful completion result is a short explanation of the confirmed conventions, the check command, the documents registered and any open questions. `wolf doctor` checks project integrity; it does not establish that a human has understood or approved every convention.

Repeating bootstrap while onboarding is active reuses the thread and skips proposed rules with the same title. Once the onboarding thread is finished or deferred, bootstrap returns without rescanning; it does not reset an established project to drafts. For later document changes, use the normal scan and memory maintenance workflow rather than deleting the completed thread.

Source behavior: [`bootstrap-project.ts`](https://github.com/chekh/mister-wolf/blob/main/src/app/use-cases/bootstrap-project.ts).
