---
name: wolf-release-docs
description: "Apply when preparing any new Wolf version for release, when updating the README or the site for a release, when checking documentation readiness before publication, and after the release scope or the behavior of a documented feature changes."
---
<!-- wolf:rendered base=SKILL.md set=3.2.0 -->

# Wolf documentation before a release

## Mandatory input and responsibility

Load this skill before planning and editing release documentation. Apply it to major/minor/patch: the volume depends on the changes; verification of currency and usefulness is mandatory. A regular feature PR without release preparation needs no full pass; changed behavior is documented in its task. After scope changes, re-check the affected pages and examples.

The lead sets the release goal and accepts the package; the lead assigns authors and independent review and integrates changes, while an assigned executor may drive the plan's mechanics only within the lead's decisions. An executor receives concrete pages, sources, allowlist and criteria. Shared READMEs, the concept and navigation have a single owner of record. This skill authorizes neither npm publication, a tag, a deploy, a commit nor changes to the approved concept beyond the mandate in force.

The goal is current, coherent, increasingly useful documentation: the reader understands what Wolf is for, the benefit of features, the design, the actions, the constraints and how to verify the result. Pages, lines and new methods are not a measure of quality; fixing outdated text, a clear diagram and a good example can beat a new section.

## Grounds and the coverage map

1. Record current and target full X.Y.Z, previous release base, the verifiable SHA/dirty-state, the set of changes, approved decisions, known constraints. Cross-check diff, code, tests, CLI help, acceptance artifacts. The CHANGELOG and the author's report are pointers, not evidence of behavior. Do not edit against an unconfirmed version; follow the project's maintainer-only versioning rules.
2. Read AGENTS.md, CONTRIBUTING.md, docs/README.md and the language/generation rules. On every release, review the key pages end-to-end even if the diff does not touch them. Check remaining pages by impact of the changes, links and accumulated gaps — do not reread the whole archive instead of useful work.
3. In an existing plan or report, build a map: feature/claim → reader → pages → source of behavior/status → example → verification → author action. Mark claims new, changed, kept or outdated. The destination path and unchanged pages need grounds, not a formal "everything checked".

| Key surface | What to check and develop |
| --- | --- |
| README.md / README.ru.md | What Wolf is, who it is for, the benefit, a working example, install/upgrade, constraints, links. Update the pair consistently |
| docs/site home page | Promises, statuses, the first command, what result to expect, version, links. Find the real home-page components; do not assume a single index.md |
| getting-started / configuration / mcp | Memory versus the full agent set, platform flags, prerequisites, the first dialog, the expected result, recovery |
| organization / memory / delivery / feedback / base-set | Roles, flows, types, face versions, skills, learning and constraints; how features connect into a whole scenario |
| CLI/API and docs/reference/cli.md | Exact commands, fields, defaults, errors; the reference is complemented by guide scenarios |
| docs/concept/{concept,maturity,evidence,coverage}.md | The canon, explanation of the principles, actual maturity, evidence strength and semantic coverage |
| artifact-pipeline / troubleshooting / upgrade | Document templates, real routes, compatibility, migrations, typical problems, safe actions |
| CHANGELOG / release notes / docs/dev | The user-facing effect, migrations, open risks, the final status. Keep the event log; the final summary reflects the facts |

Use real paths and EN/RU pairs. A service report does not replace the user guide; the README does not become a copy of the detailed reference.

## Balanced content development

4. Check Wolf's four pillars: persistent organization, continuity of state, accumulated capabilities, managed learning. Explain a new command through one or more pillars; do not develop only the CLI while managed learning, memory boundaries or the user path stay unclear.
5. Pick substantial reader gaps: user questions, repeated explanations, complaints, undocumented constraints, an interrupted scenario, contradictions between pages. Without such data, check the new-user scenario and upgrading an existing project; do not invent support statistics. Close chosen gaps in this pass; keep the rest prioritized in the existing backlog.
6. For every new or substantially changed feature, explain with sufficient depth: what problem it solves; who needs it and when; how it connects to the rest of Wolf; how to use it; what result to expect; what it does not guarantee; how to continue after an error. Spread material across pages; do not repeat the full set everywhere.
7. Add a reproducible main example and a substantial boundary/error scenario where behavior is not obvious. For a new workflow, show the whole path, not only the call to a new API. For a small local edit, updating an existing example is acceptable. Example behavior, settings and results must match the version.
8. Deepen concept explanations through connections, invariants, the reasons for choices and real cases. A wording refinement or an example that preserves the approved meaning is ordinary editing; changing goals, roles, rights, guarantees or the model is a product change: file a CR and get approval through L0. Do not rewrite the canon after every implementation detail; current maturity lives in maturity/evidence.

Before completing each release, compare reader understanding before and after: which scenario can now be completed, which term or causal link became clearer, which gap is closed. For an urgent hotfix, currency and upgrade instructions are mandatory; a large unrelated tutorial can be postponed with concrete grounds. Do not delay an incident fix for artificial documentation volume. For a release without substantial gaps, record the verification and result explicitly — no filler to meet a growth norm.

## Sample of a useful explanation

A weak version: "Added restoring the previous version of a file from a backup".

Substantial material explains: a separate versioned skill file describes the agent's behavior; the reason and boundaries of the change are visible in history; the owner has a rollback. It shows the permitted change, viewing a version, its application boundary and a recovery scenario, and clarifies that version history alone proves no behavior improvement. Take commands and fields from the current CLI; this is the structure of an explanation, not a promise of a specific version's guarantees.

