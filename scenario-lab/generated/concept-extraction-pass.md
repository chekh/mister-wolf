# Concept Extraction Pass — Mr. Wolf Scenario Lab

**Date:** 2026-05-05
**Scope:** 80 scenarios, 80 playthroughs, 80 extraction reports
**Method:** Aggregate analysis across scenario bank, playthroughs, extraction reports, generated catalogs

## 1. Confirmed Core Components

### Always Core (present in ≥60 scenarios, all levels)

| Component | Scenarios | Evidence |
|-----------|-----------|----------|
| WolfFacade | 80 | all levels L1–L5 |
| ContextResolver | 72 | all levels L1–L5 |
| AgentRunner | 69 | all levels L1–L5 |
| TraceSystem | 63 | all levels L1–L5 |

### Core for L2+ (≥30 scenarios, L2–L5)


### Core for L3+ (≥15 scenarios, L3–L5)

- **PolicyCore** — 23 scenarios (L4–L5)

### Core for L4/L5 only

- **MCPWrapper** — 8 scenarios (L4–L5)
- **FileWriteGateWithRollback** — 8 scenarios (L4–L5)

### Key Component Verdicts

- **WolfFacade** — 100% scenarios. Always core. Single entry point.
- **ContextResolver** — 65+ scenarios. Core from L2+. Reads repo/docs/meeting notes.
- **AgentRunner** — 60+ scenarios. Core from L2+. Executes agent logic.
- **TraceSystem** — 60+ scenarios. Core from L2+. Audit + observability.
- **ScenarioRouter / ScenarioRouterLight** — 30 each. Router abstraction needed (decision log A2).
- **PolicyCore** — 15 scenarios. Core for L4/L5. Gates, approvals, hard-deny.
- **ModelRouter** — 8 scenarios. Core for L1/L2 fast path. Selects lightweight vs reasoning model.
- **MCPWrapper** — 6 scenarios. Core for L5 only. External capability lifecycle.
- **FileWriteGateWithRollback** — 2 scenarios in extraction reports, but implied in 12 L4 scenarios with file write. Core for file mutation scenarios.

## 2. Component Noise / Deferred Components

### Deferred (≤3 occurrences, not safety-critical)

- `EmergencyPolicy` — 1 scenario(s). **Defer.**

### Specific Analysis

- **LightweightAnswerCache** — suggested in 3 extraction reports for L1. Not a runtime subsystem; caching is infrastructure, not concept. **Defer.**
- **LightweightSolvePlanner** — rejected in decision log R1. L2 solves via routing without planner. **Reject.**
- **LegalDisclaimerPrompter** — 2 occurrences. Feature, not subsystem. **Defer.**
- **ToneAdapter** — 1 occurrence (research+sales cross-domain). Feature for tone shift. **Defer.**
- **ActionItemExtractor** — 1 occurrence. Office assistant feature. **Defer.**
- **FrameworkVersionChecker** — 1 occurrence. Security compliance helper. **Defer.**

## 3. Artifact Taxonomy Findings

### Universal Artifacts (≥10 domains)


### Development Core Artifacts (SE + Architecture)

| Artifact | SE | Arch | Total |
|----------|----|------|-------|
| ADL | 0 | 3 | 3 |
| ADR | 1 | 3 | 4 |
| ADRReview | 0 | 2 | 2 |
| AcceptanceCriteria | 2 | 0 | 2 |
| Answer | 2 | 0 | 10 |
| ArchitectureDiagram | 1 | 1 | 2 |
| CIReport | 2 | 0 | 2 |
| CISummary | 1 | 0 | 1 |
| ChangeLog | 2 | 0 | 2 |
| ComparisonReport | 0 | 1 | 1 |
| CompatibilityMatrix | 1 | 1 | 2 |
| CoverageReport | 2 | 0 | 2 |
| DataModel | 2 | 0 | 2 |
| DecisionLog | 1 | 1 | 3 |
| ImplementationPlan | 2 | 0 | 2 |
| InterfaceContract | 2 | 0 | 2 |
| MigrationPlan | 1 | 1 | 2 |
| MigrationRoadmap | 0 | 1 | 1 |
| MitigationPlan | 0 | 1 | 1 |
| NextMVPRecommendation | 1 | 0 | 1 |
| OpenAPISpec | 1 | 0 | 1 |
| PRDescription | 1 | 0 | 1 |
| PolicyDecision | 1 | 0 | 1 |
| RefactorReport | 1 | 0 | 1 |
| RefactoringRoadmap | 1 | 0 | 1 |
| ReleaseChecklist | 3 | 0 | 3 |
| ReviewReport | 2 | 0 | 2 |
| RiskRegister | 1 | 2 | 8 |
| RollbackPlan | 2 | 1 | 3 |
| SecurityReviewReport | 1 | 1 | 2 |
| SystemDiagram | 0 | 2 | 2 |
| TaskList | 2 | 0 | 2 |
| TechnicalSpecification | 2 | 0 | 2 |
| TestCaseList | 2 | 0 | 2 |
| TestPlan | 2 | 0 | 2 |
| TestResults | 3 | 0 | 3 |
| ThreatModel | 1 | 2 | 3 |

