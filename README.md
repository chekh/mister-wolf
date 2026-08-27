# Mr. Wolf

![Mr. Wolf logo](docs/Mr.%20Wolf.png)

> **"I solve problems."**
>
> Local-first Project Semantic Memory layer for AI coding agents.
>
> Not another agent. A memory substrate for agents.
>
> See [Concept v2.0](docs/concept/concept.md) for the full architecture and concept.

## Status

Phases 0–12 are implemented (Phase 9 semantic-search part is deferred): Core Memory; Work Threads / Info Requests / Articles; Decisions / Blockers; Scan + Document Registration; Relations / Session Checkpoints; Search & Retrieval Improvements; Governance + Flat Namespace; Schema-Driven Taxonomy + Orchestration Types + Write Reliability; solve/call memory-repair loop; insights (Level 1, no LLM); structured thinking (`wolf think`); Session Wrap-Up Habit. Superpowers integration phases 15–17 and 19 are done too; phase 18 was merged into phase 23. An MCP server ships with the CLI (`wolf mcp`).

Next: **Phase 13 — Document Ingest** (see [roadmap-v2](docs/superpowers/plans/roadmap-v2.md); blocked on the embedding strategy decision).

## Quick Start

```bash
npm install
npm run build
node dist/bootstrap/cli.js init
node dist/bootstrap/cli.js add --type lesson --title "First lesson" --body "What we learned"
node dist/bootstrap/cli.js search "lesson"
```

## Commands

### Core memory

- `wolf init` — initialize Mr. Wolf memory in the project.
- `wolf add` — add a memory object. Supports `--tags`, `--confidence`, `--importance`, and `--scope` (for types that declare a scope field, e.g. `rule`: `project|global`; the value is validated by the type schema). Search sees it immediately.
- `wolf list` — list memory objects, optionally filtered by type, status, or stale objects.
- `wolf get <id>` — retrieve a single memory object by ID.
- `wolf search <query>` — full-text search over memory objects. Finds objects in any live status of their lifecycle (`active`, `open`, `proposed`, ...); `superseded`/`archived` stay hidden unless requested.
- `wolf supersede <old-id> <new-id>` — mark an older memory object as superseded. Both ids are validated (format and existence), and `old ≠ new` is enforced.
- `wolf rebuild-index` — rebuild the SQLite FTS5 index from markdown source files.

### Phase 1: threads, info requests, articles

- `wolf thread create` — create a work thread.
- `wolf thread list` — list work threads.
- `wolf thread brief <id>` — show a thread brief.
- `wolf info-request create` — create an info request linked to a thread.
- `wolf info-request list` — list info requests.
- `wolf article add` — add an article linked to a thread.
- `wolf article list` — list articles.

### Phase 2: decisions and blockers

- `wolf decision add` — add a decision.
- `wolf decision list` — list decisions.
- `wolf blocker add` — add a blocker.
- `wolf blocker list` — list blockers.
- `wolf blocker resolve <id>` — resolve a blocker.
- `wolf transition <id> resolved` — generic lifecycle transition; for active blockers it accepts `resolved`/`obsolete`, consistent with `wolf blocker resolve`.

### Phase 3: scan and document registration

- `wolf scan` — scan the project, save a snapshot context object, and register discovered project documents as `document` artifacts by reference.
- `wolf brief` — generate an agent brief from the latest scan and active memory.

### Phase 4: relations and checkpoints

- `wolf decision add --based-on <artifact-id>` — link a decision to supporting artifacts.
- `wolf blocker resolve <id> --by <artifact-id>` — record what resolved a blocker.
- `wolf relation add <subject-id> <predicate> <object-id>` — create a typed relation between two memory objects. Positional arguments; 16 predicates (`based_on`, `answers`, `blocks`, `supersedes`, ...).
- `wolf session checkpoint --thread <thread-id>` — create a session checkpoint for a thread.
- `wolf thread diff <thread-id> --since <checkpoint-id>` — show changes since a checkpoint. Also available top-level: `wolf diff <thread-id> --since <checkpoint-id>`.

### Phase 5: search and retrieval improvements

- `wolf search <query> --type <type> --status <status> --tag <tag> --confidence <level> --min-importance <n> --max-importance <n> --created-after <iso> --created-before <iso> --limit <n>` — full-text search with filters and ranking.
- `wolf list --stale` — list memory objects not updated in the last 30 days.

