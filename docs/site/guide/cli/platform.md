# Platform & Maintenance

## wolf init

Initialize Mr. Wolf memory for this project (interactive in TTY; non-interactive requires `--model`).

```text
Usage: wolf init [options]
```

Options:

- `--platform <ids>` — explicit platform list (comma-separated: `opencode,claude`); replaces the current set
- `--model <id>` — model for Mr. Wolf and its agents (`<providerID>/<modelID>`); required when non-interactive
- `--recreate` — backup a corrupted `.wolf/config.yaml` and re-create it from defaults (default: false)

In a TTY `wolf init` asks for the model interactively; in scripts and CI pass `--model` explicitly.

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

(Re)generate `.opencode/skills/<name>/SKILL.md` from the tool object (idempotent).

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

Regenerate `memory_types.core` in `.wolf/config.yaml` from code canon.

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

Archive the legacy `.wolf/run-log.jsonl` to `.wolf/metrics/archive/run-log-<date>-legacy.jsonl` (local date; a name collision gets the next free `-2`, `-3` suffix). Run it after upgrading if your `wolf run` used to write the run log: while the legacy file is in place, analytics counts old runs twice — the signal log is the canonical source. The move is a rename (contents are never rewritten); the command prints the line count. Idempotent: no legacy file → `nothing to migrate`, exit 0.

```bash
wolf migrate run-log
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

```text
Usage: wolf doctor [options]
```

No options beyond `-h, --help`.

## wolf sync

Re-render the wolf base set (stamped files only; memory untouched).

```text
Usage: wolf sync [options]
```

No options beyond `-h, --help`.

```bash
wolf sync
```

## wolf run

Run opencode with the model from the Wolf routing object; log weighted token cost.

```text
Usage: wolf run [options] <prompt>
```

Arguments: `prompt` — prompt passed to opencode.

Options:

- `--agent <name>` — opencode agent name
- `--title <title>` — run label written to the log
- `--session <sid>` — opencode session id to continue
- `--tool <name>` — mark this run as using tool(s) (repeatable; default: `[]`)
- `--experiment <id>` — experiment id (comparative methodologies, e.g. RCT)
- `--arm <choice>` — experiment arm (choices: `wolf`, `baseline`)
- `--task-id <id>` — task id (written top-level whenever passed; duplicated in the experiment when `--experiment`)
- `--campaign <id>` — campaign id (written top-level `campaign_id`; groups runs for `--view campaign`)
- `--trace-id <id>` — trace id (defaults to a fresh uuid)
- `--attempt <n>` — attempt number within the task

See [Analytics](/guide/cli/analytics#wolf-run-enrichment) for run enrichment: raw tokens, `duration_ms` and experiment fields in the logs.

```bash
wolf run "Summarize the current blockers" --title "blocker-scan"
```

## wolf upgrade

Upgrade the global `wolf` installation to the latest npm version (runs `npm install -g mister-wolf@latest`).

```text
Usage: wolf upgrade [options]
```

Options:

- `--check` — only check for a newer version, do not install anything (default: false)

```bash
wolf upgrade --check
```
