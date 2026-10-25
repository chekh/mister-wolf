# Platform & Maintenance

## wolf init

Initialize Mr. Wolf memory for this project (interactive in TTY; non-interactive works without flags). Since 2.16 the default is the minimal file set, no model pinning.

```text
Usage: wolf init [options]
```

Options:

- `--platform <ids>` — explicit platform list (comma-separated: `opencode,claude`); replaces the current set
- `--model <id>` — model for Mr. Wolf and its agents (`<providerID>/<modelID>`); opt-in — by default model lines are omitted and the platform default applies
- `--full` — render the full base set (agents/skills/commands/plugins) instead of the minimal set (default: false)
- `--yes` — re-init: apply the plan without interactive confirmation (default: false)
- `--recreate` — backup a corrupted `.wolf/config.yaml` and re-create it from defaults (default: false)

In a TTY `wolf init` asks one interview question (project purpose, stack, conventions — Enter to skip; the answer seeds starting memory). Non-interactive runs (scripts, CI) need no flags — nothing is pinned. Re-init on a live project prints the plan and asks for confirmation; `--yes` applies it without asking.

```bash
wolf init --platform opencode,claude
```

## wolf bootstrap

Scan the project and draft starting memory: proposed rules, document-refs, work thread.

```text
Usage: wolf bootstrap [options]
```

Options:

- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

## wolf mcp

Start the MCP server (stdio). This is the command platform configs point at — see [MCP Integration](/guide/mcp).

```text
Usage: wolf mcp [options]
```

No options beyond `-h, --help`.

## wolf scaffold

Scaffold opencode frame (agent|skill|command) + playbook in Wolf memory.

```text
Usage: wolf scaffold [options] <kind> <name>
```

Arguments: `kind` — frame kind (`agent`, `skill`, `command`); `name` — frame name.

Options:

- `--persona <text>` — agent frame body text (agent only)
- `--model <model>` — agent frontmatter model (agent only)
- `--from-playbook <id>` — reuse existing playbook id instead of creating a new one
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

```bash
wolf scaffold agent reviewer --persona "Review diffs for over-engineering" --model "your-model-id"
```

## wolf tool

Tool librarian: register/list/use/expose/deprecate/revive.

```text
Usage: wolf tool [options] [command]
```

Commands: `register`, `list`, `use`, `expose`, `deprecate`, `revive`, `stats`.

### wolf tool register

Register a script as tool memory object (copies script to `.wolf/tools/`).

```text
Usage: wolf tool register [options] <script-path>
```

Arguments: `script-path` — path to the script.

Options:

- `--name <name>` — tool name (unique)
- `--language <language>` — script language (typescript, python, bash, ...)
- `--contract-in <text>` — input contract
- `--contract-out <text>` — output contract
- `--contract-env <text>` — environment contract
- `--notes <text>` — notes (stored as object body)
- `--force` — skip similar-tools check (default: false)
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

```bash
wolf tool register scripts/check.sh --name check --contract-in "none" --contract-out "exit 0/1"
```

### wolf tool list

List registered tools.

```text
Usage: wolf tool list [options]
```

Options:

- `--status <status>` — filter by status. Choices: `active`, `candidate`, `deprecated`, `archived`

```bash
wolf tool list --status active
```

### wolf tool use

Mark tool as used (increments `usage_count`, prints contract reminder).

```text
Usage: wolf tool use [options] <name-or-id>
```

Arguments: `name-or-id` — tool name or id.

```bash
wolf tool use check
```

### wolf tool expose

(Re)generate `.opencode/skills/<name>/SKILL.md` from the tool object (idempotent). The file starts with its YAML frontmatter; the `<!-- generated from tool:… -->` marker follows right after it.

```text
Usage: wolf tool expose [options] <name-or-id>
```

Arguments: `name-or-id` — tool name or id.

### wolf tool deprecate

Deprecate a tool (requires reason).

```text
Usage: wolf tool deprecate [options] <name-or-id>
```

Arguments: `name-or-id` — tool name or id.

Options:

- `--reason <text>` — deprecation reason

```bash
wolf tool deprecate check --reason "replaced by the linter"
```

### wolf tool revive

Revive a deprecated tool (deprecated → active).

```text
Usage: wolf tool revive [options] <name-or-id>
```

Arguments: `name-or-id` — tool name or id.

### wolf tool stats

Usage counters per tool + reuse economy (signal log + legacy run-log). The canonical source is the signal log; a legacy `.wolf/run-log.jsonl` is still merged during the transition window — run `wolf migrate run-log` to archive it and stop the double count.

```text
Usage: wolf tool stats [options]
```

No options beyond `-h, --help`.

## wolf taxonomy

Manage memory taxonomy.

```text
Usage: wolf taxonomy [options] [command]
```

Commands: `sync`, `show`.

### wolf taxonomy sync

