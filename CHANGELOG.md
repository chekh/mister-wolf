# Changelog

All notable changes to this project are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [2.15.2] - 2026-10-09

### Changed — expert revision of the skill set + governance consistency

- All 18 base skills rewritten per the 2026-10-09 external expert review, integrated with the owner-approved point-by-point verdicts: process routing map; FULL/LITE/FIX process scaling with a misclassification escalation protocol (the mode is changed only by L1; "approved scope" does not block escalation); deterministic triggers for mandatory process skills (wolf-brainstorm on new needs, wolf-debug on unexpected behavior, verification-before-completion on completion claims) plus a break-glass rule: "if in doubt whether a skill applies — load and check; you are not obliged to use an unfitting skill."
- Review contracts: verdicts bound to artifact revision; review-budget exhaustion yields UNRESOLVED (never approval); INCONCLUSIVE where inputs are missing; conditional security/trust lens whose start/skip decision is recorded in review.md.
- Execution discipline: TDD keeps RED-before-GREEN for new behavior and bugfixes, allows characterization tests for existing behavior, and treats code-first for new behavior as a documented deviation routed through test-quality review (DONE_WITH_CONCERNS minimum); verification switches to freshness-based evidence (revision + dirty-state digest), the receiver cross-checks evidence revision before the verdict, and "an executor's report is not proof" is restored as a red flag; git operations consolidated at L1 (workers never commit).
- Governance consistency: worker-reviewer playbook v2 (narrow lens mandates instead of forced six zones, unified Critical/Major/Minor scale, APPROVED/CHANGES_REQUIRED/INCONCLUSIVE, "mark out-of-mandate findings, don't stay silent"); worker-implementer playbook (task_id, RESULT statuses DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED, EVIDENCE contract, commits stay at L1); L0 frame acceptance tied to ACCEPTANCE criteria and fresh evidence; L2 reviewer frame aligned (INCONCLUSIVE + mark-don't-silence); common contracts and the assigned methodology delivered in lead briefs.
- Delivery truth: "highest version" resolution wording replaced everywhere with the actual mechanism (current non-superseded playbook via `--hide-superseded`, owner_skill guard, universal plugin fallback — router tests green); the session-start plugin injection synced with the new using-skills (the old 1%-rule body removed); worktree memory documented as task-local (`.wolf/` resolves from cwd; state moves via wolf-handoff, not shared directories); AGENTS.md taxonomy fixed (`--type blocker` → thread with a blocked status per the actual CLI) and CLI paths corrected.
- Tests: guard/render tests re-anchored to new-edition invariants (conveyor-skills-guard, intake-skill-guard, base-set-init, plugin-injection); full `npm run check` green; E2E suite green (46 files / 182 tests).

### Upgrade notes

- Migrations: none. Frames, playbooks and skills in initialized projects update via `wolf sync` with this release. Seeded playbook copies inside Wolf memory (for example, the lens playbook v1) are superseded by the shipped files; re-sync them through the Steward on the next mutation cycle.

## [2.15.1] - 2026-10-09

### Changed — positioning: a permanent project organization, not a memory utility

- Site and README reframed around the organization concept (concept v3.3.1): agents are temporary, the project's organization (roles, processes, memory, learning loop) is permanent. Hero copy replaced with the approved messaging; the slogan "But first, I remember" removed everywhere; statement is now the clean quote "I'm Mr. Wolf. I solve problems."
- New guide page `Organization & Council` (EN+RU): L0/L1/L2 roles and prohibitions, the working cycle (goal → brief → plan → execute → report → accept → checkpoint), acceptance by verifiable artifacts, Council honestly stamped DESIGNED (runtime on the roadmap), status-stamp legend linking to maturity.md.
- Site structure: `router.md` renamed to `delivery.md` ("Delivery: Frames, Faces & Trust" — frame/face/mutator model, three delivery channels, router mechanics preserved, trust invariant as design intent); `feedback.md` retitled "Learning Loop" and absorbs the Steward aggregation page as a section (mutation proven in PoC #3, effect target/validating E1d); `core-concepts.md` removed as a page — lifecycle matrix, governance axes and injections moved into appendices of `memory.md`, which is now the single source of the taxonomy.
- Fact hygiene: "25 object types / 16 statuses" claims replaced with the code truth (7 core types + facets; 18 lifecycle statuses in the union, `blocked`/`waiting_answer` thread-specific); README Problems table extended with P7–P9 (self-checking agent, repeated mistakes, quality decay) and the Organization subsection added to Features; the router `--type playbook` contradiction resolved against the actual plugin code (playbooks are notes with `facet: howto` + `owner_skill`).
- Site meta (title/description/og/twitter) switched to the organization positioning, EN with RU-locale mirror.
- maturity.md factual sync: `tool` type exists since 2.13 (Tool registry I1→I2, Pillar 3 profile updated); Council memory schema row corrected — council-* are deprecated aliases (note + facet: context) since the 7-type taxonomy.

### Upgrade notes

- Migrations: none. Removed site pages (`core-concepts`, `steward`, `router`) redirect by structure: memory appendices, Learning Loop (feedback) and Delivery pages; sidebar updated in both locales.

## [2.15.0] - 2026-10-08

### Added — artifact pipeline & skill intake (wave 2.15)

- `wolf scaffold artifact <slug>`: creates a feature folder `docs/dev/<date>-<slug>/` with requirements/design/plan/test-plan templates; profiles `full` and `--fix`.
- `wolf sync` generates `docs/dev/INDEX.md` (feature table with a "Waves" column) and per-part `_index.md` files; idempotent.
- `wolf doctor` gains a `## Artifacts (docs/dev)` section — pipeline lint: duplicate REQ/NFR ids, broken links, REQ without AC/Source, `[НЕОПРЕДЕЛЕНО]` in approved docs, CR without downstream, downstream status resets, requirement/roadmap duplicates, readiness, ghost skills.
- Pipeline skills: `wolf-design` and `wolf-testplan` (new); `wolf-brainstorm`/`wolf-plan`/`wolf-review` v2 with artifact inputs/outputs; `wolf-sdd`/`wolf-execute` gain checkboxes + test-plan validation; disciplinary axis: `receiving-code-review`, `writing-skills` (seed) plus a revision of TDD/verification/worktrees/finishing skills.
- Skill intake: `wolf-skill-intake` skill + tool fields `owner_skill`/`version`/`source_url` for registering external skills in the tool registry.
- Docs (EN+RU): artifact-pipeline and skill-intake guides, roadmap migrated to `docs/dev/roadmap/`, legacy wave folders frozen.

### Upgrade notes

- Migrations: none.

## [2.14.1] - 2026-10-07

### Fixed — OpenCode v2 compatibility

- Plugin templates (`wolf-router.ts`, `wolf-session-start.js`) now support both OpenCode v1 and v2 from one file: v1 hook registrations are preserved unchanged; v2-native hooks (`ctx.session.hook("context")`, `ctx.tool.hook("execute.before")`, dual entry shape `{id, setup, server}`) are added, because v1 implementations do not run in v2.
- `wolf init` detects the installed OpenCode version (`opencode --version`, 5s timeout, read-only): `< 1.18.29` → warning with v1 fallback (config still written); unparseable output → warning, init continues; absent CLI → legacy v1 behavior unchanged. Only the OpenCode branch is affected — other platforms and npx are untouched.
- Container smoke harness `tests/container/opencode-v2/` (Docker Node 22; pinned `opencode-ai@1.18.35` / `@opencode/cli@2.0.24`; isolated HOME; read-only repo mount; host-config hash checked before/after): hooks verified to fire in both v1 and v2.

Supported OpenCode range: v1 ≥ 1.18.29 and v2 (tested against 2.0.24).

## [2.14.0] - 2026-09-30

### Fixed — data integrity (first complaint in the new loop)

- `add` no longer silently overwrites a memory on id collision: a deterministic id that already exists fails with an actionable hint (`edit` / `supersede` / different title). Every overwriting save now writes a `memory.overwritten` audit event **before** the write (store-level safety net; fixes the same-title silent-loss defect reported through the new complaint loop).

### Added — steward loop (owner-approved design)

- Complaint classification `kind` (technical / behavioral, heuristic by `about`); recap shows "complaints without outcome"; behavioral complaints escalate to Steward for playbook mutation from the executor-lead frame.
- `outcome` / `outcome_of` relation predicates: every resolved complaint links to what it produced (rule / lesson / rejection / deferral).
- Steward-aggregator: detector of mature unaggregated lessons (3 lessons / 7 days per class), recap and call banners, `wolf aggregate apply` (hidden; transactional with completion-on-retry, idempotent): archives source lessons, creates the generalized one, links `aggregates`, emits `memory.aggregated`. "Redistribution, not layering" — the aggregate replaces sources in delivery; two-step confirmation through memory.
- Class decay metric in `analytics --view steward`: new lessons/complaints of a class before vs after aggregation.
- Coordinator and Steward frames carry the loop protocol (cycle-end trigger → call Steward; aggregation recipe with was/became/why).

### Added — projects & hygiene

- `wolf projects`: registry list with computed stats (version, activity, memory size) — the registry as a phone book for finding projects and statistics.
- Doctor hygiene: automatic sandbox pruning, ghost detection (wolf markers without memory — and vice versa), registry self-healing.

### Upgrade notes

- One behavior change: `add` with a colliding deterministic id now fails (previously: silent overwrite). No migration needed; everything is additive.

### Removed — the big diet

- `wolf coord`, the whole `run`/model-routing/RCT experiment family, `memory-stage` (manual producer of an automatic event), council CLI, session-checkpoint, and the learn conveyor (digest/propose/validate/activate/decay/pattern-detection/evolve) — zero confirmed usage across all observed projects (owner decision 2026-09-29; lessons are written by executor-leads, aggregation moves to Steward in 2.14). ~5,600 lines removed.
- Manual type namespaces (`decision add`, `thread create`, …) — replaced by generated commands; `create` is removed immediately (decision: no alias period): every `create_*` path answers with an actionable hint to use `add`.
- Dead code: `prune()`, `artifact_sources`, run-log, orphaned stop-gate; playbook `wolf-review-lenses` (unreachable by router construction).
- Config noise: the 570-line `memory_types.core` dump is gone — replaced by a `wolf_version` stamp; legacy configs with the dump still validate (drift check intact), and the config round-trip no longer silently drops pricing/learning/analytics sections.

### Changed — taxonomy: 7 types + facets (owner-approved)

- Data model: `rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note` (new universal type). 19 types collapsed into `note` + facet; `blocker`/`info_request`/`question` become `thread` statuses (`blocked`/`waiting_answer`/`open`).
- Facets: closed vocabularies (first: character — howto/pitfall/context/metric/history/legacy/constraint), picked from a list on `add` — free-form input is rejected with a hint; ANSI facet colors in list/search/call (auto-off for non-TTY/agents, `WOLF_NO_COLOR`).
- Alias reading: old frontmatter types and old directories read as their new equivalents (layout v2 type-prefiltering preserved).

### Added

- `wolf migrate taxonomy`: dry-run report (old type → type+facet map, counts, conflicts untouched, active call-injections listed) → confirm → `--apply` with git-clean guard and rollback (`git checkout .wolf/memory && wolf rebuild-index`); idempotent; id-set comparison before/after — zero losses on staging (dogfood 864 objects, Tender 509).
- Honest CRUD: `wolf edit` (title/body with two-line diff audit), `wolf archive`, `wolf relation list --of / remove`.
- State windows merged: `recap` / `brief` / `analytics --view` (effectiveness, dashboard, delivery as views); old names work as hidden synonyms with deprecation warnings.
- CLI surface: help 81 → 30 visible commands (plumbing hidden); CLI reference generated from the registry (1,406 hand-written lines → 0); type command namespaces generated from the taxonomy (guard: all 7 types have add/list).
- MCP diet: catalog reduced to 7 tools + ping; removed tools answer with migration hints.
- `WOLF_SESSION` is inherited across spawns (session delivery dedup now works between spawns of one session — 2.12 tail).
- Docs (EN+RU): new memory model page and "Upgrading to 2.13" migration guide; getting-started/cli/configuration/analytics/base-set updated; site gains a Changelog page synced from CHANGELOG.md at build time.

### Upgrade notes

- Run `wolf migrate taxonomy` after updating (dry-run first — it is safe and idempotent). Scripts calling `create_*` must switch to `add` (the error message tells you how).

## [2.12.0] - 2026-09-29

### Changed

- Performance: CLI cold boot (lazy command imports + lazy SQLite open) — `wolf --version` ≈ 0.13 s (was ~1 s); `wolf brief` p90 ≈ 1.4 s (was ~7 s) via persistent scan snapshot with diff-before-save (stops ~120 event-log lines per call); delivery telemetry switched to incremental sidecar counters (no full log re-reads per delivery — linear degradation removed); `wolf call` uses a single store pass instead of five; search pushes LIMIT and file_path down to SQL.
- Router plugin: playbook cache TTL 5 minutes + early-stop on miss (warm chat-turns: zero CLI spawns, was 5–7 s); `router.log` gains `ms=`/`bytes=` fields; `WOLF_SESSION` producer; skill-invocation hook — skills are now measurable.

### Added

- Session-scoped delivery deduplication: a memory is injected once per session, re-delivered only when its text checksum changes; deduplicated empty output explains itself.
- Soft injection-size warning (`delivery.*` config, default 20% of session context, stderr, non-blocking).
- Delivery observability: recap line (deliveries / misses / top-missed agents), `wolf analytics --view delivery` (top delivered, miss-rate by agent, avg injection bytes, router p50/p90, skill counters), applied-rate join for delivered memories (CLI channel).
- Docs updated (EN+RU): mcp (dedup/limit/recap line), configuration (delivery.\*), router (TTL/early-stop/ms=), cli/analytics (`--view delivery`), base-set (skill telemetry).

## [2.11.0] - 2026-09-29

### Added

- Router fallback playbook: any agent-id without a canonical playbook now receives a generic fallback injection (router.log marks canonical/fallback); `executor-lead` gets a dedicated playbook in the default base set and its agent frame no longer declines injections (T012).
- `wolf sync` mutated-skip: stamped files modified locally (differing from both the installed and the fresh render) are skipped with a warning instead of silent overwrite — local mutations of AGENTS.md/agents/plugins are safe (T010).
- Base set documentation page (site, EN+RU): full composition (6 agents, 13 skills, 3 commands, 2 plugins, 6 playbooks) and the wx/sync stamping policy (C3).
- Router/playbook injections guide page (site, EN+RU).

### Changed

- `add` validation errors fixed at the root: camelCase/`.strict()` mismatches now report the expected snake_case field, unknown-field errors list valid fields and available types, plain Errors carry type hints; schema-level errors are now visible in telemetry (previously a blind spot) (T011).
- `brief` is fast: incremental scan cache (tree signature + store parse cache) and a single bounded `store.list()` — p90 ≈ 19 ms on 260 objects (was full FS scan + full list per call) (T013).
- Docs: `migrate doc-ids [--apply]` documented on the site (C4); `update --actor` documented (C5); troubleshooting page gains add error classes (`error_class_id`).

- `wolf analytics --view acceptance`: machine-readable acceptance metrics — router miss-rate per agent-id, delivery burst stats (gap >60s per session), per-tool error-rate/p50/p90, malformed lines, search→get follow-rate, 72h vitality, error-class breakdown (JSON + human summary).
- Telemetry: `mcp_call.detail` gains `error.message`/`error.code`/`error_class_id`, `args_summary` (add), `memory_id`/`memory_ids` (get/search), CLI command name for `user:cli`; `delivery.detail` gains `injection_bytes`; `router.log` logs playbook name with canonical/fallback variant on hit.
- CLI sessions emit per-invocation `WOLF_SESSION` (session key, CLI channel only; MCP is intentionally excluded); stamped templates pass the session id on agent spawn.

### Changed

- `wolf call` telemetry: `target` truncated to 200 chars (prompt content no longer leaks into metrics).

## [2.10.0] — 2026-09-28

### Security

- F26: sandbox escape via child processes closed. Global user-config resolution (`wolfUserConfigDir`, `src/adapters/fs/user-config.ts`) is now env-only: `WOLF_SANDBOX` (sandbox root; overrides `XDG_CONFIG_HOME`/`HOME`, makes isolation transitive for child processes; a non-existent root is an explicit refusal) → `XDG_CONFIG_HOME` → `HOME` → explicit `UserFacingError`. The silent fallback to `os.homedir()` — a `getpwuid`-backed, environment-independent escape channel — is removed. `wolf-session.sh --no-global` exports the `WOLF_SANDBOX` marker (ae7f500).

### Added

- WolfEval v1 evaluation harness and the WEV-001 core-value campaign under `playground-lab/`: environment lock (wolf/model/tool pins), hidden TF-1 oracles, BASE/WOLF arms — 28 valid episodes across two rounds, campaign audits, cost/CSR/CFR scorers with bootstrap CIs, and a findings registry extended with F21–F27. Internal research infrastructure — not shipped in the npm package (`files: dist, templates`); no user-facing surface changed.

## [2.9.0] — 2026-09-05

### Changed

- docs: comprehensive revision after P0–P3 — analytics guide rebuilt as a coherent narrative, site EN/RU brought to parity, coverage gaps closed.

### Fixed

- MCP server reported hardcoded 0.1.0 version; now reads package.json via getWolfVersion().

## [2.8.0] — 2026-09-05

### Added

- Campaigns, cohorts and per-memory ROI analytics (P3, spec `docs/superpowers/specs/2026-09-04-p3-campaigns-roi-design.md`):
  - `wolf run --campaign <id>` writes a top-level `campaign_id` into the run signal; `wolf task-eval --campaign <id>` propagates it into `task_evaluated` (`detail.campaign_id`); without the flag nothing is written (backward-compatible optional schema field, `task_id` pattern from P1).
  - `wolf analytics --view campaign` (CLI and MCP): runs grouped by `campaign_id`, split into `with_memory`/`no_memory` cohorts by injected-memory presence in the run session (`session_id` join over `memory_stage injected`, attribution pattern from P2); per cohort — n, median weighted, accepted-verdict share, process-failure rate; cohorts below 3 runs report honest `n/a` with reason, campaigns without verdicts report `n/a` verdict columns.
  - `wolf analytics --view memory`: per-memory ROI section — `associatedAccepted` / `associatedApplied` / `injectedTotal` / last activity per memory id, sorted by `associatedAccepted` desc, under a "correlational, not causal" disclaimer.
  - Docs: analytics guide + site (EN/RU) cover the new view and ROI section with live examples; signal-log guide documents `campaign_id`; harness-integration guide adds the "with/without memory" campaign scenario.

## [2.7.0] — 2026-09-05

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

[Unreleased]: https://github.com/chekh/mister-wolf/compare/v2.9.0...HEAD
[2.0.0]: https://github.com/chekh/mister-wolf/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/chekh/mister-wolf/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/chekh/mister-wolf/compare/v1.0.2...v1.0.3
[1.0.1]: https://github.com/chekh/mister-wolf/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/chekh/mister-wolf/commits/v1.0.0
