# Platform & Maintenance

## wolf init

Initialize Mr. Wolf memory for this project (idempotent, non-interactive).

```text
Usage: wolf init [options]
```

Options:

- `--platform <ids>` — explicit platform list (comma-separated: `opencode,claude`); replaces the current set
- `--recreate` — backup a corrupted `.wolf/config.yaml` and re-create it from defaults (default: false)

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

Usage counters per tool + reuse economy from `.wolf/run-log.jsonl`.

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

```bash
wolf run "Summarize the current blockers" --title "blocker-scan"
```