### Artifact Chains

**spec → tasks → implementation → tests**
  - `TechnicalSpecification` — 2
  - `TaskList` — 2
  - `ImplementationPlan` — 2
  - `TestPlan` — 2
  - `TestCaseList` — 2
  - `CoverageReport` — 2

**ADR/ADL → decision evolution**
  - `ADR` — 4
  - `ADL` — 3
  - `DecisionLog` — 3
  - `ArchitectureDiagram` — 2
  - `SystemDiagram` — 2

**release → changelog → notes**
  - `ReleaseChecklist` — 3
  - `CIReport` — 2
  - `ChangeLog` — 2
  - `ReleaseNotes` — 0

**migration → rollback → compatibility**
  - `MigrationPlan` — 2
  - `CompatibilityMatrix` — 2
  - `RollbackPlan` — 3
  - `RiskRegister` — 8

**API contract → implementation → tests**
  - `OpenAPISpec` — 1
  - `InterfaceContract` — 2
  - `DataModel` — 2
  - `ContractTestPlan` — 0

**security review → approval**
  - `ThreatModel` — 3
  - `SecurityReviewReport` — 2
  - `PolicyDecision` — 1

### First-Class Artifacts for Concept v2

**Must be first-class (with lifecycle and linking):**
- `TechnicalSpecification`, `TaskList`, `AcceptanceCriteria`
- `ImplementationPlan`, `TestPlan`, `TestCaseList`, `CoverageReport`
- `ADR`, `ADL`, `ArchitectureDiagram`, `SystemDiagram`
- `ReleaseChecklist`, `CIReport`, `ChangeLog`
- `ThreatModel`, `SecurityReviewReport`
- `PolicyDecision`, `DecisionLog`

## 4. SolveResult / ExecutionResult Model

### Envelope Types

| Type | Count | Meaning |
|------|-------|---------|
| Artifact | 47 | see below |
| Plan | 21 | see below |
| Answer | 12 | see below |

### Recommended Model

`SolveResult` is a **canonical envelope** that wraps all execution modes. It contains:

```yaml
SolveResult:
  envelope_type: Answer | Plan | Artifact | Refusal | PartialResult
  summary: string
  confidence: high | medium | low
  artifacts: []  # references to ArtifactStore IDs, not embedded copies
  trace_reference: CaseTrace ID
  policy_decisions: []  # which policies were checked
  gates_triggered: []   # which gates were applied
```

### Answer to Canonical vs Envelope Only

**Answer:** `SolveResult` is canonical envelope with **referential artifact links**.

- Artifacts live in `ArtifactStore` with lifecycle (created → validated → persisted → archived).
- `SolveResult.artifacts` contains references (IDs), not embedded data.
- `artifacts.outputs` in Scenario Card defines what artifacts are produced.
- `SolveResult` unifies all execution modes under one envelope for consistent UX and logging.
- Evidence: extraction reports consistently mention `SolveResult envelope` as missing core abstraction (3 reports).

## 5. Policy / Gate Model

### Policy Patterns (top 15)

| Pattern | Count |
|---------|-------|
| external_send | 77 |
| generate_report | 71 |
| file_write | 69 |
| read_project_files | 56 |
| draft_communication | 31 |
| personal_data_exposure | 21 |
| shell_mutation | 20 |
| dangerous_shell | 14 |
| mcp.invoke | 12 |
| read_uploaded_document | 9 |
| financial_action_without_approval | 6 |
| legal_advice_without_gate | 4 |
| secrets_exposure | 4 |
| unauthorized_external_send | 3 |
| auto_publish_without_review | 3 |

