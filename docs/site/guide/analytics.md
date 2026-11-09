# Understand how your organization works

Analytics helps inspect actual activity: what was delivered to agents, what was accepted, which tools were reused and what changed through the Steward. It supports project decisions; using Wolf does not require running a benchmark program.

Start with a question rather than every available metric:

| Your question                                     | Command                                   |
| ------------------------------------------------- | ----------------------------------------- |
| What is happening across the project?             | `wolf analytics --view dashboard`         |
| What has the Steward changed?                     | `wolf analytics --view steward`           |
| Was memory retrieved, delivered or applied?       | `wolf analytics --view memory`            |
| Which skills and faces were delivered?            | `wolf analytics --view delivery`          |
| Where did handoffs or blockers occur?             | `wolf analytics --view coordination`      |
| Are tool calls and delivery behaving as expected? | `wolf analytics --view acceptance --json` |
| Which tools are reused?                           | `wolf tool stats`                         |

These commands aggregate local logs and memory deterministically. They do not ask an LLM to invent a score. Missing data is reported as `n/a` with a reason where the metric requires it. A console dashboard is not a web dashboard.

## Read the outcome, not just activity

Finishing a run is different from delivering an accepted task. Record a verdict against the actual acceptance criteria, with the real task and session identity when available:

```bash
wolf task-eval --verdict accepted --task-id docs-navigation \
  --session docs-session --scorer human \
  --criteria-passed 3 --criteria-total 3 \
  --note "Installation, navigation and EN/RU content checked"
```

This is an illustrative recording example, not a test result from your project. Use `partial`, `rejected` or `inconclusive` when appropriate. The scorer must identify who actually evaluated the result.

A recorded verdict does not itself verify the artifact. Keep the underlying checks and acceptance evidence with the task. Task coverage is distinct from run count; a high activity count does not establish useful progress.

## Sources and interpretation

| Data                                     | Local source                                       |
| ---------------------------------------- | -------------------------------------------------- |
| Calls, delivery, usage and task verdicts | `.wolf/metrics/session-metrics.jsonl`              |
| Face routing decisions                   | `.wolf/router.log`                                 |
| Skill invocation records (only with the optional router plugin) | `.wolf/metrics/skill-invocations.jsonl`            |
| Memory objects and their changes         | `.wolf/memory/`, `events.jsonl`, `relations.jsonl` |
| Effectiveness snapshots                  | `.wolf/metrics/effectiveness-snapshots.jsonl`      |

See [Telemetry](/guide/telemetry) for event fields, usage imports and session identity. Receiving memory is different from citing or applying it; [Harness integration](/guide/harness-integration) explains recording these later stages.

Cost estimates come from raw OpenCode usage and sessions (`opencode.db`); since 3.0.0 there are no skill counters — their absence does not mean the calls did not happen. Comparisons need both windows of the measurement protocol; the "after" window is not collected yet, so no effect results exist to publish. Cost figures still require configured pricing and suitable usage records. A missing model, missing tokens or unknown session join is a data-quality limitation, not zero cost. `weighted = input + 0.1 × cache_read + 5 × output` is a fixed token-weight heuristic, not a provider invoice.

The Steward view includes complaint outcomes and lesson aggregation. Compare counts with actual changes and their applicability: a closed complaint alone does not prove that a corrected methodology reached a later session or improved its behavior.

## Optional comparisons

Campaigns can group runs and verdicts with `--campaign`. Memory attribution associates delivered objects with session outcomes. These are observational comparisons: different tasks, models or session conditions can explain a difference. An association is not evidence that Wolf caused the improvement.

Keep campaign arms in separate sessions, label the evaluation method and inspect sample size and missing data. Small or incomplete cohorts produce `n/a` where a metric cannot be calculated. You can use practical examples and your own project observations without making universal savings claims.

The detailed reference retains view fields, lifecycle classes, thresholds, snapshots, JSON structure, pricing and campaign joins: [Analytics CLI](/guide/cli/analytics). Tool reuse calculations are explained in [Accumulated tools](/guide/tool-economy).
