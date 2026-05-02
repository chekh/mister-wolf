# Domain Methodology Gap Report

**Focus:** Professional process families and methodology coverage.

## software_engineering / architecture — Target Methodology Check

### software_engineering
- **Present:** adr_first
- **Missing:** specification_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### architecture
- **Present:** adr_first
- **Missing:** specification_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

## Cross-Domain Methodology Coverage

| domain | methodologies | notable_gaps |
|---|---|---|
| architecture | adr_first, checklist_based, expert_review, lightweight_review, rapid_prototyping, spec_driven | adl_first, compliance_review, incident_response... |
| concierge | checklist_based, concierge_planning, rapid_prototyping, spec_driven | adl_first, adr_first, compliance_review... |
| data_analysis | checklist_based, expert_review, lightweight_review, rapid_prototyping, spec_driven | adl_first, adr_first, compliance_review... |
| finance_ops | checklist_based, compliance_review, lightweight_review, rapid_prototyping, spec_driven | adl_first, adr_first, expert_review... |
| hr_recruiting | checklist_based, compliance_review, lightweight_review, rapid_prototyping, spec_driven | adl_first, adr_first, expert_review... |
| legal_ops | checklist_based, compliance_review, expert_review, rapid_prototyping | adl_first, adr_first, incident_response... |
| office_assistant | checklist_based, concierge_planning, lightweight_review, rapid_prototyping, spec_driven | adl_first, adr_first, compliance_review... |
| product_management | checklist_based, expert_review, kanban, lightweight_review, rapid_prototyping, research_protocol, spec_driven | adl_first, adr_first, compliance_review... |
| research | expert_review, lightweight_review, rapid_prototyping, research_protocol, spec_driven | adl_first, adr_first, checklist_based... |
| sales_crm | checklist_based, spec_driven | adl_first, adr_first, compliance_review... |
| security_compliance | checklist_based, compliance_review, expert_review, incident_response, lightweight_review, rapid_prototyping | adl_first, adr_first, kanban... |
| software_engineering | adr_first, checklist_based, expert_review, iterative_mvp_planning, lightweight_review, rapid_prototyping, spec_driven | adl_first, compliance_review, incident_response... |

## Critical Methodology Gaps

1. **`tdd`** — Present only in `software_engineering` (via `software.plan.refactoring_roadmap.048`). Absent from `architecture`, `data_analysis`, `security_compliance`.
2. **`release_readiness`** — Not used in any scenario. No release methodology coverage.
3. **`api_contract_design`** — Not used in any scenario.
4. **`legacy_modernization`** — Not explicitly tagged; only `legacy_maintenance` domain_mode exists.
5. **`security_sensitive_change`** — Not used in any scenario.
6. **`adl_first`** — Absent everywhere. Only `adr_first` is used.
