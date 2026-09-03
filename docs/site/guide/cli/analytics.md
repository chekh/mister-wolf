# Analytics

Effectiveness analytics aggregates the logs the harness already writes — run-log, signal log, memory event log — with no LLM calls and no new collectors. The mental model is a value funnel: write → deliver → trigger; every report localizes where the funnel leaks (capture grows but effect doesn't → delivery problem; delivery grows but holdout is empty → memory doesn't change behavior). Analytics serves data, not decisions: archiving, superseding and repairs stay with the Steward under governance rules.

## wolf analytics

Sample queries for the Steward: ledgers, funnel, agent and steward views.

```text
Usage: wolf analytics [options]

Effectiveness analytics: ledgers (memory/tools/rules), funnel, agents, steward
view, outliers, experiment readiness

Options:
  --view <view>      Analytics view (choices: "memory", "tools", "rules",
                     "funnel", "agents", "steward", "outliers", "readiness",
                     "all", default: "all")
  --class <class>    Memory lifecycle filter (choices: "new", "sleeper",
                     "workhorse", "dead")
  --type <type>      Memory type filter
  --origin <origin>  Tool origin filter (choices: "script", "native")
  --agent <agent>    Agent name filter
  --silent           Rules view: only silent rules (default: false)
  --top <n>          Row limit (default: 20)
  --weeks <n>        Funnel window in weeks (default: 8)
  --json             Machine-readable JSON output (default: false)
  -h, --help         display help for command
```

Options:

- `--view <view>` — analytics view (choices: `memory`, `tools`, `rules`, `funnel`, `agents`, `steward`, `outliers`, `readiness`, `all`; default: `all`)
- `--class <class>` — memory lifecycle filter (choices: `new`, `sleeper`, `workhorse`, `dead`)
- `--type <type>` — memory type filter
- `--origin <origin>` — tool origin filter (choices: `script`, `native`)
- `--agent <agent>` — agent name filter
- `--silent` — rules view: only silent rules (default: false)
- `--top <n>` — row limit (default: 20)
- `--weeks <n>` — funnel window in weeks (default: 8)
- `--json` — machine-readable JSON output (default: false)

Views:

| View        | What it returns                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `memory`    | Memory ledger: per-object age, deliveries, triggers, complaints, last_used, lifecycle class; garbage ratio (DEAD / active) |
| `tools`     | Tool ledger: usage, error rate, lifecycle (script tools); run-log attributions (model-native); promotion candidates        |
| `rules`     | Rule ranking by `holdout_prevented`; silent rules list                                                                     |
| `funnel`    | Weekly write → deliver → trigger conversion                                                                                |
| `agents`    | Per-agent runs, weighted cost, duration, failure rate, tool errors, complaints (filed and received), achievements          |
| `steward`   | Steward mutations by kind, complaint funnel, SLA escalations, recurrences, churn, share of auto-mutations                  |
| `outliers`  | Most expensive runs (weighted; `$` with pricing)                                                                           |
| `readiness` | Experiment readiness: share of runs with an arm, sample sizes per group                                                    |
| `all`       | All sections in sequence (default)                                                                                         |

### Lifecycle classes

