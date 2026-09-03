# Playthrough Schema

## 1. Purpose

Scenario Playthrough Bank stores results of "games" played through scenarios. The game is needed to go beyond static Scenario Cards and verify how a human and Mr. Wolf interact over time.

Playthrough must not become a long fictional dialogue. It must be a short structured simulation from which requirements, artifacts, risks, UX problems, policy gaps, and subsystem boundaries can be extracted.

## 2. Core Game Idea

Each scenario is played by three roles:
```
User Simulator    — plays a real user.
Wolf Simulator    — plays Mr. Wolf per current concept.
Observer/Critic   — records weak spots, artifacts, subsystems, and concept questions.
```

Additional specialized expert roles may be added:
```
Security Reviewer, SRE Reviewer, Domain Reviewer,
Integration Reviewer, Artifact Reviewer
```

## 3. Game Results

Two records per scenario:
1. **Playthrough Record** — short interaction modeling.
2. **Extraction Report** — structured analysis of what the game showed for the concept.

Source of truth — JSONL:
```
scenario-bank/playthroughs/playthroughs.jsonl
scenario-bank/playthroughs/extraction-reports.jsonl
```

## 4. Directory Structure

```
scenario-bank/
  playthroughs/
    playthroughs.jsonl
    extraction-reports.jsonl
    by-domain/
      software_engineering.jsonl
      office_assistant.jsonl
      legal_ops.jsonl
    summaries/
      playthrough-summary.md
      weak-spots.md
      concept-updates.md
```

## 5. Game Rules

### 5.1 General Rules
- Play only one Scenario Card at a time.
- Do not rewrite Scenario Card during the game; changes go to Extraction Report.
- No long dialogues.
- Maximum 8–12 interaction steps.
- Each step must have an explicit actor.
- Wolf Simulator must not use capabilities not in Scenario Card without marking `missing_capability`.
- If Wolf is unsure, ask/clarify instead of guessing.
- If action is risky, apply policy/gate.
- If action is impossible, explain why-not.

### 5.2 User Simulator Behavior
Must behave like a real human:
- Formulate tasks incompletely
- Not know Wolf internal terms
- Sometimes change requirements
- Sometimes want quick results
- Sometimes not understand if Wolf will make side effects
- Sometimes ask "do everything yourself"
- Sometimes give clarification after Wolf asks

Must NOT:
- Hint at architecture
- Name internal components
- Pre-select the correct workflow
- Be a perfect user

### 5.3 Wolf Simulator Behavior
Must act per Mr. Wolf concept:
- Accept task through facade
- Determine scenario
- Consider confidence/ambiguity
- Build plan if needed
- Apply configuration mode
- Choose persona/skill/workflow/tool/model
- Apply policy
- Ask for approval
- Refuse on hard-deny
- Create or use artifacts
- Explain important decisions to user

Must NOT:
- Execute side effects without policy
- Use LLM as hard policy replacement
- Hide uncertainty
- Load all skills/tools at once
- Turn simple scenario into full orchestration without reason

### 5.4 Observer/Critic Behavior
Records:
- Where user was unclear
- Where Wolf made correct clarification
- Where Wolf erred or should have asked
- Where overengineering arose
- Where artifact was missing
- Where gate is needed
- Where wrapper/adapter is needed
- Where memory/context is lacking
- Where policy conflict appeared
- What conceptual questions arose

Observer/Critic must be strict. Goal is not to confirm the concept but to find weak spots.

## 6. Playthrough Record Format

```yaml
playthrough_id: string
scenario_id: string
run_id: string
played_at: string
roles:
  user_simulator: string
  wolf_simulator: string
  observer: string

summary:
  user_goal: string
  wolf_path: string
  outcome: success | partial_success | blocked | refused | unclear

interaction_steps:
  - step: 1
    actor: user | wolf | observer
    type: user_request | clarification_question | clarification_answer | plan | approval_request | approval_response | action | result | refusal | observation
    content: string
    gate_explanation: string  # NEW: why approval is needed (for approval_request steps)
    internal_notes:
      scenario_decision: string
      confidence: high | medium | low
      artifacts_created: string[]
      policies_checked: string[]
      capabilities_used: string[]

final_visible_result:
  type: answer | plan | artifact | refusal | partial_result
  summary: string

runtime_path:
  scenario: string
  persona: string
  execution_mode: simple_answer | context_answer | dry_run | workflow | governed_action | external_capability
  configuration_mode: string[]
  components_used: string[]
  circuit_breaker_triggered: boolean  # NEW
  circuit_breaker_reason: string      # NEW: reason if triggered

artifacts_observed:
  created: string[]
  used: string[]
  missing: string[]

policy_and_gates:
  decisions: string[]
  gates_created: string[]
  refusals: string[]

issues_detected:
  - description: string
    severity: critical | major | minor | info  # NEW
    category: architecture | security | ux | performance | domain  # NEW
```

