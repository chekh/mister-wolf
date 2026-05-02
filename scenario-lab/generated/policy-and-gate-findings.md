# Policy and Gate Findings

## Policy Patterns (by frequency)

| Policy | Occurrences |
|--------|-------------|
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
| auto_assign_without_review | 3 |
| financial_action | 2 |
| http.request | 2 |
| read_docs | 1 |
| run_tests | 1 |
| draft_plan | 1 |
| deploy_action | 1 |
| draft_pr_description | 1 |
| auto_merge_without_review | 1 |
| read_calendar | 1 |
| auto_delete_without_confirmation | 1 |
| read_public_data | 1 |
| run_containment_scripts | 1 |
| file_write_without_approval | 1 |
| run_model | 1 |

## Gate Patterns (by frequency)

| Gate | Occurrences | Severity |
|------|-------------|----------|
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
| experiment_plan_approval | 1 | block |
| expense_approval_gate | 1 | block |
| compliance_check_gate | 1 | block |
| emergency_action_approval | 1 | block |
| model_run_approval | 1 | block |
| data_access_approval | 1 | block |
| ats_access_approval | 1 | block |
| background_check_approval | 1 | block |
| budget_adjustment_approval | 1 | block |
| payroll_approval | 1 | block |
| bank_transfer_approval | 1 | block |
| ticket_creation_approval | 1 | block |
| external_update_approval | 1 | block |
| notification_approval | 1 | notify |
| external_api_approval | 1 | block |
| citation_sync_approval | 1 | notify |
| legal_disclaimer | 1 | notify |
| external_database_gate | 1 | block |
| external_system_gate | 1 | block |
| hris_write_gate | 1 | block |
| production_scan_gate | 1 | block |
| shell_execution_gate | 1 | block |
| legal_advice_gate | 1 | block |
| gdpr_feature_gate | 1 | block |
| audit_scope_gate | 1 | block |
| file_write_gate | 1 | block |
| crm_sync_gate | 1 | block |
| migration_approval | 1 | block |
| rollback_verification | 1 | block |
| ci_config_approval | 1 | block |
| coverage_gate | 1 | block |
| release_gate | 1 | block |
| external_tool_approval | 1 | block |

## Gate Severity Distribution

| Severity | Count |
|----------|-------|
| block | 63 |
| notify | 7 |

## Gate Severity Model

```
silent   → auto-approve, log only
notify   → inform user, continue unless blocked by another gate
block    → require explicit approval before proceeding
expert_gate → require domain expert approval (legal, security, architecture)
```

## Hard-Deny Policies

Confirmed hard-deny actions (always deny, no override):

- `auto_assign_without_review`
- `auto_delete_without_confirmation`
- `auto_hire_without_review`
- `auto_merge_without_review`
- `auto_publish_without_review`
- `auto_transfer_without_approval`
- `dangerous_shell`
- `deploy_action`
- `external_send`
- `file_write`
- `file_write_without_approval`
- `financial_action_without_approval`
- `legal_advice_without_gate`
- `personal_data_exposure`
- `secrets_exposure`
- `shell_mutation`
- `unauthorized_external_send`

## User-Visible Rationale Requirement

All gates with severity `block` or `expert_gate` must include `rationale` visible to user.
Evidence: all L4/L5 scenarios with gates specify rationale.

## Emergency Mode Policy

**Finding:** Emergency mode does NOT bypass gates in any scenario.
Evidence: `security.incident.response_runbook.018` (L5 emergency) still applies `external_notification_approval` gate.
**Rule:** Emergency mode = fast-track routing + logging, NOT gate bypass.
