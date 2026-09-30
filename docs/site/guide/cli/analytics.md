# Analytics

Effectiveness analytics aggregates the logs the harness already writes — the signal log (the canonical run-metrics source since P1), the memory event log, the legacy run-log during its transition window, and the router plugin's `.wolf/router.log` — with no LLM calls and no new collectors. The mental model is a value funnel: write → deliver → trigger; every report localizes where the funnel leaks (capture grows but effect doesn't → delivery problem; delivery grows but holdout is empty → memory doesn't change behavior). Analytics serves data, not decisions: archiving, superseding and repairs stay with the Steward under governance rules.

## wolf analytics

The single analytics surface: every window of the project state renders here (since 2.13 the former standalone `wolf effectiveness` / `wolf dashboard` / `wolf insights` commands are views of `wolf analytics`).

```text
Usage: wolf analytics [options]

Analytics state window: ledgers (memory/tools/rules), weekly activity, agents,
steward, councils, outliers, readiness, coordination, campaign, delivery,
acceptance, effectiveness, dashboard

Options:
  --view <view>      Analytics view (choices: "memory", "tools", "rules",
                     "weeklyActivity", "agents", "steward", "outliers",
                     "readiness", "councils", "coordination", "campaign",
                     "delivery", "acceptance", "effectiveness", "dashboard",
                     "all", default: "all")
  --class <class>    Memory lifecycle filter (choices: "new", "sleeper",
                     "workhorse", "dead")
  --type <type>      Memory type filter
  --origin <origin>  Tool origin filter (choices: "script", "native")
  --agent <agent>    Agent name filter
  --silent           Rules view: only silent rules (default: false)
  --top <n>          Row limit (default: 20)
  --weeks <n>        Weekly activity window in weeks (default: 8)
  --snapshot         Effectiveness view: append the report to
                     .wolf/metrics/effectiveness-snapshots.jsonl (default:
                     false)
  --json             Machine-readable JSON output (default: false)
  -h, --help         display help for command
```

Options:

- `--view <view>` — analytics view (choices: `memory`, `tools`, `rules`, `weeklyActivity`, `agents`, `steward`, `outliers`, `readiness`, `councils`, `coordination`, `campaign`, `delivery`, `acceptance`, `effectiveness`, `dashboard`, `all`; default: `all`)
- `--class <class>` — memory lifecycle filter (choices: `new`, `sleeper`, `workhorse`, `dead`)
- `--type <type>` — memory type filter
- `--origin <origin>` — tool origin filter (choices: `script`, `native`)
- `--agent <agent>` — agent name filter
- `--silent` — rules view: only silent rules (default: false)
- `--top <n>` — row limit (default: 20)
- `--weeks <n>` — weekly activity window in weeks (default: 8)
- `--snapshot` — effectiveness view: append the report to `.wolf/metrics/effectiveness-snapshots.jsonl` (default: false)
- `--json` — machine-readable JSON output (default: false)

Views:

| View             | What it returns                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `memory`         | Memory ledger: per-object age, deliveries, triggers, complaints, last_used, lifecycle class; garbage ratio (DEAD / active); lifecycle funnel added→retrieved→injected→cited→applied; attribution share; per-memory ROI (P3)                |
| `tools`          | Tool ledger: usage, error rate, lifecycle (script tools); signal-log `tools` attributions (model-native); promotion candidates                                                                                                             |
| `rules`          | Rule ranking by `holdout_prevented`; silent rules list                                                                                                                                                                                     |
| `weeklyActivity` | Weekly write / deliver / trigger activity per week                                                                                                                                                                                         |
| `agents`         | Per-agent runs, weighted cost, duration, process-failure rate, completed and accepted tasks, complaints (filed and received), prevented; JSON names them honestly: `completedRuns` (runs with `outcome: 'ok'`) and `processFailureRatePct` |
| `steward`        | Steward mutations by kind, complaint funnel, SLA escalations, recurrences, churn, share of auto-mutations                                                                                                                                  |
| `councils`       | Councils: questions called (total / window / open), opinions per question, per-agent participation, vote distribution, synthesis share and median question→synthesis time, weekly activity, open questions                                 |
| `coordination`   | Coordination events: counts by kind × source actor, 20 most recent events, blocker open→resolve pairs by ref                                                                                                                               |
| `campaign`       | Campaigns → cohorts with/without injected memory in the run's session: n, median weighted, accepted share, process-failure rate; honest n/a for small samples (P3)                                                                         |
| `outliers`       | Most expensive runs (weighted; `$` with pricing)                                                                                                                                                                                           |
| `readiness`      | Experiment readiness: share of runs with an arm, sample sizes per group                                                                                                                                                                    |
| `delivery`       | Delivery panel: top delivered objects with the applied% indicator, miss-rate by agent-id, average injection size (two channels), router resolve latency p50/p90, skill invocation counters (see [Delivery panel](#delivery-panel))         |
| `acceptance`     | Machine acceptance (wave metrics): router miss-rate per agent, per-tool error rate + p50/p90 latency, error classes, delivery bursts, search→get follow, 72 h vitality, malformed lines (see [Machine acceptance](#machine-acceptance))    |
| `effectiveness`  | Memory effectiveness panel: rules holdout, tool economy, delivery, noise, routing; `--snapshot` appends the report to `.wolf/metrics/effectiveness-snapshots.jsonl` (see [Effectiveness](#effectiveness-view-effectiveness))               |
| `dashboard`      | Console dashboard: health, ledgers, trends — Unicode tables and text sparklines, nothing written to disk (see [Dashboard](#dashboard-view-dashboard))                                                                                      |
| `all`            | All sections in sequence (default)                                                                                                                                                                                                         |

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
┌──────────────────────────────────────────┬──────────┬───────────┬──────────┬────────────┬──────────┬────────────┬───────────┐
│ id                                       │ type     │ lifecycle │ age_days │ deliveries │ triggers │ complaints │ last_used │
├──────────────────────────────────────────┼──────────┼───────────┼──────────┼────────────┼──────────┼────────────┼───────────┤
│ mem_20260630_need_incremental_indexing_… │ note     │ dead      │ 91       │ 0          │ 0        │ 0          │ -         │
│ mem_20260630_use_decision_and_blocker_t… │ decision │ dead      │ 91       │ 0          │ 0        │ 0          │ -         │
│ mem_20260630__c0acde                     │ note     │ dead      │ 92       │ 0          │ 0        │ 0          │ -         │
└──────────────────────────────────────────┴──────────┴───────────┴──────────┴────────────┴──────────┴────────────┴───────────┘
garbage: dead/base = 422/732 = 57.7%
```

### Memory lifecycle funnel

The `memory` view ends with a stage funnel `added → retrieved → injected → cited → applied` built from `memory_stage` signal events: which share of the store ever gets retrieved, lands in an agent's context, gets cited in an answer, and actually changes the code. `added` counts all store objects (`events` = `-`: births live in the memory event log, not the signal log); each stage reports `events` plus `unique_ids` (distinct memory ids that reached the stage). The JSON payload adds `appliedUniqueIds` — the sorted list of ids that reached `applied`.

Stage events have exactly one kind of writer since 2.13 — **automatic** (the manual `wolf memory-stage` command was removed; stages are written automatically by the memory commands):

- `wolf search` / `wolf get` write `retrieved` on a non-empty result set; `wolf brief` / `wolf call` write `injected` when injections are actually delivered. Nothing to record → no event: an empty search result writes no `retrieved`, a brief without injections writes no `injected`.
- `cited` and `applied` have no built-in writer anymore; a harness that wants them appends `memory_stage` events to the signal log directly (see [Harness integration](#harness-integration)).

`attribution: accepted X/Y (Z%)` — the share of `accepted` `task_evaluated` verdicts preceded by an injection in the same `session_id` (an `injected` stage with `ts` ≤ the verdict's `ts`). Injections without a `session_id` do not participate. Honest nulls: with no data the line reads `attribution: n/a (<reason>)` — `no task_evaluated`, `no injected` or `no accepted verdicts`.

```bash
wolf analytics --view memory --top 3
```

```text
== memory ==
┌──────────────────────────────────────────┬──────────┬───────────┬──────────┬────────────┬──────────┬────────────┬──────────────────────────┐
│ id                                       │ type     │ lifecycle │ age_days │ deliveries │ triggers │ complaints │ last_used                │
├──────────────────────────────────────────┼──────────┼───────────┼──────────┼────────────┼──────────┼────────────┼──────────────────────────┤
│ mem_20260630_mr_wolf_schema_driven_memo… │ thread   │ sleeper   │ 92       │ 0          │ 1        │ 0          │ 2026-08-25T08:49:35.952Z │
│ mem_20260630_need_incremental_indexing_… │ note     │ dead      │ 91       │ 0          │ 0        │ 0          │ -                        │
│ mem_20260630_use_decision_and_blocker_t… │ decision │ dead      │ 91       │ 0          │ 0        │ 0          │ -                        │
└──────────────────────────────────────────┴──────────┴───────────┴──────────┴────────────┴──────────┴────────────┴──────────────────────────┘
garbage: dead/base = 422/732 = 57.7%
┌───────────┬────────┬────────────┐
│ stage     │ events │ unique_ids │
├───────────┼────────┼────────────┤
│ added     │ -      │ 803        │
│ retrieved │ 144    │ 272        │
│ injected  │ 5189   │ 50         │
│ cited     │ 0      │ 0          │
│ applied   │ 0      │ 0          │
└───────────┴────────┴────────────┘
attribution: accepted 0/1 (0.0%)
```

### Tool origin

The tool ledger separates two origins with different economics:

- `script` — objects registered in the tool registry (custom scripts in `.wolf/tools/`, full register → use → expose → deprecate lifecycle). Reuse of a script saves re-creation effort.
- `model-native` — the model's own tools (MCP, built-in), which are not in the registry and are visible only through signal-log `tools` attributions and `tool_error` events. Creation economy doesn't apply; they are outside Wolf's jurisdiction. Every `mr-wolf_*` MCP tool call is itself instrumented: an `mcp_call` event with `tool_name`, `duration_ms` and `outcome` (`ok` \| `error`; `error` only when the handler throws — a textual "not found" is `ok`), plus `detail.method` (the method invoked) and `detail.wolf_version` (the runtime version from package.json, so one log can distinguish behavior across Wolf versions).

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
│ …                  │       │
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

(The weeks table shows all 8 week buckets; trimmed here. Vote strings are whatever the council actually used — including plain-language votes.)### Coordination

`--view coordination` aggregates `coord_event` signals — a coordination log written by the removed `wolf coord` command; the view reads the history (there is no writer anymore, kinds are historical data):

- **counts** — events per `kind × actor_from` pair (who initiated what);
- **recent** — the 20 most recent events: ts, kind, `from->to`, refs;
- **blockers** — open→resolve pairs by ref: `opened` is the earliest `coord --kind blocker` naming that ref, `resolved` is the first `memory.resolved` event for the referenced object at or after it; `-` means still open. A pair is closed by resolving the referenced object (in the current model — a note via `wolf transition`), not by a second coord event.

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

`--view campaign` is the A/B storefront "same task, with and without memory": runs are grouped by `campaign_id` (a top-level run-signal field written by the harness — see [Harness integration](#harness-integration)) and split into two cohorts by whether the run's session had injected memory — a `session_id` join over `memory_stage injected`, the same pattern as attribution (P2); a run with `session_id: null` lands in `no_memory`:

- **n** — cohort runs in the campaign;
- **median_weighted** — median weighted of the cohort's runs; below 3 runs the whole cohort metric row is `n/a` with note `n<3: min 3 runs` (shares are not shown on tiny samples); an empty cohort notes `no runs`;
- **accepted\_%** — share of accepted verdicts in the cohort: verdicts enter the campaign via the hidden `wolf task-eval --campaign <id>` plumbing (`detail.campaign_id`) and are cohorted by the same session join; a campaign with no verdicts at all → `n/a` with note `no verdicts`;
- **pfail\_%** — runs with `outcome !== 'ok'` / n (`processFailureRatePct` in the JSON cohort row).

The view is correlational: p-values and confidence intervals are wrong at these sample sizes — a deliberate P3 boundary. Read a cohort split as a hypothesis prompt, not a proof.

Real output (demo log: eval-01 — both cohorts at 3 runs with verdicts; eval-02 — small samples and a campaign without verdicts):

```text
== campaign ==
┌──────────┬─────────────┬───┬─────────────────┬────────────┬─────────┬─────────────────┐
│ campaign │ cohort      │ n │ median_weighted │ accepted_% │ pfail_% │ note            │
├──────────┼─────────────┼───┼─────────────────┼────────────┼─────────┼─────────────────┤
│ eval-01  │ with_memory │ 3 │ 5210            │ 100.0      │ 0.0     │                 │
│ eval-01  │ no_memory   │ 3 │ 8120            │ 0.0        │ 33.3    │                 │
│ eval-02  │ with_memory │ 2 │ n/a             │ n/a        │ n/a     │ n<3: min 3 runs │
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

### Delivery panel

`--view delivery` is the one-command view onto the delivery funnel — what gets delivered, how big it is, and whether the agent ever comes back for what was delivered. No new collectors: it aggregates delivery signals, `.wolf/router.log` (including the `ms=`/`bytes=` fields) and `.wolf/metrics/skill-invocations.jsonl`:

- **top delivered** — delivery-signal counts per `detail.name`, with the **applied%** indicator: the share of a name's deliveries that were followed in the same session by a `wolf get`/`wolf search` touching that same id (a CLI-channel join; MCP sessions have a null session id and are outside the metric). Applied% is an indicator, not a verdict — but a name with `deliveries ≥ 10` and `applied% < 10%` lands in the **highlight** line: delivered a lot, never touched — a candidate for the constitution's rot filter.
- **miss-rate by agent** — share of `variant=fallback` router lines per agent-id (a "miss" = the canonical playbook wasn't found, the universal fallback was delivered; misses are a subset of deliveries).
- **avg injection bytes** — mean injection size, two channels kept separate: `delivery_signals` (mean `detail.injection_bytes`) and `router_log` (mean `bytes=` of playbook injections).
- **router resolve ms** — p50/p90 over the router log's `ms=` field; the wave acceptance threshold (p90 < 500 ms) is checked against exactly this number.
- **skills** — invocation counters per skill name from the plugin-written skill-invocations log (see [Base Set — plugins](/guide/base-set#plugins--2--opencodeplugins)): until now, skill value was invisible.

The same numbers reach the session entry point: `wolf recap` prints a `Delivery (7d)` line — N deliveries (canonical+fallback over the last 7 days), M misses among them (the fallback share) and the top-3 miss agents. The section is omitted when there is no router log.

```bash
wolf analytics --view delivery
```

```text
== delivery ==
top delivered:
┌──────────────────┬────────────┬─────────┬───────────┐
│ name             │ deliveries │ applied │ applied_% │
├──────────────────┼────────────┼─────────┼───────────┤
│ mem_…_prefer_vt… │ 14         │ 2       │ 14.3      │
└──────────────────┴────────────┴─────────┴───────────┘
highlight (deliveries>=10, applied<10%): -
miss-rate by agent:
┌──────────┬───────────┬───────┬────────┐
│ agent    │ fallbacks │ total │ miss_% │
├──────────┼───────────┼───────┼────────┤
│ reviewer │ 3         │ 12    │ 25.0   │
└──────────┴───────────┴───────┴────────┘
avg injection bytes: delivery_signals=812 router_log=1493
router resolve ms: p50=210 p90=433 (n=57)
skills:
┌────────────┬───────┐
│ skill      │ count │
├────────────┼───────┤
│ wolf-plan  │ 7     │
└────────────┴───────┘
```

`--json` returns the same sections machine-readable (`topDelivered`, `underApplied`, `missRateByAgent`, `avgInjectionBytes`, `routerMs`, `skills`).

### Machine acceptance

`--view acceptance` is the machine-facing acceptance report — the metrics waves and CI gates are checked against, from two sources: the signal log (`mcp_call`, `delivery`) and `.wolf/router.log` (see [Telemetry](/guide/telemetry) for the raw fields):

- **router** — playbook miss-rate per agent-id from the router plugin's log: hits, misses, `miss_%`;
- **tool calls** — per tool, both channels (MCP and CLI): calls, errors, `err_%`, latency `p50_ms`/`p90_ms` (linear interpolation);
- **error classes** — error counts by `detail.error_class_id` (the deterministic classifier);
- **bursts** — delivery series per session: a burst is a group of deliveries in one `session_id` with gaps ≤ 60 s; avg deliveries per burst, max repeat-streak (consecutive deliveries of the same `detail.name`), the share of bursts with streak ≤ 2, and a separate counter for deliveries without a session;
- **search → get follow** — share of searches followed by a `get` of one of the found ids within 10 s (join by `detail.memory_id` / `detail.memory_ids`);
- **vitality** — core tool calls (`search`, `get`, `list`, `add`, `transition`, `brief`, `recap`, `create_decision`, `create_blocker`, `resolve_blocker`) in the last 72 h;
- **dataQuality** — malformed lines of the signal log.

Null metrics print as `n/a` honestly.

```bash
wolf analytics --view acceptance
```

```text
== acceptance ==
router:
┌──────────┬──────┬────────┬────────┐
│ agent    │ hits │ misses │ miss_% │
├──────────┼──────┼────────┼────────┤
│ reviewer │ 2    │ 1      │ 33.3   │
└──────────┴──────┴────────┴────────┘
tool calls:
┌───────┬───────┬────────┬───────┬────────┬────────┐
│ tool  │ calls │ errors │ err_% │ p50_ms │ p90_ms │
├───────┼───────┼────────┼───────┼────────┼────────┤
│ get   │ 12    │ 0      │ 0.0   │ 3      │ 9      │
│ …     │       │        │       │        │        │
└───────┴───────┴────────┴───────┴────────┴────────┘
error classes:
┌────────────┬───────┐
│ class      │ count │
├────────────┼───────┤
│ not_found  │ 2     │
└────────────┴───────┘
bursts: 4 (deliveries 9, avg/burst 2.3, max repeat-streak 1, streak<=2 100.0%, no-session 0)
search->get follow: 3/7 (42.9%)
vitality: core calls 72h = 18
```

`--json` returns the same sections machine-readable.

### Examples

```bash
wolf analytics --view rules --top 3
```

```text
== rules ==
┌──────────────────────────────────────────┬───────────┬─────────┬────────┬──────────────────────────────────────────┐
│ id                                       │ prevented │ checked │ silent │ title                                    │
├──────────────────────────────────────────┼───────────┼─────────┼────────┼──────────────────────────────────────────┤
│ mem_20260703_update_project_docs_after_… │ 0         │ -       │ no     │ Update project docs after every impleme… │
│ …                                       │           │         │        │                                          │
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
│ 2026-09-07 │ 11     │ 267      │ 9        │
│ 2026-09-14 │ 0      │ 0        │ 0        │
│ 2026-09-21 │ 5      │ 878      │ 8        │
│ 2026-09-28 │ 57     │ 9980     │ 30       │
└────────────┴────────┴──────────┴──────────┘
```

Delivery events are counted per session (not unique objects), so `delivers` can exceed `writes` — the table is a weekly activity count, not a conversion rate.

### Dashboard (view=dashboard)

`--view dashboard` renders the console dashboard: three sections straight to the terminal with Unicode tables and text sparklines (`▁▂▃▄▅▆▇█`) — health (L1 statuses, absolutes, current-period weekly activity), ledgers (L2 tables: memory, tools, rules, agents, open council questions, top-N) and trends (L3 sparklines over snapshots, weekly activity, cache-hit ratio, experiment readiness, council activity per week, coverage and data quality lines). The former `--tab` flag of the standalone `wolf dashboard` is gone: the view renders all three sections; `--json` returns the machine-readable `DashboardData`.

```bash
wolf analytics --view dashboard
```

```text
== health ==
rules: ✓ active=23 prevented/checked: 0/0
tools: · count=0 usage=0 economy: n/a: not enough data (tool runs: 0, total: 2, need ≥ 3 in each group)
delivery: · events=42482 triggered=34 silentRules=0 (n/a)
noise: ✗ 478/732 = 65.3%
routing: zai-coding-plan/glm-5.2: tasks=2 median=21368
totals: runs=2 weighted=42736
```

Console-only by design: the dashboard renders to stdout and writes no files; the HTML storefront was deliberately deferred (an optional flag may appear when there is demand).

### Effectiveness (view=effectiveness)

`--view effectiveness` prints the memory effectiveness panel — rules holdout, tool economy, delivery, noise, routing (aggregation only, no LLM). The `--snapshot` flag serializes the full report and appends it to `.wolf/metrics/effectiveness-snapshots.jsonl` (append-only history for trends).

A plain call prints the panel; once at least one snapshot exists, it also prints a delta versus the latest snapshot (`delta vs <ts>` over the numeric fields of each block).

The panel ends with an absolutes block: run and process-failure counts (`processFailures`), weighted and raw token sums, cache-hit ratio, average duration, and per-model `costPerCompletedRun` (`$cost / completedRuns`). `$` fields appear only when `pricing` is configured (see [Configuration](#configuration)).

```bash
wolf analytics --view effectiveness
```

```text
effectiveness panel (mileage aggregation, no LLM):
rules: active=23 | prevented/checked: 0/0
tools: count=0 | usage=0 | economy: n/a: not enough data (tool runs: 0, total: 2, need ≥ 3 in each group) [INFO]
delivery: events=42482 | triggered=34 | silentRules=0 (not enough delivery data)
noise: 478/732 = 65.3% [BAD]
documents: 0 (registered refs, not part of the noise metric) [INFO]
archived: 71 (outside the noise metric) [INFO]
routing: zai-coding-plan/glm-5.2: tasks=2 median=21368
totals: runs=2 processFailures=0 weighted=42736 cache=n/a avg=n/a
cost: n/a (no pricing configured)
model zai-coding-plan/glm-5.2: runs=2 processFailures=0 cost=n/a cost/completedRun=n/a
thresholds: noise ok<20 warn<=40 bad | silent ok<30
```

### Hidden synonyms (deprecated)

The former standalone analytics commands still work but are hidden (not in `--help`) and will be **removed in 2.15**:

| Old command          | Maps to                               |
| -------------------- | ------------------------------------- |
| `wolf insights`      | `wolf analytics --view readiness`     |
| `wolf effectiveness` | `wolf analytics --view effectiveness` |
| `wolf dashboard`     | `wolf analytics --view dashboard`     |

Each hidden synonym prints one stderr notice and then runs the mapped view:

```text
[wolf] 'effectiveness' is deprecated since 2.13 and hidden: it now maps to "analytics --view effectiveness"; it will be removed in 2.15
```

Hidden plumbing (alive, not deprecated, for scripts only): `wolf task-eval` records task verdicts (`task_evaluated`) that feed acceptance metrics, coverage and campaigns.

## Coverage, acceptance and data quality

`wolf analytics` (end of `--view all`; the `dashboard` view repeats them in the trends section) prints data-honesty lines. Real output:

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

Wrapper and plugin authors can write v2 events into the signal log (`.wolf/metrics/session-metrics.jsonl`) and get first-class analytics. The essentials:

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

**v2 identity fields** (all optional — but the fuller, the richer the cross-run analytics):

| Field            | Type / form            | Semantics                                                       |
| ---------------- | ---------------------- | --------------------------------------------------------------- |
| `event_id`       | uuid                   | unique event id; duplicates are detected by data-quality v2     |
| `schema_version` | `2` (literal)          | schema version; absent = read as v1                             |
| `run_id`         | uuid                   | id of the run — the task's chain                                |
| `trace_id`       | uuid                   | trace: groups the runs of one task (harness-supplied or a uuid) |
| `parent_span_id` | string                 | parent span (reserved; the span model is planned for P2)        |
| `role_level`     | `L0` \| `L1` \| `L2`   | writer's role level by the actor convention                     |
| `attempt`        | number                 | retry number within the run                                     |
| `task_id`        | string                 | shared task id                                                  |
| `config_hash`    | sha256, first 12 chars | signature of `.wolf/config.yaml` at run time                    |
| `prompt_hash`    | sha256, first 12 chars | signature of the prompt text                                    |
| `tools`          | `string[]`             | tools of the run — feeds the tool economy                       |

`campaign_id` is the campaigns' grouping key — see [Campaigns](#campaigns).

**role_level follows the actor convention**: L0 — coordinator (dispatch and acceptance; the human owner sits here at acceptance), L1 — lead/reviewer, L2 — worker/executor. Default: omit the field.

**`WOLF_SESSION` ties the auto-writers to the session**: the automatic `memory_stage` writers (`wolf search`/`get` → `retrieved`, `wolf brief`/`call` → `injected`) take the session id from the `WOLF_SESSION` env var — the symmetric twin of `WOLF_ACTOR`. A harness that exports `WOLF_SESSION` when an agent session starts gets its `injected` events joined with `task_evaluated` by `session_id`, so attribution sees auto-path injections; without the env the events are written with `session_id: null` and do not participate in attribution.

Mechanics: append via `appendSignal(baseDir, event)` (or append a JSON line + `\n`); unknown fields are stripped by the Zod schema on read, records without `schema_version` are read as v1. Duplicate `event_id`s are deduplicated by analytics (first copy wins, repeats surface as `duplicateEventRatePct`). A telemetry failure must never break the wrapped call — keep it in try/catch.

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

## MCP

Analytics is CLI-only since 2.13: the former `analytics` MCP tool was removed (the remaining MCP tools are the core set — `search`, `get`, `list`, `add`, `transition`, `brief`, `recap`). For machine-readable output use `wolf analytics --json`.

## Limitations

- `$` fields are hidden unless `pricing` is configured — prices come from the owner, never from the code.
- `holdout_prevented` counters are cumulative (no timestamps), so prevented counts are not part of the weekly activity view; they surface as totals in the rule ranking.
- `--view dashboard` is read-only: it renders to stdout and writes no files; the HTML storefront is deferred by design.
