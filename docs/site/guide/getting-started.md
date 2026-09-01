# Getting Started

## Requirements

- **Node.js >= 22** (Node 22 or 24).
- **OS:** macOS or Linux (glibc). Alpine/musl is not supported in v1; Windows is best-effort, not claimed.
- The native dependency `better-sqlite3` installs from prebuilds; mister-wolf ships no install scripts of its own.

## Installation

::: warning Package name
The package is named exactly **`mister-wolf`** ([on npm](https://www.npmjs.com/package/mister-wolf)). The `mr-wolf` package on npm belongs to someone else (a work-queue library). Check the name letter by letter before installing — see [Troubleshooting](/guide/troubleshooting).
:::

Installation is three commands:

```bash
npm install -g mister-wolf   # 1) machine: the wolf binary
cd my-project && wolf init   # 2) project: .wolf/ skeleton + platform MCP configs
wolf bootstrap               # 3) memory: starting content drafted from project documents
```

What each step does:

1. `npm install -g mister-wolf` installs the global `wolf` binary.
2. `wolf init` creates the `.wolf/` skeleton in the project and writes MCP configs for detected platforms (opencode, Claude Code). Detection is automatic; explicit: `wolf init --platform opencode,claude` (the list replaces the current set).
3. `wolf bootstrap` scans the project and drafts starting memory: proposed rules, `document-ref`s and a work thread.

After `wolf init` **restart your agent platform** — the Wolf MCP server connects at startup. Claude Code will ask you to approve the project-scope MCP server on first start; that is expected.

## Quick try-out (no installation)

```bash
npx mister-wolf init
```

Try-out mode creates project memory but **never writes MCP configs** — npx mode does not touch platform configuration. Like it? `npm install -g mister-wolf` and run `wolf init` again.

## Your first session

The cold-start ritual: pull injections, check the project state, do the work, write back what you learned.

```bash
wolf call                # cold-start: active injections for this session
wolf brief               # project state summary from the latest scan + memory
```

After doing some work, capture the outcome so the next session starts from it:

```bash
wolf add --type lesson --title "Run wolf search before writing new scripts" \
  --body "A similar script often already exists in tool memory." \
  --tags "search,before-write" --confidence medium

wolf recap               # summary: rules, work threads, blockers, questions, decisions
```

Key flags of `wolf add` (see the [CLI reference](/guide/cli/memory#wolf-add) for the full list):

- `--type <type>` — one of 24 active memory types (`decision`, `lesson`, `rule`, `blocker`, …).
- `--title`, `--body` — the object's content.
- `--tags <tags>` — comma-separated tags.
- `--confidence <level>` — `low|medium|high`.
- `--importance <n>` — importance from 0 to 1.
- `--set <k=v>` — extra field, repeatable (`"[a,b]"` value is a string array).

## Where the data lives

Everything is local, inside your project's `.wolf/` directory:

```text
.wolf/
├── config.yaml            # project configuration
├── memory/
│   ├── threads/<tid>/     # per-thread objects; work thread = WORK-THREAD.md
│   ├── shared/<subdir>/   # shared objects
│   ├── briefs/            # generated briefs
│   ├── events.jsonl       # event log (lazy)
│   ├── relations.jsonl    # relations between objects (lazy)
│   └── quarantine/        # broken objects moved by wolf validate --fix (lazy)
├── cache/
│   └── index.sqlite       # SQLite FTS search index (lazy)
├── metrics/               # session-metrics.jsonl, patterns.jsonl (lazy)
├── thinking/              # structured thinking sequences (lazy)
├── tools/                 # registered tool scripts (lazy)
└── backup/<ts>/           # config backups made by wolf init --recreate (lazy)
```

`wolf init` creates `memory/`, `memory/threads/`, `memory/shared/`, `memory/briefs/`, `cache/` and `config.yaml`; the remaining paths appear lazily as features use them. Memory objects are plain markdown files with ids like `mem_20260831_…`.

## Next steps

- [Core Concepts](/guide/core-concepts) — memory objects, the 25 types, lifecycle and governance.
- [CLI Reference](/guide/cli/) — every command and subcommand.
- [MCP Integration](/guide/mcp) — connecting agents via MCP.
- [Configuration](/guide/configuration) — `.wolf/config.yaml`, custom memory types, storage layout.
- [Troubleshooting](/guide/troubleshooting) — common problems and fixes.
