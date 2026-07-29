# Deterministic Multi-Round Refinement Pipeline

> **Date:** 2026-07-29
> **Status:** Draft
> **Design doc:** `docs/superpowers/specs/2026-07-29-deterministic-refinement-pipeline-design.md`
> **Supercedes:** POC in `tools/pipeline/autorefine.sh`

---

## 1. What This Is

A **deterministic multi-round refinement pipeline** for AI-generated software plans (and, by extension, specs and other artifacts). It wraps the opencode agent runtime with an **external orchestration loop** that runs independent LLM-based checkers, a resolver, and an applier — each with a narrow, well-defined role — until convergence or a round limit is reached.

The pipeline is:

- **Deterministic** — identical input + identical plan file → identical artifact set. All state is file-backed; no hidden LLM loop state.
- **Resumable** — each round is a git commit + checkpoint file. Crash mid-round? Start from the last completed round.
- **Transparent** — every artifact is `.md` with YAML frontmatter. Human-readable, machine-parseable, diffable.
- **Composable** — checkers are independent. Add/remove them without touching the loop logic.

### What it is NOT

- Not a general multi-agent orchestrator (cf. AgentLoom)
- Not a replacement for opencode's built-in workflows
- Not a mission loop (cf. opencode-orchestrator)
- Not tied to bash (POC was bash; production runtime is Python/TS)

---

## 2. Why This Exists

### The Problem

A single LLM session asked to "review and fix this plan" suffers from:

| Failure mode | Manifestation |
|---|---|
| **Confirmation bias** | The model finds problems in the same areas it would naturally produce, missing blind spots |
| **Context pollution** | Finding issues and fixing them in one session produces a muddled trace — what was found vs what was changed? |
| **No convergence guarantee** | A single agent can oscillate, re-introduce removed issues, or invent new ones each pass |
| **No separation of concerns** | "Check coverage" and "check architecture" require different expertise, but one agent does both |

### The Solution

Three rigidly separated roles, informed by **CI/CD pipelines** (lint → triage → fix), **QA engineering** (tester → lead → developer), and **Dima Safonov's meta-harness** (7 analyzers × 7 rounds × resolver × applier):

```
                 ┌─────────────┐
                 │   Plan.md   │
                 └──────┬──────┘
                        │
     ┌──────────────────┼──────────────────┐
     │                  │                   │
     ▼                  ▼                   ▼
┌──────────┐     ┌──────────┐       ┌──────────┐
│ Checker  │     │ Checker  │  ...  │ Checker  │  ← parallel, each one dimension
│  types   │     │coverage  │       │  arch.   │
└─────┬────┘     └─────┬────┘       └─────┬────┘
      └────────────────┼──────────────────┘
                       ▼
              ┌─────────────────┐
              │  Merge + Dedup  │  ← machine, no LLM
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │   Resolver      │  ← LLM: triage, prioritize, resolve conflicts
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │   Applier       │  ← LLM: edit plan file
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Convergence?    │  ← machine: criticals==0 AND warnings==0?
              │ Round < Max?    │  ← or: no diff? or: max rounds reached?
              │ Plan changed?   │
              └────────┬────────┘
                  ╱         ╲
               YES           NO
                │              │
                ▼              ▼
             Done          Next round
```

### Why Not One Agent?

Empirical: a single agent given "find and fix problems in this plan" **finds fewer unique issues** than N specialized agents each given one dimension. This is the well-known **ensemble effect** in ML: N weak classifiers beat one strong one.

Industrial precedent:

| Domain | Analog |
|---|---|
| **Linting** | `eslint --no-eslintrc --rule X` per check → aggregate results → `eslint --fix` |
| **Code review** | Google's critiquers: readability, security, correctness — separate reviewers, separate concerns |
| **Formal verification** | Each property checked by a different prover → counterexample triage → fix |
| **Testing** | Unit + integration + e2e; separate suites, separate reports, separate owners |

### Why Not Just More Rounds of the Same Agent?

Dima Safonov's meta-harness experiment (7 rounds × 7 analyzers) showed:

- **Round 1-2:** each analyzer finds ~60% of issues in its dimension
- **Round 3-4:** recall plateaus at ~85%; new findings are mostly cross-dimension edge cases
- **Round 5+:** diminishing returns — models oscillate or hallucinate new "issues"

The resolver+applier pattern extracts more value from early rounds by resolving conflicts and applying fixes deterministically, before the next round of analysis.

---

## 3. Pipeline Architecture

### 3.1 Stages

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Require- │    │   Plan   │    │   Auto-  │    │ Execute  │
│  ments   │───▶│   (gen)  │───▶│  refine  │───▶│   (impl) │
│  (spec)  │    │          │    │ (pipeline)│    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │                               │
                     │ ▲                             │
                     │ │ (feedback: найденные        │
                     │ │   проблемы в спеке)         │
                     └─┘                             └───→ code