Another example: if init is minimal by default, writing "--full appeared" is not enough. Show separately how memory connects and how the agent organization deploys; state the platform, first-run result and next step. Check the meaning is the same in README, home page and getting-started.

## Examples and accuracy

9. A full example has a goal, initial state, prerequisites/version/role, commands or steps, an observable result and an important constraint. Add a next step and safe cleanup when needed. Use a meaningful end-to-end task; explain placeholders like <id> and where to take values from.
10. Run suitable examples in an isolated fixture of the needed version; for a linked worktree, check the shared memory root — it does not guarantee memory isolation. Do not modify a live project, secrets, publications or external services for documentation. Describe dangerous or unavailable external actions with conditions and an explicit verification status. Mark expected illustrative output as expected, not an actual trace.
11. Do not turn a fallback into the main success scenario. Separate loading an instruction from applying it, saving from delivery/processing, a PR from merge/publication, a lock from a transaction, local tests from the model's real behavior. A normative rule in a skill does not prove enforcement in the code. "It works", "it is designed", "it is experimental" and "the effect is confirmed" have different grounds.
12. Check defaults and missing flags, memory scopes, actor/permissions, processes/sessions, repeated calls, partial failure and compatibility. A nice promise does not fix a code problem: pass the defect through wolf-debug/the working process and weaken the claim to the confirmed level. Do not extend the implementation covertly in a documentation task.

## Editing and structure

Write in the reader's language: meaning and useful action first, then design and details. Explain a term before using it further; keep exact command/field names. Apply wolf-explain principles to user-facing explanations; do not carry the internal RESULT/EVIDENCE report into the guide.

Separate getting started, task guides, the explanation of principles and the exact reference; links connect the levels. A command example does not replace an explanation of the reasons; an abstract concept does not replace instructions. For interacting parts, use a compact diagram when more precise than prose; it reflects the implemented or explicitly marked design model.

Remove duplicates, outdated instructions, service jargon; keep the useful explanations and the reasons behind the constraints. Do not cut a long example just for brevity. A new section serves a real reader task, not every new file. Tables of contents and navigation must help find the next answer; check links between pages.

## Generation and language alignment

13. Do not hand-edit the generated reference and the CHANGELOG mirrors. scripts/generate-cli-reference.mjs builds the CLI reference from the assembled registry; scripts/sync-changelog.mjs updates the history pages; npm run docs:build invokes them and VitePress. First make sure dist corresponds to the code being verified: an old dist is not enough. Check current scripts and marker rules if changed.
14. Align the EN/RU READMEs and the meaningful pairs of site pages: commands, defaults, statuses and constraints must match; keep product-facing documents and localized pages consistent in language. Do not require a literally identical translation volume, but leave no reader without the new substantial instructions. The generator may deliberately keep the English CHANGELOG on the Russian site — do not create a diverging manual translation without a decision.

## Verification and independent review

15. Run the relevant project-profile verifications: formatting, links/navigation, examples, generated consistency, the documentation build and the provided release checks. The site build confirms the build, not the meaning. Producing HTML is not a deploy; the published site is checked after a separately authorized deploy.
16. Hand the independent reviewer the documents, diff, version, grounds for the claims, the coverage map and raw example results. Assign two mandates: factual correspondence to the product and usefulness to the reader. For a small task, one independent reviewer can explicitly do both; a separate agent per page is not needed. Without an independent channel, state the constraint; do not imitate a second voice.
17. The reviewer reads through the eyes of a new user and an upgrading owner: can they start without guessing, understand the benefit, complete the scenario, recognize the result and recover; also verify that the concept explanation did not change the approved meaning. Handle findings through receiving-code-review; after fixes, re-check the affected example/page pairs. The verdict is bound to the version.

## Documentation readiness gate

Documentation must not be declared ready for publication while substantial contradictions in init, defaults, guarantees, statuses and examples remain unaddressed. Fix a blocking finding or take an explicitly bounded outcome to the owner; do not hide it in a general APPROVED. Non-blocking debt has a source and a priority.

Prepare in the existing release report:

- full number and SHA/dirty-state; surfaces and changes reviewed;
- map of features/claims to documentation paths, with grounds;
- useful development: closed reader gaps, examples, clarifications — not line counts;
- verification results and unverified-example status;
- EN/RU alignment, generated pages, navigation and version;
- independent mandates/verdicts, found constraints, debt and the owner's decisions;
- source/build readiness separately from published-site readiness.

For final approval, apply verification-before-completion. Hand the package to the lead; carry out only already authorized follow-ups. This skill does not start publication. When verification is impossible, state the exact constraint instead of "everything is current".

## Do not substitute for documentation development

| Thought | Action |
| --- | --- |
| "Listing the new API in the CHANGELOG is enough" | Explain the task, the benefit, the place in the system and a working scenario |
| "The README did not change in the diff" | Check its promises and the new-user path |
| "The site built, so the documentation is correct" | Check the behavior of the examples and the meaning of the claims |
| "More text means better" | Close a specific gap; remove duplicates and filler |
| "The concept can be extended with any new promise" | Distinguish explaining the canon from changing the product model |
| "Translation and examples will be done after the release" | Substantial user paths are part of release readiness |
| "The old output looks like the new one" | Compare the version, the conditions and the current results |
| "A patch needs no documentation" | Check the affected instructions and constraints; choose a proportionate volume |
| "I will write what was fixed while the code is unconfirmed" | Return the defect to the executor and state the actual state |