Memory objects are classified by usage count and age. Thresholds are configurable (see [Configuration](#configuration)); defaults are 14 days / 3 uses:

- `WORKHORSE` — uses ≥ `workhorse_uses` (default 3)
- `SLEEPER` — at least one use but below `workhorse_uses` (with defaults: 1–2)
- `NEW` — zero uses, age ≤ `new_days` (default 14)
- `DEAD` — zero uses, older than `new_days`

Filter with `--class`, e.g. `--class dead` to list archive candidates:

```bash
wolf analytics --view memory --class dead --top 3
```

```text
== memory ==
id                                                            type         lifecycle  age_days  deliveries  triggers  complaints  last_used
mem_20260630_mr_wolf_schema_driven_memory_control_pla_300359  work-thread  sleeper    65        0           1         0           2026-08-25T08:49:35.952Z
mem_20260630_need_incremental_indexing_bddb0a                 blocker      dead       65        0           0         0           -
mem_20260630_use_decision_and_blocker_types_for_phase_e7f8ee  decision     dead       65        0           0         0           -
garbage: dead/base = 27/460 = 5.9%
```

Note: the `--class`/`--type`/`--origin`/`--agent`/`--silent` filters currently apply to `--json` output only; the text render prints the section unfiltered (the sleeper first row above is real output, not a mistake). `--top` applies in both modes.

### Tool origin

The tool ledger separates two origins with different economics:

- `script` — objects registered in the tool registry (custom scripts in `.wolf/tools/`, full register → use → expose → deprecate lifecycle). Reuse of a script saves re-creation effort.
- `model-native` — the model's own tools (MCP, built-in), which are not in the registry and are visible only through run-log `--tool` attributions and `tool_error` events. Creation economy doesn't apply; they are outside Wolf's jurisdiction.

Promotion candidates: a script candidate whose `usage_count` reaches the pattern threshold is an expose candidate; a native name appearing repeatedly in the logs without registration is a register candidate (precedent: the search-before-write rule).

### Steward view

`--view steward [--weeks N]` reports what the Steward does and how well it copes: mutations by kind (update / supersede / resolve / transition / tool mutation), the complaint funnel (filed → resolved / rejected), SLA violations (dispatch ages), recurrences (a repeat complaint on the same object), churn (objects with ≥ 2 mutations in the window), and the share of auto-mutations.

### Examples

```bash
wolf analytics --view rules --top 3
```

```text
== rules ==
id                                                            prevented  checked  silent  title
mem_20260703_update_project_docs_after_every_implemen_53189e  0          0        no      Update project docs after every implementation phase
mem_20260823__c93eac                                          0          0        no      Коммитить изменения после завершённой работы
mem_20260823_e2e_5459cc                                       0          0        no      Полное E2E-тестирование после каждого выполненного плана
```

## wolf dashboard

Console dashboard: three sections rendered straight to the terminal with Unicode tables and text sparklines (`▁▂▃▄▅▆▇█`).

```text
Usage: wolf dashboard [options]

Console dashboard: health, ledgers, trends (unicode tables and sparklines; no
files written)

Options:
  --tab <tab>  Render a single section (choices: "health", "ledgers", "trends")
  --json       Machine-readable JSON output of the whole dashboard (default:
               false)
  -h, --help   display help for command
```

Options:

- `--tab <tab>` — render a single section: `health` (L1 statuses, absolutes, current-period funnel), `ledgers` (L2 tables: memory, tools, rules, agents, top-N), `trends` (L3 sparklines over snapshots, weekly funnel, cache-hit ratio, experiment readiness)
- `--json` — machine-readable JSON output of the whole dashboard (`DashboardData`)

```bash
wolf dashboard --tab health
```

```text
== health ==
rules: ✓ active=17 prevented/checked: 0/0
tools: · count=0 usage=0 economy: n/a: not enough data (tool runs: 0, total: 3, need ≥ 3 in each group)
delivery: · events=21770 triggered=10 silentRules=0 (n/a)
noise: ✗ 391/460 = 85.0%
routing: zai-coding-plan/glm-5.2: tasks=3 median=22868.2
totals: runs=2 weighted=42736
```

Console-only by design: the dashboard renders to stdout and writes no files; the HTML storefront was deliberately deferred (an optional flag may appear when there is demand).

## wolf effectiveness

```text
Usage: wolf effectiveness [options]

Memory effectiveness panel: rules holdout, tool economy, delivery, noise,
routing (aggregation only, no LLM)

Options:
  --snapshot  Append the full report to
              .wolf/metrics/effectiveness-snapshots.jsonl
  -h, --help  display help for command
```

Options:

- `--snapshot` — serialize the full report and append it to `.wolf/metrics/effectiveness-snapshots.jsonl` (append-only history for trends)

A plain call prints the panel; once at least one snapshot exists, it also prints a delta versus the latest snapshot (`delta vs <ts>` over the numeric fields of each block).

The panel ends with an absolutes block: run/failure counts, weighted and raw token sums, cache-hit ratio, average duration, and per-model cost-per-success. `$` fields appear only when `pricing` is configured (see [Configuration](#configuration)).

```bash
wolf effectiveness
```

```text
effectiveness panel (mileage aggregation, no LLM):
rules: active=17 | prevented/checked: 0/0
...
noise: 391/460 = 85.0% [BAD]
routing: zai-coding-plan/glm-5.2: tasks=3 median=22868.2
totals: runs=2 failures=0 weighted=42736 cache=n/a avg=n/a
cost: n/a (no pricing configured)
model zai-coding-plan/glm-5.2: runs=2 failures=0 cost=n/a cost/success=n/a
thresholds: noise ok<20 warn<=40 bad | silent ok<30
```

## wolf run enrichment

`wolf run` itself is documented on the [Platform page](/guide/cli/platform#wolf-run); these are the enrichment flags for comparative methodologies (RCT, golden tasks):

- `--experiment <id>` — experiment id (comparative methodologies, e.g. RCT)
- `--arm <choice>` — experiment arm (choices: `wolf`, `baseline`)
- `--task-id <id>` — task id within the experiment (golden tasks)

Every run now writes raw tokens (`input`, `output`, `cache_read`) and `duration_ms` into the run-log and the signal log, with the experiment fields riding along. Runs without the new flags keep the old record format — the enrichment is backward-compatible.

```bash
wolf run "Fix the failing test" --experiment exp-20260904-x1 --arm wolf --task-id t3
```

## wolf insights --type activity

The `activity` lens adds a weekly mutations breakdown — added / updated / superseded / resolved / transitioned over the same 8-week window as density insights. A quick pulse of how much memory churns per week and which weeks were capture spikes.

```bash
wolf insights --type activity --topic analytics
```

```text
Insights [activity] (topic: analytics), matched 15/643 objects
Scope: matched 15/643 objects, truth roles: accepted_knowledge 12 / proposed_knowledge 3
...

## Weekly mutations
- 2026-07-13: added 0, updated 0, superseded 0, resolved 0, transitioned 0 (total 0)
...
- 2026-08-17: added 27, updated 0, superseded 0, resolved 1, transitioned 0 (total 28)
- 2026-08-24: added 298, updated 0, superseded 20, resolved 3, transitioned 108 (total 429)
- 2026-08-31: added 286, updated 0, superseded 6, resolved 4, transitioned 3 (total 299)

## Status tally
- active (15)
```

## Configuration

`.wolf/config.yaml`:

```yaml
# $ conversion: model -> $/Mtok; without the block, $ fields are hidden
# (numbers are never invented)
pricing:
  zai-coding-plan/glm-5.2:
    input: 0.6
    output: 2.2
    cache_read: 0.08

# memory lifecycle thresholds (defaults: 14 days / 3 uses)
analytics:
  thresholds:
    new_days: 14
    workhorse_uses: 3
```

## MCP tool

The `analytics` MCP tool mirrors the CLI: it accepts the same parameters (`view`, `class`, `type`, `origin`, `agent`, `top`, `weeks`, `silent`) and returns the same JSON as `wolf analytics --json`. Terminal rendering is CLI-only.

## Limitations

- `$` fields are hidden unless `pricing` is configured — prices come from the owner, never from the code.
- `holdout_prevented` counters are cumulative (no timestamps), so prevented counts are not part of the weekly funnel; they surface as totals in the rule ranking.
- `wolf dashboard` is read-only: it renders to stdout and writes no files; the HTML storefront is deferred by design.