### Gate Patterns

| Gate | Count | Severity |
|------|-------|----------|
| pii_handling_gate | 7 | notify |
| file_write_approval | 5 | block |
| secrets_handling_gate | 4 | block |
| external_action_approval | 3 | block |
| security_review_gate | 3 | block |
| test_coverage_gate | 2 | block |
| external_notification_approval | 2 | block |
| offer_send_approval | 2 | block |
| expert_review_gate | 2 | block |
| adr_approval_gate | 2 | block |
| mcp_capability_gate | 1 | block |
| legal_advice_disclaimer | 1 | notify |
| expert_gate_legal_advice | 1 | block |
| external_database_query_approval | 1 | block |
| calendar_mutation_approval | 1 | block |

### Gate Severity Model

```
silent   → log only, no UX friction (auto-approve low-risk)
notify   → inform user, continue unless blocked by another gate
block    → require explicit user approval before proceeding
expert_gate → require domain expert approval (legal, security, architecture)
```

### Hard-Deny

- `auto_assign_without_review` — no override, always denied
- `auto_delete_without_confirmation` — no override, always denied
- `auto_hire_without_review` — no override, always denied
- `auto_merge_without_review` — no override, always denied
- `auto_publish_without_review` — no override, always denied
- `auto_transfer_without_approval` — no override, always denied
- `dangerous_shell` — no override, always denied
- `deploy_action` — no override, always denied
- `external_send` — no override, always denied
- `file_write` — no override, always denied
- `file_write_without_approval` — no override, always denied
- `financial_action_without_approval` — no override, always denied
- `legal_advice_without_gate` — no override, always denied
- `personal_data_exposure` — no override, always denied
- `secrets_exposure` — no override, always denied
- `shell_mutation` — no override, always denied
- `unauthorized_external_send` — no override, always denied

### Emergency Mode

**Rule:** Emergency mode = fast-track routing + logging. **Does NOT bypass gates.**
Evidence: `security.incident.response_runbook.018` (L5 emergency) still requires `external_notification_approval`.

## 6. Configuration Model

### Progressive Configuration

| Mode | Scenarios | Use Case |
|------|-----------|----------|
| dynamic_persona | 80 | see below |
| domain_pack | 55 | see below |
| generated_config | 30 | see below |
| explicit_config | 28 | see below |
| zero_config | 12 | see below |
| llm_assisted_selection | 10 | see below |
| rule_routing | 1 | see below |
| memory_adapted | 1 | see below |

### Configuration Hell Risk

**Risk signal:** 6 different modes across 80 scenarios.
**Mitigation:** progressive disclosure path: `zero_config` → `generated_config` → `explicit_config` → `domain_pack`.
**Rule:** First Useful Product must work on `zero_config`/`generated_config`. L4/L5 require `explicit_config`/`domain_pack`.
**Rule:** `custom_plugin` must stay below 5% of scenarios (currently 3/80 = 3.75%).

## 7. Behavior Model

| Behavior Mode | Level | Artifacts | Components | Evidence |
|---------------|-------|-----------|------------|----------|
| simple_answer | L1 | Answer, CaseTrace | WolfFacade, ModelRouter | 10 L1 scenarios |
| context_aware_answer | L2 | ContextBundle, reports | +ContextResolver, +AgentRunner | 20 L2 scenarios |
| clarification | L1–L5 | ScenarioDecision | +ScenarioRouter | 5 playthroughs show clarification |
| plan_dry_run | L3 | Plans, specs, checklists | +TraceSystem | 20 L3 scenarios |
| governed_action | L4 | Artifacts + logs | +PolicyCore, +FileWriteGate | 20 L4 scenarios |
| artifact_producing_workflow | L3–L5 | Artifact chains | All core + domain-specific | 40 scenarios produce artifacts |
| refusal | L1–L5 | Refusal explanation | PolicyCore | Hard-deny policies in all domains |
| external_capability | L5 | External artifacts | +MCPWrapper, +AdapterLayer | 12 L5 scenarios |
| cross_domain | L4–L5 | Cross-domain reports | Domain packs composed | 5 cross-domain scenarios |

## 8. Memory Model Findings

### Required Memory Types

