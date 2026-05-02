# Concept v2 Terminology Fixes

**Date:** 2026-05-05
**Source:** Concept v2 Expert Review Pass
**Target:** `generated/concept-v2-draft.md`

---

## must fix (inconsistencies / contradictions)

### T-MF-1: `file_write` in hard-deny list
- **Current:** `file_write` — hard-deny, no override
- **Problem:** Contradicts L4 governed_action with `file_write_approval` gate
- **Fix:** `file_write_without_approval` — hard-deny. `file_write` with `file_write_approval` — governed action.
- **Occurrences:** §8 Hard-deny rules

### T-MF-2: `external_send` in hard-deny list
- **Current:** `external_send` — hard-deny, no override
- **Problem:** Contradicts L5 external_capability_use with `external_action_approval`
- **Fix:** `external_send_without_approval` — hard-deny. `external_send` with approval — governed action.
- **Occurrences:** §8 Hard-deny rules

### T-MF-3: `PolicyCore` scope
- **Current:** «PolicyCore — core for L4/L5 (23 scenarios)»
- **Problem:** Hard-deny applies to all levels (L1–L5). If PolicyCore only L4+, L1–L3 have no policy enforcement.
- **Fix:** «PolicyCore (base) — always-core. Hard-deny + basic policy evaluation. GateManager — conditional (L4+). Approval gates + expert gates + rollback.»
- **Occurrences:** §5 Runtime Architecture, §8 Policy and Gate Model

### T-MF-4: `AnswerArtifact` classification
- **Current:** Listed under «first-class artifact types» / Universal
- **Problem:** L1 produces plain text for user. If AnswerArtifact is «first-class», user should see structure. But document says «renders as plain text».
- **Fix:** «AnswerArtifact — internal representation for audit/trace. Not user-facing. User sees plain text rendering.» Move to separate «Internal Artifacts» category or mark with (internal).
- **Occurrences:** §7 Artifact Model / Universal

### T-MF-5: `MemoryBundle` monolith
- **Current:** «MemoryBundle (case trace + artifact links + decision + preference)» in in-core now
- **Problem:** 5 types of memory with different level requirements bundled into one component.
- **Fix:** Split:
  - Case Trace Memory — in-core / MVP Core
  - Artifact Link Memory — conditional (L3+)
  - Decision Memory — conditional (L3+)
  - Preference Memory — conditional (L2+)
  - Stale Memory Detection — conditional
- **Occurrences:** §5 Runtime Architecture, §11 Memory Model, §14 Scope Boundaries

---

## should fix (ambiguities)

### T-SF-1: `in-core now` → `MVP Core` / `always-core`
- **Current:** «in-core now» used throughout §14
- **Problem:** Vague. Does «now» mean MVP or full system?
- **Fix:** Replace with explicit tiers:
  - `MVP Core` — minimal useful product
  - `Always Core` — present in all scenarios, but may be post-MVP
  - `Conditional` — activated by scenario requirements
  - `Deferred` — explicitly postponed
- **Occurrences:** §14 Scope Boundaries

### T-SF-2: `AgentRunner`
- **Current:** «AgentRunner — исполнение агентной логики: выбранного агента с его skill set и policy scope.»
- **Problem:** Name suggests single-agent runner, but orchestration may involve multiple agents.
- **Fix:** Add clarification: «AgentRunner executes a single agent invocation. Multi-agent orchestration is handled by Workflow Engine. AgentRunner does not manage agent-to-agent communication.»
- **Occurrences:** §5 Runtime Architecture

### T-SF-3: `Skill` vs `Workflow`
- **Current:** Skill = «domain logic + tools», Workflow = «multi-step orchestration»
- **Problem:** Boundary is fuzzy. A skill can be multi-step.
- **Fix:** Add explicit boundary: «Skill = reusable logic unit, no internal gates, no artifact chains. Workflow = orchestration DAG with gates and artifact passing. A workflow calls skills; a skill does not call workflows.»
- **Occurrences:** §9 Capability Model

### T-SF-4: `Wrapper` vs `Adapter`
- **Current:** Adapter = «translation layer», Wrapper = «policy-enforcing decorator»
- **Problem:** In practice, they often merge. Reader may not see the difference.
- **Fix:** Add note: «Adapter handles schema/auth translation. Wrapper adds policy overlay. In MVP, Adapter functions may be merged into MCPWrapper or Tool Registry. They are conceptually separate but implementation may combine them.»
- **Occurrences:** §9 Capability Model

### T-SF-5: `ScenarioRouter` vs `ScenarioRouterLight`
- **Current:** «Router и RouterLight — это одна абстракция с двумя реализациями.»
- **Problem:** What is the abstraction called? «Router» or «ScenarioRouter»?
- **Fix:** Define abstraction name: «RouterInterface» or «ScenarioRouter» (abstract). Implementations: `RouterLight` (L1–L2) and `RouterFull` (L3–L5).
- **Occurrences:** §5 Runtime Architecture

### T-SF-6: `ModelRouter`
- **Current:** «ModelRouter — core for L1/L2 fast path.»
- **Problem:** If L5 needs reasoning model, ModelRouter must be always-core.
- **Fix:** «ModelRouter — always-core. Selects model based on scenario level and latency requirements. Lightweight for L1, reasoning for L5.»
- **Occurrences:** §5 Runtime Architecture

