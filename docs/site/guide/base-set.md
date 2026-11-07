# Base Set

The base set is the agent harness Mr. Wolf delivers into a project: agents, skills, commands, opencode plugins and playbooks. The source of truth is the `templates/` directory of the `mister-wolf` npm package: `wolf init --full` renders the set into the project, and later updates arrive via the projects pass of `wolf upgrade` (`--here` for one project; see [Platform & Maintenance — wolf upgrade](/guide/cli/platform#wolf-upgrade) and the workflow on [Upgrading a Project and a Park](/guide/upgrade)). The set also ships the onboarding block for the project root `AGENTS.md` (marked `<!-- wolf:onboarding v3 -->`): a new file gets it as part of the stamped whole-file render, an existing file gets the block appended, and everything outside the markers is preserved byte-for-byte.

The composition below is the catalog of `templates/base/` in the package.

## Agents — 7 → `.opencode/agents/`

| Agent                | Role                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mr-wolf`            | The coordinator (L0): briefs, dispatches executors, accepts their reports; never touches code itself                                                                                                                                                                                                                        |
| `steward`            | Background mentor: mutates agent playbooks on complaints, aggregates mature lessons ([loop](/guide/feedback), [aggregation](/guide/feedback#steward-aggregation)); invoked only nested                                                                                                                                      |
| `executor-lead`      | Level 1: takes a task brief from mr-wolf, decomposes it, executes directly or via workers, returns a report                                                                                                                                                                                                                 |
| `worker-implementer` | Single-task code executor (L2): exactly one subtask, allowlist-scoped edits, self-check, short report                                                                                                                                                                                                                       |
| `worker-researcher`  | Investigates code, documents and the web against one question; returns findings with sources and confidence; on an explicitly assigned architectural question it compares variants and returns a recommendation — it writes no files and approves no architecture                                                           |
| `worker-reviewer`    | Reviews workers' code and documents against the brief requirements; verdict via the VERDICT/SUMMARY contract                                                                                                                                                                                                                |
| `worker-expert`      | Bounded professional position on one question (L2): reads project files, code included, through a tool-enabled read channel inside the project boundary; writes, shell, subagents, web fetch and external directories stay denied; degrades to packet-only with an explicit `channel`; see [Expert Council](/guide/council) |

Every dispatched task carries an execution block: requested model/variant, the execute/solve mode, a tool-call budget and a stop condition. Since 2.24.0 it also carries a density axis — `density standard|draft`. The owner level (L0/L1) picks the density when writing the TASK; a missing field means `standard`. In `draft` the executor shortens the visible service record — repeated retellings, narration of the obvious, ritual summaries — while keeping mandatory checks, rights, evidence and independent acceptance; substantial uncertainty widens the targeted verification instead of shrinking the answer, and an unsupported density is returned to L1. Acceptance checks observed actions, evidence and the result — not a draft label in RESULT. No numeric savings are claimed; the measurable comparison is a separate observation effort (roadmap A1.2).

## Skills — 30 → `.opencode/skills/`

| Skill                            | Purpose                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finishing-a-development-branch` | choose how to integrate finished work — merge, PR or cleanup                                                                                                                    |
| `receiving-code-review`          | receive review feedback with rigor, no performative agreement                                                                                                                   |
| `requesting-code-review`         | verify work against requirements before merging                                                                                                                                 |
| `test-driven-development`        | red-green-refactor discipline before any implementation code                                                                                                                    |
| `using-git-worktrees`            | isolated worktrees for feature work and plan execution                                                                                                                          |
| `using-skills`                   | load the required methodology before responding or acting                                                                                                                       |
| `verification-before-completion` | run the checks before any "done" claim — evidence first                                                                                                                         |
| `wolf-brainstorm`                | intent dialogue — substantive questions and proposals until the goal is understood, a visible recap before new work starts                                                      |
| `wolf-code-craft`                | full implementation of the assigned behavior with readable means and no unnecessary complexity; also the criteria for evaluating an implementation within a mandate             |
| `wolf-code-simplify`             | targeted simplification of a named complexity with behavior and contract preserved — assigned separately, not an obligatory stage after every edit                              |
| `wolf-council`                   | independent positions on a substantive fork — variants compared, synthesis handed to the deciding level                                                                         |
| `wolf-debug`                     | root-cause phases before proposing fixes                                                                                                                                        |
| `wolf-design`                    | design.md produced from requirements.md before implementation                                                                                                                   |
| `wolf-document-readability`      | readability editing pass on a finished document by a dedicated L2 technical writer — content and accuracy preserved, not a substantive review                                   |
| `wolf-execute`                   | flat linear plan execution without subagents (fallback mode)                                                                                                                    |
| `wolf-explain`                   | human explanations built from actions, reasons and consequences — restores a missing link instead of repeating, and keeps facts and the unknown apart                           |
| `wolf-git`                       | git stages of a task — entry and resume, branch or worktree, checkpoint, handoff, finish and cleanup; ships the `git-collaboration-policy-v1.1` reference and automates nothing |
| `wolf-handoff`                   | continue an overloaded session in a fresh one, without losing progress                                                                                                          |
| `wolf-plan`                      | zero-context plans where every task is a self-sufficient worker brief                                                                                                           |
| `wolf-work-strategy`             | choose a proportionate route, ask the context holder early, and stop at sufficient evidence                                                                                     |
| `wolf-user-report`               | reader-focused documents with sufficient depth, appropriate visuals, HTML/CSS and reusable project templates                                                                    |
| `wolf-feedback`                  | Role-scoped questions, friction, complaints and bounded session diagnosis                                                                                                       |
| `wolf-visual-dialogue`           | Visual discussion, feedback and an agreed standalone document                                                                                                                   |
| `wolf-release-docs`              | release documentation pass: coverage map, EN/RU alignment, generated pages                                                                                                      |
| `wolf-review`                    | multi-lens document review loop                                                                                                                                                 |
| `wolf-sdd`                       | subagent-driven development for plans with independent tasks                                                                                                                    |
| `wolf-skill-intake`              | connect external skills through the Wolf quality loop, owner-gated                                                                                                              |
| `wolf-software-design`           | engineering method inside wolf-design: boundaries, contracts, dependencies and state ownership of a software solution                                                           |
| `wolf-testplan`                  | test-plan.md with Given/When/Then per requirement                                                                                                                               |
| `writing-skills`                 | Wolf skill lifecycle: create, edit, verify                                                                                                                                      |

For L0/L1, bootstrap delivers the complete installed `using-skills` body rather than a separate summary. The agent checks the route when the goal or stage changes and loads other skills before applying them. L2 receives the passive worker protocol and assigned methodologies. Missing bootstrap content is reported explicitly.

Load wolf-work-strategy once per assignment, then again only if its version changes or its text is lost. It guides action selection while preserving roles and mandatory project gates. An early question can replace an expensive investigation, including fact finding; obvious facts in the supplied inputs need no question. Without an in-call dialogue channel, L2 returns the question to L1 through its existing result contract. Updating templates does not reconcile an old active playbook; use the existing Steward workflow.

Load wolf-user-report for a requested or agreed standalone human document, including updates. It is available in the full base set, not automatically loaded for chat replies or machine RESULT/EVIDENCE. Preserve the chosen format and role boundaries; do not start new research just to format the result. Project themes and templates remain project resources, not mandatory bundled CSS profiles.

Load wolf-document-readability when a finished document — requirements, a change request, design/ADR, a plan, a test plan, an instruction or a report — takes the readability route: the author hands the text to a dedicated L2 technical writer before substantive review. The editing pass preserves content and accuracy (claims, numbers, dates, IDs, links, conditions, statuses, checkboxes, append-only parts), does not research code or verify technical decisions, and never creates documentation from scratch. It is not substantive review (wolf-review) and not a standalone human document (wolf-user-report); one pass covers the initial release or a substantial rework, and the skill is never applied automatically to dialogue or service TASK/RESULT.

## Commands — 3 → `.opencode/command/`

| Command       | What it does                                                                        |
| ------------- | ----------------------------------------------------------------------------------- |
| `analyze-doc` | L0 aligns the goal → L1 organizes a bounded analysis → worker-researcher            |
| `complain`    | file an owner complaint into the memory mutation loop: complaint → triage → Steward |
| `doc-review`  | multi-lens document review orchestrated via the wolf-review skill                   |

## Plugins — 2 → `.opencode/plugins/`

Plugins ship with the opencode harness layer of the package (`templates/opencode/plugins/`) and are part of the same stamped set:

- `wolf-router` — deterministic playbook delivery per agent (by the `agent-id` marker); writes routing decisions to `.wolf/router.log` (with `ms=`/`bytes=` observability fields) and skill invocations to `.wolf/metrics/skill-invocations.jsonl` — skill usage is now measurable (see [Analytics — delivery panel](/guide/cli/analytics#delivery-panel)).
- `wolf-session-start` — injects the bootstrap context when the transcript has no marker yet (covers session start, `/clear` and compact) and manages the `WOLF_SESSION` key: since 2.13 the `opc-<uuid>` session id is inherited between CLI spawns of one logical session (set only when absent), so delivery deduplication covers the whole session (see [Telemetry — session keys](/guide/telemetry#session-keys)).

## Playbooks — 6 → seeded into Wolf memory

Playbooks are the odd one out: they are **not** stamped files. Since 2.13 they are no longer a `playbook` type: `wolf init --full` seeds them into `.wolf/` memory — since 2.17 as `face` objects (a versioned core type with `owner_skill`; skipped when a live face or a legacy note with the same `owner_skill` is already seeded). From that moment they are memory — mutations go through the complaint loop and the Steward (`wolf face` versions with a mandatory mutation record), and the update pass never touches them. This also means the projects pass adds a missing face but never re-renders an existing one; `wolf init --yes` re-renders a face that is still `seed`/`migration`-initiated, and a face already versioned by the Steward or the owner is left alone. A project seeded in an earlier release therefore keeps its body until one of those paths runs (see [Troubleshooting — the delivered playbook still shows an outdated sentence](/guide/troubleshooting#_16-the-delivered-playbook-still-shows-an-outdated-sentence)). Legacy seeded notes migrate with `wolf face migrate`. See [Memory Model](/guide/memory).

Owner-only face commands stay owner-only. `wolf face restore --from <id|vN>` and `wolf face migrate` are refused inside an agent session (`WOLF_SESSION=opc-*`) exactly like `wolf face breakglass` — there the actor is `user:cli`, not the owner, and `restore` takes the body wholesale from the base version, so edits accumulated on the live face would be lost; the refusal is logged (`memory.face.denied`). Both keep working from the owner's terminal. `wolf scaffold agent|skill|command <name>` refuses when a live face with the same `owner_skill` already exists and names its id and version, so the scaffold stub can no longer overwrite a live face; a new name scaffolds as before, and an existing face is updated by the Steward (`wolf face new` with `WOLF_ACTOR=agent:steward`), not by scaffold.

| Playbook                      | Content                                               | Owner                |
| ----------------------------- | ----------------------------------------------------- | -------------------- |
| `complaint-protocol`          | complaint intake and the triage tree                  | `mr-wolf`            |
| `executor-lead-playbook`      | the lead's decomposition and acceptance pipeline      | `executor-lead`      |
| `steward-nastavnik`           | the playbook mutation protocol                        | `steward`            |
| `worker-implementer-playbook` | method and report format for the implementer          | `worker-implementer` |
| `worker-researcher-playbook`  | analysis method and findings format                   | `worker-researcher`  |
| `worker-reviewer-playbook`    | review zones and the VERDICT contract                 | `worker-reviewer`    |
| `worker-expert-playbook`      | the expert's bounded-position and read-channel method | `worker-expert`      |

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

## Addressed routes and project tools

using-skills has a small core and topical references describing when and how to
apply a skill and its result. Assigned skills can be loaded directly; L2 does
not browse the catalog. L1 composes an assistant from an L2 instance, its face
and skills; programmatic tools support its mechanical work.

### The internal agent language reference

Since 2.29.0 using-skills ships `references/agent-language.md` — a static specification of the internal agent language: the shared terms (TASK, RESULT, DONE ≠ ACCEPTED, EVIDENCE, VERDICT, COMPLAINT and the rest), the usage rules R1–R6, and an escape statement for situations a form does not cover. The problem it addresses: this language runs every handoff between agents, and retellings of terms scattered across contract texts drift and force re-asks — one written reference gives every agent the same words. Message slots stay normative in `contracts.md`; the specification links there and adds no new mandatory fields.

Status: observation stage. The specification writes down existing constructs and changes no runtime; whether it actually reduces re-asks and meaning drift has not been measured, and the language stays fixed until the stage concludes. If a term or a form itself is the problem, complaints now carry a LANGUAGE subject — `LANGUAGE/ambiguous-definition`, `LANGUAGE/insufficient-form`, `LANGUAGE/excessive-requirement` (see [The Steward](/guide/feedback)). Humans keep ordinary language in all cases.

Three engineering skills ride the existing route instead of adding a stage to it: the goal reaches L1, `wolf-design` applies the software-design method where boundaries and contracts are the open question, the existing plan and test-plan follow, the implementer receives `wolf-code-craft`, and the existing independent review and project checks stay where they are.

A researcher answers an explicitly assigned architectural question with a comparison of variants and a recommendation — the architecture itself is approved by the responsible level. Simplification (`wolf-code-simplify`) is assigned separately when a named complexity needs its own analysis; it is not an automatic extra round, and the implementer removes the surplus complexity inside the current mandate. Documents and operations without a software implementation do not get the engineering set assigned automatically.

The skills add reusable methods to what the organization accumulates — see [Capabilities and boundaries](/guide/capabilities) — and add no agent, no face and no runtime surface.

A tool card references the project source files instead of copying them into
`.wolf/tools/`: the entrypoint is registered by its project path, additional
significant files are added by repeating `--resource`, and an explicit `--update`
refreshes the same card ID when the source changes. Cards registered the old way
keep working without a bulk migration. The `source_digest` check only confirms
the listed files are unchanged; the environment and side effects still depend on
the card's contract. `tool use` records usage — it does not execute anything.
Full command syntax with all flags: [CLI reference](/guide/cli/command-reference).