```

**Stage 1 — Requirements (Spec):** Standard superpowers `brainstorming` → spec in `docs/superpowers/specs/`. Unchanged.

**Stage 2 — Plan generation:** Standard superpowers `writing-plans` → plan in `docs/superpowers/plans/`. The plan is the **primary artifact** refined by the pipeline.

**Stage 3 — Autorefine:** The deterministic multi-round loop described in this document.

**Stage 4 — Execute:** Implementation from the refined plan. Uses final plan + `.autorefine/final/` context for informed execution.

### 3.2 Artifact Structure

```
docs/superpowers/
├── specs/YYYY-MM-DD-<feature>.md         ← spec (input, static)
└── plans/YYYY-MM-DD-<feature>.plan.md    ← plan (mutated by pipeline)

.autorefine/
├── state.md                               ← pipeline run metadata
├── config.md                              ← per-run configuration
│
├── round-001/
│   ├── 00-state.md                        ← round metadata
│   ├── 01-findings-types.md               ← checker output (parallel)
│   ├── 01-findings-coverage.md
│   ├── 01-findings-placeholders.md
│   ├── 01-findings-architecture.md        ← (if enabled)
│   ├── 02-all-findings.md                 ← machine merge + dedup
│   ├── 03-actions.md                      ← resolver output
│   ├── 04-applied.md                      ← applier changelog
│   └── 05-round-summary.md                ← metrics (machine)
│
├── round-002/
│   └── ...
│
├── final/
│   ├── summary.md                         ← full run overview
│   └── plan-snapshot.md                   ← plan as of last round
│
```

**All artifacts are `.md` with YAML frontmatter.** Not JSON. Rationale:

| Concern | YAML frontmatter in .md | JSON | Pure .md |
|---|---|---|---|
| Human-readable diff | ✅ Clean, staged | ❌ One-liner | ✅ Clean |
| Machine-parseable | ✅ `---\nk:v\n---` via yaml lib | ✅ Native | ❌ grep/awk fragile |
| Self-documenting | ✅ Body can explain context | ❌ | ✅ Body explains |
| Agent-friendly output | ✅ LLMs write markdown natively | ❌ Forced JSON escapes | ✅ Native |
| Token cost to produce | ✅ Low (natural) | ❌ Higher (instruction overhead) | Low |

### 3.3 Agent Roles

#### Checker (N instances, parallel)

**Role:** Read the plan (and optionally the spec), find problems in ONE dimension. Return findings.

**Constraints:**
- `mode: primary`, `edit: deny`, `bash: deny` (read-only)
- One dimension per checker — never "check everything"
- Output is `.md` with YAML frontmatter + findings as subsections

**Input context (injected into prompt):**
```yaml
---
round_number: 1
total_rounds: 3
checker_dimension: coverage  # what this checker looks for
plan_path: docs/.../plan.md
spec_path: docs/.../spec.md        # optional, if coverage needs requirements
previous_findings: []              # what was found in previous rounds (for comparison)
previous_actions: []               # what was already fixed
---
```

**Output:** `01-findings-<dimension>.md` with YAML frontmatter + finding subsections.

**Why read-only?** A checker that can edit is a writer, not a checker. Separation of concerns: you cannot judge your own work.

**Why parallel?** Each checker is independent. Running them serially adds latency with zero quality benefit.

#### Resolver (1 instance)

**Role:** Read the merged `02-all-findings.md`, deduplicate, resolve conflicts, prioritize, produce a flat action list.

**Constraints:**
- `edit: deny`, `bash: deny` (read-only; never modifies the plan)
- Receives merged findings from ALL checkers — full picture
- Does NOT re-analyze the plan itself; works only with findings

**Input context:**
```yaml
---
round_number: 1
total_findings: 14
findings_by_role:
  coverage: 5
  placeholders: 4
  types: 3
  architecture: 2
---
```

**Output:** `03-actions.md` with prioritized action items.

**Why not merge checkers into resolver?** The merge step (02) is a **structural operation** — dedup by (location, issue), count by severity, group by checker. That is a pure data operation that requires zero LLM calls. Resolver adds value by understanding **semantic conflicts** between findings (e.g., "add feature X" vs "remove feature X for YAGNI") — that requires reasoning.

#### Applier (1 instance)

**Role:** Read the action list and apply changes to the plan file. Only agent with `edit: allow`.

**Constraints:**
- `edit: allow`, `bash: allow` (must write to disk, git commit)
- Does exactly what actions say — no creative additions
- Actions critical and warning are mandatory; info is optional

**Input context:**
```yaml
---
actions_count: 4
critical: 1
warning: 2
info: 1
target_file: docs/.../plan.md
---
```

**Output:** `04-applied.md` changelog + modified plan file + git commit.

---

## 4. Data Contracts (YAML Frontmatter Schemas)

### 4.1 Finding (used by all checkers)

Each finding is a section `## Finding N` with consistent fields:

