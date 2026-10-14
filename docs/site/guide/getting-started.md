# Getting Started

Mr. Wolf is a permanent project organization for temporary AI agents: a coordinator owns the goal, executors deliver, workers run in clean sessions — and typed memory, a complaint-driven learning loop and a grown tool library carry the organization from session to session. Locally, in your repo, CLI + MCP.

## Requirements

- **Node.js >= 22** (Node 22 or 24).
- **OS:** macOS or Linux (glibc). Alpine/musl is not supported in v1; Windows is best-effort, not claimed.
- The native dependency `better-sqlite3` installs from prebuilds; mister-wolf ships no install scripts of its own.

## Installation

::: warning Package name
The package is named exactly **`mister-wolf`** ([on npm](https://www.npmjs.com/package/mister-wolf)). The `mr-wolf` package on npm belongs to someone else (a work-queue library). Check the name letter by letter before installing — see [Troubleshooting](/guide/troubleshooting).
:::

Installation is the binary plus one of two explicit paths:

```bash
npm install -g mister-wolf   # 1) machine: the wolf binary
```

```bash
# Path A — memory: the minimal set
cd my-project && wolf init   # .wolf/ skeleton + AGENTS.md; no platform configs, no base set
wolf bootstrap               # memory: starting content drafted from project documents

# Path B — OpenCode organization: the full base set + MCP
cd my-project && wolf init --full --platform opencode
wolf bootstrap
```

What each path does:

1. `npm install -g mister-wolf` installs the global `wolf` binary.
2. **Path A — memory:** `wolf init` connects the project minimally — the `.wolf/` skeleton and `AGENTS.md`. A clean run prints `memory skeleton: ensured`, `base set: AGENTS.md created` and the init-report id; it writes no platform configs and no base set. The first run decides nothing else for you: one interview question in a TTY (project purpose — Enter to skip), no model pinning (`--model` is opt-in; model lines are omitted and the platform default applies). Re-init on a live project shows the plan and asks for confirmation (`--yes` skips it).
3. **Path B — OpenCode organization:** `wolf init --full --platform opencode` renders the full base set — 6 agent frames, 19 skills, 3 commands, 2 plugins, seeded playbook faces — and writes `opencode.json` (`mcp.wolf`, `default_agent=mr-wolf`, `subagent_depth=2`). Platform configs are opt-in: `wolf init --platform opencode,claude` (the list replaces the current set). **Restart opencode** after an init that wrote MCP configs — the server and the default agent connect at startup. Claude Code will ask you to approve the project-scope MCP server on first start; that is expected.
4. `wolf bootstrap` scans the project and drafts starting memory: proposed rules and a work thread.

An init counts as completed when `wolf doctor` reports 0 issues on the project; the activation metric and the acceptance window are defined in the wave spec (`docs/superpowers/specs/2026-10-10-wave-2.16-init2-unpin-hygiene-design.md`, §11).

## Quick try-out (no installation)

```bash
npx mister-wolf init
```

Try-out mode creates the `.wolf/` memory skeleton but **never writes MCP configs or the base set** — npx mode does not touch platform configuration. Like it? `npm install -g mister-wolf` and run `wolf init` again.

## Your first session

The cold-start ritual: pull injections, check the project state, do the work, write back what you learned. `call` injects the project's active organization state: rules, lessons, blockers.

```bash
wolf call                # cold-start: active injections for this session
wolf brief               # project state summary from the latest scan + memory
```

After doing some work, capture the outcome so the next session starts from it:

```bash
wolf add --type lesson --title "Run wolf search before writing new scripts" \
  --body "A similar script often already exists in tool memory." \
  --tags "search,before-write" --confidence medium

wolf recap               # summary of active project memory
```

Choosing a type is now a choice of **seven** (it used to be 26). The old question "which of the 26 types is this?" became "is this one of the six special ones? If not — `note` plus a facet." See [Memory Model](/guide/memory).

The memory surface is five verbs:

- `add` — write an object;
- `get` — read one object by id;
- `edit` — change title/body;
- `search` / `list` — find objects;
- `archive` — retire an object.

The full CLI goes beyond memory — its commands are organized in groups; see the [CLI Reference](/guide/cli/).

Key flags of `wolf add` (see the [CLI reference](/guide/cli/memory#wolf-add) for the full list):

- `--type <type>` — one of the 7 memory types (`rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note`).
- `--title`, `--body` — the object's content.
- `--tags <tags>` — comma-separated tags.
- `--facet <facet>` — the note's character (`howto|pitfall|context|metric|history|legacy|constraint|proposal`); required for `note` — on other core types only `proposal` is allowed, the signal facet for `wolf propose`.
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

- [Organization & Council](/guide/organization) — the L0/L1/L2 roles, the working cycle, the council for ambiguous calls.
- [Memory Model](/guide/memory) — the seven types, facets, thread statuses, reading pre-2.13 data.
- [CLI Reference](/guide/cli/) — every command and subcommand.
- [MCP Integration](/guide/mcp) — connecting agents via MCP.
- [Configuration](/guide/configuration) — `.wolf/config.yaml`, facet vocabulary, storage layout.
- [Troubleshooting](/guide/troubleshooting) — common problems and fixes.