Rewrite `.wolf/config.yaml`, preserving project types and settings, and stamp the `wolf_version` the taxonomy canon belongs to. The `memory_types.core` dump is no longer written.

```text
Usage: wolf taxonomy sync [options]
```

No options beyond `-h, --help`.

### wolf taxonomy show

Print effective taxonomy (code canon + project types).

```text
Usage: wolf taxonomy show [options]
```

No options beyond `-h, --help`.

## wolf migrate

One-time migration: `objects/<type>/` → `threads/<tid>/<subdir>/` + `shared/`.

```text
Usage: wolf migrate [options]
```

Options:

- `--apply` — perform the migration (default: dry-run; default: false)

### wolf migrate run-log

Archive the legacy `.wolf/run-log.jsonl` to `.wolf/metrics/archive/run-log-<date>-legacy.jsonl` (local date; a name collision gets the next free `-2`, `-3` suffix). Run it after upgrading if the removed `run` wrapper (2.13) used to write the run log: while the legacy file is in place, analytics counts old runs twice — the signal log is the canonical source. The move is a rename (contents are never rewritten); the command prints the line count. Idempotent: no legacy file → `nothing to migrate`, exit 0.

```bash
wolf migrate run-log
```

### wolf migrate doc-ids

One-time migration of `document-ref` ids to the canonical format: objects whose id is outside the canon get the id derived from `source.path` + `created_at`; a collision with an id of any memory object gets the next free `-2`, `-3` suffix. The apply pass renames each file, replaces the id in frontmatter, rewrites all references to the old id across memory `.md` files and `relations.jsonl` — matched on id boundaries, so `doc_X` is not torn where `doc_X2` exists — and rebuilds the search index. Service zones are never touched: `briefs/`, `quarantine/`, `events.jsonl`.

Dry-run by default; `--apply` performs the migration (the flag is also honored on the parent: `wolf migrate --apply doc-ids`). The report lists `id → new id` per object plus the `renamed / refs rewritten / conflicts / problems` totals; a `document-ref` without `source.path` is reported as a problem (migration impossible), a taken target path is a conflict (the object is left untouched). Conflicts exit with code 2.

```bash
wolf migrate doc-ids --apply
```

## wolf validate

Validate memory store integrity.

```text
Usage: wolf validate [options]
```

Options:

- `--fix` — quarantine broken objects (default: false)

## wolf doctor

Check all registered projects: binary vs schema version, platform configs, prune dead entries.

For a detected opencode config it also checks what the adapter writes: `default_agent`, `experimental.subagent_depth` ≥ 2, the deprecated top-level `subagent_depth` (reported as ignored by opencode v2), a legacy flat `mcp.wolf` entry (reported as deprecated: ours as `migrate`, a foreign one as left untouched), and a managed agent file whose frontmatter mixes v1 and v2 fields. `--repair` canonicalizes the config — it writes the native MCP entry and `experimental.subagent_depth` — besides repairing storage.

```text
Usage: wolf doctor [options]
```

Options:

- `--repair` — repair storage in the current project: rebuild index, backfill `memory.added` events (default: false)
- `--dry-run` — with `--repair`: print the plan without writing (default: false)

## wolf sync

> **Deprecated in 2.19.0** — superseded by `wolf upgrade --here`; the alias still works in 2.20.0 (it prints a DEPRECATED notice and re-renders stamped files). The notice text still says `removed in 2.20.0` — stale wording, the command is alive.

Re-render the wolf base set (stamped files only; memory untouched). What the set contains and how stamping works: [Base Set](/guide/base-set).

```text
Usage: wolf sync [options]
```

No options beyond `-h, --help`.

```bash
wolf sync
```

### Mutated stamped files are not overwritten

A stamped file that was edited locally — its content differs both from the last recorded render and from the new one — is never overwritten: sync writes `skipped — mutated ...` to the report and leaves the decision to the owner. To return to the canonical render, delete the file or revert the edit — the next sync re-creates (or updates) it.

The witness of the last render's hashes is `.opencode/wolf-sync-state.json`. The first sync after upgrading from an older release (≤ 2.10.0) finds no witness, so files are updated the old way (a one-time bootstrap); from the second run on, the protection is active. Delete the witness file to force a full re-render.

## Sessions & environment

`WOLF_SESSION` — the env var that ties telemetry to a session — is produced by the CLI itself: every invocation without an explicit `WOLF_SESSION` gets a fresh `cli-<uuid>`, stable for the whole process (all telemetry writers of one command share it). An explicitly exported `WOLF_SESSION` is never overwritten. The stamped opencode plugins (`wolf-router`, `wolf-session-start`) pass a fresh `opc-<uuid>` on every CLI spawn — the inherited env of a long-lived opencode process would otherwise collapse all deliveries into one fake session. Plugin templates are updated by the projects pass of `wolf upgrade` (`--here` for one project).

`wolf mcp` is deliberately not sessioned: the MCP server is a long-lived process with a single environment, so one session id for all requests would be false attribution — its telemetry is written with `session_id: null` (see [Telemetry](/guide/telemetry)).

