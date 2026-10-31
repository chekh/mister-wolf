**English** | [Русский](README.ru.md)

# Mr. Wolf

![Mr. Wolf logo](docs/Mr.%20Wolf.png)

> **Memory is the carrier. Processes are the essence. Agents are the shape. Tools are the hands.**
> And the hands accumulate: every useful script becomes a permanent project resource.
>
> **"I solve problems."**

**Concept version:** 3.3.1 · Status: opencode-first, roadmap v3 Phases A–B implemented.

## What is Wolf

Mr. Wolf is a permanent project organization assembled from temporary AI agents: a coordinator (L0) owns the goal and accepts the result, an executor (L1) supplies context and dispatches, workers (L2) run single tasks in clean sessions. Typed memory, a complaint-driven learning loop and a library of accumulated tools carry the organization from session to session — a new session starts from the project's state, not from zero. Local-first: everything lives in your repo, driven by CLI + MCP. We run our own development through this organization daily. The full picture is in the [concept v3 (RU)](docs/concept/concept.md).

## Problems Wolf solves

| #   | Problem                                  | Symptom                                                                        | Wolf response                                                                               |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| P1  | Context is lost between sessions         | the agent starts from scratch                                                  | typed memory; `wolf call`/`wolf brief` re-inject project state at cold start                |
| P2  | Experience is not reused                 | recurring tasks are solved from scratch: prose reasoning + new one-off scripts | lessons and the tool library: recurring work starts from what already worked                |
| P3  | Project documents live apart from agents | no single source of truth                                                      | `.wolf/` — a single source of truth drafted from project documents                          |
| P4  | Accumulated knowledge becomes noise      | memory grows, value drops                                                      | supersede chains, facets, decay by mileage                                                  |
| P7  | One agent thinks and checks itself       | confident mistakes survive the session                                         | L0/L1/L2 hierarchy, independent acceptance, Council for ambiguous calls (designed, roadmap) |
| P8  | The same mistakes repeat                 | corrections live in chat logs, not in the project                              | complaint → playbook mutation → next session behaves differently                            |
| P9  | Quality degrades over a long process     | context bloat, drifting goals, lost decisions                                  | briefs, checkpoints, typed state continuity                                                 |

> P5–P6 (capture/reuse failure) are answered by the learning loop and the tool pipeline — see the Learning Loop.

## Installation