```
## Finding <N>
- severity: <critical | warning | info>
- location: <where in the plan, e.g. Task 3, Step 2>
- issue: <what's wrong, one sentence>
- suggestion: <what to do instead, concrete>
```

Required: severity, location, issue.
Optional: suggestion.

### 4.2 Action (resolver output)

```
## Action <N>
- priority: <critical | warning | info>
- target: <where in the plan to apply>
- action: <what to do, imperative>
- rationale: <why this change>
- source: <checker name that originated this>
- type: <insert_section | modify_text | rename | delete_section | restructure>
```

### 4.3 Change (applier output)

```
## Change <N>
- action_ref: <N>
- status: <applied | skipped | failed>
- target: <where it was applied>
- detail: <what changed, briefly>
```

---

## 5. Round Lifecycle in Detail

```
┌─ Step 0: Init round ──────────────────────────┐
│  Write 00-state.md (round N, status: in_progress)│
└──────────────────────┬─────────────────────────┘
                       ▼
┌─ Step 1: Checkers (parallel) ─────────────────┐
│  For each checker c in config:                 │
│    run_agent(c.agent,                          │
│      plan=plan_path,                           │
│      round_context=state_round_N,              │
│      timeout=120s)                             │
│  → Write 01-findings-<c>.md                    │
│                                                 │
│  Если checker упал (timeout/error):            │
│    Записать findings с status=failed            │
│    Продолжить (один упавший not fatal)         │
└──────────────────────┬─────────────────────────┘
                       ▼
┌─ Step 2: Merge + Dedup (machine) ─────────────┐
│  Read all 01-findings-*.md                     │
│  Dedup by (location + issue)                   │
│  Tally by severity                             │
│  → Write 02-all-findings.md                    │
│                                                 │
│  Если total_findings == 0:                     │
│    → converged, exit loop                      │
└──────────────────────┬─────────────────────────┘
                       ▼
┌─ Step 3: Resolver ─────────────────────────────┐
│  run_agent(state.resolver_agent,               │
│    all_findings=02-all-findings.md,             │
│    round_context=state_round_N)                 │
│  → Write 03-actions.md                         │
│                                                 │
│  Если actions.critical == 0 AND                 │
│     actions.warning == 0:                       │
│    → converged, exit loop                       │
└──────────────────────┬─────────────────────────┘
                       ▼
┌─ Step 4: Applier ──────────────────────────────┐
│  run_agent(state.applier_agent,                │
│    actions=03-actions.md,                      │
│    plan_path=plan_path)                        │
│  → Write 04-applied.md                         │
│  → Modify plan file                            │
│  → git add <plan.md> && git commit             │
└──────────────────────┬─────────────────────────┘
                       ▼
┌─ Step 5: Convergence check (machine) ─────────┐
│  Проверить:                                    │
│  - criticals + warnings == 0 → converged       │
│  - git diff план пустой → stalemate            │
│  - round >= max_rounds → max reached            │
│                                                 │
│  → Write 05-round-summary.md                   │
│  → If not converged: round += 1, repeat        │
└─────────────────────────────────────────────────┘
```

### 5.1 Rollup between rounds

When a new round begins, **03-actions.md** from the previous round is included in the context for all checkers. This prevents:

- Re-reporting already-fixed issues
- Spinning: checker finds X → applier fixes X → next round checker finds X again
- Wasted tokens on known-resolved problems

### 5.2 Stalled round detection

