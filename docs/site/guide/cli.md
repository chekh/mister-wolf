# CLI Reference

The `wolf` binary is the human/script surface of Mr. Wolf. Check your installation with `wolf --version`; every command and subcommand also supports `-h, --help`.

Commands are grouped by purpose: [Memory](#memory) · [Sessions & Context](#sessions-context) · [Work Management](#work-management) · [Thinking & Council](#thinking-council) · [Learning & Effectiveness](#learning-effectiveness) · [Platform & Maintenance](#platform-maintenance).

## Memory

### wolf add

Add a memory object.

```text
Usage: wolf add [options]
```

Options:

- `--type <type>` — memory type. Choices: `decision`, `lesson`, `observation`, `session-summary`, `open-question`, `context`, `work-thread`, `info-request`, `article`, `blocker`, `session-checkpoint`, `rule`, `document-ref`, `document-native`, `task-brief`, `report`, `council-question`, `council-opinion`, `synthesis`, `escalation`, `decision-request`, `call-injection`, `playbook`, `tool`
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

### wolf list

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

### wolf get

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

### wolf search

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

### wolf supersede

Supersede a memory object with another. Marks the old object `superseded` with `superseded_by` pointing to the new one and reindexes.

```text
Usage: wolf supersede [options] <old-id> <new-id>
```

Arguments: `old-id` — id of the object to supersede; `new-id` — id of the replacement object.

```bash
wolf supersede mem_001 mem_002
```

### wolf transition

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

### wolf rebuild-index

Rebuild the SQLite search index from memory objects.

```text
Usage: wolf rebuild-index [options]
```

No options beyond `-h, --help`.

```bash
wolf rebuild-index
```

## Sessions & Context

### wolf scan

Scan the project and save a context snapshot.

```text
Usage: wolf scan [options]
```

No options beyond `-h, --help`.

### wolf brief

Generate the agent brief from the latest scan and memory.

```text
Usage: wolf brief [options]
```

No options beyond `-h, --help`.

### wolf recap

Summarize active project memory: rules, threads, blockers, questions, decisions.

```text
Usage: wolf recap [options]
```

No options beyond `-h, --help`.

### wolf call

Get active call injections — the cold-start delivery of relevant rules, lessons and call-injections. See [Injections](/guide/core-concepts#injections) for the matching and ranking mechanics.

```text
Usage: wolf call [options]
```

Options:

- `--for <topic>` — topic to match injections against
- `--thread <thread-id>` — thread id for thread mode
- `--compact [chars]` — compact budget in chars (default 1200)

```bash
wolf call --for vitest --compact
```

### wolf insights

Heuristic pattern analysis over project memory (Level 1, no LLM).

```text
Usage: wolf insights [options]
```

Options:

- `--topic <topic>` — filter by topic: exact tag match or substring in title/body
- `--type <type>` — analysis lens. Choices: `patterns`, `technical_debt`, `decisions`, `lessons`, `activity` (default: `patterns`)

```bash
wolf insights --type technical_debt
```

### wolf session

Manage sessions and checkpoints.

```text
Usage: wolf session [options] [command]
```

Commands: `checkpoint`, `wrap-up`.

#### wolf session checkpoint

Create a checkpoint for a work thread.

```text
Usage: wolf session checkpoint [options]
```

Options:

- `--thread <thread-id>` — thread id
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf session checkpoint --thread mem_20260831_docs
```

#### wolf session wrap-up

Manually create a session-summary of recent events.

```text
Usage: wolf session wrap-up [options]
```

Options:

- `--title <title>` — summary title
- `--tags <tags>` — comma-separated tags

```bash
wolf session wrap-up --title "Docs pages written" --tags "docs,site"
```

### wolf diff

Show thread changes since a checkpoint.

```text
Usage: wolf diff [options] <thread-id>
```

Arguments: `thread-id` — thread id.

Options:

- `--since <checkpoint-id>` — checkpoint id

```bash
wolf diff mem_20260831_docs --since mem_20260831_cp1
```

### wolf solve

Build a solve pack for a memory problem.

```text
Usage: wolf solve [options] <problem>
```

Arguments: `problem` — problem description.

Options:

- `--save` — save a memory repair request
- `--thread <id>` — thread the repair request

```bash
wolf solve "broken relation links" --save
```

## Work Management

### wolf thread

Manage work threads.

```text
Usage: wolf thread [options] [command]
```

Commands: `create`, `list`, `brief`.

#### wolf thread create

Create a work thread.

```text
Usage: wolf thread create [options]
```

Options:

- `--title <title>` — thread title
- `--goal <goal>` — thread goal
- `--current-state <state>` — current state (default: `""`)
- `--next-steps <steps>` — comma-separated next steps
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf thread create --title "Docs site" --goal "Ship the VitePress site" --next-steps "write pages,build,deploy"
```

#### wolf thread list

List work threads.

```text
Usage: wolf thread list [options]
```

No options beyond `-h, --help`.

#### wolf thread brief

Generate a brief for a work thread.

```text
Usage: wolf thread brief [options] <thread-id>
```

Arguments: `thread-id` — thread id.

### wolf decision

Manage decisions.

```text
Usage: wolf decision [options] [command]
```

Commands: `add`, `list`.

#### wolf decision add

Add a decision.

```text
Usage: wolf decision add [options]
```

Options:

- `--title <title>` — decision title
- `--body <body>` — decision body
- `--thread <thread-id>` — parent thread id
- `--based-on <ids>` — comma-separated artifact ids this decision is based on
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf decision add --title "Use worktrees for docs work" --body "Trunk-based; work in .worktrees/<task>."
```

#### wolf decision list

List decisions.

```text
Usage: wolf decision list [options]
```

Options:

- `--thread <thread-id>` — filter by thread

### wolf blocker

Manage blockers.

```text
Usage: wolf blocker [options] [command]
```

Commands: `add`, `list`, `resolve`.

#### wolf blocker add

Add a blocker.

```text
Usage: wolf blocker add [options]
```

Options:

- `--title <title>` — blocker title
- `--impact <impact>` — blocker impact
- `--workaround <workaround>` — possible workaround
- `--thread <thread-id>` — parent thread id
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf blocker add --title "CI blocked" --impact "No releases" --workaround "Run tests locally"
```

#### wolf blocker list

List blockers.

```text
Usage: wolf blocker list [options]
```

Options:

- `--thread <thread-id>` — filter by thread

#### wolf blocker resolve

Resolve a blocker.

```text
Usage: wolf blocker resolve [options] <id>
```

Arguments: `id` — blocker id.

Options:

- `--by <artifact-id>` — artifact that resolves the blocker

### wolf info-request

Manage info requests.

```text
Usage: wolf info-request [options] [command]
```

Commands: `create`, `list`.

#### wolf info-request create

Create an info request.

```text
Usage: wolf info-request create [options]
```

Options:

- `--title <title>` — request title
- `--thread <thread-id>` — parent thread id
- `--question <question>` — question to answer
- `--detour-reason <reason>` — why this derails the main session
- `--expected-answer <answers>` — comma-separated expected answer items
- `--needed-for <items>` — comma-separated items this answer is needed for
- `--preliminary-answer <answer>` — preliminary answer (default: `""`)
- `--created-by <actor>` — creator actor (default: `user:cli`)

#### wolf info-request list

List info requests.

```text
Usage: wolf info-request list [options]
```

Options:

- `--thread <thread-id>` — filter by thread

### wolf article

Manage articles.

```text
Usage: wolf article [options] [command]
```

Commands: `add`, `list`.

#### wolf article add

Add an article.

```text
Usage: wolf article add [options]
```

Options:

- `--title <title>` — article title
- `--thread <thread-id>` — parent thread id
- `--summary <summary>` — article summary
- `--body <body>` — article body
- `--answers <ids>` — comma-separated answered info-request ids
- `--supports <items>` — comma-separated items this article supports
- `--evidence <items>` — comma-separated evidence items
- `--created-by <actor>` — creator actor (default: `user:cli`)

#### wolf article list

List articles.

```text
Usage: wolf article list [options]
```

Options:

- `--thread <thread-id>` — filter by thread

### wolf rule

Manage rules.

```text
Usage: wolf rule [options] [command]
```

Commands: `add`, `list`.

#### wolf rule add

Add a rule (user only).

```text
Usage: wolf rule add [options]
```

Options:

- `--title <title>` — rule title
- `--body <body>` — rule body
- `--scope <scope>` — rule scope (`project|global`)
- `--applies-to <items>` — comma-separated paths/patterns
- `--trigger <trigger>` — when to apply the rule
- `--created-by <actor>` — creator actor (default: `user:cli`)

```bash
wolf rule add --title "Search before writing scripts" --body "Check tool memory first." --scope project
```

#### wolf rule list

List rules.

```text
Usage: wolf rule list [options]
```

No options beyond `-h, --help`.

### wolf relation

Manage relations between memory objects.

```text
Usage: wolf relation [options] [command]
```

Commands: `add`.

#### wolf relation add

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

## Thinking & Council

### wolf think

Structured thinking sequences (goal → thoughts → conclusion).

```text
Usage: wolf think [options] [command]
```

Commands: `start`, `add`, `conclude`, `abandon`.

#### wolf think start

Start a thinking sequence.

```text
Usage: wolf think start [options]
```

Options:

- `--goal <goal>` — goal of the thinking sequence
- `--thread <thread-id>` — parent thread id
- `--created-by <actor>` — creator actor (accepted for surface parity; not persisted on scratch; default: `user:cli`)

```bash
wolf think start --goal "Pick a docs-site generator"
```

#### wolf think add

Add a thought to a thinking sequence.

```text
Usage: wolf think add [options]
```

Options:

- `--sequence <id>` — thinking sequence id
- `--type <type>` — thought type. Choices: `hypothesis`, `reasoning`, `evidence`, `concern`
- `--text <text>` — thought text

#### wolf think conclude

Conclude a thinking sequence into a decision with an embedded thinking trace.

```text
Usage: wolf think conclude [options]
```

Options:

- `--sequence <id>` — thinking sequence id
- `--title <title>` — decision title
- `--body <body>` — decision body
- `--created-by <actor>` — creator actor (default: `user:cli`)

#### wolf think abandon

Abandon a thinking sequence without creating a decision.

```text
Usage: wolf think abandon [options]
```

Options:

- `--sequence <id>` — thinking sequence id

### wolf council

Council operations.

```text
Usage: wolf council [options] [command]
```

Commands: `tally`, `synthesize`.

#### wolf council tally

Tally council votes.

```text
Usage: wolf council tally [options]
```

Options:

- `--question-id <id>` — question ID
- `--quorum <n>` — minimum votes required
- `--threshold <x>` — consensus threshold (0-1; default: 0.5)

#### wolf council synthesize

Create synthesis from council opinions.

```text
Usage: wolf council synthesize [options]
```

Options:

- `--question-id <id>` — question ID
- `--recommendation <text>` — recommendation text
- `--created-by <actor>` — creator actor (default: `user:cli`)

## Learning & Effectiveness

### wolf learn

Self-learning loop: pattern digest, signal-log health, draft propose/validate/activate.

```text
Usage: wolf learn [options] [command]
```

Commands: `digest`, `status`, `propose`, `validate`, `activate`, `gate`, `decay`, `evolve`, `route`.

#### wolf learn digest

Active patterns with live counts, recent examples, evidence refs and post-audit drafts.

```text
Usage: wolf learn digest [options]
```

No options beyond `-h, --help`.

#### wolf learn status

Signal-log health: volumes, threshold, Layer 1-2 meta-metrics, decay drift, last events.

```text
Usage: wolf learn status [options]
```

No options beyond `-h, --help`.

#### wolf learn propose

Create a draft lesson/rule from an active pattern (mechanical generator, no LLM).

```text
Usage: wolf learn propose [options] <pattern-key>
```

Arguments: `pattern-key` — the pattern to propose a draft from.

Options:

- `--negative` — negative constraint: anti-rule banning the tool entirely
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `steward:archivist`)

#### wolf learn validate

Sandbox Replay Holdout: replay the draft on `tool_error` events after its creation.

```text
Usage: wolf learn validate [options] <draft-id>
```

Arguments: `draft-id` — the draft to validate.

#### wolf learn activate

Activate a validated draft (gate: holdout pass, or `--human-approved`).

```text
Usage: wolf learn activate [options] <draft-id>
```

Arguments: `draft-id` — the draft to activate.

Options:

- `--human-approved` — human review override for text drafts (`needs_human_review`)
- `--created-by <actor>` — actor (default: env `WOLF_ACTOR`, else `steward:archivist`)

#### wolf learn gate

STOP-gate (phase 23): delivery pressure scenarios + read-only zone probe (run separately, outside `check`).

```text
Usage: wolf learn gate [options]
```

No options beyond `-h, --help`.

#### wolf learn decay

Phase 26: mileage-based decay run (sessions) — `review_required` queue, reactivation, drift.

```text
Usage: wolf learn decay [options]
```

Options:

- `--dry-run` — compute without writing changes to objects

```bash
wolf learn decay --dry-run
```

#### wolf learn evolve

Phase 24 GEPA: candidate vs current template (`.wolf/templates/<id>.md`) by a deterministic metric; activation is human-only.

```text
Usage: wolf learn evolve [options] <template-id>
```

Arguments: `template-id` — the template to evolve.

Options:

- `--write` — write the candidate file `<id>.candidate.md` (NOT activation; activation is a human gate)

#### wolf learn route

Phase 25: review-depth heuristic from task features (a recommendation; the decision stays with the human).

```text
Usage: wolf learn route [options]
```

Options:

- `--type <t>` — task type: `feature|bugfix|refactor|docs|experiment`
- `--files <n>` — number of files in the change
- `--lines <n>` — number of lines in the change
- `--blast-radius <x>` — blast radius 0..1
- `--touches-read-only` — the change touches a read-only zone (gates/logs/skeleton)
- `--security` — security: trust boundaries, secrets
- `--metricless` — no deterministic quality metric

### wolf effectiveness

Memory effectiveness panel: rules holdout, tool economy, delivery, noise, routing (aggregation only, no LLM).

```text
Usage: wolf effectiveness [options]
```

No options beyond `-h, --help`.

### wolf complain

Record a complaint about agent/methodology behavior (hot-signal for the Steward).

```text
Usage: wolf complain [options]
```

Options:

- `--about <about>` — complaint target: playbook id, agent id or skill name (e.g. `skill:apprentice`)
- `--text <text>` — complaint text
- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

```bash
wolf complain --about skill:apprentice --text "Skipped the plan review step"
```

## Platform & Maintenance

### wolf init

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

### wolf bootstrap

Scan the project and draft starting memory: proposed rules, document-refs, work thread.

```text
Usage: wolf bootstrap [options]
```

Options:

- `--created-by <actor>` — creator actor (default: env `WOLF_ACTOR`, else `user:cli`)

### wolf mcp

Start the MCP server (stdio). This is the command platform configs point at — see [MCP Integration](/guide/mcp).

```text
Usage: wolf mcp [options]
```

No options beyond `-h, --help`.

### wolf scaffold

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

### wolf tool

Tool librarian: register/list/use/expose/deprecate/revive.

```text
Usage: wolf tool [options] [command]
```

Commands: `register`, `list`, `use`, `expose`, `deprecate`, `revive`, `stats`.

#### wolf tool register

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

#### wolf tool list

List registered tools.

```text
Usage: wolf tool list [options]
```

Options:

- `--status <status>` — filter by status. Choices: `active`, `candidate`, `deprecated`, `archived`

```bash
wolf tool list --status active
```

#### wolf tool use

Mark tool as used (increments `usage_count`, prints contract reminder).

```text
Usage: wolf tool use [options] <name-or-id>
```

Arguments: `name-or-id` — tool name or id.

```bash
wolf tool use check
```

#### wolf tool expose

(Re)generate `.opencode/skills/<name>/SKILL.md` from the tool object (idempotent).

```text
Usage: wolf tool expose [options] <name-or-id>
```

Arguments: `name-or-id` — tool name or id.

#### wolf tool deprecate

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

#### wolf tool revive

Revive a deprecated tool (deprecated → active).

```text
Usage: wolf tool revive [options] <name-or-id>
```

Arguments: `name-or-id` — tool name or id.

#### wolf tool stats

Usage counters per tool + reuse economy from `.wolf/run-log.jsonl`.

```text
Usage: wolf tool stats [options]
```

No options beyond `-h, --help`.

### wolf taxonomy

Manage memory taxonomy.

```text
Usage: wolf taxonomy [options] [command]
```

Commands: `sync`, `show`.

#### wolf taxonomy sync

Regenerate `memory_types.core` in `.wolf/config.yaml` from code canon.

```text
Usage: wolf taxonomy sync [options]
```

No options beyond `-h, --help`.

#### wolf taxonomy show

Print effective taxonomy (code canon + project types).

```text
Usage: wolf taxonomy show [options]
```

No options beyond `-h, --help`.

### wolf migrate

One-time migration: `objects/<type>/` → `threads/<tid>/<subdir>/` + `shared/`.

```text
Usage: wolf migrate [options]
```

Options:

- `--apply` — perform the migration (default: dry-run; default: false)

### wolf validate

Validate memory store integrity.

```text
Usage: wolf validate [options]
```

Options:

- `--fix` — quarantine broken objects (default: false)

### wolf doctor

Check all registered projects: binary vs schema version, platform configs, prune dead entries.

```text
Usage: wolf doctor [options]
```

No options beyond `-h, --help`.

### wolf run

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
