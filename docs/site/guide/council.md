# Expert Council

An expert council is a bounded consultation method for hard calls: when justified alternatives genuinely conflict, a cause stays unclear after reasonable diagnosis, an architectural choice is expensive to reverse, or a worker and a reviewer hold a substantive dispute. Routine work and unambiguous errors do not convene a council — they go through the normal process.

## When to use it

- conflicting justified variants, where the choice changes the outcome;
- an unresolved cause after reasonable debugging;
- an expensive architectural decision;
- a substantive worker-versus-reviewer disagreement.

A council is convened by the responsible level (usually L1) — it never appears on its own. One first round, at most one clarifying round; continuing beyond that requires a new goal.

## How a council runs

1. The lead prepares a question packet for each expert.
2. Each expert answers **independently**: claims, evidence, assumptions, confidence and risks — plus `LIMITS` wherever nothing reliable can be said. The first round runs without access to other experts' opinions.
3. The lead synthesizes: accepted claims, rejected alternatives, unresolved dissent and the validation still required (`required_validation`).
4. The decision stays with the responsible level. A recommendation is not a decision.

`insufficient_evidence` is an allowed outcome: the method prefers an honest "this evidence is not enough to decide" over a forced pick.

## The worker-expert role

`worker-expert` is a base-set agent (7 agents since 2.31.0): an L2 worker holding a narrow professional position on one question. It does not accept results, does not write memory and does not delegate.

By default the expert is **packet-only**: it answers from the delivered packet, without tools. An optional **tool-enabled** profile grants exactly one read allowlist — `packet/*` — and denies everything else: writes, shell, subagents, web fetch and reads outside the packet; an `external_directory` outside the scope is rejected outright. Read isolation for this profile is provided by the platform. Before a tool-enabled run the packet passes a symlink audit, so the allowlist cannot be escaped through a link.

If the platform cannot guarantee the tool-enabled restrictions, the expert works packet-only **and the degradation is stated explicitly** — a tool-enabled acceptance is never claimed without evidence.

## Recording a council

A council is preserved as a memory note (a v2 envelope: question, expert opinions, synthesis) through one operation:

```bash
wolf council record --input council.json
```

The MCP form is `council_record` — one tool of the 8-tool catalog. The write path validates the strict envelope schema, stores canonical JSON, is idempotent by `request_key` (a retry does not create duplicates) and restores the relations between the question, the opinions and the synthesis. See the [CLI reference](/guide/cli/command-reference) and [MCP integration](/guide/mcp).

Analytics reads every historical format (legacy councils, alias and v2 envelopes) as one mixed stream: a missing vote is not a timeout, and `envelope_participation` shows how much of a recorded council actually participated. See [Analytics](/guide/analytics).

## What it does not guarantee

- A council does not replace tests, git gates, independent acceptance or the acting authority chain.
- An expert's confidence is not proof: synthesized claims still require the listed validation.
- Convocation is a judgment of the responsible level, not an automatic trigger.

The method and the role arrive with the regular base set (`wolf init` / `wolf upgrade`), together with the seed playbook `worker-expert-playbook`. Read isolation is described separately in [Read Isolation](/guide/read-isolation).
