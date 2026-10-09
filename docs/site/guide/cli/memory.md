# Memory

The canonical entry points are the five verbs — `add`, `get`, `edit`, `list`/`search`, `archive` — plus `wolf relation` for edges between objects. The rest of this page is plumbing: hidden from `wolf --help`, alive for scripts and the complaint loop.

## wolf add

Add a memory object.

```text
Usage: wolf add [options]
```

Options:

- `--type <type>` — memory type. Choices: `rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note`
- `--title <title>` — title
- `--body <body>` — body text
- `--tags <tags>` — comma-separated tags
- `--confidence <confidence>` — confidence level (`low|medium|high`)
- `--importance <n>` — importance from 0 to 1
- `--set <k=v>` — extra field key=value (repeatable; a `"[a,b]"` value is a string array; default: `[]`)
- `--scope <scope>` — scope field for types that declare one (rule: `project|global`)
- `--facet <facet>` — note facet. Required for `note`: `howto|pitfall|context|metric|history|legacy|constraint`. Free input is an error — the facet vocabulary is closed
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

```bash
wolf add --type lesson --title "Run search before writing scripts" \
  --body "A registered tool often already exists." --tags "search,before-write" --confidence medium

wolf add --type note --title "CI cache pitfall" --body "vitest needs --no-cache" --facet pitfall
```

Every type also has a generated namespace with these base flags plus type-specific ones — `wolf note add --facet <choice>`, `wolf thread add --goal <goal> --current-state <s> --next-steps <a,b>`, and so on. The namespaces are generated from the taxonomy; see [Memory Model](/guide/memory).

## wolf list

List memory objects.

```text
Usage: wolf list [options]
```

Options:

- `--type <type>` — filter by type
- `--status <status>` — filter by status
- `--stale` — list stale objects (not updated in 30 days; default: false)
- `--facet <facet>` — filter notes by character facet (`howto|pitfall|context|metric|history|legacy|constraint`)

`list` is enumeration with filters; when you need a full-text query, use `search` — the two share no duplicate options.

```bash
wolf list --type decision --stale
wolf list --facet pitfall
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
- `--facet <facet>` — filter notes by character facet (`howto|pitfall|context|metric|history|legacy|constraint`)
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
wolf search "cache" --facet pitfall
```

### Colon queries

The query string itself supports `field:value` prefixes over the indexed columns:

- `type:lesson`, `status:active` — filter by the type / status column;
- `title:checklist`, `body:redis`, `tags:deploy` — filter by the title / body / tags column;
- prefixes can be combined with words: `type:lesson redis` narrows lessons mentioning redis.

An unknown prefix is not an error: `tag:deployment` (no such column) drops the prefix and searches the value as a regular word. The rest is FTS word search: `AND`/`OR` work as operators, `NOT`/`NEAR` are treated as plain words, quoted phrases degrade to AND of their words, hyphenated tokens search both parts.

The structured flags above (`--type`, `--status`, `--tag`, …) do the same filtering with exact matching and remain the recommended path for scripts; colon queries shine in interactive, one-off exploration.

## wolf edit

Edit the title and/or body of a memory object. Every change is diff-audited: a `memory.edited` event lands in `events.jsonl` with payload `{memory_id, field, before, after}`, values truncated to 200 characters.

```text
Usage: wolf edit [options] <id>
```

Arguments: `id` — memory object id.

Options:

- `--title <t>` — new title
- `--body <b>` — new body
- `--actor <actor>` — actor performing the edit (default: `user:cli`)

Use `edit` for fixes — typos, wording — that do not change what the record means. For a meaningful replacement, create the new object and `wolf supersede` the old one, so the `superseded_by` chain stays intact.

```bash
wolf edit mem_001 --title "Run search before writing scripts (rev)"
```

## wolf archive

Archive a memory object. Sugar for `transition --status archived`; `transition` remains the full status matrix.

```text
Usage: wolf archive [options] <id>
```

Arguments: `id` — memory object id.

Options:

- `--actor <actor>` — actor performing the archive (default: `user:cli`)

```bash
wolf archive mem_042
```

## wolf relation

Typed edges between memory objects. The edge log is append-only: `remove` appends a compensating record instead of deleting anything.

### wolf relation add

Record a relation between two memory objects.

```text
Usage: wolf relation add [options] <subject> <predicate> <object>
```

Arguments: `subject` — subject memory object id; `predicate` — relation predicate; `object` — object memory object id.

Options:

- `--source <source>` — relation source (default: `agent`)

```bash
wolf relation add mem_001 supports mem_002
```

### wolf relation list

List relations — direct and inverse edges, output as `subject -predicate-> object`.

```text
Usage: wolf relation list [options]
```

Options:

- `--of <id>` — only edges of this memory object (subject or object side)
- `--json` — JSON output

```bash
wolf relation list --of mem_001
```

### wolf relation remove

Remove a relation by id. Appends a compensating record with `removed: true` to `relations.jsonl`; edges with `removed` are not read anymore. Rolling back a removal means removing that record — the log itself stays append-only.

```text
Usage: wolf relation remove <id>
```

Arguments: `id` — relation id (see `relation list`).

## Plumbing

Hidden from `wolf --help`, alive for scripts and the complaint loop:

### wolf update

`wolf update <id> [--set k=v …] [--inc field=n …] [--tags …] [--actor …]` — the Steward's triage command for complaints: triage fields (`triage|resolution`), monotonic counters (`dispatch_ages|corroborations`).

### wolf supersede

`wolf supersede <old-id> <new-id>` — meaningful replacement of a record: the old object gets `superseded` with `superseded_by` pointing to the new one, then reindexes.

### wolf transition

`wolf transition <id> <status> [--actor …]` — the full lifecycle status matrix (see [lifecycle transitions](/guide/memory#appendix-object-lifecycle)); `archive` covers the common exit.

### wolf rebuild-index

`wolf rebuild-index` — rebuild the SQLite search index from memory objects.