If a round produces no applied changes (the applier's diff against the plan is empty), the pipeline exits with status `stalemate` — regardless of remaining findings. Continued rounds after stalemate are statistically proven to hallucinate.

---

## 6. Orchestrator Design (Runtime)

### 6.1 Requirements

- Read/write YAML frontmatter in `.md` files
- Launch opencode agents via HTTP API (opencode serve)
- Parallel execution of checkers (async/concurrent)
- State management (create/read/write round artifacts)
- No bash required

### 6.2 Technology

Choice: **Python** or **TypeScript**.

| | Python | TypeScript |
|---|---|---|
| YAML parsing | `pyyaml` (stdlib-adjacent) | `js-yaml` |
| Async | `asyncio` + `httpx` | native `async/await` |
| opencode SDK | HTTP client | `@opencode-ai/sdk` |
| Fits project | New dep | Same stack |

Decision: **Python** for the orchestrator. Rationale:
- Pipeline is infrastructure, not product code — separate from the TS project
- `pyyaml` + `httpx` + `asyncio` is zero-install on any modern system
- Easier to evolve independently

The POC bash scripts remain as-is for reference; the new orchestrator replaces them.

### 6.3 API Surface

The orchestrator exposes:

```
# From command line
pipeline refine <plan.md> [--rounds 3] [--checkers coverage,types,...]
pipeline status [.autorefine/state.md]
pipeline resume [.autorefine/state.md]
    # Resume: читает .autorefine/state.md
    # Если последний round имел status=completed → запускает следующий round
    # Если последний round имел status=in_progress → перезапускает его с Step 1
    # Если последний round имел status=converged/stalemate → ничего не делает
pipeline replay <round-dir>
    # Re-run a specific round's Step 3 (resolver) + Step 4 (applier) only
    # Uses existing 02-all-findings.md from that round
    # Useful for: different resolver/applier model, different priority tuning

# Programmatic (optional)
from pipeline import RefinementPipeline
pipeline = RefinementPipeline(plan="plan.md")
result = pipeline.run(max_rounds=3)
```

The orchestrator connects to a running `opencode serve` instance (or starts one). It uses the opencode **session API** (`POST /session/:id/prompt_async`) with SSE-based result collection, not `opencode run` subprocess.

### 6.4 OpenCode Server Integration

```python
async with OpencodeClient(attach="http://localhost:4096") as client:
    session = await client.create_session(cwd=project_root)
    result = await client.run_agent(
        session_id=session.id,
        agent="check-coverage",
        prompt=build_checker_prompt(plan_path, round_context),
        timeout_ms=120_000
    )
```

The orchestrator reuses one opencode server for the entire run (no cold boot per agent call). Checkers run in parallel on the same server via separate sessions.

---

## 7. Error Handling

| Scenario | Behavior |
|---|---|
| Checker timeout | Mark as failed, continue with remaining checkers |
| Resolver returns invalid YAML | Retry once; if still invalid, abort pipeline |
| Applier fails to edit | Log error, mark action as failed, continue |
| OpenCode server down | Wait 5s, retry once; if still down, abort |
| Git conflict | Stop, human resolution required |
| Disk full | Abort immediately |

The pipeline never blocks on a single checker failure — it degrades gracefully. But resolver and applier failures are fatal: without them, no refinement happens.

---

## 8. Integration with Superpowers Workflow

**Existing flow:**
```
brainstorming skill → writing-plans skill → executing-plans skill
```

**Proposed flow:**
```
brainstorming skill → writing-plans skill → [autorefine] → executing-plans skill
```

The pipeline sits **between** plan creation and plan execution. It does not replace or require changes to the superpowers skills:

- `brainstorming` produces specs in `docs/superpowers/specs/` (unchanged)
- `writing-plans` produces plans in `docs/superpowers/plans/` (unchanged)
- `autorefine` reads the plan from `docs/superpowers/plans/` and writes artifacts to `.autorefine/`
- `executing-plans` reads the refined plan from `docs/superpowers/plans/` (changed by applier) and can optionally read `.autorefine/final/summary.md` for context

The master-plan template (`docs/master-plan-template.md`) gains a reference to the pipeline orchestrator.

---

## 9. Design Decisions Record

| Decision | Rationale |
|---|---|
| YAML frontmatter in .md, not JSON | Human-readable, diffable, agent-friendly output, single format |
| `.autorefine/` hidden directory | Pipeline artifacts are not project docs; don't clutter `docs/` |
| Three roles (checker → resolver → applier) | Minimal separation of concerns; industry precedent in QA/CI |
| Merge step is machine-only | Dedup by (location, issue) requires no LLM — cheaper, deterministic |
| Checkers run in parallel | Independent dimensions, no shared state, reduces wall-clock time |
| Git commit per round | Idempotent resume, inspectable history, rollback |
| Previous round actions included in next round | Prevents re-finding fixed issues, reduces token waste |
| Stalemate detection by git diff | If applier did nothing, further rounds are statistically useless |
| opencode serve + HTTP API | Avoids subprocess overhead, cold boot, ANSI-parsing hell |
| Python for orchestrator | Standalone tool, zero-dependency on TS project, `pyyaml` built-in |

---

## 10. Future Considerations

| Feature | When |
|---|---|
| Web dashboard (event stream) | After stable CLI — AgentLoom's Web UI is a reference |
| Spec refinement in addition to plan | Round 2+: propagate plan changes back to spec |
| Checker quality scoring | Track each checker's precision/recall across runs |
| Cached checker results | If plan unchanged and same checker config, skip re-run |
| Parallel resolver + applier across features | Multi-plan refinement for large features |
| Integration with Mr. Wolf | Findings as observations, actions as decisions, history as sessions |

---

## Appendix: Relationship to POC

The existing `tools/pipeline/autorefine.sh` served as a proof of concept. It validated:

- The three-role pattern works
- Git-based resume is feasible
- JSON output from agents is fragile (ANSI codes, markdown blocks)

The production orchestration described here replaces the bash script. The old script stays in the repo for reference but is not extended.
