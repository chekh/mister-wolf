# Mr. Wolf Scenario Bank — формат сценария и структура банка сценариев

## 1. Назначение

Scenario Bank — это формализованный набор сценариев для исследования концепции Mr. Wolf. Он нужен не для демонстрации, а для анализа: какие подсистемы нужны, какие артефакты возникают, как Wolf настраивается под разные домены, где нужны policy/gates, adapters, wrappers, memory и imported capabilities.

Сценарии должны быть компактными, однородными и пригодными для автоматического анализа.

## 2. Общие требования

Каждый сценарий должен быть:

- лаконичным;
- структурированным;
- доменно понятным;
- пригодным для simulation pass;
- пригодным для машинной агрегации;
- ограниченным controlled vocabulary;
- не длиннее 400–700 слов в human-readable форме;
- представленным как JSONL/YAML object.

Запрещено:

- писать длинные диалоги в Scenario Card;
- смешивать Scenario Card и Simulation Trace;
- использовать произвольные теги без словаря;
- описывать архитектурные рассуждения вместо поведения;
- добавлять roadmap или implementation plan в карточку сценария.

## 3. Рекомендуемая структура файлов

```text
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

Основной формат хранения — JSONL: один сценарий = одна строка JSON.

Допустимо дополнительно создавать Markdown-render для чтения человеком, но source of truth — JSONL.

## 4. Scenario Card — обязательные поля

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
gates: string[]
memory: object
failure_modes: string[]
analysis_tags: string[]
configuration_effort: object
new_capabilities_introduced: string[]
concept_questions: string[]
```

## 5. Scenario Card — полный шаблон

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

user_input: 'Проверь репозиторий и предложи следующий MVP.'

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
    - ReviewReport
    - NextMVPRecommendation
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

gates: []

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
  notes: 'Works with defaults; improves with software-engineering domain pack.'

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
```

## 6. Controlled vocabularies

### 6.1 Domains

```yaml
domains:
  - software_engineering
  - architecture
  - office_assistant
  - legal_ops
  - concierge
  - research
  - product_management
  - sales_crm
  - finance_ops
  - hr_recruiting
  - education
  - security_compliance
  - data_analysis
  - content_marketing
  - personal_knowledge
```

### 6.2 Domain modes

```yaml
domain_modes:
  - prototype
  - personal
  - product
  - production
  - enterprise
  - regulated
  - audit_heavy
  - emergency
  - legacy_maintenance
  - exploratory
```

### 6.3 Methodologies

```yaml
methodologies:
  - rapid_prototyping
  - spec_driven
  - adr_first
  - adl_first
  - tdd
  - checklist_based
  - expert_review
  - compliance_review
  - research_protocol
  - concierge_planning
  - kanban
  - incident_response
  - lightweight_review
```

### 6.4 Artifact profiles

```yaml
artifact_profiles:
  - minimal
  - report_based
  - spec_based
  - adr_adl
  - diagram_heavy
  - audit_heavy
  - compliance_heavy
  - evidence_table
  - draft_communication
  - decision_log
```

### 6.5 Interaction surfaces

```yaml
interaction_surfaces:
  - cli
  - opencode
  - vscode
  - openclaw
  - mcp_client
  - api
  - chat
  - github_action
```

### 6.6 Configuration modes

```yaml
configuration_modes:
  - zero_config
  - generated_config
  - explicit_config
  - domain_pack
  - rule_routing
  - dynamic_persona
  - llm_assisted_selection
  - memory_adapted
  - user_clarified
  - nested_autoconfig
  - custom_workflow
  - custom_plugin
```

### 6.7 Analysis tags

```yaml
analysis_tags:
  # interaction
  - cli
  - opencode
  - vscode
  - api
  - chat

  # execution
  - simple_answer
  - context_answer
  - dry_run
  - workflow
  - tool_call
  - external_action
  - multi_agent
  - a2a

  # configuration
  - zero_config
  - generated_config
  - explicit_config
  - domain_pack
  - dynamic_persona
  - memory_adapted
  - llm_assisted

  # risk
  - read_only
  - writes_files
  - external_send
  - financial_action
  - legal_risk
  - personal_data
  - security_sensitive
  - high_cost

  # governance
  - allow
  - ask
  - deny
  - expert_gate
  - policy_conflict
  - hard_deny

  # capability
  - mcp
  - bash_script
  - http_api
  - imported_skill
  - native_skill
  - wrapper
  - adapter
  - memory
  - artifact
