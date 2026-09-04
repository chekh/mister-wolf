# Changelog

All notable changes to this project are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Memory lifecycle, attribution and coordination events (P2, spec `docs/superpowers/specs/2026-09-04-p2-lifecycle-attribution-design.md`):
  - `memory_stage` signal event (`detail.stage`: `retrieved`|`injected`|`cited`|`applied`, `detail.memory_ids: string[]` non-empty): auto-writers in `wolf search`/`get` (retrieved, ids from the result set) and `wolf brief`/`call` (injected, ids of delivered injections; no event when empty); new CLI `wolf memory-stage --stage <s> --ids <id,...> [--actor <a>] [--session <id>]` for external actors (cited/applied — harness responsibility). Telemetry failures never break the wrapped command; `WOLF_SESSION` env links auto-writers to the agent session (attribution key, symmetry with `WOLF_ACTOR`).
  - `coord_event` signal event (`detail.kind`: `handoff`|`review`|`acceptance`|`blocker`|`escalation`, `actor_from`, optional `actor_to`, `refs`, `note`): new CLI `wolf coord --kind <k> [--from a] [--to b] [--ref id,...] [--note s]` for all orchestration levels.
  - `mcp_call` signals now carry `detail.wolf_version` (runtime version from package.json, single cached read).
  - `wolf analytics --view memory`: memory lifecycle funnel added→retrieved→injected→cited→applied (events + unique ids per stage, `appliedUniqueIds`) and attribution — `attributionCoveragePct` = share of accepted `task_evaluated` verdicts preceded by an injection in the same `session_id` (honest `null` + reason when data is missing).
  - `wolf analytics --view coordination` (CLI and MCP): counts kind × actor, 20 most recent events, blocker open/resolve pairs by refs; payload of `--view memory` extended additively with funnel + attribution.
  - Docs: signal-log guide (event schemas, live examples), analytics guide + site (EN/RU) cover the two new views, new `docs/guide/harness-integration.md` — how harness actors record cited/applied and coordination events.

### Changed

- `wolf brief` use-case now returns `injectedIds` (ids of all sections rendered into the brief) alongside the content.

## [2.6.1] — 2026-09-04

### Added

- End-to-end telemetry identity (P1, spec `docs/superpowers/specs/2026-09-04-p1-telemetry-identity-design.md`):
  - `SignalEventSchema` v2: optional identity fields on every signal — `event_id` (uuid), `schema_version: 2`, `run_id`, `trace_id`, `parent_span_id`, `role_level` (L0/L1/L2), `attempt`, `task_id`, `config_hash`, `prompt_hash`, `tools: string[]`. Records without `schema_version` read as v1 (upcast on read, history is never rewritten); unknown fields are stripped by Zod.
  - `wolf run` writes v2 fields into the run signal: generates `event_id`/`run_id` (uuid), `trace_id` (uuid or new `--trace-id`), `attempt` (new `--attempt`), `config_hash` = sha256(`.wolf/config.yaml`).slice(0,12), `prompt_hash` = sha256(prompt).slice(0,12), `tools` from `--tool`; `--task-id` is promoted from experiment-only to a general flag (always written when passed).
  - `mcp_call` signal event (P1 D5): the `registerMemoryTools` wrapper logs every `mr-wolf_*` tool call with `tool_name`, `duration_ms`, `outcome: 'ok'|'error'`, `detail.method`; telemetry failures never break the wrapped call.
  - `dataQuality` v2 in the analytics report: `duplicateEventRatePct` (duplicates by `event_id`; the second copy never reaches analytics), `unknownModelRatePct` (runs with modelID null/'unknown'), `pricingCoveragePct` (runs with tokens priced / all runs with tokens; null without pricing), `completeTraceRatePct: null` with `completeTraceRateReason` (span model planned P2). `wolf analytics`/`wolf dashboard` print the new lines.
  - Docs: signal-log guide covers schema v2 and `mcp_call`; new "Harness integration" section in the analytics guide and on the site (EN/RU) — how wrapper/plugin authors write v2 events.
- New `wolf migrate run-log`: archives the legacy `.wolf/run-log.jsonl` to `.wolf/metrics/archive/run-log-<date>-legacy.jsonl` (local date, collision → next free `-2`/`-3` suffix, pure rename with a streamed line count in the report) so analytics stops double-counting old runs; idempotent — no legacy file → `nothing to migrate`, exit 0.

### Changed

- Tool economy and routing (`tool stats` economy, `analyzeEconomy`, effectiveness routing block, analytics outliers and model-native tool ledger) now run on the signal log as the canonical source; the legacy `.wolf/run-log.jsonl` is still read and merged (simple concatenation, no dedup) during the transition window — medians are invariant to the symmetric duplication, run counters may overcount until the window closes.

