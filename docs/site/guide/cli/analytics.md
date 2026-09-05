# Analytics

Effectiveness analytics aggregates the logs the harness already writes — the signal log (the canonical run-metrics source since P1), the memory event log, the legacy run-log during its transition window — with no LLM calls and no new collectors. The mental model is a value funnel: write → deliver → trigger; every report localizes where the funnel leaks (capture grows but effect doesn't → delivery problem; delivery grows but holdout is empty → memory doesn't change behavior). Analytics serves data, not decisions: archiving, superseding and repairs stay with the Steward under governance rules.

## wolf analytics

Sample queries for the Steward: ledgers, weekly activity, agent and steward views.

```text
Usage: wolf analytics [options]

Effectiveness analytics: ledgers (memory/tools/rules), weekly activity, agents,
steward view, councils, outliers, experiment readiness, memory lifecycle &
coordination

Options:
  --view <view>      Analytics view (choices: "memory", "tools", "rules",
                     "weeklyActivity", "agents", "steward", "outliers",
                     "readiness", "councils", "coordination", "campaign",
                     "all", default: "all")
  --class <class>    Memory lifecycle filter (choices: "new", "sleeper",
                     "workhorse", "dead")
  --type <type>      Memory type filter
  --origin <origin>  Tool origin filter (choices: "script", "native")
  --agent <agent>    Agent name filter
  --silent           Rules view: only silent rules (default: false)
  --top <n>          Row limit (default: 20)
  --weeks <n>        Weekly activity window in weeks (default: 8)
  --json             Machine-readable JSON output (default: false)
  -h, --help         display help for command
```

Options:

- `--view <view>` — analytics view (choices: `memory`, `tools`, `rules`, `weeklyActivity`, `agents`, `steward`, `outliers`, `readiness`, `councils`, `coordination`, `campaign`, `all`; default: `all`)
- `--class <class>` — memory lifecycle filter (choices: `new`, `sleeper`, `workhorse`, `dead`)
- `--type <type>` — memory type filter
- `--origin <origin>` — tool origin filter (choices: `script`, `native`)
- `--agent <agent>` — agent name filter
- `--silent` — rules view: only silent rules (default: false)
- `--top <n>` — row limit (default: 20)
- `--weeks <n>` — weekly activity window in weeks (default: 8)
- `--json` — machine-readable JSON output (default: false)

Views:

