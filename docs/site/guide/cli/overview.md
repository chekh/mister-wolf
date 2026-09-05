# CLI Reference

The `wolf` binary is the human/script surface of Mr. Wolf. Check your installation with `wolf --version`; every command and subcommand also supports `-h, --help`.

Commands are grouped by purpose: [Memory](/guide/cli/memory) · [Sessions & Context](/guide/cli/sessions-context) · [Work Management](/guide/cli/work-management) · [Thinking & Council](/guide/cli/thinking-council) · [Learning](/guide/cli/learning) · [Analytics](/guide/cli/analytics) · [Platform & Maintenance](/guide/cli/platform). The [command index](/guide/cli/) lists all 45 commands with links on one page.

## Conventions

- Every command and subcommand prints its exact interface with `wolf <cmd> --help` (or `-h`).
- `--created-by <actor>` — the actor credited with a mutation (default: env `WOLF_ACTOR`, else `user:cli`); some steward-facing commands default to `steward:archivist`.
- List options such as `--tags` / `--applies-to` take comma-separated values; repeatable options can be passed multiple times.
- Boolean flags default to `false` unless stated otherwise.