## 7. Extraction Report Format

```yaml
extraction_id: string
scenario_id: string
playthrough_id: string

verdict:
  usefulness: high | medium | low
  realism: high | medium | low
  concept_pressure: high | medium | low
  implementation_risk: high | medium | low

behavior_findings:
  user_confusion_points: string[]
  wolf_decision_points:
    - decision: string
      confidence: high | medium | low
      issue: string
  good_behaviors: string[]
  bad_behaviors: string[]

artifact_findings:
  required_artifacts: string[]
  missing_artifacts: string[]
  questionable_artifacts: string[]
  artifact_lifecycle_questions: string[]

component_findings:
  components_confirmed: string[]
  components_missing: string[]
  components_overkill: string[]
  new_components_suggested: string[]

configuration_findings:
  configuration_mode_confirmed: string[]
  config_needed: string[]
  can_be_zero_config: boolean
  generated_config_possible: boolean
  domain_pack_needed: boolean
  custom_plugin_needed: boolean

policy_findings:
  required_policies: string[]
  required_gates: string[]
  hard_denies: string[]
  policy_conflicts: string[]
  safety_gaps: string[]

capability_findings:
  required_tools: string[]
  required_skills: string[]
  required_adapters: string[]
  required_wrappers: string[]
  imported_capabilities: string[]

memory_findings:
  memory_needed: none | read | write_candidate | control
  memory_items: string[]
  stale_memory_risks: string[]
  memory_visibility_concerns: string[]

failure_modes:
  observed: string[]
  potential: string[]
  mitigations: string[]

complexity_assessment:
  implementation_complexity: 1
  config_complexity: 1
  runtime_risk: 1
  security_risk: 1
  latency_cost_risk: 1
  debugging_complexity: 1
  total: 6
  recommendation: safe_mvp | simplify | split | defer

concept_updates:
  must_add: string[]
  should_add: string[]
  can_defer: string[]
  rejected_assumptions: string[]

next_questions:
  - string
```

## 8. Outcome Types

```yaml
outcomes:
  success:          Wolf completed expected behavior.
  partial_success:  Wolf produced useful output but needed missing capabilities or assumptions.
  blocked:          Wolf could not proceed due to missing context, tools, config, or approval.
  refused:          Wolf correctly refused due to policy/hard-deny.
  unclear:          Scenario or user intent was too ambiguous for reliable behavior.
```

## 9. Interaction Step Types

```yaml
interaction_step_types:
  - user_request
  - clarification_question
  - clarification_answer
  - scenario_explanation
  - plan
  - dry_run
  - approval_request
  - approval_response
  - action
  - tool_call
  - artifact_created
  - result
  - refusal
  - observation
```

## 10. Simulation Summary Requirements

Must be short:
```
max 12 interaction steps
max 2 sentences per step
no full prompt transcripts unless necessary
no implementation code
no long explanations
```

Goal: see behavior structure, not write a novel.

## 11. Four Play Modes

For important scenarios, 4 runs may be conducted.

### 11.1 UX Play
Focus: What does the user see? Where do they get confused? Are explanations enough? Where is dry-run needed? Where is approval needed?

### 11.2 Runtime Play
Focus: What components wake up? What objects are created? What decisions does Wolf make? What artifacts appear?

### 11.3 Failure Play
Focus: What if router is wrong? What if policy conflict? What if tool unavailable? What if memory stale? What if user didn't give approval?

### 11.4 Minimality Play
Focus: What can be removed? What is overkill? Can it be solved simpler? What is the minimum useful version?

Not every scenario needs all 4 runs. Levels 1–2: UX + Minimality enough. Levels 4–5: all 4 desirable.

## 12. Example Playthrough Record

