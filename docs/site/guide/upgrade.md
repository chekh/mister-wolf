# Upgrading a Project and a Park

Wolf manages files in your projects: agents, skills, commands, plugins, the `AGENTS.md` onboarding block. A new release brings new versions of those files, and you eventually edit some of them for your own reasons. This page is about the seam between the two: how an update shows you what it wants to change, how you say "take it" or "this one is mine", and how a silent run stays reversible.

The mental model is three layers, from least to most permanent:

| Layer               | You express it by                                          | What the update does                                     | Lifetime                          |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------------- | --------------------------------- |
| Decision, one time  | `--review`, `--resolve 3=take\|keep\|protect\|pin`         | applies your verb to that file                           | until the file drifts again       |
| Intent, in the file | `protect: true` / `protect: X.Y.Z` in the YAML frontmatter | never touches the file again (no overwrite, no deletion) | forever, until you remove the key |
| Silence, machine    | `--yes` + `--json`                                         | applies the plan, backs up what it overwrites            | one run                           |

Nothing here changes what the update pass does to **memory** (`.wolf/`): faces are memory, the pass never rewrites them (see [Memory Model](/guide/memory)).

## Reading the plan before anything is written

`wolf upgrade --check` is read-only — park-wide, and with `--here` for one project. It exits `0` always: it is a report, not a gate.

```bash
wolf upgrade --check          # the whole registry
wolf upgrade --here --check   # only the current directory
```

Actual output (2.20.0, a park of two projects, one protected file each):

```text
wolf upgrade — check
- cli: installed 2.20.0 · available 2.19.0
ok: proj · /Users/…/proj — current
- stamps 2.20.0 · map 2.20.0
- 1 protected (intentional)
warn: proj2 · /Users/…/proj2 — needs decision
- stamps 2.20.0 · map 2.20.0
- mutated: .opencode/skills/wolf-review/SKILL.md · 1 protected (intentional)
Protections
- proj · .opencode/command/complain.md · protect: 2.20.0 · behind (base 2.20.0)
- proj2 · .opencode/skills/wolf-explain/SKILL.md · protect: 2.19.0 · behind (base 2.20.0)
- 2 protected files · release: wolf upgrade --resolve <file>=take
ok: Done (read-only)
```

Each project gets one class:

- `current` — nothing to do. Files identical to the base, protected files held, accepted-local (`kept`) files held.
- `behind` — stamped files differ from the update map of the available release; the pass will simply update them.
- `needs decision` — a stamped file was edited locally (`mutated`), or an unstamped file occupies a wolf target (`conflict`). The pass will not resolve these by itself.
- `unknown` — the project is not covered by the update map of that release (`foreign` files, unreadable projects, broken onboarding markers). Out of coverage does **not** mean up to date.

Every entry names its files: `mutated:`, `differ:` (all paths, not a counter), `foreign:`; `missing` is a counter — its paths are in `--json` (`missing[]`). The `Protections` section is always printed — `Protections: none` when there is nothing to hold — and it is the audit view of the second layer in the table above.

A stamped file that differs from the base **only** by its `wolf:rendered …` line needs no decision: the pass re-renders it silently and refreshes the stamp. In `--check` it shows as `current` — `identical` here means "nothing to decide", not "byte-identical".

The map number (`map 2.20.0`) is the release whose update map is used. It is generated from the actual template diff of that release, so `map: 0 new · 0 changed …` for a release that only touched the `AGENTS.md` block is honest, not a bug.

## Reviewing decisions one by one

```bash
wolf upgrade --review            # park, interactive
wolf upgrade --here --review     # single project
```

In a TTY it walks the decisions in order, showing for each one the `local → base` diff and a choice:

```text
[3/7] .opencode/agents/foo.md — mutated · base 2.20.0
  local: 42 lines · base: 38 lines · −12 +8
  --- a/base 2.20.0
  +++ b/local
  @@ …  (at most 40 diff lines; "… N more lines")
  choice: [t]ake [k]eep [p]rotect [v]pin [s]kip  (a — apply to all similar, q — quit)
```