> [!WARNING]
> The package is named **`mister-wolf`** ([on npm](https://www.npmjs.com/package/mister-wolf)) — exactly that. The `mr-wolf` package on npm **belongs to someone else** (a work-queue library): `npm install mr-wolf` installs third-party code and runs its install scripts. Check the name letter by letter before installing.

Installation is the binary plus one of two explicit paths:

```bash
npm install -g mister-wolf   # 1) машина: бинарь wolf (уровень 0)
```

```bash
# Путь А — память: минимальный набор
cd my-project && wolf init   # скелет .wolf/ + AGENTS.md; без платформенных конфигов и базового сета
wolf bootstrap               # память: стартовое наполнение из документов проекта

# Путь Б — организация OpenCode: полный базовый набор + MCP
cd my-project && wolf init --full --platform opencode
wolf bootstrap
```

- **Path A — memory:** `wolf init` connects the project minimally — the `.wolf/` skeleton and `AGENTS.md`; it writes no platform configs and no base set. What a clean run prints: `memory skeleton: ensured`, `base set: AGENTS.md created`, the init-report id.
- **Path B — OpenCode organization:** `wolf init --full --platform opencode` renders the full base set (6 agent frames, 19 skills, 3 commands, 2 plugins, seeded playbook faces) and writes `opencode.json` (`mcp.servers.wolf`, `default_agent=mr-wolf`, `experimental.subagent_depth=2`). **Restart opencode** after it — the MCP server and the default agent connect at startup. Claude Code will ask you to approve the project-scope MCP server on first start — that is expected.

- **Try it without installing:** `npx mister-wolf init` — try-out mode: creates the `.wolf/` memory skeleton but never writes MCP configs or the base set. Like it? `npm install -g mister-wolf` and run `wolf init` again.
- **Updating:** `wolf upgrade` — one command updates everything: the npm phase (`npm install -g mister-wolf@latest`) is followed by the update pass over all registered projects (stamped base-set files and seeded faces; deletions only with confirmation). `--check` reports CLI + park freshness without installing; `--here` updates only the current project (no npm, no registry); `--yes` skips the confirmation and backs up whatever it overwrites. Dev/linked installs are refused honestly. `wolf sync` is deprecated → `wolf upgrade --here` (the alias still works and re-renders stamped files; its DEPRECATED notice still says `removed in 2.20.0` — stale wording, the command is alive).
- **Owner intent (2.20.0):** when a pass needs your word, it names the file and the reason (`mutated` / `conflict`, per path — no bare counters). `--review` walks the decisions with a diff, `--show <file|N>` prints local vs base, `--resolve <file|N>=take|keep|protect|pin` applies one, `--json` is the machine channel (`wolf.upgrade/1`, and `wolf.upgrade.check/1` with `--check`). `protect: true` (or `protect: X.Y.Z`) in an agent/skill/command frontmatter holds that file forever — never overwritten, never deleted, still visible in `--check`. A local conflict, start to finish:

  ```bash
  wolf upgrade --check                                     # needs decision: .opencode/agents/foo.md (mutated)
  wolf upgrade --show 1                                    # local → base diff, read-only
  wolf upgrade --resolve 1=protect                         # this file is mine from now on
  wolf upgrade --check                                     # current · 1 protected (intentional)
  ```

  Full workflow, backups and limits: [Upgrading a Project and a Park](docs/site/guide/upgrade.md).

- **Platforms v1:** opencode, Claude Code. Platform MCP configs are opt-in: `wolf init --platform opencode,claude` (the list replaces the current set); without the flag no platform configs are written.
- **First run without barriers:** `wolf init` decides nothing for you — a minimal file set by default (`--full` for the complete base set), one interview question in a TTY (Enter to skip), no model pinning (`--model` is opt-in; model lines are omitted and the platform default applies). Re-init on a live project shows the plan and needs a confirmation (`--yes` skips it).
- **OS/runtime:** macOS and Linux (glibc) on Node 22/24. Alpine/musl is not supported in v1; Windows is best-effort, not claimed. The native dependency better-sqlite3 installs from prebuilds — that is the dependency's own behavior; mister-wolf ships no install scripts of its own.
- **If installation fails on better-sqlite3 — two different situations:**
  `prebuild-install ... no prebuilt binary found (musl)` — no prebuilds are published for your platform (Alpine/musl) — **not supported in v1**, use a glibc distribution;
  `gyp ERR!` / `node-gyp` / a from-source build failed — there is no prebuild for your Node version or it did not download. Install the node-gyp prerequisites (python3, make, a C++ toolchain) and retry `npm rebuild better-sqlite3` — this one is fixable, unlike musl.
- **Dev path (from a cloned repo):** `npm install && npm run build`, then `alias wolf="node dist/bootstrap/cli.js"`. With a global `mister-wolf` installed at the same time, mind PATH shadowing: which `wolf` runs is decided by the order of directories in your PATH. npm also carries a third-party `wolf` package (Wolfram CLI) — installing both globally conflicts over the binary name and resolves by the same PATH order.

Connecting an agent is one command: `wolf scaffold agent <name>` creates a thin frame in `.opencode/agents/<name>.md`, a face — the agent's playbook as a versioned memory object — and a relation between them. Playbook delivery into the session is done by the `.opencode/plugins/wolf-router.ts` plugin — see [Integrations](#integrations).

`bootstrap` finishes by invoking the Steward to fold the startup-memory drafts — protocol: [steward bootstrap (RU)](docs/guide/steward-bootstrap.md).

## Versioning

- The single source of truth for the version is `package.json`; the version changes only via `npm version X.Y.Z` (semver, manual).
- A `v*` tag is the release trigger: CI runs `check`+`e2e` and publishes the package (trusted publishing, provenance).
- Change history lives in [CHANGELOG.md](CHANGELOG.md); an entry there is mandatory for every release.

## Architecture

Four layers ([concept §2 (RU)](docs/concept/concept.md)):

| Layer         | Contents                                                                                             | State                                     |
| ------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Memory**    | Single source of truth: decisions, lessons, rules, documents, processes, tools; supersede chains     | mature: CLI + MCP, taxonomy, FTS search   |
| **Processes** | Working protocols: bootstrap, cold-start, complain channel, checkpoint/wrap-up, knowledge processing | partly in the product, partly in practice |
| **Agents**    | Thin frames (persona) + playbooks (methodology in memory); delivery into platforms                   | proven by PoCs #1–4                       |
| **Tools**     | CLI and MCP — the hands that put memory and processes into action                                    | mature                                    |

The layers are not a stack but a **loop**: agents run processes; processes read and write memory; tools put everything into action; results flow back into memory as new knowledge and new tools.

Details: [architecture guide (RU)](docs/guide/architecture.md) · [concept v3 (RU)](docs/concept/concept.md).

## Features

### Memory

Everything is memory: 8 core types (`rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note`, `face`) plus facets, versions, relations, attribution. A `face` is an agent's playbook as its own versioned type — new versions via `wolf face` (the Steward's mutations leave a structured mutation record), emergency owner rollback via `wolf face breakglass`; structured proposals travel as `wolf propose`.

```bash
wolf add --type lesson --title "..." --body "..." --tags "vitest,ci" --confidence medium
wolf get mem_001 --latest          # до актуального в supersede-цепочке
wolf list --type decision --stale  # не обновлялись 30 дней
wolf search "supersede" --type rule --hide-superseded
wolf supersede mem_001 mem_002     # mem_001 заменён mem_002
wolf transition mem_002 accepted   # смена статуса жизненного цикла
wolf relation add mem_001 supports mem_002
```

- `wolf taxonomy show|sync` — the effective taxonomy and its regeneration from code.
- `wolf validate [--fix]` — store integrity, quarantine for broken objects.
- FTS search over a SQLite index (`wolf rebuild-index` to rebuild).
- `wolf projects` — all registered projects: activity and memory size; transfer is just git — commit `.wolf/memory/`, the clone carries it.

### Processes

Agent working protocols as a product.

```bash
wolf bootstrap                                    # подключение к проекту: скан → черновики правил, document-ref'ы, work-thread
wolf call                                         # cold-start: активные injections для сессии (--for <topic> — по теме)
wolf brief                                        # сводка состояния по последнему scan + памяти
wolf complain --about skill:apprentice --rule "…" --evidence "…" --proposal "…" # жалоба на правило/агента → объект complaint → hot-signal Стюарду
wolf session checkpoint --thread <id>             # точка свёртки прогресса
wolf session wrap-up --title "…"                  # session-summary завершения
wolf solve "битые relation-ссылки" --save         # solve pack для проблемы памяти
wolf think start --goal "…"                       # последовательность: goal → мысли → решение
```

- Контур поправок замыкается в памяти: жалоба → триаж → исход (`relation outcome_of`) — **поправил → закрепилось → доставилось → окупилось**.

### Organization

Wolf works as a permanent project organization from temporary agents: a **coordinator (L0)** holds the goal and accepts the result, an **executor (L1)** supplies context and dispatches, **workers (L2)** execute single tasks in clean sessions. Roles, the working cycle and the council for ambiguous calls — [Organization & Council](https://chekh.github.io/mister-wolf/guide/organization); the council is designed and on the roadmap, the hierarchy and independent acceptance work today. Corrections flow through the complaint loop: complaint → triage → outcome → playbook mutation → the next session behaves differently.

### Agents

- `wolf scaffold agent|skill|command <name>` — a platform frame + a face (the agent's playbook) in memory + a relation, all in one command; `--persona` and `--model` for agents, `--from-playbook <id>` to reuse an existing playbook.
- Playbook delivery is plugin injection into the system prompt (delivery layer #1): `.opencode/plugins/wolf-router.ts`.
- **Steward** — the loop's background agent with faces: **Mentor** (methodology, handles complaints), **Librarian** (tools), **Archivist** (knowledge). A new face = a new playbook, not a new agent — since 2.17 a face is a core type: versioned through `wolf face` with a mandatory mutation record per Steward version, migratable from legacy playbook notes (`wolf face migrate`). Since 2.14 the Steward also aggregates mature lessons into single replacements — proposed, then owner-confirmed.

### Tools

Tool librarian: a successful script crystallizes into a permanent project resource (search-before-write).

```bash
wolf tool register scripts/check.sh --name check --contract-in "нет" --contract-out "exit 0/1"
wolf tool list --status active
wolf tool use check          # +1 к usage_count, напоминание контракта
wolf tool stats              # счётчики + экономика переиспользования из сигнального лога
wolf tool expose check       # (пере)генерировать .opencode/skills/check/SKILL.md
wolf tool deprecate check --reason "заменён линтером"
wolf tool revive check       # deprecated → active
```

### Self-learning

The standalone self-learning pipeline was removed by owner decision — write lessons with `wolf add --type lesson`. The signal log (`.wolf/metrics/session-metrics.jsonl`) remains the source: `wolf tool stats` and `wolf analytics` aggregate it.

### Effectiveness

- `wolf analytics` — the single analytics surface: ledgers (memory/tools/rules/agents), memory lifecycle & attribution, campaigns with/without memory + per-memory ROI, coordination, data-quality, console dashboard (`--view dashboard`), experiment readiness; honest metrics (`n/a` + reason, never invented numbers). The former standalone `wolf effectiveness` / `wolf dashboard` / `wolf insights` commands are views of `wolf analytics`.
- `wolf task-eval --verdict accepted|rejected|partial|inconclusive` — task verdicts: acceptance, coverage, cost per accepted task; `--campaign` groups runs into A/B cohorts.
- Benchmarks: `scripts/bench/` (b1-repeat-debug, b2-bootstrap, b3-retrospective).

## Read isolation

Memory scoped to a linked worktree (`worktree:<id>`) is filtered on exactly one path — the delivery path, `wolf call`, in all modes (default, `--for <topic>`, `--thread <id>`); the MCP channel mirrors the CLI list and a `call` tool there would inherit the same isolation. Every other read — `wolf search`/`get`/`list`/`show`, `brief`, `recap`, `think`/`solve`, `doctor`, relation/analytics paths, `wolf face *` (faces filter by `owner_skill`, not scope) — sees the whole project memory. This composition is a frozen contract (NFR-03): extending it is a requirements change, guarded by a doc-test. Details: [Read Isolation](https://chekh.github.io/mister-wolf/guide/read-isolation).

## Demos

Self-checking scenarios: `bash scripts/demo/scenario-N.sh`.

| #   | Scenario                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Connecting Wolf to a new project (self-checking, PASS/FAIL points)                                                  |
| 2   | The life of a knowledge item: birth, aging (supersede), reading the current one                                     |
| 3   | A new agent = one command (scaffold: playbook + frame + relation)                                                   |
| 4   | An owner complaint — a hot-signal into the self-learning loop                                                       |
| 5   | A script becomes a resource — the Librarian's tool cycle                                                            |
| 6   | Signal log: repeated tool errors land in session metrics (self-learning pipeline removed)                           |
| 7   | Loop hygiene: memory integrity, attribution, and noise audit                                                        |
| 8   | Routing: model from a routing memory object, session wrap-up recorded in memory (**one real LLM call, ~30–60 sec**) |

## Integrations

### MCP server

`wolf mcp` — runs the MCP server (stdio): all memory and processes are available to agents on any MCP-compatible platform. Tool list and configuration: [MCP integration spec (RU)](docs/specs/2026-07-01-mcp-server-integration-design.md).

### opencode plugins

- `.opencode/plugins/wolf-router.ts` — injects the current playbook into the system prompt (delivery layer #1); `wolf search` is the fallback.
- `.opencode/plugins/wolf-session-start.js` — session start context.
- Agent frames live in `.opencode/agents/` (created by `wolf scaffold`).

### WOLF_ACTOR

Mutation attribution: every memory object has an author. Priority: the `--created-by <actor>` flag > the `WOLF_ACTOR` env var > fallback (`user:cli` for CLI commands, `steward:<face>` for the Steward loop).

## Limitations and roadmap

- **opencode-first**: multi-platform support is an architectural principle (concept §6.6), but the threads for other platforms come after Levels 1–2 mature.
- **What Wolf does not do** (concept §10): code editing as a project function · IDE integration · web UI · distributed work · general-purpose orchestration (only protocols proven by practice).
- Plan: [roadmap-v4 (RU)](docs/dev/roadmap/roadmap-v4.md) — active roadmap; history: [v3](docs/dev/roadmap/roadmap-v3.md), [v2](docs/dev/roadmap/roadmap-v2.md).

## Documentation

- [Concept v3 (RU)](docs/concept/concept.md) — four layers, the activation pipeline, the Steward, USP
- [Roadmap v4 (RU)](docs/dev/roadmap/roadmap-v4.md) — active roadmap; history: [v3](docs/dev/roadmap/roadmap-v3.md), [v2](docs/dev/roadmap/roadmap-v2.md)
- [User guide (RU)](docs/guide/user-guide.md) — basic commands and workflow
- [CLI reference (RU)](docs/reference/cli.md) — full command reference
- [Architecture (RU)](docs/guide/architecture.md) — how the system is built
- [Documentation index (RU)](docs/README.md)

Feature documentation lives in `docs/dev/` as an artifact pipeline (requirements → design → plan → test-plan): `wolf scaffold artifact` creates the feature folder, `wolf sync` maintains INDEX.md, and `wolf doctor` lints the documents. External skills are onboarded through skill intake: search → review → owner gate → `npx skills add` → registration in Wolf memory.

## Development

TypeScript (strict, ESM), Node 22, vitest. Verification: `npm run check` (format + lint + test + build); e2e suite: `npm run e2e`. Architecture: ports & adapters — `src/domain` · `src/app/use-cases` · `src/adapters` · `src/ports`.
