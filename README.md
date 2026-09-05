**English** | [Русский](README.ru.md)

# Mr. Wolf

![Mr. Wolf logo](docs/Mr.%20Wolf.png)

> **"I solve problems."**
>
> **Memory is the carrier. Processes are the essence. Agents are the shape. Tools are the hands.**
> And the hands accumulate: every useful script becomes a permanent project resource.

**Concept version:** 3.0 · Status: opencode-first, roadmap v3 Phases A–B implemented.

## What is Wolf

Mr. Wolf is a local-first layer of memory, processes, agents and tools for AI coding: a single source of truth that agents write their experience to and read context from. It is not an orchestrator and not yet another agent — it is a substrate under any agent. Accumulation instead of evaporation: decisions, lessons, tools and processes stay with the project after the session and make the next task cheaper. The full picture is in the [concept v3 (RU)](docs/concept/concept.md).

## Problems Wolf solves

| #   | Problem                                  | Symptom                                                                        |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| P1  | Context is lost between sessions         | the agent starts from scratch                                                  |
| P2  | Experience is not reused                 | recurring tasks are solved from scratch: prose reasoning + new one-off scripts |
| P3  | Project documents live apart from agents | no single source of truth                                                      |
| P4  | Accumulated knowledge becomes noise      | memory grows, value drops                                                      |

## Installation

