# Base Set

The base set is the agent harness Mr. Wolf delivers into a project: agents, skills, commands, opencode plugins and playbooks. The source of truth is the `templates/` directory of the `mister-wolf` npm package: `wolf init --full` renders the set into the project, and later updates arrive via the projects pass of `wolf upgrade` (`--here` for one project; see [Platform & Maintenance — wolf upgrade](/guide/cli/platform#wolf-upgrade) and the workflow on [Upgrading a Project and a Park](/guide/upgrade)). The set also ships the onboarding block for the project root `AGENTS.md` (marked `<!-- wolf:onboarding v3 -->`): a new file gets it as part of the stamped whole-file render, an existing file gets the block appended, and everything outside the markers is preserved byte-for-byte.

The composition below is the catalog of `templates/base/` in the package.

## Agents — 6 → `.opencode/agents/`

| Agent                | Role                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mr-wolf`            | The coordinator (L0): briefs, dispatches executors, accepts their reports; never touches code itself                                                                                   |
| `steward`            | Background mentor: mutates agent playbooks on complaints, aggregates mature lessons ([loop](/guide/feedback), [aggregation](/guide/feedback#steward-aggregation)); invoked only nested |
| `executor-lead`      | Level 1: takes a task brief from mr-wolf, decomposes it, executes directly or via workers, returns a report                                                                            |
| `worker-implementer` | Single-task code executor (L2): exactly one subtask, allowlist-scoped edits, self-check, short report                                                                                  |
| `worker-researcher`  | Investigates code, documents and the web against one question; returns findings with sources and confidence                                                                            |
| `worker-reviewer`    | Reviews workers' code and documents against the brief requirements; verdict via the VERDICT/SUMMARY contract                                                                           |

## Skills — 20 → `.opencode/skills/`

| Skill                            | Purpose                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| `finishing-a-development-branch` | choose how to integrate finished work — merge, PR or cleanup               |
| `receiving-code-review`          | receive review feedback with rigor, no performative agreement              |
| `requesting-code-review`         | verify work against requirements before merging                            |
| `test-driven-development`        | red-green-refactor discipline before any implementation code               |
| `using-git-worktrees`            | isolated worktrees for feature work and plan execution                     |
| `using-skills`                   | load the required methodology before responding or acting                  |
| `verification-before-completion` | run the checks before any "done" claim — evidence first                    |
| `wolf-brainstorm`                | structured dialogue before any creative work                               |
| `wolf-debug`                     | root-cause phases before proposing fixes                                   |
| `wolf-design`                    | design.md produced from requirements.md before implementation              |
| `wolf-execute`                   | flat linear plan execution without subagents (fallback mode)               |
| `wolf-explain`                   | clear coordinator responses that preserve facts and limitations            |
| `wolf-handoff`                   | continue an overloaded session in a fresh one, without losing progress     |
| `wolf-plan`                      | zero-context plans where every task is a self-sufficient worker brief      |
| `wolf-release-docs`              | release documentation pass: coverage map, EN/RU alignment, generated pages |
| `wolf-review`                    | multi-lens document review loop                                            |
| `wolf-sdd`                       | subagent-driven development for plans with independent tasks               |
| `wolf-skill-intake`              | connect external skills through the Wolf quality loop, owner-gated         |
| `wolf-testplan`                  | test-plan.md with Given/When/Then per requirement                          |
| `writing-skills`                 | Wolf skill lifecycle: create, edit, verify                                 |

For L0/L1, bootstrap delivers the complete installed `using-skills` body rather than a separate summary. The agent checks the route when the goal or stage changes and loads other skills before applying them. L2 receives the passive worker protocol and assigned methodologies. Missing bootstrap content is reported explicitly.

## Commands — 3 → `.opencode/command/`

| Command       | What it does                                                                             |
| ------------- | ---------------------------------------------------------------------------------------- |
| `analyze-doc` | analyze a document by the methodology stored in Wolf memory (worker-researcher playbook) |
| `complain`    | file an owner complaint into the memory mutation loop: complaint → triage → Steward      |
| `doc-review`  | multi-lens document review orchestrated via the wolf-review skill                        |

## Plugins — 2 → `.opencode/plugins/`

Plugins ship with the opencode harness layer of the package (`templates/opencode/plugins/`) and are part of the same stamped set:

- `wolf-router` — deterministic playbook delivery per agent (by the `agent-id` marker); writes routing decisions to `.wolf/router.log` (with `ms=`/`bytes=` observability fields) and skill invocations to `.wolf/metrics/skill-invocations.jsonl` — skill usage is now measurable (see [Analytics — delivery panel](/guide/cli/analytics#delivery-panel)).
- `wolf-session-start` — injects the bootstrap context when the transcript has no marker yet (covers session start, `/clear` and compact) and manages the `WOLF_SESSION` key: since 2.13 the `opc-<uuid>` session id is inherited between CLI spawns of one logical session (set only when absent), so delivery deduplication covers the whole session (see [Telemetry — session keys](/guide/telemetry#session-keys)).

## Playbooks — 6 → seeded into Wolf memory

Playbooks are the odd one out: they are **not** stamped files. Since 2.13 they are no longer a `playbook` type: `wolf init --full` seeds them into `.wolf/` memory — since 2.17 as `face` objects (a versioned core type with `owner_skill`; skipped when a live face or a legacy note with the same `owner_skill` is already seeded). From that moment they are memory — mutations go through the complaint loop and the Steward (`wolf face` versions with a mandatory mutation record), and the update pass never touches them. Legacy seeded notes migrate with `wolf face migrate`. See [Memory Model](/guide/memory).

| Playbook                      | Content                                          | Owner                |
| ----------------------------- | ------------------------------------------------ | -------------------- |
| `complaint-protocol`          | complaint intake and the triage tree             | `mr-wolf`            |
| `executor-lead-playbook`      | the lead's decomposition and acceptance pipeline | `executor-lead`      |
| `steward-nastavnik`           | the playbook mutation protocol                   | `steward`            |
| `worker-implementer-playbook` | method and report format for the implementer     | `worker-implementer` |
| `worker-researcher-playbook`  | analysis method and findings format              | `worker-researcher`  |
| `worker-reviewer-playbook`    | review zones and the VERDICT contract            | `worker-reviewer`    |

## Stamped files and sync

The agents, skills, commands and plugins of the set are delivered and updated as **stamped** files: each carries a `wolf:rendered base=<base> set=<version>` marker right after its frontmatter. The update pass (`wolf upgrade` — projects pass; `--here` for one project; `wolf sync` is a deprecated alias) re-renders stamped files only — memory (`.wolf/`) is untouched:

- `created` — the file was missing;
- `skipped` — the stamped content is identical;
- `updated` — the file is stamped but differs from the template: **local edits to a stamped file are overwritten** by the re-render;
- `updated (stamp drift healed)` — the content is identical to the template except for the `wolf:rendered …` line itself (an older release stamped it): wolf rewrites the file to align the stamp and refreshes the witness. This is not a decision and it is not `behind` in `--check` — an outdated stamp alone is not a local edit;
- `conflict` — an unstamped file occupies the template's place: the owner decides — rename it, delete it, or accept it as is;
- `protected` — the file carries `protect: true` (or `protect: X.Y.Z`) in its frontmatter: it is never overwritten and never deleted, whatever the release says;
- `kept` — you accepted the local content of a stamped file (`wolf upgrade --resolve <file>=keep`): the witness records it as accepted and the next pass leaves it alone instead of reverting your edit;
- `orphaned` — a stamped file whose template is gone from the package; you may delete it, or hold it with `protect`.

The `set=` value records the version of the package that last rendered the file: the update pass takes it from the running CLI, not from the update map, so it is the release you installed and ran — not necessarily the release you read about. That is why `wolf upgrade --check` can show `stamps 2.21.2 · map 2.22.0`: nothing has been written yet. A file held under `protect:` is never re-rendered, so it keeps the `set=` of its last render; the `protect:` value records the release only in its `X.Y.Z` form — `protect: true` carries no version.

An unstamped file is yours (the `wx` policy): `wolf init` skips it, the update pass reports the conflict instead of overwriting. The source of truth is always `templates/` in the npm package — template updates arrive with the package (`wolf upgrade`) and land in the project via its projects pass. Note: npx try-out mode never writes the base set.

### The onboarding block in `AGENTS.md`

`AGENTS.md` is managed in one of two modes, and both keep your authorship intact:

- **Stamped whole-file mode — what a fresh `init` writes**: `AGENTS.md` carries a `wolf:rendered …` stamp and belongs to wolf entirely — local edits make it `mutated`, and `take`/`keep` decide its fate. A `protect` key is not available here because the file ships without YAML frontmatter.
- **Block mode — what `init` appends when `AGENTS.md` already existed**: wolf owns only the lines between `<!-- wolf:onboarding v3 -->` and `<!-- /wolf:onboarding -->`. Everything above and below stays byte-for-byte, including line endings. The block itself is a versioned format: an existing `v2` block is recognized and updated in place to `v3` (the block gained the owner-intention line about `protect` and `--review`) — no second block is ever appended, and text _inside_ the block is wolf's zone, so it is not preserved. A broken marker pair (an opening marker without a closing one) makes the file foreign: it is skipped and reported as `onboarding markers broken`, never turned into a decision.

`wolf upgrade` never appends a block to an unstamped `AGENTS.md` without markers — only `init` creates one. A file wolf did not create stays foreign.

Want to customize an agent or a skill? Do it in memory, not in the stamped file: file a complaint (`wolf complain`) and let the Steward mutate the playbook — or fork the file by removing its stamp, accepting that the update pass will no longer manage it. If you only need to keep the local version of a file wolf does manage, declare the intent in the file (`protect: true`, or `wolf upgrade --resolve <file>=protect`) instead of removing the stamp: the file stays visible in `wolf upgrade --check`, which is the point. Full workflow: [Upgrading a Project and a Park](/guide/upgrade).
