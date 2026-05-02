# Failure Mode Clusters

## Model Hallucination / Misunderstanding

**Examples:** model_hallucination, overly_generic_answer, overly_technical_answer, model_hallucination_on_legal_terms

**Affected domains:** all

**Required safeguard:** ModelRouter + prompt constraints

**Responsible component:** WolfFacade, ModelRouter

**Occurrences in bank:** 24

## Stale Data / Memory

**Examples:** stale_data, stale_memory_suggests_wrong_next_step, stale_compliance_framework, stale_legal_precedents, stale_forecast_model

**Affected domains:** all

**Required safeguard:** Freshness checks + bounded context

**Responsible component:** MemoryBundle, ContextResolver

**Occurrences in bank:** 20

## Missing Context / Too Large

**Examples:** missing_context, context_too_large, repository_context_too_large, missing_docs, missing_infrastructure_docs

**Affected domains:** all

**Required safeguard:** Bounded context + progressive disclosure

**Responsible component:** ContextResolver

**Occurrences in bank:** 18

## External API / MCP Unavailable

**Examples:** external_tool_unavailable, mcp_unavailable, jira_unavailable, confluence_unavailable, slack_unavailable

**Affected domains:** L4/L5

**Required safeguard:** Fallback actions + retry policy

**Responsible component:** MCPWrapper, AdapterLayer

**Occurrences in bank:** 13

## Policy Conflict

**Examples:** policy_conflict, policy_conflict_on_external_action, policy_conflict_on_file_write, policy_conflict_on_pii, policy_conflict_on_sync

**Affected domains:** L4/L5

**Required safeguard:** Policy hierarchy + conflict resolver

**Responsible component:** PolicyCore

**Occurrences in bank:** 11

## PII / Secrets Exposure

**Examples:** pii_in_transcripts, pii_in_resumes, secrets_in_configs, secrets_exposure, personal_data_exposure

**Affected domains:** legal, HR, security, finance

**Required safeguard:** PII detector + redactor + verifier

**Responsible component:** PolicyCore, PII subsystem

**Occurrences in bank:** 10

## Test / CI Failure

**Examples:** ci_failure, missing_test_coverage, coverage_below_threshold, test_failure

**Affected domains:** software_engineering

**Required safeguard:** Coverage gate + CI monitor

**Responsible component:** PolicyCore, TraceSystem

**Occurrences in bank:** 12

## Release / Migration Rollback

**Examples:** rollback_needed, rollback_failure, incomplete_rollback_plan, backward_compatibility_break

**Affected domains:** software_engineering, architecture

**Required safeguard:** Rollback verification gate

**Responsible component:** PolicyCore

**Occurrences in bank:** 5

## Jurisdiction / Compliance Mismatch

**Examples:** jurisdiction_mismatch, currency_mismatch

**Affected domains:** legal, finance

**Required safeguard:** Jurisdiction detector + multi-framework support

**Responsible component:** Domain Pack

**Occurrences in bank:** 6

## Runaway Workflow / Cost

**Examples:** runaway_workflow, cost_exceeded

**Affected domains:** L5

**Required safeguard:** Circuit breaker (max steps, tokens, external calls)

**Responsible component:** TraceSystem, CircuitBreaker

**Occurrences in bank:** 2

## Gate Misunderstanding / Timeout

**Examples:** gate_misunderstood, expert_gate_timeout

**Affected domains:** L4/L5

**Required safeguard:** Gate explanation + timeout handling

**Responsible component:** PolicyCore

**Occurrences in bank:** 3

## Missing Capability / Tool

**Examples:** missing_capability, missing_tool_permission

**Affected domains:** all

**Required safeguard:** Capability registry + graceful degradation

**Responsible component:** CapabilityRegistry

**Occurrences in bank:** 0

---

## Summary Table

| Cluster | Examples | Occurrences | Component |
|---------|----------|-------------|-----------|
| Model Hallucination / Misunderstanding | 4 | 24 | WolfFacade, ModelRouter |
| Stale Data / Memory | 7 | 20 | MemoryBundle, ContextResolver |
| Missing Context / Too Large | 5 | 18 | ContextResolver |
| External API / MCP Unavailable | 8 | 13 | MCPWrapper, AdapterLayer |
| Policy Conflict | 5 | 11 | PolicyCore |
| PII / Secrets Exposure | 5 | 10 | PolicyCore, PII subsystem |
| Test / CI Failure | 4 | 12 | PolicyCore, TraceSystem |
| Release / Migration Rollback | 4 | 5 | PolicyCore |
| Jurisdiction / Compliance Mismatch | 2 | 6 | Domain Pack |
| Runaway Workflow / Cost | 2 | 2 | TraceSystem, CircuitBreaker |
| Gate Misunderstanding / Timeout | 2 | 3 | PolicyCore |
| Missing Capability / Tool | 2 | 0 | CapabilityRegistry |