### Breaking

- `wolf run` no longer writes `.wolf/run-log.jsonl` (P1 D4: single canonical signal log; `verdict_pending` is not carried over — use `wolf task-eval`). Existing run-log history remains readable for analytics; run `wolf migrate run-log` after upgrade to archive the legacy file and stop the double count.

### Fixed

- e2e telemetry tests updated for signal-only source (v2.6.0 publish blocker): `analytics.e2e` asserted against `.wolf/run-log.jsonl`, which `wolf run` no longer writes — run assertions now target the canonical signal log (`session_id`/`arm`/`task_id` coverage preserved); `migrate doc-ids` e2e fixture made deterministic (live playground memory is copied only when it still contains `doc_*` ids, otherwise the synthetic seed is used — local/CI parity).

## [2.5.0] — 2026-09-04

### Added

- Task verdicts (P0 analytics honesty, spec `docs/superpowers/specs/2026-09-04-p0-analytics-honesty-design.md`):
  - New signal event `task_evaluated` (`detail.verdict accepted|rejected|partial|inconclusive`, `detail.scorer human|deterministic|llm_judge|hidden_tests`, optional `criteria_passed`/`criteria_total`/`critical_failure`/`note`, linked by `session_id` and/or `detail.task_id`).
  - New CLI command `wolf task-eval --verdict <v> [--scorer <s>] [--session <id>] [--task-id <id>] [--criteria-passed N --criteria-total M] [--critical-failure] [--note <text>]` — human/L0 verdict writer.
  - `acceptance` block in the analytics report: `accepted` (strict session-link: only accepted verdicts with ≥1 run signal sharing the `session_id`) and `costPerAcceptedTask` (`sumWeighted` of linked runs ÷ accepted; `null` without data).
  - `coverage` block: `scoredTaskRatePct` = `task_evaluated` / `run` signals; `wolf analytics`/`wolf dashboard` print `coverage: partial — scored X/Y (Z%)` when coverage is below 100% (interim denominator, honest one lands in P1).
  - `dataQuality` block: `validEventRatePct` / `malformedLines` from the signal log; malformed lines are counted, never silently dropped, and never crash analytics.
  - Signal log is now validated by a Zod schema (`SignalEventSchema`): unknown fields are stripped, invalid lines increment `malformedLines`. New API `readSignalLog()` returns events + counters; `readSignals()` is unchanged for existing callers.

### Changed

- **BREAKING** (semantics-honest metric names, release v2.5.0): analytics JSON and text renames — `successes` → `completedRuns`, `failures` → `processFailures`, `failureRatePct` → `processFailureRatePct`, `costPerSuccess` → `costPerCompletedRun`; report section/field `funnel` → `weeklyActivity` (CLI `--view weeklyActivity`, MCP enum, header `== Weekly activity ==` without W->D/D->T columns). Existing snapshots with old field names still parse (lenient reader) but produce one-time delta noise.
- Docs: analytics/effectiveness guides and site analytics pages (EN/RU) updated to the v2.5.0 metric names; new sections for `wolf task-eval` and coverage/acceptance/data quality (examples from live runs).

## [2.4.0] — 2026-09-04

### Added

- Council analytics: `wolf analytics --view councils` (also included in `--view all`, `--json`, and the MCP `analytics` tool) — council questions (total / in-window / open), opinions per question, participation by author, vote distribution, synthesis rate with median question→synthesis time, and weekly activity. Zero new signal collectors: pure aggregation over the memory store and relation log.
- `wolf dashboard`: open council questions table in Ledgers and council activity sparklines in Trends.
- Docs: Councils section in the analytics guide (manual + site EN/RU).

## [2.3.2] — 2026-09-04

### Fixed

- Publish workflow E2E no longer times out: the REAL `npx -y <tarball> init` test hung >240s on CI (twice, run 33847380163) because npm 10 blocks on the security-audit request (`POST /-/npm/v1/security/advisories/bulk`) during install — tarball fetches take 2–3s each, the audit POST stalls for minutes (57s measured on npm 11, >330s on npm 10.9/linux; killed with empty stderr → `status: null`). The test's isolated env now disables npm audit/fund requests (`npm_config_audit=false`, `npm_config_fund=false`): behaviour-irrelevant network variance removed instead of raising the timeout. Regression guard of 1.0.1 fully preserved (real npx still installs and runs the tarball; MCP config NOT written, `.wolf/` created, npx try-out warning shown). Cold-cache e2e: 39s for the whole distribution file (was: unbounded hang).

