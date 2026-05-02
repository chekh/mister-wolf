# Concept v2 Editing Plan

**Date:** 2026-05-05
**Source:** Concept v2 Expert Review Pass + Issues
**Target:** `generated/concept-v2-draft.md`
**Constraint:** No new scenarios, no JSONL changes, no roadmap.

---

## Editing Philosophy

1. **Fix contradictions first** (must-fix issues).
2. **Clarify boundaries** (MVP vs conditional vs deferred).
3. **Add examples** where abstraction is unclear.
4. **Polish terminology** for consistency.
5. **Keep document length stable** — add examples, but remove redundant explanations.

---

## Phase 1: Structural Changes

### P1-1: Add MVP Boundary definition
- **Location:** New subsection in §14 Scope Boundaries (before `in-core now`)
- **Action:** Add «MVP Boundary» — список компонентов, artifact types, config modes для первого useful product.
- **Content:**
  - Components: WolfFacade, ContextResolver, AgentRunner, TraceSystem, ScenarioRouter (incl. RouterLight), PolicyCore (base), ArtifactStore (basic), ModelRouter
  - Artifacts: AnswerArtifact (internal), TechnicalSpecification, TaskList, TestPlan, ADR, ReleaseChecklist, PolicyDecision
  - Config: zero_config, generated_config, explicit_config (incl. domain pack loading)
  - NOT in MVP: PII verifier, CircuitBreaker (use hard limits), artifact validation (full), artifact links (foreign keys only), custom_plugin

### P1-2: Restructure §14 into clearer tiers
- **Location:** §14 Scope Boundaries
- **Action:** Reorganize:
  1. **MVP Core** — минимальный набор для useful product
  2. **Always Core (post-MVP)** — компоненты, которые становятся core сразу после MVP
  3. **Conditional** — активируются по необходимости
  4. **Deferred** — явно отложены
  5. **Rejected** — отклонены

### P1-3: Split PolicyCore into base and extended
- **Location:** §5 Runtime Architecture + §8 Policy and Gate Model
- **Action:**
  - Rename `PolicyCore` → `PolicyCore` (base, always-core): hard-deny checks, basic policy evaluation
  - Add `GateManager` (conditional, L4+): approval gates, expert gates, file write rollback
  - Update §8: clarify that hard-deny applies at all levels, gates apply at L4+

---

## Phase 2: Must-Fix Edits

### P2-1: Fix hard-deny list (MF-1)
- **Location:** §8 Policy and Gate Model / Hard-deny rules
- **Action:**
  - Replace `file_write` → `file_write_without_approval`
  - Replace `external_send` → `external_send_without_approval` (or keep `unauthorized_external_send`)
  - Add explicit note: «Hard-deny = action without mandatory approval gate. Same action with approval gate = governed action (L4+).»
  - Add example: `file_write` with `file_write_approval` = OK; `file_write` without approval = Refusal.

### P2-2: Fix PolicyCore scope (MF-2)
- **Location:** §5 Runtime Architecture
- **Action:**
  - Move PolicyCore from «core for L4/L5» to «always-core» (base policy checking)
  - Move `FileWriteGateWithRollback`, `external_action_approval`, `expert_gate` mechanics to «conditional» (GateManager)
  - Update description: PolicyCore = policy evaluation engine, GateManager = interactive approval system

### P2-3: Move PII subsystem to conditional (MF-4)
- **Location:** §5 Runtime Architecture
- **Action:**
  - Move PII subsystem from `in-core now` to `conditional`
  - Add trigger conditions: «active when domain = legal/HR/finance/security/compliance OR when PII patterns detected in input/output»
  - Update §8 PII subsystem: «MVP: detector + redactor. Verifier deferred.»

### P2-4: Fix configuration overlap explanation (MF-5)
- **Location:** §12 Configuration Model + §15 Evidence Appendix
- **Action:**
  - Add note: «Configuration modes are not mutually exclusive. Domain pack can be loaded in generated_config mode (auto-detected) or explicit_config mode (user-specified).»
  - In §15, change «Configuration distribution» from counts to «Configuration mode coverage» with note about overlaps.

### P2-5: Clarify Skill vs Workflow (MF-6)
- **Location:** §9 Capability Model
- **Action:**
  - Add explicit distinction block:
    - **Skill** = reusable logic unit, function-like, called by agent or workflow. No gates inside.
    - **Workflow** = orchestration DAG with artifact passing, conditional logic, gates. Can call skills.
    - **Boundary:** Skill does not contain gates or multi-step artifact chains. Workflow does.
  - Add example: `software.project_review` = skill (analyzes code, returns report). `spec-first flow` = workflow (creates spec → tasks → impl → tests with gates between steps).

### P2-6: Add MVP Boundary (MF-7)
- **Location:** §14 (see P1-1)
- **Action:** Already covered in P1-1.

### P2-7: Clarify AnswerArtifact (MF-8)
- **Location:** §7 Artifact Model / Universal + §4 simple_answer
- **Action:**
  - Change `AnswerArtifact` description: «Internal representation of L1–L2 response. User sees plain text rendering. Used for audit trail and potential future linking. Not a user-facing artifact in the same sense as TechnicalSpecification.»
  - Remove `AnswerArtifact` from «first-class artifact types» list or mark as «internal-only».

---

## Phase 3: Should-Fix Edits

### P3-1: Add end-to-end examples (SF-1)
- **Location:** New section after §2 Problem Statement OR append to §4 Core Behavioral Model
- **Action:** Add 3 short examples (≤10 lines each):
  - **L1:** User: «Объясни spec-first». Wolf: returns plain text. Internal: SolveResult(Answer, trace_ref).
  - **L3:** User: «Создай TechnicalSpecification для фичи X». Wolf: creates spec, shows preview. User: approves. Wolf: persists artifact.
  - **L4:** User: «Примени implementation plan». Wolf: shows plan, triggers file_write_approval gate. User: approves. Wolf: writes files, returns artifacts + logs.

