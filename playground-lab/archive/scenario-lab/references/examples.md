# Examples

## Example 1: Generate Scenarios

User:
```
Create 50 Scenario Cards for Mr. Wolf across software, legal, office, research and finance. Use levels 1–5 and include configuration mode.
```

Expected output:
```
JSONL Scenario Cards + coverage summary.
```

## Example 2: Run Playthrough

User:
```
Run a playthrough for scenario software.review.next_mvp.001.
```

Expected output:
```
Playthrough Record + Extraction Report.
```

## Example 3: Expert Review

User:
```
Review this Scenario Bank as architect, security, SRE and UX experts.
```

Expected output:
```
Role-based expert review with must-fix / should-fix / can-defer.
```

## Example 4: Aggregate Findings

User:
```
Analyze these 120 scenarios and extract artifact catalog, component demand map and MVP candidates.
```

Expected output:
```
Markdown summaries + structured catalogs.
```

## Example Scenario Card (Compact)

```json
{"id":"software.review.next_mvp.001","title":"Review repository and suggest next MVP","domain":"software_engineering","subdomain":"roadmap_planning","scenario_level":2,"domain_mode":"product","methodology":["lightweight_review"],"artifact_profile":["report_based"],"interaction_surface":["cli","opencode"],"user_input":"Review the repository and suggest the next MVP.","user_intent":{"primary":"propose_next_mvp","secondary":["assess_current_state"],"ambiguity":"low"},"wolf_configuration":{"mode":["generated_config","rule_routing","dynamic_persona"],"domain_pack":"software-engineering","persona":"software_architect","autonomy":"supervised","explicit_config_needed":"low"},"expected_visible_behavior":["explain selected review path","build or read context","return next-MVP recommendation"],"internal_behavior":["create SolveRequest","select roadmap scenario","read ContextBundle","invoke architect agent","write case trace"],"artifacts":{"inputs":["repository_files","docs"],"intermediate":["ContextBundle","ScenarioDecision"],"outputs":["ReviewReport","NextMVPRecommendation"],"persisted":["CaseTrace"]},"capabilities":{"agents":["software_architect"],"skills":["software.project_review"],"tools":["context.read"],"external":[]},"policies":{"allow":["read_project_files"],"ask":[],"deny":["file_write"]},"gates":[],"memory":{"read":["recent_case_summaries_optional"],"write_candidates":["project_review_summary"],"control_memory":[]},"failure_modes":["repository_context_too_large","missing_docs","scenario_misclassified"],"configuration_effort":{"level":"generated_config","notes":"Works with defaults; improves with domain pack."},"new_capabilities_introduced":["review_report_artifact"],"concept_questions":["should recommendation be artifact or plain answer"],"analysis_tags":["context_answer","report_artifact","read_only","dynamic_persona"]}
```

## Example Playthrough Record

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

## Example Extraction Report

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

## Example Expert Review Output

```yaml
role: Architect
top_concerns:
  - "SolveRequest routing may be too heavy for simple scenarios."
must_fix:
  - "Distinguish lightweight routing from full workflow orchestration."
should_fix:
  - "Add execution mode enum to ScenarioDecision."
can_defer:
  - "Multi-agent decomposition for repo review."
rejected_assumptions:
  - "Every scenario needs a workflow engine."
suggested_tests:
  - "Test Level 1 scenario without any workflow."
verdict: "Concept is sound if routing stays lightweight for simple cases."
```

## Example Coverage Matrix (Fragment)

| Domain | L1 | L2 | L3 | L4 | L5 | Gov | Ext | Mem |
|---|---|---|---|---|---|---|---|---|
| software_engineering | 2 | 3 | 3 | 2 | 2 | 3 | 2 | 1 |
| legal_ops | 2 | 2 | 2 | 2 | 1 | 4 | 1 | 1 |
| office_assistant | 3 | 2 | 2 | 2 | 1 | 2 | 1 | 0 |
| research | 2 | 2 | 3 | 2 | 1 | 2 | 2 | 2 |
| finance_ops | 2 | 2 | 2 | 1 | 1 | 3 | 1 | 0 |

## Example Clarifying Questions

When user request is underspecified, ask only the most important:
1. How many scenarios should be generated?
2. Which domains should be included?
3. Should playthroughs be generated now or only Scenario Cards?
4. What output format: JSONL, YAML, Markdown, or all?
5. Should the scenario bank target CLI, OpenCode, or all interaction surfaces?

Default assumptions if not specified:
```
number of scenarios: 100
domains: 10–12 mixed domains
levels: 1–5
output: JSONL + Markdown summaries
playthroughs: 30 selected scenarios
interaction surfaces: CLI + OpenCode + MCP/API optional
```