1. **Case Trace Memory** — universal (80/80 scenarios). Audit trail.
2. **Artifact Link Memory** — spec→tasks→tests→impl→release chains. Required for anchor domain.
3. **Decision Memory** — ADR/ADL propagation. 8 architecture scenarios need this.
4. **Preference Memory** — `previous_*` patterns in 30+ scenarios.
5. **Stale Memory Detection** — `stale_*` failure modes in 15+ scenarios.

### Artifact Links (Required Schema)

- `TechnicalSpecification` → `TaskList` (`decomposes_to`)
- `TaskList` → `ImplementationPlan` (`implements_via`)
- `TechnicalSpecification` → `TestPlan` (`tested_by`)
- `TestPlan` → `CoverageReport` (`produces`)
- `ADR` → `ADL` (`refines_to`)
- `ADL` → `ImplementationPlan` (`constrains`)
- `ImplementationPlan` → `ReleaseChecklist` (`requires`)
- `ReleaseChecklist` → `ChangeLog` (`generates`)

### Memory Safety

- Memory is NOT uncontrolled RAG.
- Every read requires `citation` (source scenario ID) and `freshness`.
- Policy boundaries: PII/secrets gates apply to memory reads.

## 9. Failure Mode Clusters

### Model Hallucination / Misunderstanding
- Examples: model_hallucination, overly_generic_answer, overly_technical_answer
- Occurrences: 24
- Safeguard: ModelRouter + prompt constraints
- Component: WolfFacade, ModelRouter

### Stale Data / Memory
- Examples: stale_data, stale_memory_suggests_wrong_next_step, stale_compliance_framework
- Occurrences: 20
- Safeguard: Freshness checks + bounded context
- Component: MemoryBundle, ContextResolver

### Missing Context / Too Large
- Examples: missing_context, context_too_large, repository_context_too_large
- Occurrences: 18
- Safeguard: Bounded context + progressive disclosure
- Component: ContextResolver

### External API / MCP Unavailable
- Examples: external_tool_unavailable, mcp_unavailable, jira_unavailable
- Occurrences: 13
- Safeguard: Fallback actions + retry policy
- Component: MCPWrapper, AdapterLayer

### Policy Conflict
- Examples: policy_conflict, policy_conflict_on_external_action, policy_conflict_on_file_write
- Occurrences: 11
- Safeguard: Policy hierarchy + conflict resolver
- Component: PolicyCore

### PII / Secrets Exposure
- Examples: pii_in_transcripts, pii_in_resumes, secrets_in_configs
- Occurrences: 10
- Safeguard: PII detector + redactor + verifier
- Component: PolicyCore, PII subsystem

### Test / CI Failure
- Examples: ci_failure, missing_test_coverage, coverage_below_threshold
- Occurrences: 12
- Safeguard: Coverage gate + CI monitor
- Component: PolicyCore, TraceSystem

### Release / Migration Rollback
- Examples: rollback_needed, rollback_failure, incomplete_rollback_plan
- Occurrences: 5
- Safeguard: Rollback verification gate
- Component: PolicyCore

### Jurisdiction / Compliance Mismatch
- Examples: jurisdiction_mismatch, currency_mismatch
- Occurrences: 6
- Safeguard: Jurisdiction detector + multi-framework support
- Component: Domain Pack

### Runaway Workflow / Cost
- Examples: runaway_workflow, cost_exceeded
- Occurrences: 2
- Safeguard: Circuit breaker (max steps, tokens, external calls)
- Component: TraceSystem, CircuitBreaker

### Gate Misunderstanding / Timeout
- Examples: gate_misunderstood, expert_gate_timeout
- Occurrences: 3
- Safeguard: Gate explanation + timeout handling
- Component: PolicyCore

### Missing Capability / Tool
- Examples: missing_capability, missing_tool_permission
- Occurrences: 0
- Safeguard: Capability registry + graceful degradation
- Component: CapabilityRegistry

## 10. Domain Pack Model

### Domain Pack Definition

Scoped configuration bundle extending universal runtime with domain-specific skills, tools, artifacts, policies, personas, workflows.

### Cross-Domain Verdict

**DomainPackCoordinator:** Not needed now.
- Cross-domain scenarios: 5/80 = 6.25%
- Composition rules sufficient for 2-domain cases.
- Defer coordinator to post-MVP (when cross-domain > 15%).

## 11. Skill / Tool / Adapter / Workflow / Agent / Domain Pack Distinction

