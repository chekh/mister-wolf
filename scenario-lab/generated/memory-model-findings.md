# Memory Model Findings

## Memory Read Patterns

| Memory Item | Occurrences |
|-------------|-------------|
| previous_adrs | 3 |
| previous_releases | 3 |
| previous_assessments | 2 |
| previous_budgets | 2 |
| previous_roadmaps | 2 |
| previous_threat_models | 2 |
| previous_migrations | 2 |
| previous_specs | 2 |
| previous_adls | 2 |
| recent_case_summaries_optional | 1 |
| recent_refactor_cases | 1 |
| recent_pr_patterns | 1 |
| recent_contract_patterns | 1 |
| recent_negotiation_cases | 1 |
| precedent_decisions | 1 |
| recent_meeting_notes_optional | 1 |
| previous_board_packs | 1 |
| scheduling_preferences | 1 |
| previous_research_topics | 1 |
| previous_experiments | 1 |

## Memory Write Patterns

| Memory Item | Occurrences |
|-------------|-------------|
| project_review_summary | 1 |
| auth_module_refactor_summary | 1 |
| pr_creation_summary | 1 |
| nda_review_summary | 1 |
| negotiation_summary | 1 |
| gdpr_assessment_summary | 1 |
| board_pack_summary | 1 |
| reschedule_summary | 1 |
| research_summary | 1 |
| experiment_design_summary | 1 |
| budget_scenario_summary | 1 |
| expense_review_summary | 1 |
| prioritization_summary | 1 |
| research_synthesis_summary | 1 |
| compliance_gap_summary | 1 |
| incident_summary | 1 |
| screening_summary | 1 |
| sales_analysis_summary | 1 |
| dataset_summary | 1 |
| quality_assessment_summary | 1 |

## Memory Control Patterns

| Memory Item | Occurrences |
|-------------|-------------|
| active_incident_flag | 1 |
| active_hiring_flag | 1 |
| spec_reference | 1 |
| task_reference | 1 |
| release_reference | 1 |

## Required Memory Types

1. **Case Trace Memory** — every scenario produces `CaseTrace`. Universal.
2. **Artifact Link Memory** — spec→tasks→tests→impl→release chains need explicit links.
3. **Decision Memory** — ADR/ADL decisions must propagate to future scenarios.
4. **User/Project Preference Memory** — `previous_*` patterns across domains.
5. **Stale Memory Detection** — `stale_*` failure modes appear in 15+ scenarios.

## Artifact Link Memory Schema (Required)

```yaml
memory_links:
  - source: TechnicalSpecification
    target: TaskList
    link_type: decomposes_to
    direction: forward
  - source: TaskList
    target: ImplementationPlan
    link_type: implements_via
    direction: forward
  - source: TechnicalSpecification
    target: TestPlan
    link_type: tested_by
    direction: forward
  - source: TestPlan
    target: CoverageReport
    link_type: produces
    direction: forward
  - source: ADR
    target: ADL
    link_type: refines_to
    direction: forward
  - source: ADL
    target: ImplementationPlan
    link_type: constrains
    direction: forward
  - source: ImplementationPlan
    target: ReleaseChecklist
    link_type: requires
    direction: forward
  - source: ReleaseChecklist
    target: ChangeLog
    link_type: generates
    direction: forward
```

## Memory Safety Rules

- Memory must NOT be uncontrolled RAG.
- Every memory read must include `citation` (source scenario ID).
- Every memory read must include `freshness` timestamp.
- Policy boundaries: memory read cannot bypass `pii_handling_gate` or `secrets_handling_gate`.
- Evidence: `stale_memory_suggests_wrong_next_step` appears in 4 scenarios; `stale_compliance_framework` in 6.