| View             | What it returns                                                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory`         | Memory ledger: per-object age, deliveries, triggers, complaints, last_used, lifecycle class; garbage ratio (DEAD / active); lifecycle funnel added→retrieved→injected→cited→applied; attribution share; per-memory ROI (P3) |
| `tools`          | Tool ledger: usage, error rate, lifecycle (script tools); signal-log `tools` attributions (model-native); promotion candidates                                                                                              |
| `rules`          | Rule ranking by `holdout_prevented`; silent rules list                                                                                                                                                                      |
| `weeklyActivity` | Weekly write / deliver / trigger activity per week                                                                                                                                                                          |
| `agents`         | Per-agent runs, weighted cost, duration, process-failure rate, completed and accepted tasks, complaints (filed and received), prevented                                                                                     |
| `steward`        | Steward mutations by kind, complaint funnel, SLA escalations, recurrences, churn, share of auto-mutations                                                                                                                   |
| `councils`       | Councils: questions called (total / window / open), opinions per question, per-agent participation, vote distribution, synthesis share and median question→synthesis time, weekly activity, open questions                  |
| `coordination`   | Coordination events: counts by kind × source actor, 20 most recent events, blocker open→resolve pairs by ref                                                                                                                |
| `campaign`       | Campaigns → cohorts with/without injected memory in the run's session: n, median weighted, accepted share, process-failure rate; honest n/a for small samples (P3)                                                          |
| `outliers`       | Most expensive runs (weighted; `$` with pricing)                                                                                                                                                                            |
| `readiness`      | Experiment readiness: share of runs with an arm, sample sizes per group                                                                                                                                                     |
| `all`            | All sections in sequence (default)                                                                                                                                                                                          |

### Lifecycle classes

Memory objects are classified by usage count and age. Thresholds are configurable (see [Configuration](#configuration)); defaults are 14 days / 3 uses:

- `WORKHORSE` — uses ≥ `workhorse_uses` (default 3)
- `SLEEPER` — at least one use but below `workhorse_uses` (with defaults: 1–2)
- `NEW` — zero uses, age ≤ `new_days` (default 14)
- `DEAD` — zero uses, older than `new_days`

Filter with `--class`, e.g. `--class dead` to list archive candidates (works in both text and `--json` modes):

```bash
wolf analytics --view memory --class dead --top 3
```

```text
== memory ==
┌──────────────────────────────────────────┬──────────────┬───────────┬──────────┬────────────┬──────────┬────────────┬───────────┐
│ id                                       │ type         │ lifecycle │ age_days │ deliveries │ triggers │ complaints │ last_used │
├──────────────────────────────────────────┼──────────────┼───────────┼──────────┼────────────┼──────────┼────────────┼───────────┤
│ mem_20260630_need_incremental_indexing_… │ blocker      │ dead      │ 65       │ 0          │ 0        │ 0          │ -         │
│ mem_20260630_use_decision_and_blocker_t… │ decision     │ dead      │ 65       │ 0          │ 0        │ 0          │ -         │
│ mem_20260630__c0acde                     │ info-request │ dead      │ 65       │ 0          │ 0        │ 0          │ -         │
└──────────────────────────────────────────┴──────────────┴───────────┴──────────┴────────────┴──────────┴────────────┴───────────┘
garbage: dead/base = 27/465 = 5.8%
```

### Memory lifecycle funnel

The `memory` view ends with a stage funnel `added → retrieved → injected → cited → applied` built from `memory_stage` signal events (see the signal-log guide): which share of the store ever gets retrieved, lands in an agent's context, gets cited in an answer, and actually changes the code. `added` counts all store objects (`events` = `-`: births live in the memory event log, not the signal log); each stage reports `events` plus `unique_ids` (distinct memory ids that reached the stage). The JSON payload adds `appliedUniqueIds` — the sorted list of ids that reached `applied`.

`attribution: accepted X/Y (Z%)` — the share of `accepted` `task_evaluated` verdicts preceded by an injection in the same `session_id` (an `injected` stage with `ts` ≤ the verdict's `ts`). Injections without a `session_id` do not participate. Honest nulls: with no data the line reads `attribution: n/a (<reason>)` — `no task_evaluated`, `no injected` or `no accepted verdicts`.

```bash
wolf analytics --view memory --top 3
```

```text
== memory ==
┌──────────────────────────────────────────┬──────────┬───────────┬──────────┬────────────┬──────────┬────────────┬──────────────────────────┐
│ id                                       │ type     │ lifecycle │ age_days │ deliveries │ triggers │ complaints │ last_used                │
├──────────────────────────────────────────┼──────────┼───────────┼──────────┼────────────┼──────────┼────────────┼──────────────────────────┤
│ mem_20260904_docs_example_blocker_416c08 │ blocker  │ sleeper   │ 0        │ 0          │ 1        │ 0          │ 2026-09-04T19:44:50.567Z │
│ ...                                      │          │           │          │            │          │            │                          │
└──────────────────────────────────────────┴──────────┴───────────┴──────────┴────────────┴──────────┴────────────┴──────────────────────────┘
garbage: dead/base = 0/13 = 0.0%
┌───────────┬────────┬────────────┐
│ stage     │ events │ unique_ids │
├───────────┼────────┼────────────┤
│ added     │ -      │ 13         │
│ retrieved │ 1      │ 1          │
│ injected  │ 1      │ 2          │
│ cited     │ 1      │ 1          │
│ applied   │ 1      │ 1          │
└───────────┴────────┴────────────┘
attribution: accepted 1/1 (100.0%)
```

### Tool origin

The tool ledger separates two origins with different economics:

- `script` — objects registered in the tool registry (custom scripts in `.wolf/tools/`, full register → use → expose → deprecate lifecycle). Reuse of a script saves re-creation effort.
- `model-native` — the model's own tools (MCP, built-in), which are not in the registry and are visible only through signal-log `tools` attributions and `tool_error` events. Creation economy doesn't apply; they are outside Wolf's jurisdiction. Every `mr-wolf_*` MCP tool call is itself instrumented (`mcp_call` event with duration and outcome).

Promotion candidates: a script candidate whose `usage_count` reaches the pattern threshold is an expose candidate; a native name appearing repeatedly in the logs without registration is a register candidate (precedent: the search-before-write rule).

### Steward view

`--view steward [--weeks N]` reports what the Steward does and how well it copes: mutations by kind (update / supersede / resolve / transition / tool mutation), the complaint funnel (filed → resolved / rejected), SLA violations (dispatch ages), recurrences (a repeat complaint on the same object), churn (objects with ≥ 2 mutations in the window), and the share of auto-mutations.

### Councils

`--view councils [--weeks N]` aggregates council objects (`council-question` / `council-opinion` / `synthesis`) and their relations (`answers`, `based_on`) — no new collectors, store-only aggregation:

- **Questions** — total, within the `--weeks` window, and currently open (status `open`);
- **Participation** — opinions per question (min/avg/max over all questions) and a per-agent opinion count (`created_by` is the voter);
- **Votes** — distribution of `vote` values; the parser is shared with council vote tallying (the `vote` field → a `VOTE:` line in the body → `TIMEOUT`). Values are free-form strings — the set is not hardcoded;
- **Effectiveness** — share of questions that got a synthesis (a synthesis links to the question's opinions via `based_on`) and the median question→synthesis time;
- **Weekly activity** — the same 8 week buckets as the `weeklyActivity` view;
- **Open questions** — id, days open, opinion count, vote summary.

```bash
wolf analytics --view councils
```

```text
== councils ==
questions: total=2 inWindow=2 open=1
opinions: total=5 per-question min/avg/max = 2/2.5/3
participation:
┌────────────────────────────┬──────────┐
│ agent                      │ opinions │
├────────────────────────────┼──────────┤
│ user:cli                   │ 2        │
│ agent:pragmatist-dev       │ 1        │
│ agent:researcher-architect │ 1        │
│ agent:skeptic-reviewer     │ 1        │
└────────────────────────────┴──────────┘
votes:
┌────────────────────┬───────┐
│ vote               │ count │
├────────────────────┼───────┤
│ decision-audit     │ 1     │
│ session-resume     │ 1     │
│ solve-pack-anatomy │ 1     │
│ нет                │ 1     │
│ только измерив     │ 1     │
└────────────────────┴───────┘
synthesis: questions=1/2 (50.0%) median question->synthesis=0.0h
weeks:
┌────────────┬───────────┬──────────┬───────────┐
│ week       │ questions │ opinions │ syntheses │
├────────────┼───────────┼──────────┼───────────┤
│ 2026-08-24 │ 2         │ 5        │ 1         │
│ 2026-08-31 │ 0         │ 0        │ 0         │
└────────────┴───────────┴──────────┴───────────┘
open questions:
┌──────────────────────────┬───────────┬──────────┬──────────────────────────────────────────┐
│ id                       │ days_open │ opinions │ votes                                    │
├──────────────────────────┼───────────┼──────────┼──────────────────────────────────────────┤
│ mem_20260824_wolf_fd1b83 │ 10        │ 3        │ decision-audit=1, session-resume=1, sol… │
└──────────────────────────┴───────────┴──────────┴──────────────────────────────────────────┘
```

(The weeks table shows all 8 week buckets; trimmed here. Vote strings are whatever the council actually used — including plain-language votes.)

### Coordination

`--view coordination` aggregates `coord_event` signals written by `wolf coord` (who writes which kind — see the harness-integration guide):

- **counts** — events per `kind × actor_from` pair (who initiated what);
- **recent** — the 20 most recent events: ts, kind, `from->to`, refs;
- **blockers** — open→resolve pairs by ref: `opened` is the earliest `coord --kind blocker` naming that ref, `resolved` is the first `memory.resolved` event (`wolf blocker resolve <id>`) at or after it; `-` means still open. A pair is closed by resolving the blocker object, not by a second coord event.

```bash
wolf analytics --view coordination
```

```text
== coordination ==
counts:
┌────────────┬─────────────┬───────┐
│ kind       │ from        │ count │
├────────────┼─────────────┼───────┤
│ blocker    │ L1:lead     │ 3     │
│ acceptance │ L1:reviewer │ 1     │
│ handoff    │ L0:wolf     │ 1     │
│ review     │ L1:reviewer │ 1     │
└────────────┴─────────────┴───────┘
recent:
┌──────────────────────────┬────────────┬──────────────────────┬──────────────────────────────────────────┐
│ ts                       │ kind       │ from->to             │ refs                                     │
├──────────────────────────┼────────────┼──────────────────────┼──────────────────────────────────────────┤
│ 2026-09-04T19:45:14.265Z │ blocker    │ L1:lead              │ mem_20260904_docs_resolved_blocker_a28f… │
│ ...                      │            │                      │                                          │
└──────────────────────────┴────────────┴──────────────────────┴──────────────────────────────────────────┘
blockers:
┌──────────────────────────────────────────┬──────────────────────────┬──────────────────────────┐
│ ref                                      │ opened                   │ resolved                 │
├──────────────────────────────────────────┼──────────────────────────┼──────────────────────────┤
│ mem_20260904_docs_resolved_blocker_a28f… │ 2026-09-04T19:45:14.265Z │ 2026-09-04T19:45:14.575Z │
│ ...                                      │                          │                          │
└──────────────────────────────────────────┴──────────────────────────┴──────────────────────────┘
```

### Campaigns

`--view campaign` is the A/B storefront "same task, with and without memory": runs are grouped by `campaign_id` (a top-level run-signal field written by `wolf run --campaign <id>`) and split into two cohorts by whether the run's session had injected memory — a `session_id` join over `memory_stage injected`, the same pattern as attribution (P2); a run with `session_id: null` lands in `no_memory`:

- **n** — cohort runs in the campaign;
- **median_weighted** — median weighted of the cohort's runs; below 3 runs it is `n/a` with note `n<3: min 3 runs`; an empty cohort notes `no runs`;
- **accepted\_%** — share of accepted verdicts in the cohort: verdicts enter the campaign via `wolf task-eval --campaign <id>` (`detail.campaign_id`) and are cohorted by the same session join; a campaign with no verdicts at all → `n/a` with note `no verdicts`;
- **pfail\_%** — runs with `outcome !== 'ok'` / n.

The view is correlational: p-values and confidence intervals are wrong at these sample sizes — a deliberate P3 boundary. Read a cohort split as a hypothesis prompt, not a proof.

Real output (demo log: eval-01 — both cohorts at 3 runs with verdicts; eval-02 — small samples and a campaign without verdicts):

```text
== campaign ==
┌──────────┬─────────────┬───┬─────────────────┬────────────┬─────────┬─────────────────┐
│ campaign │ cohort      │ n │ median_weighted │ accepted_% │ pfail_% │ note            │
├──────────┼─────────────┼───┼─────────────────┼────────────┼─────────┼─────────────────┤
│ eval-01  │ with_memory │ 3 │ 5210            │ 100.0      │ 0.0     │                 │
│ eval-01  │ no_memory   │ 3 │ 8120            │ 0.0        │ 33.3    │                 │
│ eval-02  │ with_memory │ 2 │ n/a             │ n/a        │ 0.0     │ n<3: min 3 runs │
│ eval-02  │ no_memory   │ 3 │ 9100            │ n/a        │ 0.0     │ no verdicts     │
└──────────┴─────────────┴───┴─────────────────┴────────────┴─────────┴─────────────────┘
```

### Memory ROI

The tail of `--view memory` (P3): which memory objects are associated with accepted tasks, and which merely occupy context:

- **assoc_accepted** — accepted verdicts in sessions where the id was injected no later than the verdict (`ts` of the injection ≤ `ts` of the verdict);
- **assoc_applied** / **injected_total** — applied / injected events of the id;
- **last_activity** — max `ts` over the id's injected/applied events.

Sorted by assoc_accepted desc, then injectedTotal desc, then id; the text view shows the top 20 (`--top`), JSON carries the full list. The section header is the disclaimer `correlational, not causal`: association is by session (the object was in context when the task was accepted), which is not causation — an accepted task was not necessarily accepted thanks to the memory.

Real output (tail of `--view memory` on the same demo log):

```text
memory ROI (correlational, not causal):
┌──────────────────────────────────────────┬────────────────┬───────────────┬────────────────┬──────────────────────────┐
│ id                                       │ assoc_accepted │ assoc_applied │ injected_total │ last_activity            │
├──────────────────────────────────────────┼────────────────┼───────────────┼────────────────┼──────────────────────────┤
│ mem_20260905_write_signals_schema_v2_e4… │ 1              │ 0             │ 2              │ 2026-09-05T10:20:11.774Z │
│ mem_20260905_use_worktree_for_feature_b… │ 1              │ 1             │ 1              │ 2026-09-05T10:07:30.918Z │
│ mem_20260905_prefer_vitest_run_over_wat… │ 0              │ 0             │ 1              │ 2026-09-05T09:30:00.480Z │
└──────────────────────────────────────────┴────────────────┴───────────────┴────────────────┴──────────────────────────┘
```

### Examples

```bash
wolf analytics --view rules --top 3
```

```text
== rules ==
┌──────────────────────────────────────────┬───────────┬─────────┬────────┬──────────────────────────────────────────┐
│ id                                       │ prevented │ checked │ silent │ title                                    │
├──────────────────────────────────────────┼───────────┼─────────┼────────┼──────────────────────────────────────────┤
│ mem_20260703_update_project_docs_after_… │ 0         │ 0       │ no     │ Update project docs after every impleme… │
│ mem_20260823__c93eac                     │ 0         │ 0       │ no     │ Коммитить изменения после завершённой р… │
│ mem_20260823_e2e_5459cc                  │ 0         │ 0       │ no     │ Полное E2E-тестирование после каждого в… │
└──────────────────────────────────────────┴───────────┴─────────┴────────┴──────────────────────────────────────────┘
```

```bash
wolf analytics --view weeklyActivity --weeks 4
```

```text
== Weekly activity ==
┌────────────┬────────┬──────────┬──────────┐
│ week       │ writes │ delivers │ triggers │
├────────────┼────────┼──────────┼──────────┤
│ 2026-08-10 │ 0      │ 0        │ 0        │
│ 2026-08-17 │ 27     │ 0        │ 0        │
│ 2026-08-24 │ 298    │ 4427     │ 8        │
│ 2026-08-31 │ 311    │ 20123    │ 10       │
└────────────┴────────┴──────────┴──────────┘
```

Delivery events are counted per session (not unique objects), so `delivers` can exceed `writes` — the table is a weekly activity count, not a conversion rate.

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

- `--tab <tab>` — render a single section: `health` (L1 statuses, absolutes, current-period weekly activity), `ledgers` (L2 tables: memory, tools, rules, agents, open council questions, top-N), `trends` (L3 sparklines over snapshots, weekly activity, cache-hit ratio, experiment readiness, council activity per week, coverage and data quality lines)
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

The panel ends with an absolutes block: run and process-failure counts (`processFailures`), weighted and raw token sums, cache-hit ratio, average duration, and per-model `costPerCompletedRun`. `$` fields appear only when `pricing` is configured (see [Configuration](#configuration)).

```bash
wolf effectiveness
```

```text
effectiveness panel (mileage aggregation, no LLM):
rules: active=17 | prevented/checked: 0/0
...
noise: 416/485 = 85.8% [BAD]
routing: zai-coding-plan/glm-5.2: tasks=3 median=22868.2
totals: runs=2 processFailures=0 weighted=42736 cache=n/a avg=n/a
cost: n/a (no pricing configured)
model zai-coding-plan/glm-5.2: runs=2 processFailures=0 cost=n/a cost/completedRun=n/a
thresholds: noise ok<20 warn<=40 bad | silent ok<30
```

## wolf run enrichment

`wolf run` itself is documented on the [Platform page](/guide/cli/platform#wolf-run); these are the enrichment flags for comparative methodologies (RCT, golden tasks) and telemetry identity:

- `--tool <name>` — mark the run as using tool(s) (repeatable); feeds tool-run economy from the signal log
- `--experiment <id>` — experiment id (comparative methodologies, e.g. RCT)
- `--arm <choice>` — experiment arm (choices: `wolf`, `baseline`)
- `--task-id <id>` — task id (written top-level whenever passed, experiment or not)
- `--campaign <id>` — campaign id (written top-level as `campaign_id`; groups runs for `--view campaign`)
- `--trace-id <id>` — trace id grouping runs of one task (defaults to a fresh uuid)
- `--attempt <n>` — attempt number within the task

Every run writes raw tokens (`input`, `output`, `cache_read`), `duration_ms` and the v2 identity fields (`event_id`, `run_id`, `trace_id`, `config_hash`, `prompt_hash`, `tools`, `schema_version: 2`) into the signal log — since P1 the signal log is the single canonical source of run metrics, and `.wolf/run-log.jsonl` is no longer written (existing history is still read for the economy transition window; run `wolf migrate run-log` to archive the legacy file and stop the double count). Runs without the new flags keep the old record format — the enrichment is backward-compatible.

```bash
wolf run "Fix the failing test" --experiment exp-20260904-x1 --arm wolf --task-id t3 --tool wolf-search --trace-id 7f3a2b1c-9d4e-4f6a-8b2c-1e5d7a9f0b3e
```

## wolf task-eval

Records a task verdict into the signal log (`task_evaluated` event) — the input for honest acceptance metrics and run coverage:

- `--verdict <verdict>` — `accepted`, `rejected`, `partial`, `inconclusive`
- `--scorer <scorer>` — who evaluated: `human` (default), `deterministic`, `llm_judge`, `hidden_tests`
- `--session <id>` / `--task-id <id>` — link the verdict to a run/task (without a link it still counts toward coverage, but is not attributed to an agent)
- `--campaign <id>` — campaign id (written as `detail.campaign_id`; groups verdicts for `--view campaign`)
- `--criteria-passed <n>` / `--criteria-total <m>` — numeric criteria counts
- `--critical-failure` — mark a critical failure; `--note <text>` — free-form note

A completed run is not the same as a useful task: verdicts feed `accepted` and `costPerAcceptedTask` (the acceptance block) and the coverage line below.

```bash
wolf task-eval --verdict accepted --task-id docs-v2.5.0-rename --scorer human --note "v2.5.0 docs sync"
```

```text
task verdict recorded: verdict=accepted scorer=human
```

## Coverage, acceptance and data quality

`wolf analytics` (end of `--view all`) and `wolf dashboard` (trends section) print data-honesty lines. Real output:

```text
coverage: partial — scored 1/2 (50.0%)
dataQuality: valid 100.0% (malformed lines: 0)
duplicateEventRatePct: n/a
unknownModelRatePct: n/a
pricingCoveragePct: n/a
completeTraceRatePct: n/a (span model planned P2)
```

- `coverage: partial — scored X/Y (Z%)` — share of runs with a verdict (`task_evaluated` signals / run signals); `partial` means not every run has been scored, so treat per-run metrics with caution
- `acceptance` (JSON block) — `accepted` count and `costPerAcceptedTask` (`$` with pricing): how many tasks were actually accepted and what an accepted task costs
- `dataQuality` — data honesty (v2): `validEventRatePct` / `malformedLines` (valid share of lines), `duplicateEventRatePct` (share of duplicate events by `event_id`; the second copy never reaches analytics), `unknownModelRatePct` (runs with modelID null/'unknown'), `pricingCoveragePct` (runs with tokens whose model is priced), and `completeTraceRatePct: null` with the reason — the span model is planned for P2. `n/a` means no data for the metric yet (v1 records without `event_id`, no pricing configured).

## Harness integration

Wrapper and plugin authors can write v2 events into the signal log (`.wolf/metrics/session-metrics.jsonl`) and get first-class analytics. The full format lives in the signal-log guide; the essentials:

**Required fields** (minimum — without them the line counts as malformed):

```ts
{
  ts: new Date().toISOString(),          // ISO8601
  event: 'run',                          // event type
  session_id: null,                      // session id or null
  gen_ai: { modelID: null, agent: null },
  orchestration: { task: null, actor: 'system:my-wrapper' },
}
```

**v2 identity fields** (optional, but the fuller the richer the cross-run analytics): generate an `event_id` (uuid) per event and set `schema_version: 2`; thread `run_id`/`trace_id` through the chain (one trace per task, one run per invocation); `attempt` for retries; `config_hash`/`prompt_hash` as input signatures (sha256, first 12 chars).

**role_level follows the actor convention**: L0 — human/owner, L1 — executor (worker/CLI run), L2 — coordinator/orchestrator. Default: omit the field.

Mechanics: append via `appendSignal(baseDir, event)` (or append a JSON line + `\n`); unknown fields are stripped by the Zod schema on read, records without `schema_version` are read as v1. Duplicate `event_id`s are deduplicated by analytics (first copy wins, repeats surface as `duplicateEventRatePct`). A telemetry failure must never break the wrapped call — keep it in try/catch.

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
- `holdout_prevented` counters are cumulative (no timestamps), so prevented counts are not part of the weekly activity view; they surface as totals in the rule ranking.
- `wolf dashboard` is read-only: it renders to stdout and writes no files; the HTML storefront is deferred by design.
