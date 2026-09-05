# Memory

## wolf add

Add a memory object.

```text
Usage: wolf add [options]
```

Options:

- `--type <type>` — memory type. Choices: `decision`, `lesson`, `observation`, `complaint`, `session-summary`, `open-question`, `context`, `work-thread`, `info-request`, `article`, `blocker`, `session-checkpoint`, `rule`, `document-ref`, `document-native`, `task-brief`, `report`, `council-question`, `council-opinion`, `synthesis`, `escalation`, `decision-request`, `call-injection`, `playbook`, `tool`
- `--title <title>` — title
- `--body <body>` — body text
- `--tags <tags>` — comma-separated tags
- `--confidence <confidence>` — confidence level (`low|medium|high`)
- `--importance <n>` — importance from 0 to 1
- `--set <k=v>` — extra field key=value (repeatable; a `"[a,b]"` value is a string array; default: `[]`)
- `--scope <scope>` — scope field for types that declare one (rule: `project|global`)
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

```bash
wolf add --type lesson --title "Run search before writing scripts" \
  --body "A registered tool often already exists." --tags "search,before-write" --confidence medium
```

## wolf list

List memory objects.

```text
Usage: wolf list [options]
```

Options:

- `--type <type>` — filter by type
- `--status <status>` — filter by status
- `--stale` — list stale objects (not updated in 30 days; default: false)

```bash
wolf list --type decision --stale
```

## wolf get

Get a memory object by id.

```text
Usage: wolf get [options] <id>
```

Arguments: `id` — memory object id.

Options:

- `--latest` — follow the `superseded_by` chain to the current object (default: false)

```bash
wolf get mem_001 --latest
```

## wolf search

Search memory objects (FTS over the SQLite index).

```text
Usage: wolf search [options] <query>
```

Arguments: `query` — search query.

Options:

- `--type <type>` — filter by type
- `--status <status>` — filter by status
- `--tag <tag>` — filter by tag (repeatable; default: `[]`)
- `--confidence <confidence>` — filter by confidence (`low|medium|high`)
- `--min-importance <n>` — minimum importance
- `--max-importance <n>` — maximum importance
- `--created-after <iso>` — created on or after date
- `--created-before <iso>` — created on or before date
- `--limit <n>` — maximum results
- `--file-path <path>` — filter by related/source file path
- `--hide-superseded` — hide superseded objects (shown and marked `[superseded]` by default; default: false)
- `--include-superseded` — deprecated no-op: superseded objects are shown by default

```bash
wolf search "supersede" --type rule --hide-superseded
```

### Colon queries

The query string itself supports `field:value` prefixes over the indexed columns:

- `type:lesson`, `status:active` — filter by the type / status column;
- `title:checklist`, `body:redis`, `tags:deploy` — filter by the title / body / tags column;
- prefixes can be combined with words: `type:lesson redis` narrows lessons mentioning redis.

An unknown prefix is not an error: `tag:deployment` (no such column) drops the prefix and searches the value as a regular word. The rest is FTS word search: `AND`/`OR` work as operators, `NOT`/`NEAR` are treated as plain words, quoted phrases degrade to AND of their words, hyphenated tokens search both parts.

The structured flags above (`--type`, `--status`, `--tag`, …) do the same filtering with exact matching and remain the recommended path for scripts; colon queries shine in interactive, one-off exploration.

## wolf update

Update triage fields of a memory object (the Steward's triage command for complaints).

```text
Usage: wolf update [options] <id>
```

Arguments: `id` — memory object id.

Options:

- `--set <k=v>` — set a triage field: `triage|resolution` (repeatable)
- `--inc <field=n>` — increment a monotonic counter by integer n > 0: `dispatch_ages|corroborations` (repeatable)
- `--tags <tags>` — append comma-separated tags

```bash
wolf update mem_…_complaint --set triage=duplicate --inc dispatch_ages=1
```

## wolf supersede

Supersede a memory object with another. Marks the old object `superseded` with `superseded_by` pointing to the new one and reindexes.

```text
Usage: wolf supersede [options] <old-id> <new-id>
```

Arguments: `old-id` — id of the object to supersede; `new-id` — id of the replacement object.

```bash
wolf supersede mem_001 mem_002
```

## wolf transition

Transition a memory object to a new status (see [lifecycle transitions](/guide/core-concepts#lifecycle)).

```text
Usage: wolf transition [options] <id> <status>
```

Arguments: `id` — memory object id; `status` — new status.

Options:

- `--actor <actor>` — actor performing the transition (default: `user:cli`)

```bash
wolf transition mem_002 accepted
```

## wolf rebuild-index

Rebuild the SQLite search index from memory objects.

```text
Usage: wolf rebuild-index [options]
```

No options beyond `-h, --help`.

```bash
wolf rebuild-index
```
