# Scenario Card Schema

## 1. Purpose

Scenario Bank is a formalized set of scenarios for researching the Mr. Wolf concept. Not for demonstration — for analysis: what subsystems are needed, what artifacts arise, how Wolf configures for different domains, where policies/gates, adapters, wrappers, memory, and imported capabilities are needed.

Scenarios must be compact, uniform, and suitable for automated analysis.

## 2. General Requirements

Each scenario must be:
- Concise
- Structured
- Domain-intelligible
- Suitable for simulation pass
- Suitable for machine aggregation
- Limited by controlled vocabulary
- No longer than 400–700 words in human-readable form
- Represented as JSONL/YAML object

Forbidden:
- Long dialogues in Scenario Card
- Mixing Scenario Card and Simulation Trace
- Arbitrary tags without vocabulary
- Architectural reasoning instead of behavior
- Roadmap or implementation plan inside scenario card

## 3. File Structure

```
scenario-bank/
  README.md
  schemas/
    scenario-card.schema.json
    scenario-playthrough.schema.json
    extraction-report.schema.json
  vocabularies/
    domains.yaml
    tags.yaml
    artifact-types.yaml
    capability-types.yaml
    policy-actions.yaml
    configuration-modes.yaml
  scenarios/
    software_engineering.jsonl
    architecture.jsonl
    office_assistant.jsonl
    legal_ops.jsonl
    research.jsonl
    product_management.jsonl
    finance_ops.jsonl
    hr_recruiting.jsonl
    security_compliance.jsonl
    data_analysis.jsonl
    content_marketing.jsonl
    personal_knowledge.jsonl
  generated/
    coverage-matrix.md
    artifact-catalog.md
    component-demand-map.md
    risk-summary.md
```

Source of truth — JSONL: one scenario = one JSON line.
Markdown render may be created for human reading, but source of truth is JSONL.

## 4. Required Fields

```yaml
id: string
title: string
domain: enum
subdomain: string
scenario_level: 1 | 2 | 3 | 4 | 5
domain_mode: enum
methodology: string[]
artifact_profile: enum[]
interaction_surface: enum[]
user_input: string
user_intent: object
wolf_configuration: object
expected_visible_behavior: string[]
internal_behavior: string[]
artifacts: object
capabilities: object
policies: object
gates: object[]
memory: object
failure_modes: string[]
analysis_tags: string[]
configuration_effort: object
new_capabilities_introduced: string[]
concept_questions: string[]
```

### Optional Fields (backward-compatible)

```yaml
execution_result:
  envelope_type: Answer | Plan | Artifact | Refusal | PartialResult
  summary: string
  confidence: high | medium | low
  trace_reference: string

observability_requirements:
  metrics: boolean
  spans: boolean
  alerts: string[]
```

**Note:** `observability_requirements` is required for new scenarios at Level 3+.

## 5. Full Template

```yaml
id: software.review.next_mvp.001
title: Review repository and suggest next MVP
domain: software_engineering
subdomain: roadmap_planning
scenario_level: 2

domain_mode: product
methodology:
  - lightweight_architecture_review
  - iterative_mvp_planning
artifact_profile:
  - minimal
  - report_based
interaction_surface:
  - cli
  - opencode

user_input: "Review the repository and suggest the next MVP."

user_intent:
  primary: propose_next_mvp
  secondary:
    - assess_current_state
    - identify_missing_capabilities
    - produce_actionable_recommendation
  ambiguity: low

wolf_configuration:
  mode:
    - generated_config
    - rule_routing
    - dynamic_persona
  domain_pack: software-engineering
  persona: software_architect
  autonomy: supervised
  explicit_config_needed: low
  adaptive_elements:
    - select_review_depth
    - choose_context_profile
    - select_model_route

expected_visible_behavior:
  - acknowledge task as project review
  - explain selected review path briefly
  - build or read project context
  - return concise next-MVP recommendation
  - include rationale and risks

internal_behavior:
  - create SolveRequest
  - select roadmap/review scenario
  - build or read ContextBundle
  - select architect/reviewer agent
  - choose reasoning model route
  - generate ReviewReport
  - write case trace

artifacts:
  inputs:
    - repository_files
    - README
    - docs
  intermediate:
    - ContextBundle
    - ScenarioDecision
  outputs:
    - name: ReviewReport
      type: report
      lifecycle_state: created  # created | validated | persisted
      domain_specific: false
    - name: NextMVPRecommendation
      type: recommendation
      lifecycle_state: created
      domain_specific: false
  persisted:
    - CaseTrace

capabilities:
  agents:
    - software_architect
  skills:
    - software.project_review
  tools:
    - context.read
  external: []

policies:
  allow:
    - read_project_files
    - read_docs
  ask: []
  deny:
    - file_write
    - shell_mutation

gates:
  - gate_name: ""
    severity: silent | notify | block  # default: block
    rationale: ""  # user-visible explanation

memory:
  read:
    - recent_case_summaries_optional
  write_candidates:
    - project_review_summary
  control_memory: []

failure_modes:
  - repository_context_too_large
  - missing_docs
  - scenario_misclassified_as_code_review
  - stale_memory_suggests_wrong_next_step

configuration_effort:
  level: generated_config
  notes: "Works with defaults; improves with software-engineering domain pack."

new_capabilities_introduced:
  - review_report_artifact

concept_questions:
  - should next-MVP recommendation be artifact or plain answer
  - should memory be consulted by default

analysis_tags:
  - context_answer
  - report_artifact
  - read_only
  - dynamic_persona
  - software_engineering

execution_result:
  envelope_type: Artifact
  summary: "ReviewReport with next MVP recommendation."
  confidence: high
  trace_reference: "CaseTrace"

observability_requirements:
  metrics: false
  spans: false
  alerts: []
```