## [2.3.1] — 2026-09-04

### Fixed

- Text render of `wolf analytics` now applies `--class/--type/--origin/--agent/--silent` (previously only `--json`/MCP did); the `all` view filters each section too.
- `wolf dashboard` / `wolf analytics` table borders now align with columns: one shared table generator computes column widths once (visual width aware: `…`/`✓` narrow, CJK wide; cells >40 chars clipped) and builds rows and borders from the same widths — no more cumulative 1–2 char drift per column.
- Dashboard trends show `n/a (need ≥2 snapshots)` instead of blank sparkline values.
- Funnel ratios above 100% render as `×N.N` multipliers (delivery events are per-session, not unique objects); columns relabeled `W->D`/`D->T`.
- `wolf analytics --weeks/--top` values parse base-10: commander passed the numeric default as `parseInt` radix, so `--weeks 8` became `NaN` (empty funnel) and `--weeks 10` silently meant 8.

## [2.3.0] — 2026-09-03

### Added

- Effectiveness analytics system (spec `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md`):
  - `wolf run` now records a raw token breakdown (`input`/`output`/`cache_read`), wall-clock `duration_ms`, and optional experiment primitives (`--experiment`, `--arm wolf|baseline`, `--task-id`) into both the run log and the signal log; existing records stay compatible.
  - `wolf effectiveness --snapshot` — append-only report snapshots (`.wolf/metrics/effectiveness-snapshots.jsonl`); regular runs print a numeric delta against the last snapshot.
  - Absolute totals block in `wolf effectiveness`: runs/failures, weighted and raw token sums, cache-hit ratio, average duration, per-model cost-per-success, and optional `$` conversion via `pricing` in `.wolf/config.yaml` (hidden when no pricing is configured).
  - Weekly memory-mutation dynamics in `wolf insights` (activity view).
  - `wolf analytics` — entity ledgers and funnel: memory ledger with lifecycle classes (NEW/SLEEPER/WORKHORSE/DEAD) and an age-aware garbage ratio; tool ledger splitting `script` vs `model-native` origin with expose/register promotion candidates; rule ranking by holdout-prevented with silent rules; weekly write→deliver→trigger funnel; agent ledger (volume, failures, tool errors, complaints, holdout-prevented by author); steward view (mutations by actor, complaint funnel with SLA breaches, recidivism, churn); top-N costly runs; experiment readiness. Filters: `--view`, `--class`, `--type`, `--origin`, `--agent`, `--top`, `--weeks`, `--json`.
  - MCP tool `analytics` returning the same JSON as `wolf analytics --json`.
  - `wolf dashboard` — console dashboard (Unicode tables, text sparklines, ✓/!/✗/· statuses): Health / Ledgers / Trends sections with `--tab`, machine-readable `--json`; no files written.
  - Docs: new `docs/guide/analytics.md`; `docs/guide/signal-log.md` documents the new run-event fields.

## [2.2.1] — 2026-09-03

### Changed

- All wolf user-facing output is now English (CLI, MCP tool text, help); Russian remains in code comments/internal dev docs (bilingual policy: EN primary).

### Added

- english-surface gate in `npm run check`.

## [2.2.0] — 2026-09-02

### Added

- `wolf upgrade` — self-update of the global install: compares the installed version against the npm registry, installs the update via npm, and refuses dev/linked copies with a one-line remediation hint; `--check` only reports the latest available version without installing.

## [2.1.0] — 2026-09-02

### Changed

- Document-ref ids follow the memory canon `mem_<YYYYMMDD>_doc_<slug>_<hash8>` (was `doc_<path-tokens>`): no path pseudo-tokens in ids, no residual FTS noise; existing `doc_*` objects keep working and can be migrated explicitly.
- New `wolf migrate doc-ids` (dry-run by default, `--apply`): renames off-canon document-refs, rewrites every reference to the old id across memory (frontmatter, bodies, relations, supersede chains, thread pointers) and rebuilds the search index; `wolf scan` prints a reminder when off-canon ids are detected.

### Fixed

- F5: init log lists skills as `[skill] <name> → <path>` instead of N faceless `SKILL.md created` lines.
- F6: init platform lines name the actual config file and keys (`opencode.json: written (mcp.wolf, default_agent=mr-wolf, subagent_depth=2)`); every `skipped` carries a reason.
- F16: vitest runs are isolated from the global registry (`XDG_CONFIG_HOME` per-run tmp via `tests/setup.ts`) — `npm run check` no longer leaves dead entries in `~/.config/wolf/projects.yaml`.
- `wolf list --type document` resolves the deprecated alias to `document-ref` with a stderr warning (exit 0); unknown types exit 1 with the closest match and the list of valid types.
- Recreate-guard: `init --recreate` in a removed working directory exits with a one-line `Error: ...` (code 1) instead of a raw `uv_cwd` stack.