> [!WARNING]
> The package is named **`mister-wolf`** ([on npm](https://www.npmjs.com/package/mister-wolf)) — exactly that. The `mr-wolf` package on npm **belongs to someone else** (a work-queue library): `npm install mr-wolf` installs third-party code and runs its install scripts. Check the name letter by letter before installing.

Installation is three commands:

```bash
npm install -g mister-wolf   # 1) машина: бинарь wolf (уровень 0)
cd my-project && wolf init   # 2) проект: скелет .wolf/ + MCP-конфиги платформ
wolf bootstrap               # 3) память: стартовое наполнение из документов проекта
```

After `wolf init` **restart your agent platform** — the Wolf MCP server connects at startup. Claude Code will ask you to approve the project-scope MCP server on first start — that is expected.

- **Try it without installing:** `npx mister-wolf init` — creates project memory but never writes MCP configs (try-out mode). Like it? `npm install -g mister-wolf` and run `wolf init` again.
- **Updating:** `wolf upgrade` — compares the installed version with the npm registry and runs `npm install -g mister-wolf@latest` (`--check` only reports, dev/linked installs are refused honestly). Manual path: `npm i -g mister-wolf@latest`.
- **Platforms v1:** opencode, Claude Code. Detection is automatic; explicit: `wolf init --platform opencode,claude` (the list replaces the current set). If no platform markers are found, init warns you honestly and suggests `--platform`.
- **OS/runtime:** macOS and Linux (glibc) on Node 22/24. Alpine/musl is not supported in v1; Windows is best-effort, not claimed. The native dependency better-sqlite3 installs from prebuilds — that is the dependency's own behavior; mister-wolf ships no install scripts of its own.
- **If installation fails on better-sqlite3 — two different situations:**
  `prebuild-install ... no prebuilt binary found (musl)` — no prebuilds are published for your platform (Alpine/musl) — **not supported in v1**, use a glibc distribution;
  `gyp ERR!` / `node-gyp` / a from-source build failed — there is no prebuild for your Node version or it did not download. Install the node-gyp prerequisites (python3, make, a C++ toolchain) and retry `npm rebuild better-sqlite3` — this one is fixable, unlike musl.
- **Dev path (from a cloned repo):** `npm install && npm run build`, then `alias wolf="node dist/bootstrap/cli.js"`. With a global `mister-wolf` installed at the same time, mind PATH shadowing: which `wolf` runs is decided by the order of directories in your PATH. npm also carries a third-party `wolf` package (Wolfram CLI) — installing both globally conflicts over the binary name and resolves by the same PATH order.

Connecting an agent is one command: `wolf scaffold agent <name>` creates a thin frame in `.opencode/agents/<name>.md`, a playbook object in memory, and a relation between them. Playbook delivery into the session is done by the `.opencode/plugins/wolf-router.ts` plugin — see [Integrations](#integrations).

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

Everything is memory: 25 object types (including `complaint`), versions, relations, attribution.

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

### Agents

- `wolf scaffold agent|skill|command <name>` — a platform frame + a playbook in memory + a relation, all in one command; `--persona` and `--model` for agents, `--from-playbook <id>` to reuse an existing playbook.
- Playbook delivery is plugin injection into the system prompt (delivery layer #1): `.opencode/plugins/wolf-router.ts`.
- **Steward** — the loop's background agent with faces: **Mentor** (methodology, handles complaints), **Librarian** (tools), **Archivist** (knowledge). A new face = a new playbook, not a new agent.

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

The phases 20–26 loop on top of the signal log (`.wolf/metrics/session-metrics.jsonl`).

```bash
wolf learn digest                    # активные паттерны (N≥3) + post-audit draft'ы
wolf learn propose <pattern-key>     # draft урока/правила из паттерна (без LLM)
wolf learn validate <draft-id>       # Sandbox Replay Holdout на реальных событиях
wolf learn activate <draft-id>       # активация (гейт: holdout pass или --human-approved)
wolf learn gate                      # STOP-гейт: pressure-сценарии доставки + read-only probe
wolf learn decay --dry-run           # чистка знаний по пробегу (сессии)
wolf learn status                    # здоровье сигнального лога: объёмы, метрики, drift
```

### Effectiveness

- `wolf effectiveness` — dashboard: rules holdout, tool economy, delivery, noise, routing (aggregation, no LLM); `--snapshot` — append-only history for trends.
- `wolf analytics` — ledgers (memory/tools/rules/agents), memory lifecycle & attribution, campaigns with/without memory + per-memory ROI, coordination, data-quality; honest metrics (`n/a` + reason, never invented numbers).
- `wolf dashboard` — console dashboard: health, ledgers, trends (unicode tables, sparklines).
- `wolf task-eval --verdict accepted|rejected|partial|inconclusive` — task verdicts: acceptance, coverage, cost per accepted task; `--campaign` groups runs into A/B cohorts.
- `wolf insights [--type lessons|decisions|technical_debt|…] [--topic <t>]` — heuristic analysis of memory (Level 1, no LLM).
- Benchmarks: `scripts/bench/` (b1-repeat-debug, b2-bootstrap, b3-retrospective).

## Demos

Self-checking scenarios: `bash scripts/demo/scenario-N.sh`.

| #   | Scenario                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Connecting Wolf to a new project (self-checking, PASS/FAIL points)                                                |
| 2   | The life of a knowledge item: birth, aging (supersede), reading the current one                                   |
| 3   | A new agent = one command (scaffold: playbook + frame + relation)                                                 |
| 4   | An owner complaint — a hot-signal into the self-learning loop                                                     |
| 5   | A script becomes a resource — the Librarian's tool cycle                                                          |
| 6   | Self-learning: 3 mistakes → pattern → draft → Sandbox Replay → activation                                         |
| 7   | Loop hygiene: learn status, memory integrity, mileage-based decay                                                 |
| 8   | wolf run: model from a routing memory object, spend written to the signal log (**one real LLM call, ~30–60 sec**) |

## Integrations

### MCP server

`wolf mcp` — runs the MCP server (stdio): all memory and processes are available to agents on any MCP-compatible platform. Tool list and configuration: [MCP integration spec (RU)](docs/superpowers/specs/2026-07-01-mcp-server-integration-design.md).

### opencode plugins

- `.opencode/plugins/wolf-router.ts` — injects the current playbook into the system prompt (delivery layer #1); `wolf search` is the fallback.
- `.opencode/plugins/wolf-session-start.js` — session start context.
- Agent frames live in `.opencode/agents/` (created by `wolf scaffold`).

### WOLF_ACTOR

Mutation attribution: every memory object has an author. Priority: the `--created-by <actor>` flag > the `WOLF_ACTOR` env var > fallback (`user:cli` for CLI commands, `steward:<face>` for the Steward loop).

## Limitations and roadmap

- **opencode-first**: multi-platform support is an architectural principle (concept §6.6), but the threads for other platforms come after Levels 1–2 mature.
- **What Wolf does not do** (concept §10): code editing as a project function · IDE integration · web UI · distributed work · general-purpose orchestration (only protocols proven by practice).
- Plan: [roadmap-v3 (RU)](docs/superpowers/plans/roadmap-v3.md) — phases A–E.

## Documentation

- [Concept v3 (RU)](docs/concept/concept.md) — four layers, the activation pipeline, the Steward, USP
- [Roadmap v3 (RU)](docs/superpowers/plans/roadmap-v3.md) — phases A–E, status and rationale
- [User guide (RU)](docs/guide/user-guide.md) — basic commands and workflow
- [CLI reference (RU)](docs/reference/cli.md) — full command reference
- [Architecture (RU)](docs/guide/architecture.md) — how the system is built
- [Documentation index (RU)](docs/README.md)

## Development

TypeScript (strict, ESM), Node 22, vitest. Verification: `npm run check` (format + lint + test + build); e2e suite: `npm run e2e`. Architecture: ports & adapters — `src/domain` · `src/app/use-cases` · `src/adapters` · `src/ports`.