## wolf upgrade

**Unified update (2.19.0): one command updates everything.** The npm phase (`npm install -g mister-wolf@latest`) is followed by an update pass over every project registered in the wolf registry: stamped base-set files are re-rendered, seeded faces updated, and the update map is strictly verified (see [Base Set](/guide/base-set)). The CLI re-executes itself between the phases, so the projects pass always runs with the freshly installed binary; the output of both phases flows into the same terminal.

**Owner intentions (2.20.0)** add the missing half: named decisions, four resolution verbs, an in-file hold (`protect`) and a machine channel. The full workflow — with real output and every limitation — is on [Upgrading a Project and a Park](/guide/upgrade); this section is the flag reference.

```text
Usage: wolf upgrade [options]
```

Options:

- `--check` — read-only freshness summary of the CLI and the whole park: no install, no writes, exit always `0`; also prints the `Protections` section (default: false)
- `--here` — update only the current project: the full project step in cwd, no npm self-update, no registry
- `--yes` — apply the plan without interactive confirmation (`--here` or the projects pass); `mutated` files are backed up and taken, `conflict`/`diverged` still keep exit `2`
- `--resolve <target=verb>` — resolve a decision: `<file|N>=take|keep|protect|pin`, repeatable, comma-separated lists allowed
- `--show <file|N>` — print one target with the `local → base` diff (read-only)
- `--review` — walk the decisions one by one with a diff (TTY); without a TTY prints the recipe and writes nothing
- `--json` — print a single machine-readable document on stdout (`wolf.upgrade/1`, or `wolf.upgrade.check/1` with `--check`)

```bash
wolf upgrade                              # npm phase + projects pass (plan, then confirm)
wolf upgrade --check                      # read-only: CLI + park freshness + protections
wolf upgrade --here                       # update this project only, outside the registry
wolf upgrade --review                     # decide per file, with a diff
wolf upgrade --resolve 2=take --resolve .opencode/agents/foo.md=protect
wolf upgrade --show 2                     # what would `take` do to this file?
wolf upgrade --yes --json > run.json      # silent pass, machine channel
```

Flag dispatch happens once, in the command action, and short-circuits before the npm phase and the re-exec: `--check` (stronger than `--here`), then `--show`, `--review`, `--resolve`, then `--here`, and only a bare `wolf upgrade` / `--yes` reaches the npm phase. Incompatible pairs are argument errors (exit `1`, nothing written): `--review` with `--json`/`--resolve`/`--yes`/`--show`/`--check`, `--show` with `--resolve`/`--yes`/`--check`, `--resolve` with `--yes`/`--check`.

Actual `--check` output (2.20.0, a two-project fixture park, one protected file each — absolute paths shortened):

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

Park classification per project: `current` (nothing to do — identical, protected and `kept` files all count as current), `behind` (stamped files differ from the map of the available release), `needs decision` (a stamped file was edited locally — mutated files are never overwritten — or an unstamped file sits on a wolf target), `unknown` (project is not covered by the update map of the release — out of coverage does **not** mean up to date). Every entry names its files instead of only counting them. A missing update map degrades the summary to stamps only (marked unreliable).

Expected combined run (interactive confirmation renders the per-project plan first):

```text
wolf upgrade — projects       # phase 2 (re-exec): registry pass
- adminvps — updated
- verify: 31/31 ok
- mister-wolf — needs decision
- verify: 29/30 ok · 1 needs decision
- hint: 1 file needs a decision — run wolf upgrade --review
updated 1 · up-to-date 0 · worktree 0 · pinned 0 · missing 0 · needs decision 1 · errors 0 · new 0 · changed 31 · deprecated 0 · removed 0 · faces seeded 0
warn: Done with attention
```

Exit codes: `0` — done (or nothing to do), `1` — failed (npm error, project step error, argument error), `2` — done with attention: at least one project needs a decision (mutated/conflict — the decision stays with the owner — or a `diverged` memory face, which is the Steward's zone and not addressable by `--resolve`). In a non-TTY run without `--yes` the projects pass prints the plan and stops with `Cancelled: --yes is required` — exit `0`, no changes. If the spawn of the re-executed binary fails after a successful npm phase, wolf prints `CLI updated; projects not touched — run wolf upgrade again for the project pass` and exits `1`: the npm phase is idempotent, so simply re-running `wolf upgrade` resumes with the projects pass.

What it does **not** guarantee: the update map covers only the files listed for a release — files outside it are not verified; `unknown` projects get no claims; deletions happen only with explicit confirmation; unregistered projects are only reported by the scan hint (top-5 by recency), never written. Memory (`.wolf/`) is never touched by any pass — face mutations go through the complaint loop and the Steward. Dev/linked CLI installs are refused honestly (self-update would break the link). There is no content auto-merge: a decision is whole-file `take` or `keep`.