### Phase 6: governance and flat namespace

- `wolf rule add --title "..." --body "..." --scope project|global` — add a rule.
- `wolf rule list` — list rules.

### Phase 7: session wrap-up habit

- `wolf recap` — session startup snapshot: active rules, active work threads, open blockers / open questions / open info requests, recent decisions (last 5 by `updated_at`). The MCP tool `recap` returns the same report. Complements `wolf brief`: brief is the full project overview, recap is the quick session entry.
- `.wolf/SKILL.md` — agent guidance committed with the project: session startup ritual (`recap` + `search`), trigger → memory type table, rule-creation policy (user request only), info-request → article flow.
- `wolf session wrap-up --title "..." --tags tag1,tag2` — manually create a session summary of recent events.
- Session summaries are auto-created after resolving a blocker, terminal transitions, superseding an object, creating a decision, or creating an article.

### Phase 8: schema-driven taxonomy, orchestration types, reliability

- `wolf taxonomy sync` — regenerate `memory_types.core` in `.wolf/config.yaml` from the code canon (`CORE_TAXONOMY`). `artifact_sources` and `memory_types.project` are preserved.
- `wolf taxonomy show` — print the effective taxonomy (core + project types).
- `wolf add --type task-brief --set executor=executor-lead,priority=high` — create any of the 7 orchestration types (`task-brief`, `report`, `council-question`, `council-opinion`, `synthesis`, `escalation`, `decision-request`) via generic creation with extra fields validated by the type declaration. `--set k=v` is repeatable (`--set a=1 --set b=2`); repeating a non-array key is an error; for `string[]` taxonomy fields pass a bracketed list (`--set 'trigger_keywords=[git,merge]'`, JSON quotes optional) or repeat the key to accumulate values.
- `wolf migrate` — one-time migration of legacy `objects/<type>/` into layout v2 (`threads/<tid>/<subdir>/` + `shared/<subdir>/`) with document split (`document-ref`/`document-native`). Dry-run by default; `--apply` performs it. Idempotent.
- `wolf validate [--fix]` — health check: taxonomy drift, layout leftovers, broken objects, events/relations JSONL, index freshness, stale locks. Exit 1 on errors. `--fix` quarantines broken object files into `.wolf/memory/quarantine/`.
- `wolf council tally --question-id <id> --quorum N --threshold X` — count council votes from `council-opinion` objects linked by `answers` relations.
- `wolf council synthesize --question-id <id> --recommendation "..."` — create a `synthesis` object linked `based_on` every opinion.
- Default creation status: question types start `open` — `open-question` via its declaration's `defaultStatus`, and types whose lifecycle head is already `open` (`info-request`, `council-question`, `escalation`, `decision-request`); all other types keep their lifecycle head (`active`/`proposed`).

### Phase 9: solve/call — memory repair loop

Two-session cycle for fixing broken agent behavior caused by stale or missing memory:

1. **Active session:** observe the symptom (e.g. agent keeps using a deprecated command).
2. **Clean session:** `wolf solve "<problem>"` — builds a Solve Pack (scenario classification, relevant memory, analysis instructions).
3. **Analyze:** follow the pack's instructions, propose corrections.
4. **Persist:** `wolf solve "<problem>" --save [--thread <id>]` — creates an `info-request` tagged `solve/memory-repair` for durable tracking.
5. **Inject:** create a `call-injection` via `wolf add --type call-injection --set 'trigger_keywords=[get,deprecated]'`, then `wolf call --for "deprecated get"` returns compact injection blocks for the active session.

```bash
# diagnose
wolf solve "agent keeps using deprecated get command"

# diagnose + save repair request
wolf solve "agent keeps using deprecated get command" --save

# get context-sensitive injections
wolf call --for "deprecated get"

# compact output to 800 chars
wolf call --for "deprecated get" --compact=800

# get all injections with thread context
wolf call --thread mem_t1

# link a call-injection to specific objects
wolf relation add <injection-id> based_on <rule-id>
```

**Safety model:** `wolf solve` is read-only by default. `--save` only creates an `info-request` — no memory mutations. Call injections are inert text blocks; they require `wolf add` to create.

> Note: real memory IDs have the format `mem_<date>_<slug>_<hash>`; examples in this section are illustrative. Documents are registered as `document-ref` type; the `document` type is deprecated.