```

## 7. Scenario levels

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

## 8. Configuration effort levels

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

## 9. Naming conventions

Scenario ID format:

```text
<domain>.<subdomain>.<short_name>.<number>
```

Examples:

```text
software.review.next_mvp.001
software.auth.enterprise_design.002
office.meeting.followup.001
legal.contract.nda_risk_review.001
research.literature.systematic_scan.001
finance.budget.scenario_plan.001
```

Rules:

- lowercase;
- dot-separated;
- stable once created;
- do not reuse IDs;
- if scenario changes significantly, create a new scenario ID or revision field.

## 10. Domain coverage targets

For the first large bank:

```text
Target: 100–200 scenarios
Minimum domains: 10
Recommended domains: 12–15
Scenarios per domain: 8–12
```

Each domain should include:

```text
at least 2 Level 1–2 scenarios
at least 2 Level 3 scenarios
at least 2 Level 4 scenarios
at least 1 Level 5 scenario
at least 2 different domain modes
at least 2 artifact profiles
at least 1 scenario with explicit governance
```

## 11. Quality checks for Scenario Cards

A Scenario Card is valid if:

- all required fields are present;
- domain is from controlled vocabulary;
- scenario_level is 1–5;
- configuration mode is explicit;
- at least one artifact output is specified;
- failure modes are listed;
- analysis tags are from controlled vocabulary;
- user input is natural and realistic;
- internal behavior is compact, not a full implementation plan;
- scenario does not assume impossible capabilities without marking them as required/new.

## 12. Example compact Scenario Card in JSONL style

```json
{
  "id": "software.review.next_mvp.001",
  "title": "Review repository and suggest next MVP",
  "domain": "software_engineering",
  "subdomain": "roadmap_planning",
  "scenario_level": 2,
  "domain_mode": "product",
  "methodology": ["lightweight_review"],
  "artifact_profile": ["report_based"],
  "interaction_surface": ["cli", "opencode"],
  "user_input": "Проверь репозиторий и предложи следующий MVP.",
  "user_intent": { "primary": "propose_next_mvp", "secondary": ["assess_current_state"], "ambiguity": "low" },
  "wolf_configuration": {
    "mode": ["generated_config", "rule_routing", "dynamic_persona"],
    "domain_pack": "software-engineering",
    "persona": "software_architect",
    "autonomy": "supervised",
    "explicit_config_needed": "low"
  },
  "expected_visible_behavior": [
    "explain selected review path",
    "build or read context",
    "return next-MVP recommendation"
  ],
  "internal_behavior": [
    "create SolveRequest",
    "select roadmap scenario",
    "read ContextBundle",
    "invoke architect agent",
    "write case trace"
  ],
  "artifacts": {
    "inputs": ["repository_files", "docs"],
    "intermediate": ["ContextBundle", "ScenarioDecision"],
    "outputs": ["ReviewReport", "NextMVPRecommendation"],
    "persisted": ["CaseTrace"]
  },
  "capabilities": {
    "agents": ["software_architect"],
    "skills": ["software.project_review"],
    "tools": ["context.read"],
    "external": []
  },
  "policies": { "allow": ["read_project_files"], "ask": [], "deny": ["file_write"] },
  "gates": [],
  "memory": {
    "read": ["recent_case_summaries_optional"],
    "write_candidates": ["project_review_summary"],
    "control_memory": []
  },
  "failure_modes": ["repository_context_too_large", "missing_docs", "scenario_misclassified"],
  "configuration_effort": { "level": "generated_config", "notes": "Works with defaults; improves with domain pack." },
  "new_capabilities_introduced": ["review_report_artifact"],
  "concept_questions": ["should recommendation be artifact or plain answer"],
  "analysis_tags": ["context_answer", "report_artifact", "read_only", "dynamic_persona"]
}
```