| Concept | Level | Scope | Trust | Examples |
|---------|-------|-------|-------|----------|
| Tool | Low-level | Stateless action | native→mcp→api | context.read, file.write, mcp.invoke |
| Skill | Mid-level | Domain logic + tools | native/imported | software.project_review, legal.contract_analysis |
| Workflow | High-level | Multi-step orchestration | Declarative | spec-first flow, TDD workflow |
| Agent | Persona | Skill set + policy scope | Selected by router | software_architect, security_reviewer |
| Adapter | Integration | External system bridge | Wrapped | salesforce_adapter, vuln_scanner_adapter |
| Wrapper | Policy layer | Capability decorator | Untrusted by default | github_mcp_wrapper |
| Domain Pack | Bundle | All above for domain | Scoped | software-engineering, legal-ops |

### Trust and Policy Overlay

Wolf applies 6-step overlay to all external capabilities:
1. Discovery → 2. Trust scoring → 3. Policy check → 4. Gate application → 5. Fallback activation → 6. Audit logging

## 12. Concept v2 Updates

### Must Add

1. **SolveResult envelope** — unified output wrapper (evidence: 3 extraction reports, decision log A1).
2. **Router abstraction** — single interface with lightweight/full implementations (decision log A2).
3. **Artifact chain schema** — explicit linking for spec→tasks→tests→impl→release (anchor deep dive).
4. **Policy hierarchy** — global → domain → scenario → user override (decision log A6).
5. **Gate severity model** — silent / notify / block / expert_gate (decision log A4).
6. **PII subsystem** — detector + redactor + verifier, not just gate (decision log A5).
7. **MCP lifecycle manager** — connect/discover/health/invoke/disconnect (decision log A7).
8. **Circuit breaker** — max steps/tokens/external calls (decision log A8).

### Should Add

1. **Component taxonomy** — Core / Conditional / External (expert review).
2. **Capability taxonomy** — native → wrapped → MCP → imported_skill → direct_api (integration expert).
3. **Artifact lifecycle state machine** — created → validated → persisted (expert review).
4. **Observability subsystem** — MetricsCollector, ExecutionSpan for L3+ (SRE expert).
5. **Audit trail for emergency overrides** — immutable log with reason (security expert).

### Can Defer

1. All domain-specific helper components (ToneAdapter, ActionItemExtractor, etc.) — 1–2 occurrences each.
2. DomainPackCoordinator — cross-domain scenarios < 15%.
3. Custom plugin framework — 0 scenarios actually require custom code.
4. A2A protocol support — 0 scenarios use agent-to-agent.

### Reject / Keep Out

1. **LightweightSolvePlanner** — rejected in decision log R1. L2 uses routing.
2. **FullWorkflowEngine for L2–L3** — rejected in decision log R2. Overkill.
3. **AnswerCache** — rejected in decision log R4. L1 should be fast without cache.
4. **Auto-merge gate** — rejected in decision log R3. No scenarios request it.

## 13. Open Questions with Recommended Answers

1. **Q:** Should artifact links be stored in memory or in ArtifactStore?
   **A:** ArtifactStore with foreign_key links; memory holds indices only.

2. **Q:** Should SolveResult include embedded artifacts or references?
   **A:** References only; prevents duplication and keeps envelope lightweight.

3. **Q:** Should gate severity have auto-escalation (notify → block)?
   **A:** Yes: repeated notify on same action type within session escalates to block.

4. **Q:** Should domain packs be hot-swappable at runtime?
   **A:** No for MVP; load at session start. Hot-swap deferred to post-MVP.

5. **Q:** Should memory freshness be time-based or version-based?
   **A:** Version-based for artifacts (artifact_id + version), time-based for preferences.

6. **Q:** Should emergency mode have its own policy subset?
   **A:** Yes: emergency_policy that relaxes routing latency but keeps all safety gates.

7. **Q:** Should external capabilities have mandatory fallback_action?
   **A:** Yes: every external capability must specify fallback_action; validation enforces this.

8. **Q:** Should L1 scenarios produce structured AnswerArtifact or plain text?
   **A:** Structured AnswerArtifact for auditability; plain text rendering for UX.

9. **Q:** Should ADR/ADL be immutable once persisted?
   **A:** ADR immutable; ADL can be superseded by new version with link to predecessor.

10. **Q:** Should concept v2 include explicit multi-language support?
   **A:** No for MVP. All 80 scenarios are single-language. Defer to post-MVP.