## [2.0.1] — 2026-09-01

### Fixed

- F13: removed working directory (`uv_cwd` ENOENT) now exits with a one-line `Error: ...` and code 1 instead of a Node stack trace.
- F14: bench runs are isolated from the global registry (`XDG_CONFIG_HOME` on a tmp dir) and clean up their `wolf-bench.*` leftovers on exit (`trap`).
- F15: `wolf init` writes `subagent_depth: 2` into `opencode.json` — the three-level scheme (Mr.Wolf → executor-lead → workers) works out of the box.
- Micronits: port comment clarified; onboarding-signal spec now keys on the bootstrap fact, not thread closure.

## [2.0.0] — 2026-09-01

### Breaking Changes

- Non-interactive `wolf init` (no TTY) now fails without an explicit `--model` — pass `--model` and `--platform` in scripts and CI.
- Model pins removed from rendered agents: models are set at `init` time (routing object, referenced as `{{model.*}}` in templates).
- `wolf init` no longer runs a full project scan — scanning moved to `wolf bootstrap`.

### Added

- Onboarding pipeline v2: first-session dialog policy in `AGENTS.md`, init report, explicit platform/model selection (flag > TTY prompt > documented default).
- Complaint loop v2: `complaint` memory type, triage, SLA, `wolf update` whitelist, anti-spam guard.
- FTS search (variant D): tokenized queries, `field:` allowlist, AND/OR operators, no silent zero-result fallbacks.
- `scripts/playground-reset.sh [--ref]` — snapshot an arbitrary git ref into the playground.

### Fixed

- F4: `opencode.json` with `mcp.wolf` and `default_agent` is written by the first init run (explicit platform choice instead of silent detection).
- F5/F6/F7: init output lists relative file paths, honest `skipped` reasons, and a next-steps block naming `opencode.json`/MCP and bootstrap.
- F8: init no longer scans the project ("foreign memory" issue) — the full scan lives in `wolf bootstrap`.
- F11: recap includes `accepted` rules alongside `active` ones.

## [1.1.0] — 2026-09-01

### Added

- Base sets: `wolf init` renders starter agents (6), skills (13), commands (3) and plugins (2) from templates bundled inside the npm package, and seeds 6 base playbooks.
- `wolf sync` — stamp-based re-rendering of base-set files with conflict/orphaned detection.

### Fixed

- Rendered plugin single-export contract, procedural complaint trigger, and `--title` flag in the complaint command (dogfood phase C fixes).

## [1.0.3] — 2026-08-31 (1.0.2 пропущен — тег создан до фикса e2e-allowlist, не публиковался)

### Changed (Docs)

- English product surface — README, CHANGELOG, SECURITY, package description (Russian stays internal).
- Community standards files: Code of Conduct, CONTRIBUTING, issue/PR templates.

## [1.0.1] — 2026-08-31

### Fixed

- `isNpxRun` accepts `npm_command='exec'` (real npx) instead of only `'npx'` — `npx mister-wolf init` no longer writes MCP configs against the try-out spec (4ac8168).

## [1.0.0] — 2026-08-31

First public release on npm.

### Added

- The `mister-wolf` npm package with the `wolf` binary (`npm install -g mister-wolf`).
- `wolf init` — idempotent non-interactive project initialization: `.wolf/` skeleton without overwriting existing files, platform auto-detection, MCP configs via opencode and Claude Code adapters, `--platform` flag.
- `npx mister-wolf init` — installation-free try-out: creates project memory, never writes MCP configs.
- Lazy schema migration: a `schema_version` marker in `.wolf/config.yaml`, a guard on entry (CLI/MCP), migration with a backup under a lock file.
- `wolf doctor` — health of registered projects: schema versions, config validity, dead registry entry cleanup.
- Publish pipeline: trusted publishing (OIDC) + provenance, `check`+`e2e` before publishing, tag↔version sanity check.
- README (agent-first: three-command install, typosquat warning) and SECURITY.md.

### Fixed

- Normalized the bin path in `package.json` — `npm publish` stripped the binary from the package (2cb1d05).

[Unreleased]: https://github.com/chekh/mister-wolf/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/chekh/mister-wolf/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/chekh/mister-wolf/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/chekh/mister-wolf/compare/v1.0.2...v1.0.3
[1.0.1]: https://github.com/chekh/mister-wolf/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/chekh/mister-wolf/commits/v1.0.0