**Storage layout v2:** objects live in `.wolf/memory/threads/<thread-id>/<subdir>/` (or `shared/<subdir>/` when not tied to a thread); work threads are stored as `threads/<id>/WORK-THREAD.md`. The store reads both v2 and the legacy `objects/` root, but writes only to v2.

**No config.yaml? No problem:** without `.wolf/config.yaml` everything works on the built-in defaults — all 22 core types from `CORE_TAXONOMY`. The config file is a generated mirror plus a place for project-specific types.

### Insights (Level 1 analytics)

- `wolf insights [--topic <topic>] [--type <type>]` — deterministic heuristic analysis of project memory, no LLM. Five lenses: `patterns` (default), `technical_debt`, `decisions`, `lessons`, `activity`; without arguments — project-wide overview. Deliberate deviations from the roadmap: debug-density is a tag heuristic (`debug`, `bug`, `bugfix`, `memory-repair`, `solve`) because the taxonomy has no `debug` core type; LLM synthesis (Level 2) is out of scope for this phase; both flags are optional.

### Structured thinking

- `wolf think start --goal <goal> [--thread <id>] [--created-by <actor>]` — start a thinking sequence; prints the sequence id.
- `wolf think add --sequence <id> --type <hypothesis|reasoning|evidence|concern> --text <text>` — append a thought; prints the thought id.
- `wolf think conclude --sequence <id> --title <title> --body <body> [--created-by <actor>]` — finish into a decision: the body gets an embedded "Thinking trace" section, the relation log gets `based_on`/`basis_for` links to every thought, and the scratch file is removed.
- `wolf think abandon --sequence <id>` — discard the sequence without creating anything.
- MCP tools: `start_thinking`, `add_thought`, `conclude_thinking`, `abandon_thinking`.
- Storage model: while thinking, thoughts live in a scratch file `.wolf/thinking/<id>.jsonl` outside the memory store (invisible to search/brief); on conclude the trace is embedded into the decision body and the scratch is deleted. Deliberate deviations from the roadmap: `--text` carries the thought content (the roadmap defined no carrier), `abandon` completes the lifecycle, storage is the hybrid scratch+embed model.

## Testing

### Unit & integration tests

```bash
npm run check          # format + lint + vitest + build (~60s)
npm run test:run       # vitest only
```

### End-to-end (black-box CLI)

```bash
npm run e2e            # build + vitest on tests/e2e/**/*.e2e.ts (several minutes)
```

The E2E suite exercises the compiled CLI via `spawnSync` — no source imports. Six scenarios:

1. **Lifecycle** — init → thread → task-brief → report → relation → transition → auto session-summary
2. **Council** — question → opinions → tally winner → synthesis
3. **Reliability** — broken object file (validate + quarantine); broken relations.jsonl line
4. **Generic add** — all 21 non-deprecated types create with correct initial lifecycle status
5. **Migration** — 5 legacy objects migrate from `objects/` to layout v2, idempotent, searchable
6. **MCP stdio** — JSON-RPC `tools/list` returns registered tools

**MCP server:** `wolf mcp` starts the stdio MCP server exposing the same capabilities as tools (`search`, `add`, `brief`, `recap`, `insights`, `start_thinking`, ...).

E2E is excluded from `npm run check` because it requires a full build and spawns subprocesses, making it significantly slower (~minutes vs ~60s).

## Documentation

- [Concept v2.0](docs/concept/concept.md) — architecture and concept (Russian)
- [Roadmap v2](docs/superpowers/plans/roadmap-v2.md) — current phases and backlog
- [Ideas backlog](docs/planning/ideas-backlog.md) — registry of captured, not-yet-implemented ideas with sources
- [User guide](docs/guide/user-guide.md) — basic commands and workflow (Russian; covers early phases, see CLI `--help` for the full command list)
- [Docs index](docs/README.md) — canonical docs, phase specs, research, archive
- [wolf-experiment](wolf-experiment/HANDOFF.md) — archived multi-agent orchestration experiment (Wolf → Executor → Workers, Council Mode): empirical boundaries of hierarchy vs flat agents; see HANDOFF.md (Russian)

## Development

```bash
npm install
npm run check       # format check + lint + tests + build
npm run format      # format code with Prettier
npm run lint        # type check with TypeScript
npm run test:run    # run tests once
npm run build       # compile TypeScript
```

## License

MIT © 2026 chekh