## 6. Scenario Levels

```yaml
scenario_levels:
  1:
    name: simple_answer
    description: Wolf answers without workflow/tools.
  2:
    name: context_aware_answer
    description: Wolf reads context, no side effects.
  3:
    name: plan_dry_run
    description: Wolf builds plan/artifacts, does not act.
  4:
    name: governed_action
    description: Wolf uses tools and gates.
  5:
    name: multi_capability_external
    description: MCP/imported skill/wrapper/memory/A2A/domain conflict.
```

## 7. Configuration Effort Levels

```yaml
configuration_effort_levels:
  zero_config:
    meaning: Works with built-in defaults.
  generated_config:
    meaning: wolf init can generate required config.
  light_project_config:
    meaning: User edits a small wolf.yaml section.
  domain_pack:
    meaning: Requires enabling a domain pack.
  custom_workflow:
    meaning: Requires a workflow definition.
  custom_plugin:
    meaning: Requires code/plugin/adapter.
```

## 8. Naming Conventions

Scenario ID format:
```
<domain>.<subdomain>.<short_name>.<number>
```

Examples:
```
software.review.next_mvp.001
software.auth.enterprise_design.002
office.meeting.followup.001
legal.contract.nda_risk_review.001
research.literature.systematic_scan.001
finance.budget.scenario_plan.001
```

Rules:
- lowercase
- dot-separated
- stable once created
- do not reuse IDs
- if scenario changes significantly, create new scenario ID or revision field

## 9. Domain Coverage Targets

For the first large bank:
```
Target: 100–200 scenarios
Minimum domains: 10
Recommended domains: 12–15
Scenarios per domain: 8–12
```

Each domain should include:
```
at least 2 Level 1–2 scenarios
at least 2 Level 3 scenarios
at least 2 Level 4 scenarios
at least 1 Level 5 scenario
at least 2 different domain modes
at least 2 artifact profiles
at least 1 scenario with explicit governance
```

## 10. Quality Checks

A Scenario Card is valid if:
- All required fields are present
- Domain is from controlled vocabulary
- scenario_level is 1–5
- Configuration mode is explicit
- At least one artifact output is specified
- Failure modes are listed
- Analysis tags are from controlled vocabulary
- User input is natural and realistic
- Internal behavior is compact, not a full implementation plan
- Scenario does not assume impossible capabilities without marking them as required/new
- **NEW:** `wolf_configuration.mode` does not mix `zero_config` with `domain_pack`, `explicit_config`, or `custom_plugin`
- **NEW:** If `gates` present, each gate has `severity` (default: block) and `rationale`
- **NEW:** `observability_requirements` is present for Level 3+ scenarios
- **NEW:** Each `capabilities.external` entry has `type`, `trust_level`, and `fallback_action`
- **NEW:** `execution_result` is present for Level 2+ scenarios (recommended)

## 11. Compact JSONL Example

```json
{"id":"software.review.next_mvp.001","title":"Review repository and suggest next MVP","domain":"software_engineering","subdomain":"roadmap_planning","scenario_level":2,"domain_mode":"product","methodology":["lightweight_review"],"artifact_profile":["report_based"],"interaction_surface":["cli","opencode"],"user_input":"Review the repository and suggest the next MVP.","user_intent":{"primary":"propose_next_mvp","secondary":["assess_current_state"],"ambiguity":"low"},"wolf_configuration":{"mode":["generated_config","rule_routing","dynamic_persona"],"domain_pack":"software-engineering","persona":"software_architect","autonomy":"supervised","explicit_config_needed":"low"},"expected_visible_behavior":["explain selected review path","build or read context","return next-MVP recommendation"],"internal_behavior":["create SolveRequest","select roadmap scenario","read ContextBundle","invoke architect agent","write case trace"],"artifacts":{"inputs":["repository_files","docs"],"intermediate":["ContextBundle","ScenarioDecision"],"outputs":[{"name":"ReviewReport","type":"report","lifecycle_state":"created","domain_specific":false},{"name":"NextMVPRecommendation","type":"recommendation","lifecycle_state":"created","domain_specific":false}],"persisted":["CaseTrace"]},"capabilities":{"agents":["software_architect"],"skills":["software.project_review"],"tools":["context.read"],"external":[]},"policies":{"allow":["read_project_files"],"ask":[],"deny":["file_write"]},"gates":[],"memory":{"read":["recent_case_summaries_optional"],"write_candidates":["project_review_summary"],"control_memory":[]},"failure_modes":["repository_context_too_large","missing_docs","scenario_misclassified"],"configuration_effort":{"level":"generated_config","notes":"Works with defaults; improves with domain pack."},"new_capabilities_introduced":["review_report_artifact"],"concept_questions":["should recommendation be artifact or plain answer"],"analysis_tags":["context_answer","report_artifact","read_only","dynamic_persona"],"execution_result":{"envelope_type":"Artifact","summary":"ReviewReport with next MVP recommendation.","confidence":"high","trace_reference":"CaseTrace"}}
```