- `t` **take** — the file becomes the base; your local content goes to a backup first.
- `k` **keep** — your local content is accepted as the current state: the witness records it with `origin: keep` and the next pass will not revert it.
- `p` **protect** — `keep` plus `protect: true` in the frontmatter: the file is held forever.
- `v` **pin** — `keep` plus `protect: <base>`: held, with the base version it was pinned at recorded in the file.
- `s` **skip** — leave the decision for later.
- `a` — apply the chosen verb to all remaining targets of the same kind and code (for example every `agent`/`mutated`); the list of affected files is printed before applying. `q` ends the loop; decisions already accepted stay applied (each is atomic).

Without a TTY the command never writes. It prints the numbered list and the exact commands:

```text
wolf upgrade — review
warn: review (non-interactive): 1 file needs a decision
-   1  proj2  .opencode/skills/wolf-review/SKILL.md  mutated  base 2.20.0
- review interactively: wolf upgrade --review  (in a TTY)
- apply a decision:    wolf upgrade --resolve 1=take  (or keep|protect|pin)
- inspect a file:      wolf upgrade --show 1
```

Exit codes: `0` nothing left to decide, `2` decisions (or `diverged` faces) remain, `1` a write failed.

## Looking at one file: `--show`

```bash
wolf upgrade --here --show 1
wolf upgrade --show .opencode/agents/foo.md
```

Read-only. Prints the target's state and the diff that `take` would apply:

```text
wolf upgrade — show
- file:      .opencode/agents/worker-reviewer.md   (project: proj /Users/…/proj)
- protect:   none
- base:      2.20.0   file stamp: 2.20.0   witness: render @ 2.20.0 (75516f576854…)   drift: local ≠ base
- --- a/local (as is)   +++ b/base 2.20.0   (what --resolve …=take gives you)
-   @@ -63,6 +63,2 @@
-    - Никогда: `rm -rf` вне системного tmp, `sudo`, …
warn:   -## Local addition
warn:   -
warn:   -Keep the review verdict in one line.
- release:   wolf upgrade --resolve .opencode/agents/worker-reviewer.md=take
```

For a protected file `protect:` shows the value (`2.19.0 (pinned; recognized)`), for a file outside the update map it shows `base: n/a (file outside the update map)` with an explanation and no `take` hint — there is no base to take. `--show` also accepts a target that is currently not a decision (a protected file, an orphan): such a target has no decision number, so address it by path. Exit `1` only for an unknown target.

## Applying a decision: `--resolve`

```bash
wolf upgrade --here --resolve 1=take
wolf upgrade --resolve .opencode/agents/foo.md=keep --resolve 2=protect
wolf upgrade --resolve my-proj/.opencode/agents/foo.md=pin,.opencode/command/baz.md=take
```

- Targets: the decision number `N`, a relative path (in `--here` from cwd, in the park `<project>/<rel-path>` or a `<rel-path>` that is unique in the park), or a combination. A path that starts with a digit is written as `./3=…`.
- Verbs: `take`, `keep`, `protect`, `pin`.
- All parse and scope errors are collected and printed **before** any write; on error nothing is applied. Applying twice the same target in one command is refused (`target listed twice`).
- Order of application is registry order, not the order you typed. Each decision is an atomic `backup → file → witness`, so a failure at step _k_ leaves steps 1…_k−1_ applied and repeatable, prints `error: <file> — <reason>` and exits `1`.
- `--resolve` never runs the npm phase and never runs a project pass; the remaining categories (`new`/`changed`/`removed`) belong to the next normal `wolf upgrade`. Combining `--resolve` with `--yes` is an argument error, because `--yes` describes a pass, not a decision.

What each verb does to the file and to the witness:

| Verb      | File                                             | `protect` | Backup                                          |
| --------- | ------------------------------------------------ | --------- | ----------------------------------------------- |
| `take`    | base, atomically; the key is dropped             | removed   | yes, if the local content differs from the base |
| `keep`    | unchanged (only the key line is dropped, if any) | removed   | no — nothing is lost                            |
| `protect` | `protect: true` inserted into the frontmatter    | `true`    | no                                              |
| `pin`     | `protect: <base>` inserted into the frontmatter  | `X.Y.Z`   | no                                              |

