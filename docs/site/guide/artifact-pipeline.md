# Artifact Pipeline

Every feature in a Wolf-driven project lives as documents, not as tribal knowledge. The artifact pipeline is the document conveyor a feature passes through: `requirements.md` → `design.md` → `plan.md` → `test-plan.md`, kept together in a dated folder `docs/dev/<YYYY-MM-DD>-<slug>/`. Two more locations complete the picture: a wave file collects what a release wave ships, and the roadmap folder `docs/dev/roadmap/` holds the long-horizon entries.

Nothing in the pipeline is "done" because an agent wrote it — it is done when it passed the gates.

## What it is

The pipeline is a set of feature documents moving through statuses under owner and lens gates. A feature folder starts with a scaffold command and grows through review; `wolf sync` keeps the indexes current; `wolf doctor` lints the result. The conveyor covers:

- the feature folder `docs/dev/<YYYY-MM-DD>-<slug>/` with the four artifact files;
- the wave file of the current release wave;
- the roadmap folder `docs/dev/roadmap/`.

## Commands

Three commands run the conveyor:

```bash
wolf scaffold artifact <slug>        # create docs/dev/<YYYY-MM-DD>-<slug>/ with the full 4-file set
wolf scaffold artifact <slug> --fix  # reduced 2-file set for fix-type work
wolf sync                            # regenerate indexes — idempotent
wolf doctor                          # lint the documents
```

`wolf sync` generates `docs/dev/INDEX.md` — a table of features plus a "Waves" section — and `_index.md` files inside the design and plan subfolders. Running it again changes nothing.

`wolf doctor` reports document findings in its `## Artifacts (docs/dev)` section (see [Platform & Maintenance](/guide/cli/platform)). The finding classes:

- duplicate REQ/NFR ids;
- broken references to REQ ids;
- a REQ without acceptance criteria or without a Source;
- a `[НЕОПРЕДЕЛЕНО]` ("undefined") marker inside an approved document;
- a CR entry without downstream artifacts;
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

Approved does not mean frozen — it means changes now have a price. Editing an approved artifact goes only through a CR entry in `requirements.md`; the downstream artifact statuses reset to `draft` and have to earn their approval again. The `wolf doctor` lint enforces the mechanics: a CR without its downstream list and stale downstream statuses both surface as findings.

## Language discipline

`requirements.md` is written in the owner's language, without jargon — it must survive being read by a non-programmer. The technical artifacts (`design.md`, `plan.md`, `test-plan.md`) are written in technical language, with a glossary where terms need it. The translation happens at the design stage, once, not in every conversation.

## Skill axes and the default set

Two axes grow the skill set around the pipeline:

- **Artifact axis** — a new artifact type gets its own skill that teaches agents how to produce it.
- **Disciplinary axis** — a repeatedly breached discipline gets an enforcement skill; the detector is the complaint loop ([Feedback](/guide/feedback)).

The default set ships 18 skills (verified against `templates/base/skills` in the package; the set itself is described in [Base Set](/guide/base-set)):

| Skill                            | Axis         | Purpose                                                             |
| -------------------------------- | ------------ | ------------------------------------------------------------------- |
| `wolf-brainstorm`                | artifact     | structured dialogue before creative work → requirements.md          |
| `wolf-design`                    | artifact     | design phase with ADR cards → design.md                             |
| `wolf-plan`                      | artifact     | zero-context plans where every task is a worker brief → plan.md     |
| `wolf-testplan`                  | artifact     | test plan derived from requirements AC → test-plan.md               |
| `receiving-code-review`          | disciplinary | apply review feedback with technical rigor, not blind compliance    |
| `writing-skills`                 | disciplinary | create, edit and verify skills before deployment                    |
| `test-driven-development`        | disciplinary | red-green-refactor before implementation code                       |
| `verification-before-completion` | disciplinary | run the checks before any "done" claim                              |
| `using-git-worktrees`            | disciplinary | isolated worktrees for feature work                                 |
| `finishing-a-development-branch` | disciplinary | choose the integration: merge, PR or cleanup                        |
| `using-skills`                   | workflow     | meta-skill: the 1% rule for finding and applying skills             |
| `requesting-code-review`         | workflow     | verify work against requirements before merging                     |
| `wolf-debug`                     | workflow     | root-cause before fixes                                             |
| `wolf-execute`                   | workflow     | flat linear execution fallback                                      |
| `wolf-handoff`                   | workflow     | continue in a fresh session without losing progress                 |
| `wolf-review`                    | workflow     | multi-lens document review                                          |
| `wolf-sdd`                       | workflow     | subagent-driven development                                         |
| `wolf-skill-intake`              | workflow     | connect external skills through the intake loop with the owner gate |

Two things are deliberately not in the default set. Security is an optional lens, switched on per feature. Capability skills from the outside world — external knowledge and tools — arrive through [Skill Intake](/guide/skill-intake), never pre-installed.