### P3-2: Add SolveResult examples (SF-2)
- **Location:** §6 SolveResult / ExecutionResult Model
- **Action:** Add 3 JSON/YAML examples after schema:
  - `Answer` envelope for L1
  - `Refusal` envelope for hard-deny
  - `PartialResult` envelope for gate block

### P3-3: Add domain pack example (SF-3)
- **Location:** §10 Domain Pack Model
- **Action:** Add minimal `software-engineering/config.yaml` example (≤30 lines) showing:
  - domain name
  - loaded skills list
  - default persona
  - policy overlays
  - artifact templates reference

### P3-4: Add glossary / terminology table (SF-4)
- **Location:** New appendix or §3 Design Principles
- **Action:** Add table of 15–20 key terms with one-line definitions.

### P3-5: Clarify Router + ModelRouter interaction (SF-5)
- **Location:** §5 Runtime Architecture
- **Action:**
  - Add note: «Router determines scenario level (L1–L5). ModelRouter selects model based on scenario level and latency requirements. For L1: lightweight model. For L5: reasoning model. ModelRouter is always-core because even L1 needs model selection.»

### P3-6: Clarify ContextResolver mechanism (SF-6)
- **Location:** §5 Runtime Architecture
- **Action:**
  - Add 2–3 sentences: «ContextResolver does not use semantic RAG by default. It performs structured queries: file tree scan, doc index lookup, artifact store query. Progressive disclosure: if context window exceeded, it summarizes lower-priority sources.»

### P3-7: Move CircuitBreaker to conditional (SF-7)
- **Location:** §5 Runtime Architecture
- **Action:**
  - Move CircuitBreaker from `in-core now` to `conditional`
  - Add trigger: «active for L4+ with external calls OR when step count > threshold»
  - For MVP: AgentRunner has hard limits (max_steps, max_tokens) without full circuit breaker pattern

### P3-8: Defer artifact validation (SF-8)
- **Location:** §7 Artifact Model
- **Action:**
  - Change lifecycle: `created → persisted` for MVP
  - Add note: «Validation (schema check, required fields) → conditional/deferred. MVP: basic format check only.»

### P3-9: Split MemoryBundle (SF-9)
- **Location:** §11 Memory Model + §14
- **Action:**
  - Case Trace Memory = in-core / MVP Core
  - Artifact Link Memory, Decision Memory, Preference Memory = conditional (L3+)
  - Stale Memory Detection = conditional

### P3-10: Collapse configuration levels (SF-10)
- **Location:** §12 Configuration Model
- **Action:**
  - Merge `custom_workflow` into `explicit_config`
  - Keep 5 levels: `zero_config` → `generated_config` → `explicit_config` → `domain_pack` → `custom_plugin`
  - Update diagram and descriptions

---

## Phase 4: Terminology Fixes

See `generated/concept-v2-terminology-fixes.md` for detailed list.

### Key replacements:
- `in-core now` → `MVP Core` (where appropriate) or `always-core`
- `PolicyCore (core for L4/L5)` → `PolicyCore (always-core, base)` + `GateManager (conditional, L4+)`
- `file_write` (in hard-deny) → `file_write_without_approval`
- `external_send` (in hard-deny) → `external_send_without_approval`
- `AnswerArtifact` (first-class) → `AnswerArtifact` (internal-only)
- `MemoryBundle` (monolithic) → split by type (Case Trace = core, остальное = conditional)
- `custom_workflow` (separate level) → part of `explicit_config`

---

## Phase 5: Optional Polish

- **OP-1:** Add ASCII/Mermaid architecture diagram in §5
- **OP-2:** Add gate approval UX flow in §8
- **OP-3:** Clarify emergency relaxations in §8
- **OP-4:** Add policy conflict example in §8
- **OP-5:** Strengthen Problem Statement distinction from coding agents

---

## Estimated Impact

| Change | Lines added | Lines removed | Sections affected |
|--------|-------------|---------------|-------------------|
| MVP Boundary | +15 | 0 | §14 |
| Fix hard-deny | +5 | -3 | §8 |
| Fix PolicyCore scope | +8 | -4 | §5, §8 |
| PII conditional | +5 | -3 | §5 |
| Config overlap note | +3 | -2 | §12, §15 |
| Skill vs Workflow | +10 | -2 | §9 |
| AnswerArtifact internal | +3 | -2 | §7 |
| End-to-end examples | +25 | 0 | §4 or new |
| SolveResult examples | +30 | 0 | §6 |
| Domain pack example | +20 | 0 | §10 |
| Glossary | +25 | 0 | new appendix |
| Router/ModelRouter note | +5 | 0 | §5 |
| ContextResolver note | +3 | 0 | §5 |
| CircuitBreaker conditional | +3 | -2 | §5 |
| Artifact validation defer | +2 | -2 | §7 |
| Memory split | +5 | -3 | §11, §14 |
| Config collapse | +2 | -3 | §12 |
| **Total** | **~+170** | **~-30** | **all sections** |

Net change: ~+140 lines (from 694 to ~834). Acceptable for review pass.

---

## Order of Execution

1. Fix contradictions (P2-1 through P2-7)
2. Restructure §14 (P1-1, P1-2)
3. Add examples (P3-1 through P3-3)
4. Add glossary (P3-4)
5. Clarify mechanisms (P3-5, P3-6, P3-7, P3-8, P3-9, P3-10)
6. Optional polish (P5)
7. Final read-through for consistency

---

*Editing plan derived from expert review. No new concepts introduced.*
