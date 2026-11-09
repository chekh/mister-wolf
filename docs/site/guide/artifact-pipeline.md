# Artifact Pipeline

Every feature in a Wolf-driven project lives as documents, not as tribal knowledge. The artifact pipeline is the document conveyor a feature passes through: `pre-requirements.md` → `requirements.md` → `change-request.md` → `design.md` → `test-plan.md` → `plan.md`, kept together in a dated folder `docs/dev/<YYYY-MM-DD>-<slug>/`. Two more locations complete the picture: a wave file collects what a release wave ships, and the roadmap folder `docs/dev/roadmap/` holds the long-horizon entries.

Nothing in the pipeline is "done" because an agent wrote it — it is done when it passed the gates.

## What it is

The pipeline is a set of feature documents moving through statuses under owner and lens gates. A feature folder starts with a scaffold command and grows through review; `wolf sync` keeps the indexes current (a deprecated alias since 2.19.0 — the alias remains the index regenerator); `wolf doctor` lints the result. The conveyor covers:

- the feature folder `docs/dev/<YYYY-MM-DD>-<slug>/` with the six package files;
- the wave file of the current release wave;
- the roadmap folder `docs/dev/roadmap/`.

## Commands

Four commands run the conveyor — and since 2.17.1 the writing session holds a single-writer claim first:

```bash
wolf claim acquire dev:<date>-<slug>  # own the artifact — scaffold refuses without it
wolf scaffold artifact <slug>         # create docs/dev/<YYYY-MM-DD>-<slug>/ with the full 6-file package
wolf scaffold artifact <slug> --fix   # fix profile: requirements.md + plan.md only
wolf sync                             # regenerate indexes — idempotent
wolf doctor                           # lint the documents
```

The full profile writes the package in the declared order — `pre-requirements.md`, `requirements.md`, `change-request.md`, `design.md`, `test-plan.md`, `plan.md`. `pre-requirements.md` records the intent and framing agreed before formal requirements (it does not approve them); `change-request.md` is an append-only list of change requests for the package. If the folder already exists (for example a brainstorm wrote `pre-requirements.md` the same day), the command tops it up: it adds only the missing documents and never overwrites an existing one. The folder is derived from the current date and the slug, so a package started on an earlier day is not topped up — continue it by hand or start the new date's package deliberately. When every file is already present the command reports that there is nothing to add.

The claim is the conveyor's write lock: two agents editing the same feature folder would silently overwrite each other, so `wolf scaffold artifact` refuses with `No claim held` until your session owns the claim for the artifact id — the refusal names the exact `claim acquire` command. When the writing session is done, release the claim (`wolf claim release dev:<date>-<slug>`) or hand it over (`--transfer-to <actor>`); `wolf claim list` shows who holds what. A claim expires after 24h, so a crashed session does not lock the folder forever.

`wolf sync` generates `docs/dev/INDEX.md` — a table of features plus a "Waves" section — and `_index.md` files inside the design and plan subfolders. Running it again changes nothing. (Deprecated as a base-set command in 2.19.0 → `wolf upgrade --here`; index regeneration is why the alias still exists.)

`wolf doctor` reports document findings in its `## Artifacts (docs/dev)` section (see [Platform & Maintenance](/guide/cli/platform)). The finding classes:

- duplicate REQ/NFR ids;
- broken references to REQ ids;
- a REQ without acceptance criteria or without a Source;
- a `[НЕОПРЕДЕЛЕНО]` ("undefined") marker inside an approved document;
- a CR entry without downstream artifacts, a CR number that is not `CR-<YYYY-MM-DD>-NN`, or a CR without an approver;
- downstream statuses reset after an upstream edit;
- duplicate requirements;
- duplicate roadmap entries;
- folder readiness — missing files of the set;
- ghost skills — listed in the set but absent from memory.

## Artifact statuses

Each artifact moves through exactly three statuses: `draft → review → approved`. That is the whole board — there is no kanban, no columns, no wip limits. The status answers one question: has this document passed its gates yet?

## Gates

Gates decide every transition. The owner approves `requirements.md`; ADR cards inside `design.md` get a separate owner sign-off; the next stage opens only after the previous stage is approved. Lenses review file pairs:

| Lens         | Reviews                  | Pair            |
| ------------ | ------------------------ | --------------- |
| Completeness | requirements             | requirements.md |
| Consistency  | design                   | design.md       |
| Conformance  | plan ↔ design            | plan.md         |
| AC coverage  | test-plan ↔ requirements | test-plan.md    |

Security is a strictly optional lens — it is not in the default set. Add it deliberately when the feature warrants it.

## Evolution

Approved does not mean frozen — it means changes now have a price. A change enters through `change-request.md` as a numbered entry `CR-<YYYY-MM-DD>-NN`. The scaffold writes each entry in a readable block form: an ID heading `### CR-<YYYY-MM-DD>-NN — <title>`, a what-and-why paragraph, and the fields on separate lines — `- затронуто:` (the affected REQ/NFR), `- утвердил:` (the approver) and `- downstream:` (the artifacts to regenerate). The request then updates `pre-requirements.md`/`requirements.md`, and the downstream statuses reset to `draft` so they earn their approval again. The flow is: remark → change request → pre-requirements/requirements → design → test-plan → plan.