### T-SF-7: `Domain pack` vs `Configuration`
- **Current:** Domain pack and configuration modes used interchangeably in places.
- **Problem:** Is domain pack a type of configuration, or separate concept?
- **Fix:** «Domain pack is a configuration bundle. Loading a domain pack is one way to achieve explicit_config or generated_config.»
- **Occurrences:** §10 Domain Pack Model, §12 Configuration Model

### T-SF-8: `Governed action`
- **Current:** Used as behavioral mode name without UX explanation.
- **Problem:** User-facing document should explain what this means for the user.
- **Fix:** Add parenthetical: «Governed action — Wolf performs actions (file writes, external calls) but may pause to request your approval before proceeding.»
- **Occurrences:** §4 Core Behavioral Model

### T-SF-9: `Artifact-producing workflow`
- **Current:** Used as mode name.
- **Problem:** How is this different from «governed action»? Both produce artifacts and may use gates.
- **Fix:** Clarify: «Governed action — single action with gate. Artifact-producing workflow — multi-step DAG where artifacts flow between steps. A workflow may contain governed actions.»
- **Occurrences:** §4 Core Behavioral Model

### T-SF-10: `Emergency mode`
- **Current:** «Emergency mode = fast-track routing + logging, not gate bypass.»
- **Problem:** What exactly is «fast-track»? Skipping what?
- **Fix:** Add specifics: «Fast-track = skip clarification prompts, use cached context, reduce routing latency. All safety gates remain active.»
- **Occurrences:** §8 Policy and Gate Model

---

## optional polish (consistency)

### T-OP-1: `CaseTrace` vs `trace_reference`
- **Current:** Both used. «CaseTrace ID» and «trace_reference».
- **Fix:** Standardize on `trace_reference` as field name, `CaseTrace` as record type.
- **Occurrences:** §6 SolveResult, §11 Memory Model

### T-OP-2: `PII subsystem` vs `PII detector`
- **Current:** Sometimes «PII subsystem», sometimes «PII detector».
- **Fix:** «PII subsystem» = umbrella term (detector + redactor + verifier). «PII detector» = specific component.
- **Occurrences:** §5 Runtime Architecture, §8 Policy and Gate Model

### T-OP-3: `External capability` vs `External tool`
- **Current:** Both used.
- **Fix:** «External capability» = superset (tool, skill, API). «External tool» = specific instance of external capability.
- **Occurrences:** §9 Capability Model

### T-OP-4: `Zero_config` vs `Zero configuration`
- **Current:** Both used.
- **Fix:** Standardize on `zero_config` (snake_case, as config mode key).
- **Occurrences:** §12 Configuration Model

### T-OP-5: `Fallback action` vs `Fallback`
- **Current:** Both used.
- **Fix:** Standardize on `fallback_action` (as specific field/property).
- **Occurrences:** §9 Capability Model

### T-OP-6: `Answer` envelope vs `AnswerArtifact`
- **Current:** «Answer» = envelope type, «AnswerArtifact» = artifact type.
- **Fix:** Keep distinction, but add note: «Answer envelope contains reference to AnswerArtifact (internal).»
- **Occurrences:** §6 SolveResult, §7 Artifact Model

---

## Cross-Reference Table

| Term | Current Location | Current Usage | Recommended Fix | Priority |
|------|-----------------|---------------|-----------------|----------|
| `file_write` (hard-deny) | §8 | Always deny | `file_write_without_approval` | must |
| `external_send` (hard-deny) | §8 | Always deny | `external_send_without_approval` | must |
| `PolicyCore` | §5, §8 | Core for L4/L5 | Base = always-core, GateManager = conditional | must |
| `AnswerArtifact` | §7 | First-class | Internal-only | must |
| `MemoryBundle` | §5, §11, §14 | Monolithic | Split by memory type | must |
| `in-core now` | §14 | Vague | `MVP Core` / `always-core` | should |
| `AgentRunner` | §5 | Ambiguous scope | Clarify: single-agent only | should |
| `Skill` vs `Workflow` | §9 | Fuzzy boundary | Add explicit boundary rule | should |
| `Wrapper` vs `Adapter` | §9 | Fuzzy boundary | Add implementation note | should |
| `ScenarioRouter` | §5 | Abstraction unclear | Define abstract + impl names | should |
| `ModelRouter` | §5 | L1/L2 only | Always-core | should |
| `Domain pack` | §10, §12 | vs Configuration | Clarify relationship | should |
| `Governed action` | §4 | No UX meaning | Add user-facing explanation | should |
| `Artifact-producing workflow` | §4 | vs Governed action | Clarify DAG vs single action | should |
| `Emergency mode` | §8 | «Fast-track» vague | Add specifics | should |
| `CaseTrace` / `trace_reference` | §6, §11 | Inconsistent | Standardize | optional |
| `PII subsystem` / `detector` | §5, §8 | Mixed usage | Define hierarchy | optional |
| `External capability` / `tool` | §9 | Mixed usage | Define superset vs instance | optional |
| `Zero_config` | §12 | Mixed casing | `zero_config` | optional |
| `Fallback action` | §9 | Mixed usage | `fallback_action` | optional |
| `Answer` / `AnswerArtifact` | §6, §7 | Confusing | Add cross-reference note | optional |

---

*Terminology fixes extracted from 8-role review. No new terms introduced.*
