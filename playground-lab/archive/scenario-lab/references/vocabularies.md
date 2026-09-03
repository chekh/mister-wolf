# Controlled Vocabularies

## Domains

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

## Domain Modes

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

## Methodologies

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

## Artifact Profiles

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

## Interaction Surfaces

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

## Configuration Modes

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

### Configuration Mode Ordering (for validation)

```yaml
configuration_mode_order:
  zero_config: 0
  generated_config: 1
  explicit_config: 2
  domain_pack: 3
  rule_routing: 3
  dynamic_persona: 3
  llm_assisted_selection: 3
  memory_adapted: 3
  user_clarified: 3
  nested_autoconfig: 4
  custom_workflow: 4
  custom_plugin: 5
```

**Validation rule:** `max(mode_order) - min(mode_order) <= 2` for a single scenario.
**Incompatibility rule:** `zero_config` cannot coexist with `domain_pack`, `explicit_config`, or `custom_plugin`.

## Analysis Tags

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
  - fast_path           # NEW
  - emergency_mode      # NEW
  - circuit_breaker_triggered  # NEW

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
  - audit_trail         # NEW
  - policy_override     # NEW
  - emergency_override  # NEW

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

  # observability  # NEW section
  - metrics_required
  - tracing_required
  - alert_triggered
```

## Scenario Levels

```yaml
scenario_levels:
  1: simple_answer          # Wolf answers without workflow/tools.
  2: context_aware_answer   # Wolf reads context, no side effects.
  3: plan_dry_run           # Wolf builds plan/artifacts, does not act.
  4: governed_action        # Wolf uses tools and gates.
  5: multi_capability_external  # MCP/imported skill/wrapper/memory/A2A/domain conflict.
```

## Configuration Effort Levels

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

## Governance Levels

```yaml
governance_levels:
  - autonomous
  - supervised
  - gated
  - expert_reviewed
```

## Outcome Types

```yaml
outcomes:
  success:          Wolf completed expected behavior.
  partial_success:  Wolf produced useful output but needed missing capabilities or assumptions.
  blocked:          Wolf could not proceed due to missing context, tools, config, or approval.
  refused:          Wolf correctly refused due to policy/hard-deny.
  unclear:          Scenario or user intent was too ambiguous for reliable behavior.
```

## Interaction Step Types

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

## Common Artifacts

```yaml
artifacts:
  inputs:
    - repository_files
    - user_request_text
    - uploaded_document
    - meeting_transcript
    - spreadsheet
    - database_query_result
    - api_response
    - external_reference
  intermediate:
    - ContextBundle
    - ScenarioDecision
    - SolveRequest
    - ExecutionPlan
    - ReviewDraft
    - RiskAssessmentDraft
  outputs:
    - ReviewReport
    - NextMVPRecommendation
    - ADR
    - ADL
    - RiskRegister
    - MeetingBrief
    - EmailDraft
    - PRDescription
    - PolicyDecision
    - AnalysisSummary
    - ConfigurationPlan
  persisted:
    - CaseTrace
    - MemoryBundle
    - ArtifactSnapshot
    - DecisionLog
```

## Common Capabilities

```yaml
capabilities:
  agents:
    - software_architect
    - security_reviewer
    - domain_expert
    - product_manager
    - legal_advisor
    - researcher
    - data_analyst
    - hr_specialist
    - sre_operator
  skills:
    - software.project_review
    - software.code_review
    - legal.contract_analysis
    - legal.nda_review
    - research.literature_scan
    - office.meeting_summary
    - office.email_draft
    - finance.budget_planning
    - data.analysis_report
  tools:
    - context.read
    - context.search
    - file.read
    - file.write
    - shell.exec
    - git.diff
    - git.commit
    - http.request
    - mcp.invoke
  external:
    - github.mcp
    - slack.mcp
    - jira.api
    - confluence.api
    - google_calendar.api
    - openclaw.skill_import
    - opencode.skill_import
```

## Common Policies

```yaml
policies:
  allow:
    - read_project_files
    - read_docs
    - read_public_data
    - draft_communication
    - generate_report
  ask:
    - file_write
    - shell_mutation
    - external_send
    - git_commit
    - deploy_action
    - financial_transaction
  deny:
    - dangerous_shell
    - secrets_exposure
    - unauthorized_external_send
    - legal_advice_without_gate
    - financial_action_without_approval
    - pii_disclosure
```

## Common Failure Modes

```yaml
failure_modes:
  - wrong_scenario
  - missing_context
  - missing_tool_permission
  - policy_conflict
  - memory_conflict
  - external_tool_unavailable
  - ambiguous_user_intent
  - stale_domain_pack
  - context_too_large
  - stale_memory_bias
  - repository_context_too_large
  - missing_docs
  - scenario_misclassified
  - missing_capability
  - model_hallucination
  - gate_misunderstood
  - runaway_workflow
  - cost_exceeded
  - latency_timeout
```

## Expert Roles

```yaml
expert_roles:
  - Architect
  - Developer/DX
  - Security/Governance
  - SRE/Operations
  - Product/UX
  - Integration
  - Domain Expert
  - Artifact Expert
```

## Subagent Roles (if available)

```yaml
subagent_roles:
  - Scenario Architect Agent
  - Domain Expert Agent
  - UX/Product Agent
  - Security/Governance Agent
  - SRE/Ops Agent
  - Integration Agent
  - Artifact Agent
  - Critic Agent
  - Aggregator Agent
```