`change-request.md` is a separate document and not the same thing as the "Change log (CR)" section inside `requirements.md`: that section records changes to the requirements themselves, while `change-request.md` records requests that may touch any document of the package. The `wolf doctor` lint enforces the mechanics on both and accepts both entry shapes: the scaffold's block form and the legacy one-liner (`- CR-<YYYY-MM-DD>-NN: …`), so older documents stay lint-clean. A CR without its downstream list, stale downstream statuses, a malformed CR number or a CR referencing a REQ that does not exist all surface as findings. New scaffold packages come out in the block form; existing documents are never rewritten by force.

## Language discipline

`requirements.md` is written in the owner's language, without jargon — it must survive being read by a non-programmer. The technical artifacts (`design.md`, `plan.md`, `test-plan.md`) are written in technical language, with a glossary where terms need it. The translation happens at the design stage, once, not in every conversation.

## Skill axes and the default set

Two axes grow the skill set around the pipeline:

- **Artifact axis** — a new artifact type gets its own skill that teaches agents how to produce it.
- **Disciplinary axis** — a repeatedly breached discipline gets an enforcement skill; the detector is the complaint loop ([Learning Loop](/guide/feedback)).

The default set ships 35 skills (verified against `templates/base/skills` in the package; the set itself is described in [Base Set](/guide/base-set)):

| Skill                            | Axis         | Purpose                                                                                        |
| -------------------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `wolf-brainstorm`                | artifact     | structured dialogue before creative work → requirements.md                                     |
| `wolf-design`                    | artifact     | design phase with ADR cards → design.md                                                        |
| `wolf-plan`                      | artifact     | zero-context plans where every task is a worker brief → plan.md                                |
| `wolf-testplan`                  | artifact     | test plan derived from requirements AC → test-plan.md                                          |
| `receiving-code-review`          | disciplinary | apply review feedback with technical rigor, not blind compliance                               |
| `writing-skills`                 | disciplinary | create, edit and verify skills before deployment                                               |
| `test-driven-development`        | disciplinary | red-green-refactor before implementation code                                                  |
| `verification-before-completion` | disciplinary | run the checks before any "done" claim                                                         |
| `using-git-worktrees`            | disciplinary | isolated worktrees for feature work                                                            |
| `finishing-a-development-branch` | disciplinary | choose the integration: merge, PR or cleanup                                                   |
| `using-skills`                   | workflow     | load the process skill before responding or acting                                             |
| `wolf-work-strategy`             | workflow     | choose the route, an early question, and sufficient depth                                      |
| `wolf-git`                       | workflow     | Git task stages and the shipped collaboration policy                                           |
| `requesting-code-review`         | workflow     | verify work against requirements before merging                                                |
| `wolf-debug`                     | workflow     | root-cause before fixes                                                                        |
| `wolf-execute`                   | workflow     | flat linear execution fallback                                                                 |
| `wolf-explain`                   | disciplinary | clear explanations of results and limitations to the user                                      |
| `wolf-user-report`               | artifact     | human reports: content, HTML/CSS and reusable project templates                                |
| `wolf-document-readability`      | workflow     | readability editing of a finished document before content review                               |
| `wolf-handoff`                   | workflow     | continue in a fresh session without losing progress                                            |
| `wolf-review`                    | workflow     | multi-lens document review                                                                     |
| `wolf-sdd`                       | workflow     | subagent-driven development                                                                    |
| `wolf-release-docs`              | workflow     | release documentation pass: coverage map, EN/RU, generated pages                               |
| `wolf-skill-intake`              | workflow     | connect external skills through the intake loop with the owner gate                            |
| `wolf-software-design`           | workflow     | engineering method inside wolf-design: boundaries, contracts, dependencies and state ownership |
| `wolf-code-craft`                | disciplinary | full implementation of the assigned behavior with readable means and no unnecessary complexity |
| `wolf-code-simplify`             | disciplinary | targeted simplification of a named complexity with the contract preserved, assigned separately |
| `wolf-feedback`                  | workflow     | role-scoped question, friction, complaint and bounded session diagnosis                        |
| `wolf-visual-dialogue`           | workflow     | visual discussion, feedback and an agreed standalone document                                  |

The engineering route rides the existing conveyor: `wolf-software-design` appears inside the design stage, `wolf-code-craft` at the implementer's task, and `wolf-code-simplify` only as a separately assigned simplification. None of them adds an artifact to the pipeline or a stage to the conveyor, and simplification is not an automatic extra round after every edit — the implementer removes the surplus complexity inside the current mandate. Documents and operations without a software implementation get no engineering set.

Two things are deliberately not in the default set. Security is an optional lens, switched on per feature. Capability skills from the outside world — external knowledge and tools — arrive through [Skill Intake](/guide/skill-intake), never pre-installed.
