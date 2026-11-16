---
name: wolf-design
description: "Apply before designing a solution for approved requirements in FULL, when interfaces, state, migrations or trust contours change; also when a previously accepted design is revisited."
---
<!-- wolf:rendered base=SKILL.md set=3.1.2 -->

# Requirements → design

## Mandatory input

The lead aligns product decisions; the lead or an assigned executor produces documents, research. Before designing, verify approval and requirement versions. Return missing requirements to wolf-brainstorm; do not reinvent known architecture. For FULL, fill design.md in the existing feature folder with the standard template sections: glossary, components and responsibility, contracts, ADR cards, NFR references. The thread relation and requirements must be available in the document or maintained memory.

Distinguish mandatory from conditional requirements; carry out a conditional one when its grounds are present.

## Input and output

Input: approved requirements or an approved brief, baseline SHA, existing architecture, project profile. Output: design.md with review state, a REQ/NFR coverage map, decisions for approval. The author is an assigned executor or the lead; approval follows project policy and is made by the responsible party.

## Engineering skill

For a software solution choosing boundaries, contracts, dependencies or state, connect wolf-software-design; the built-in skill creates no separate gate. The requester may assign wolf-researcher one architectural question with options and recommendation; approval stays at the responsible level. The researcher answers with a message, may not write design.md or implementation.

## Process

1. Check the requirements are current; read code of affected components, consumers. Write references as revision:path:symbol; line numbers are a guide.
2. Per REQ/NFR, state component, contract, a verifiable property, or a justified "design not required".
3. Describe component responsibility, state ownership, interface boundaries, data flows, dependencies. For concurrent work, define invariants and write order.
4. Specify contracts as types/schemas of sufficient length; algorithms as pseudocode when prose admits different implementations; do not insert a ready-made product implementation.
5. For a substantial decision, write an ADR: context, alternatives, choice, consequences, risk, assumption verification. Return product trade-offs, scope and irreversible decisions to the responsible party; decide local technical choices within your mandate.
6. Verify dependency failures, partial failure, retry/idempotency, recovery, observability, compatibility, migrations; a rationale suffices for inapplicable areas.
7. With external content or command execution, describe the trust boundary, rights, secret protection, validation. Do not declare a mechanism implemented merely because text has a prohibition.
8. State technical NFR budgets and measurement method; propose a limited spike for choice-blocking uncertainty; a spike result does not automatically become the implementation.
9. Hand the design to wolf-review; obtain required approvals and keep the verdict revision.

## Assumptions and the short path

Use the known approach and existing contracts when sufficient. Before a spike, ask the responsible party or check the nearest source: experiment is for remaining substantial unknowns. State which choices its outcomes change. Do not guess a new requirement or substantial trade-off from code.

## Readiness and return

Design the test-plan in parallel after the common basis; return the unverifiable to requirements.

Every requirement is covered, contracts match the baseline, critical assumptions are verified or blocked. Hand the approved design to wolf-plan and wolf-testplan. A requirement change returns to discovery; a contract change invalidates dependent tasks, tests, reviews.

## Transition gate

Do not hand the design to planning until requirement coverage, failure scenarios, required ADR approvals and review of this exact version are verified. A requirement change returns to wolf-brainstorm; if only the technical solution changes, repeat the affected review. After approval, assign wolf-plan and wolf-testplan, not implementation.

## Do not skip the process

| Thought | Action |
| --- | --- |
| "The architecture is obvious" | Write down the boundaries, contracts and consequences; obviousness does not replace the FULL document. |
| "The requirements are still drafts, but we can start" | Do not turn an assumption into an approved input. |
| "The review was yesterday" | Compare the approved and current versions. |
