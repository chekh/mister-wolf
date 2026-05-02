# Concept v2 Examples Needed

**Date:** 2026-05-05
**Source:** Concept v2 Expert Review Pass
**Target:** `generated/concept-v2-draft.md`

---

## must have (документ неполный без них)

### E-MF-1: End-to-end scenario examples
- **Section:** After §2 Problem Statement OR within §4 Core Behavioral Model
- **Purpose:** Show what Wolf actually does for user at each level
- **Format:** 3 short vignettes (≤10 lines each)
- **Content:**
  1. **L1 simple_answer:** «User: Объясни spec-first. Wolf: [2-paragraph explanation].» Internal: SolveResult(Answer, trace_ref, no artifacts).
  2. **L3 plan_dry_run:** «User: Создай TechnicalSpecification для фичи X. Wolf: [shows preview of spec]. User: looks good. Wolf: persists TechnicalSpecification artifact.» SolveResult(Artifact, trace_ref, ref:spec-123).
  3. **L4 governed_action:** «User: Примени implementation plan. Wolf: [shows plan + diff preview]. Gate: file_write_approval triggered. User: approves. Wolf: writes files, returns ImplementationPlan artifact.» SolveResult(Artifact, trace_ref, policy_decisions:[file_write_approved], gates_triggered:[file_write_approval]).

### E-MF-2: SolveResult examples
- **Section:** §6 SolveResult / ExecutionResult Model
- **Purpose:** Clarify canonical envelope with concrete JSON/YAML
- **Format:** 3 YAML blocks after schema
- **Content:**
  1. **Answer envelope (L1):**
     ```yaml
     envelope_type: Answer
     summary: "Explanation of spec-first methodology"
     confidence: high
     artifacts: ["answer-artifact-001"]  # internal AnswerArtifact
     trace_reference: "case-2026-0505-001"
     policy_decisions: ["personal_data_exposure:clean"]
     gates_triggered: []
     ```
  2. **Refusal envelope (L1–L5):**
     ```yaml
     envelope_type: Refusal
     summary: "Cannot perform file write without approval"
     confidence: high
     artifacts: []
     trace_reference: "case-2026-0505-002"
     policy_decisions: ["file_write_without_approval:hard_deny"]
     gates_triggered: []
     refusal_reason: "Policy file_write_without_approval prohibits this action. Use explicit_config to enable file_write_approval gate."
     ```
  3. **PartialResult envelope (L4):**
     ```yaml
     envelope_type: PartialResult
     summary: "Implementation plan partially applied. 3 of 5 files written."
     confidence: medium
     artifacts: ["impl-plan-001", "file-changes-001"]
     trace_reference: "case-2026-0505-003"
     policy_decisions: ["file_write:approved", "external_send:blocked"]
     gates_triggered: ["file_write_approval", "external_action_approval:blocked"]
     completed_steps: ["read_spec", "generate_plan", "write_files_1_3"]
     blocked_steps: ["sync_jira", "send_notification"]
     ```

### E-MF-3: Domain pack configuration example
- **Section:** §10 Domain Pack Model
- **Purpose:** Show developer how to create domain pack
- **Format:** YAML file (≤40 lines)
- **Content:**
  ```yaml
  # domain_packs/software-engineering/config.yaml
  name: software-engineering
  version: "1.0.0"
  description: "Software engineering domain pack for Mr. Wolf"

  default_persona: senior_engineer

  skills:
    - software.project_review
    - software.spec_first
    - software.tdd

  tools:
    - native:context.read
    - native:file.read
    - wrapped:file.write
    - mcp:github.pr

  artifacts:
    templates:
      - TechnicalSpecification
      - TaskList
      - TestPlan
    lifecycle:
      default: created → persisted
      validation: deferred

  policies:
    overlay:
      file_write: require_approval
      external_send: require_approval
    hard_deny:
      - dangerous_shell
      - auto_merge_without_review

  gates:
    - file_write_approval
    - test_coverage_gate

  workflows:
    - spec_first_flow
    - tdd_workflow
  ```

---

## should have (улучшают понимание)

