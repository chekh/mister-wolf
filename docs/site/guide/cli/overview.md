# CLI Reference

The `wolf` binary is the human/script surface of Mr. Wolf. Check your installation with `wolf --version`; every command and subcommand also supports `-h, --help`.

Wolf 2.13 made the CLI honest: `wolf --help` fits in 30 lines, plumbing commands are hidden, and the surface you see is the surface you are meant to use.

## The five verbs

Daily memory work is five verbs:

| Verb                 | What it does                                                                            |
| -------------------- | --------------------------------------------------------------------------------------- |
| `wolf add`           | Create a memory object (`--type rule\|lesson\|decision\|thread\|complaint\|tool\|note`) |
| `wolf get <id>`      | Read one object by id (`--latest` follows the `superseded_by` chain)                    |
| `wolf edit <id>`     | Fix the title/body of an existing object; every change is diff-audited                  |
| `wolf list`/`search` | Enumerate with filters (`list`) or run a full-text query (`search`)                     |
| `wolf archive <id>`  | Retire an object (sugar for `transition archived`)                                      |

Full reference: [Memory](/guide/cli/memory).

Around the verbs sit `wolf relation` (typed edges between objects) and three state windows: `wolf recap` (what is active right now), `wolf brief` (agent-facing brief), `wolf analytics --view <readiness|effectiveness|dashboard>`. The pre-2.13 window names `insights`, `effectiveness`, `dashboard` still work as hidden deprecated aliases and will be removed in 2.15.

## Generated type namespaces

Every type in the taxonomy gets its own namespace — `wolf <type> add` and `wolf <type> list` — generated from the taxonomy declaration: required fields become required flags, enums become choices.

```bash
wolf note add --facet pitfall … # facet is a choice; free input is an error
wolf thread add --goal "Ship docs" --next-steps "write,build"
```

See [Memory Model](/guide/memory) for the taxonomy itself.

## `create` is gone

`wolf create` was removed in 2.13 deliberately, with no synonym — scripts get a clear error instead of silently drifting behavior:

```text
Error: command 'create' was removed in wolf 2.13 — use `wolf add --type <type>` instead. See CHANGELOG (Migration section).
```

`wolf thread create` fails the same way, pointing at `wolf add --type thread`. Migration notes: [Migration to 2.13](/guide/migration-2.13).

## Reference pages

- [Memory](/guide/cli/memory) — the five verbs, relations, plumbing
- [Sessions & Context](/guide/cli/sessions-context)
- [Work Management](/guide/cli/work-management) — threads, decisions, rules
- [Analytics](/guide/cli/analytics)
- [Platform & Maintenance](/guide/cli/platform)

## Conventions

- Every command and subcommand prints its exact interface with `wolf <cmd> --help` (or `-h`).
- Plumbing (`update`, `supersede`, `transition`, `rebuild-index`, `migrate`, …) is hidden from help but alive for scripts and the complaint loop — see [Memory](/guide/cli/memory).
- `--created-by <actor>` / `--actor <actor>` — the actor credited with a mutation (default: env `WOLF_ACTOR`, else `user:cli`); some steward-facing commands default to `steward:archivist`.
- List options such as `--tags` / `--applies-to` take comma-separated values; repeatable options can be passed multiple times.
- Boolean flags default to `false` unless stated otherwise.
