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

The expert's default channel is **tool-enabled reading inside the project boundary**: project files, code included, are read normally, and `glob`/`grep` are available so the expert can find the file it needs. Everything else is denied: writes, shell, subagents, web fetch, browser, skills and reads outside the project (`external_directory` is rejected outright). Env files and typical secret files stay under the `ask` guard — `.npmrc`, `.netrc`, `.git-credentials`, `*.pem`, `*.key`, `id_rsa`/`id_ed25519`: a broad project read does not silently open them.

The boundary has two halves, and both are needed. Paths outside the project are rejected by the host. Symlinks are **not** resolved for that check: a link inside the project that points outside is read as an in-project path, so the lead must audit links before the run — no link inside the project may resolve outside it (`realpath` each one; links under `node_modules` that resolve into the project or its main checkout are normal). A link that escapes makes the channel unusable: remove it or go packet-only. "There is at least one link" is too coarse a rule — it would disable the channel in every Node project.

Permissions come from the **base-set configuration** (the agent profile in `.opencode/agents/`), not from the prompt text: a list of paths in a TASK grants nothing and enables no tools. That is why the dead `read packet/*` rule was replaced with a working read rule — no project has a `packet/` directory.

Before the first round the lead must run a **functional channel probe**, separate from the symlink audit: one short expert call that reads a specific project file and returns a specific line. The probe passes only when the answer contains a **content fact**; `permission.rejected`, a missing tool call, or an answer built purely from the delivered text means the channel is not tool-enabled. The symlink audit proves isolation, not that reading works — one check does not replace the other.

When the channel is unusable the expert works **packet-only** (from the delivered materials) **and the degradation is stated explicitly**: the first line of RESULT carries the actual `channel` — `tool-enabled` | `packet-only` | `denied` — and `channel != tool-enabled` makes `isolation_limits` mandatory, listing the facts that reading did not confirm. A tool-enabled acceptance is never claimed without evidence.

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