Which verbs make sense depends on what the target is:

| Target                                      | `take`                                               | `keep`                                                         | `protect` / `pin`                                    |
| ------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `mutated` stamped file                      | base + backup                                        | accept local                                                   | accept + hold                                        |
| `conflict` (unstamped file in wolf's place) | base + backup (file becomes stamped)                 | refused: `use protect (hold) or take (base)`                   | hold as a sanctioned variation (the right answer)    |
| protected file                              | drop the key, take the base, local → backup          | drop the key, accept local                                     | idempotent / update the pinned version               |
| orphan (stamped, no base in the map)        | refused: `no base for a file outside the update map` | refused                                                        | hold                                                 |
| `AGENTS.md` (stamped, whole-file)           | base + backup                                        | accept local                                                   | refused: no YAML frontmatter                         |
| `AGENTS.md` (block mode, unstamped)         | fresh file in whole (block ownership ends)           | no-op — it is already outside the sync                         | refused: no frontmatter                              |
| `kept` (accepted local content)             | base + backup                                        | idempotent                                                     | accept + hold                                        |
| `missing` (stamped file deleted by hand)    | base is written again                                | refused: `nothing to keep: the file does not exist — use take` | refused: `no YAML frontmatter — add one or use keep` |

Actual output of a resolution:

```text
wolf upgrade — resolve
ok: resolved: 1 (take: 1)
- take proj/.opencode/agents/worker-reviewer.md (local saved: .wolf/backup/upgrade/2026-10-25/.opencode/agents/worker-reviewer.md)
- no decisions — nothing needs a decision
ok: Done
```

And the refusal that keeps a conflict honest:

```text
wolf upgrade — resolve
error: cannot keep .opencode/command/complain.md: conflict stays: use protect (hold) or take (base)
warn: 1 file needs a decision
-   1  proj  .opencode/command/complain.md  conflict
error: Failed
```

## Holding a file forever: `protect`

`protect` lives in the YAML frontmatter of a wolf-managed agent, skill or command — in the file itself, not in a central list (the owner's decision: intentions live in the files they are about).

```markdown
---
description: 'Worker-reviewer (L2): …'
mode: all
protect: true
---
```

| Value                  | Meaning                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `true`                 | hold the local content forever                                                    |
| `X.Y.Z` (full version) | hold and pin the base version                                                     |
| `false`                | not protected (same as no key)                                                    |
| empty, `~`, `null`     | **held + warning** (an unfinished key is fail-safe, never "silently unprotected") |
| anything else          | **held + warning**                                                                |

Only the frontmatter counts — a `protect:` line in the body of the file is not a protection. Quoted (`"protect":`), indented or tab-separated keys are outside the grammar: they do not protect and are not normalized. When the key is declared twice, the first one wins and the rest are ignored — no warning is printed.

Writing the key (`protect`, `pin`, or by hand) is a line-wise edit: the line is inserted as the last line of the frontmatter block, existing `protect:` lines are replaced, and the rest of the file — key order, comments, spacing, line endings — stays byte-for-byte. Wolf refuses to protect a file without frontmatter:

```text
cannot protect <path>: no YAML frontmatter — add one or use keep
```

That refusal is deliberate: silently inventing a frontmatter block would change the shape of a file wolf did not create.

Comparison is normalization-based, and normalization is what makes the key cheap: the content is compared **with every `protect:` line removed**, both against the base and against the witness. Adding, changing value or removing the key therefore never produces a false `mutated`, and a held file keeps working after a release that changed the base — it just reports as `behind` until you take it or re-pin.

A protected file is never overwritten by anything: not by the pass, not by `--yes`, not by stamp healing. It is also never deleted: a target the release wants to remove stays on disk with the code `protected` and the hint `wolf upgrade --resolve <path>=keep` (which drops the key, after which the next pass sees the removal again). `take` is the single verb stronger than `protect`, and it backs the local content up first.

Auditing a whole machine is a grep, because the marker is in the files:

```bash
grep -rn --include='*.md' '^protect:' ~/dev/*/.opencode/agents ~/dev/*/.opencode/skills ~/dev/*/.opencode/command
```

Or read the same thing structured: `wolf upgrade --check` (the `Protections` section) or `wolf upgrade --check --json` (`protections[]`).

`AGENTS.md` cannot be protected: the shipped template has no frontmatter, and adding one by hand does not make the file protected. Use its two ownership modes instead — the block mode keeps your text outside the markers, the stamped whole-file mode means wolf owns the file.

## Silent runs: `--yes` and backups

`--yes` is for scripts, CI and long parks. It still prints the plan, then applies it without asking.

```bash
wolf upgrade --yes                    # park, no questions
wolf upgrade --here --yes             # one project
wolf upgrade --yes --json > run.json  # machine channel
```

What `--yes` resolves: `mutated` files — backup first, then base, then witness. What it does not: a `conflict` (an unstamped file in wolf's place is your decision — the `wx` policy is stronger than `--yes`), and a `diverged` face (memory, Steward zone). Those keep exit `2`.

```text
wolf upgrade — here
Plan
- plan: proj · /Users/…/proj
- composition 2.20.0 → 2.20.0
- map: 0 new · 0 changed · 0 deprecated · 0 removed · seed×6
- outside the registry — manual mode
ok: proj — updated
- base-set: 1 updated, 30 identical
- faces: … skipped-live …
- verify: 37/37 ok
- 1 protected (intentional)
- took base for .opencode/skills/wolf-review/SKILL.md (local saved: .wolf/backup/upgrade/2026-10-25/.opencode/skills/wolf-review/SKILL.md)
updated 1 · new 0 · changed 0 · deprecated 0 · removed 0 · faces seeded 0
ok: Done
```

Every overwrite is preceded by a copy at `.wolf/backup/upgrade/<YYYY-MM-DD>/<rel-path>` (one directory per run date). A second overwrite of the same file on the same day becomes `<name>-2.<ext>` (then `-3`, …; the extension is kept), so `.opencode/skills/wolf-debug/SKILL.md` gets `.opencode/skills/wolf-debug/SKILL-2.md` — an existing backup is never overwritten. A `removed` target is copied there too before it is deleted.

Restoring is a copy back:

```bash
cp .wolf/backup/upgrade/2026-10-25/.opencode/skills/wolf-review/SKILL.md \
   .opencode/skills/wolf-review/SKILL.md
wolf upgrade --here --resolve .opencode/skills/wolf-review/SKILL.md=protect
```

After the copy the file is a normal `mutated` (its content matches neither the witness nor the base) — frozen with `protect` it stops being a decision. **There is no garbage collector**: backups stay until you delete them, permissions and timestamps are not preserved (a copy of the content, not an FS artifact).

## Machine channel: `--json`

`--json` prints exactly one document on stdout — no banner, no human lines — and is compatible with every mode except `--review`.

```bash
wolf upgrade --check --json | jq '.projects[] | {name, class, mutated}'
wolf upgrade --yes --json | jq -e '.exit == 0' > /dev/null
```

Two schemas:

- `wolf.upgrade/1` — modes `pass`, `here`, `resolve`, `show`. Top level: `schema`, `exit` (mirrors the process exit code), `mode`, `cli{installed,available}`, optional `error`, `plan`, `projects[]`, `decisions[]`, `diverged[]`, `protections[]`. Each project has `status` (`updated` / `up-to-date` / `needs-decision` / `error` / `skipped` with `skipReason`), `files[]{path,code,inMap}`, `protected[]{path,value,behind}`, `backups[]{file,backup}`.
- `wolf.upgrade.check/1` — `--check`. `cli`, `projects[]{name,path,class,differ[],missing[],mutated[],foreign[],details[],protected[]}`, `diverged[]`, `protections[]`. `exit` is always `0`; `class` is `current` / `behind` / `needs-decision` / `unknown`.

`decisions[].n` is the same numbering as the text renderer, so `--json` consumers and the human recipe agree. Stability contract: additive fields are allowed in minor releases, a rename or a removal needs a new major (`/2`).

## `AGENTS.md` and the onboarding block

The pass and `init` manage `AGENTS.md` in two modes:

- **Stamped whole-file mode — what a fresh `wolf init` writes.** `AGENTS.md` carries a `wolf:rendered …` stamp: it belongs to wolf entirely, local edits make it `mutated`, and `take`/`keep` decide its fate. `protect` is not available here (no frontmatter).
- **Block mode — when `AGENTS.md` already existed.** `init` appends `<!-- wolf:onboarding v3 -->` … `<!-- /wolf:onboarding -->` to your file and touches nothing else. Wolf owns only the lines between the markers; everything above and below is byte-for-byte yours (a CRLF file keeps its CRLF). User text _inside_ the block is not preserved — the block is wolf's zone.

Block detection is version-agnostic: an existing `v2` block on a 2.19.0 project is recognized and updated in place to `v3` (the block gained the owner-intention line), instead of appending a second block. `init` additionally aligns the stamp of a stamped file in place; `upgrade` does not append a block to an unstamped `AGENTS.md` without markers — for the pass, a file wolf did not create stays foreign (`wx` policy).

Broken markers (an opening marker without a closing one) make the file foreign: it is skipped, reported as `onboarding markers broken` in the pass details and in `--check`, and it never becomes a decision. Fix the markers by hand (add the closing line) and the next run manages it again.

## `init` and a missing `mcp.wolf`

`wolf doctor` used to advise `wolf init` when the `mcp.wolf` entry was missing, while a minimal `init` wrote no platform configs. Now a minimal `init` on a project whose platform config already exists repairs the entry (and `default_agent` / `subagent_depth`), keeping the rest of the JSON untouched. It still does not **create** a config file that was absent — minimal init stays minimal, and `--platform opencode` remains the explicit way to write a platform config. A broken JSONC config is not touched: `init` reports `skipped` with the reason and exits `0`. A second `init` reports `unchanged`.

## Limitations, stated plainly

- **No auto-merge of content.** Only whole-file `take`/`keep`. If you need a merged file, take the base and re-apply your edit, or protect the file and keep maintaining it.
- **`diverged` faces are not addressable.** `--review` and `--resolve` print them in their own section — `steward zone (not addressable by --resolve): <N>`, then one `<project> <file> diverged v<version>` line each — and the pass names them in its `faces:` line; they keep exit `2`, but there is no `--resolve` verb for them: a face is memory, and memory is mutated through the complaint loop and the Steward. Read-only `--check` always exits `0` and prints no faces section (the park `--json` carries `diverged[]`).
- **`orphan` files have no base.** A stamped file whose target disappeared from the package can only be held (`=protect`) or deleted by hand; `take` is refused.
- **Backups are not garbage-collected** (above), and they do not preserve file metadata.
- **Exit model is unchanged** from 2.19.0: `0` done, `1` failed, `2` done with attention (`diverged` included).
- **Older wolf versions know nothing about `protect`**: they treat the key as a local edit — `mutated`, never overwritten — and they read the new witness records as `mutated` for every witness file. No content is lost; the cure is to upgrade the park, not to fight it, and a rollback to 2.19.0 is repaired by a re-upgrade or by restoring `.opencode/wolf-sync-state.json`.
- **The map covers only the files listed for a release.** Files outside it are not verified; `unknown` projects get no claims; unregistered projects are only hinted at, never written.
- **The regression guard is a live run, not a guarantee.** The `protect` key is proven not to reach the model on opencode v2.1.4; a future opencode that starts forwarding unknown agent keys is caught by that guard, and the remedy is `--resolve <file>=keep`.

## A full round, start to finish

```bash
npm i -g mister-wolf@2.20.0
wolf upgrade --check                       # read-only: what changed, per project, per file
wolf upgrade --review                      # walk the decisions with a diff
wolf upgrade --resolve .opencode/agents/foo.md=protect   # this one is mine, forever
wolf upgrade --resolve 2=take --resolve 3=keep           # these two: base / local
wolf upgrade --here --check                # confirm: current, no decisions
```

If you script it:

```bash
wolf upgrade --check --json | jq -r '.projects[] | select(.class=="needs-decision") | .path'
wolf upgrade --yes --json > upgrade-run.json || echo "attention: exit $?"
grep -c 'local saved:' upgrade-run.json   # every overwrite is reversible
```