### E-SF-1: Component interaction diagram
- **Section:** §5 Runtime Architecture
- **Purpose:** Show how components interact for different levels
- **Format:** ASCII art or Mermaid diagram
- **Content:**
  - L1 flow: User → WolfFacade → ModelRouter → AgentRunner → TraceSystem → SolveResult
  - L3 flow: User → WolfFacade → Router → ContextResolver → AgentRunner → ArtifactStore → TraceSystem → SolveResult
  - L5 flow: User → WolfFacade → Router → ContextResolver → AgentRunner → MCPWrapper → AdapterLayer → ArtifactStore → TraceSystem → SolveResult (with PolicyCore checks at each action)

### E-SF-2: Policy hierarchy example
- **Section:** §8 Policy and Gate Model / Policy hierarchy
- **Purpose:** Show how conflicts resolve
- **Format:** Table or tree diagram
- **Content:**
  ```
  Global: external_send = block
  Domain (legal-ops): external_send = notify
  Scenario (contract_review): external_send = notify
  User override: external_send = silent

  Result: block (global wins as most restrictive)
  ```

### E-SF-3: Gate approval UX flow
- **Section:** §8 Policy and Gate Model / Gate severity
- **Purpose:** Show what user sees
- **Format:** Step-by-step text flow
- **Content:**
  1. Wolf generates ImplementationPlan
  2. PolicyCore detects `file_write` action
  3. Gate `file_write_approval` triggered (severity: block)
  4. Wolf shows user: «This action will modify 3 files. [Show diff preview] [Rationale: file_write policy requires approval for repository mutations.]"
  5. User options: [Approve] [Reject] [Modify plan]
  6. If approved: Wolf writes files, returns SolveResult with `gates_triggered: [file_write_approval]`
  7. If rejected: Wolf returns `PartialResult` with `blocked_steps: ["write_files"]`

### E-SF-4: Artifact chain example
- **Section:** §7 Artifact Model / Artifact chains
- **Purpose:** Show concrete artifact linking
- **Format:** Table with artifact IDs and link types
- **Content:**
  ```
  Artifact ID          | Type                  | Links
  ---------------------|-----------------------|---------------------------
  spec-001             | TechnicalSpecification| decomposes_to → task-001
  spec-001             | TechnicalSpecification| tested_by → testplan-001
  task-001             | TaskList              | implements_via → impl-001
  testplan-001         | TestPlan              | produces → coverage-001
  impl-001             | ImplementationPlan    | requires → release-001
  release-001          | ReleaseChecklist      | generates → changelog-001
  ```

### E-SF-5: Configuration mode matrix
- **Section:** §12 Configuration Model
- **Purpose:** Clarify overlaps between modes
- **Format:** Venn-style table
- **Content:**
  | Mode | Auto-detect domain | Load domain pack | User config required | Example scenario |
  |------|-------------------|------------------|---------------------|------------------|
  | zero_config | No | No | No | «Объясни spec-first» |
  | generated_config | Yes | Optional | No | «Проанализируй этот репозиторий» |
  | explicit_config | Yes | Optional | Yes | «Используй software-engineering pack» |
  | domain_pack | Yes | Yes | Optional | «Создай spec с TDD workflow» |

### E-SF-6: Memory read example with citation
- **Section:** §11 Memory Model / Memory safety
- **Purpose:** Show what «citation + freshness» means in practice
- **Format:** YAML block
- **Content:**
  ```yaml
  memory_read:
    query: "previous TechnicalSpecification for auth module"
    result:
      artifact_id: "spec-001"
      artifact_type: "TechnicalSpecification"
      citation:
        source_scenario: "software.spec.create_technical_spec.066"
        case_trace: "case-2026-0501-042"
      freshness:
        type: version-based
        version: "1.0.0"
        created: "2026-05-01T10:00:00Z"
      policy_check:
        pii_handling_gate: passed
        secrets_handling_gate: passed
  ```

---

## optional (nice to have)