```yaml
playthrough_id: pt-software-review-next-mvp-001
scenario_id: software.review.next_mvp.001
run_id: run-001
played_at: 2026-05-01
roles:
  user_simulator: product_user
  wolf_simulator: mr_wolf_current_concept
  observer: architect_critic

summary:
  user_goal: "Understand current project state and choose next MVP."
  wolf_path: "Context-aware single-agent review with lightweight scenario routing."
  outcome: success

interaction_steps:
  - step: 1
    actor: user
    type: user_request
    content: "Review the repository and suggest the next MVP."
    internal_notes: {}
  - step: 2
    actor: wolf
    type: scenario_explanation
    content: "I interpret this as project review / roadmap planning. First I will gather context, then return a brief report and recommendation."
    internal_notes:
      scenario_decision: roadmap_planning
      confidence: high
      artifacts_created:
        - ScenarioDecision
      policies_checked:
        - read_only_allowed
      capabilities_used: []
  - step: 3
    actor: wolf
    type: action
    content: "Gathering project context in read-only mode."
    internal_notes:
      artifacts_created:
        - ContextBundle
      capabilities_used:
        - context.read
  - step: 4
    actor: wolf
    type: result
    content: "Next MVP: Wolf Facade / Solve Command. Reason: without a single entry point current runtime primitives remain fragmented."
    internal_notes:
      artifacts_created:
        - ReviewReport
        - NextMVPRecommendation

final_visible_result:
  type: artifact
  summary: "ReviewReport with next MVP recommendation."

runtime_path:
  scenario: roadmap_planning
  persona: software_architect
  execution_mode: context_answer
  configuration_mode:
    - generated_config
    - dynamic_persona
  components_used:
    - WolfFacade
    - ScenarioRouterLight
    - ContextResolver
    - AgentRunner
    - ModelRouter
    - TraceSystem

artifacts_observed:
  created:
    - ScenarioDecision
    - ContextBundle
    - ReviewReport
    - CaseTrace
  used:
    - repository_files
    - docs
  missing: []

policy_and_gates:
  decisions:
    - read_only_allowed
  gates_created: []
  refusals: []

issues_detected:
  - "Need explicit distinction between report as final answer vs persisted artifact."
```

## 13. Example Extraction Report

```yaml
extraction_id: er-software-review-next-mvp-001
scenario_id: software.review.next_mvp.001
playthrough_id: pt-software-review-next-mvp-001

verdict:
  usefulness: high
  realism: high
  concept_pressure: medium
  implementation_risk: low

behavior_findings:
  user_confusion_points: []
  wolf_decision_points:
    - decision: "selected roadmap_planning"
      confidence: high
      issue: "No issue; user intent was clear."
  good_behaviors:
    - "Wolf explained selected path before acting."
    - "Wolf stayed read-only."
  bad_behaviors: []

artifact_findings:
  required_artifacts:
    - ScenarioDecision
    - ContextBundle
    - ReviewReport
    - CaseTrace
  missing_artifacts:
    - "Explicit SolveResult envelope"
  questionable_artifacts: []
  artifact_lifecycle_questions:
    - "Should ReviewReport be stored under artifacts/ or only in outputs?"

component_findings:
  components_confirmed:
    - WolfFacade
    - ScenarioRouterLight
    - ContextResolver
    - AgentRunner
    - ModelRouter
    - TraceSystem
  components_missing:
    - SolveResultEnvelope
  components_overkill:
    - FullWorkflowEngine
    - MultiAgentDelegation
  new_components_suggested:
    - LightweightSolvePlanner

configuration_findings:
  configuration_mode_confirmed:
    - generated_config
    - dynamic_persona
  config_needed:
    - default_review_scenario
  can_be_zero_config: true
  generated_config_possible: true
  domain_pack_needed: false
  custom_plugin_needed: false

policy_findings:
  required_policies:
    - read_only_project_access
  required_gates: []
  hard_denies:
    - no_file_write
  policy_conflicts: []
  safety_gaps: []

capability_findings:
  required_tools:
    - context.read
  required_skills:
    - software.project_review_optional
  required_adapters: []
  required_wrappers: []
  imported_capabilities: []

memory_findings:
  memory_needed: read
  memory_items:
    - recent_case_summaries_optional
  stale_memory_risks:
    - "Old roadmap decision may bias recommendation."
  memory_visibility_concerns: []

failure_modes:
  observed: []
  potential:
    - context_too_large
    - stale_memory_bias
  mitigations:
    - use bounded context
    - cite memory source and freshness

complexity_assessment:
  implementation_complexity: 2
  config_complexity: 1
  runtime_risk: 1
  security_risk: 1
  latency_cost_risk: 2
  debugging_complexity: 1
  total: 8
  recommendation: safe_mvp

concept_updates:
  must_add:
    - SolveResult envelope
  should_add:
    - Artifact lifecycle rule for reports
  can_defer:
    - Multi-agent roadmap analysis
  rejected_assumptions:
    - "Full workflow required for repo review"

next_questions:
  - "Should project review use memory by default or only when present?"
```

## 14. Quality Gates

A playthrough is valid if:
- References an existing Scenario Card
- Has no more than 12 interaction steps
- Includes final outcome
- Lists components used
- Lists artifacts created/used/missing
- Has policy/gate notes
- Has issues_detected
- Has a matching Extraction Report

An Extraction Report is valid if:
- Includes verdict
- Includes behavior findings
- Includes artifact findings
- Includes component findings
- Includes policy findings
- Includes complexity assessment
- Includes concept updates

## 15. How Playthrough Data is Used

Playthrough data feeds:
```
Concept updates, Functional decomposition, Artifact catalog,
Capability registry design, Policy model, Adapter model,
Memory model, Roadmap prioritization, First Useful Product definition
```

The playthrough bank should be treated as research data. Do not overwrite old playthroughs; create new runs when the concept changes.