### E-OP-1: Emergency mode flow example
- **Section:** §8 Policy and Gate Model / Emergency mode
- **Purpose:** Show fast-track without bypass
- **Format:** Text flow
- **Content:**
  1. Incident detected (active_incident_flag = true)
  2. Emergency policy activated: routing latency relaxed, skip clarification
  3. Wolf routes to security incident workflow (L5)
  4. External notification required → `external_notification_approval` gate STILL triggered
  5. Gate approved (security team on-call)
  6. Action executed with enhanced logging
  7. Audit trail: «Emergency mode: routing relaxed, gate NOT bypassed, approver: security-oncall-001»

### E-OP-2: Capability trust overlay example
- **Section:** §9 Capability Model / External capabilities
- **Purpose:** Show 6-step overlay for MCP tool
- **Format:** Numbered list with decision points
- **Content:**
  1. Discovery: MCP server `github-mcp` exposes `create_pr` tool
  2. Trust scoring: MCP = trust level 3 (wrapped > MCP > imported)
  3. Policy check: Domain pack allows `github.pr` with `file_write_approval` gate
  4. Gate application: `file_write_approval` triggered (block)
  5. Fallback activation: If MCP unavailable, fallback = «generate PR description, leave manual creation to user»
  6. Audit logging: TraceSystem logs all 6 steps

### E-OP-3: Rejected components rationale table
- **Section:** §14 Scope Boundaries / rejected
- **Purpose:** Show discipline in scope management
- **Format:** Table
- **Content:**
  | Component | Rejected because | Alternative |
  |-----------|------------------|-------------|
  | LightweightSolvePlanner | L2 uses routing | RouterLight |
  | FullWorkflowEngine for L2–L3 | Overkill | Conditional workflow for L4+ |
  | AnswerCache | Model selection is faster | ModelRouter |
  | Auto-merge gate | No scenarios request it | Hard-deny on auto-merge |
  | Automated bias correction | Human review required | Bias flag + human review |

### E-OP-4: Cross-domain composition example
- **Section:** §10 Domain Pack Model / Cross-domain composition
- **Purpose:** Show how 2-domain case works without coordinator
- **Format:** Text example
- **Content:**
  - Scenario: Architecture review + Security review (arch + sec)
  - Composition:
    - Policy union: arch policies ∪ sec policies, conservative resolution
    - Artifact merge: arch artifacts (ADL, SystemDiagram) + sec artifacts (ThreatModel)
    - Persona: Router selects `security_architect` (from sec pack) as lead
  - Result: Single workflow with combined artifacts, no DomainPackCoordinator needed

### E-OP-5: Failure mode response example
- **Section:** §13 Failure Modes and Safeguards
- **Purpose:** Show concrete safeguard in action
- **Format:** Before/After text
- **Content:**
  - **Failure:** `stale_memory_suggests_wrong_next_step`
  - **Context:** Wolf reads previous spec (spec-001, version 1.0.0, created 2026-05-01). Current date 2026-05-15.
  - **Detection:** Freshness check: spec-001 is 14 days old. Threshold: 7 days.
  - **Safeguard:** Wolf shows warning: «Previous spec is 14 days old. It may be outdated. [View spec-001] [Ignore and continue] [Refresh from source]»
  - **Result:** User chooses «Refresh from source». Wolf re-reads repository and updates context.

---

## Priority Summary

| Example | Section | Priority | Effort |
|---------|---------|----------|--------|
| End-to-end scenarios | §4 | must | low |
| SolveResult YAML | §6 | must | low |
| Domain pack config | §10 | must | low |
| Component diagram | §5 | should | medium |
| Policy hierarchy tree | §8 | should | low |
| Gate approval flow | §8 | should | low |
| Artifact chain table | §7 | should | low |
| Config mode matrix | §12 | should | low |
| Memory read YAML | §11 | should | low |
| Emergency flow | §8 | optional | low |
| Trust overlay steps | §9 | optional | low |
| Rejected table | §14 | optional | low |
| Cross-domain example | §10 | optional | low |
| Failure response | §13 | optional | low |

**Recommendation:** Add all 3 must-have examples + 4–5 should-have examples. Skip optional unless document still feels abstract after must/should additions.

---

*Examples needed extracted from 8-role review. All examples use existing Scenario Lab scenarios and artifacts.*
