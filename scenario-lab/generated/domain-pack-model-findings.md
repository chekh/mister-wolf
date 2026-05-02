# Domain Pack Model Findings

## What is a Domain Pack

A domain pack is a scoped configuration bundle that extends the universal runtime with domain-specific:
- skills
- tools
- artifact types and templates
- policies and gates
- personas
- workflows

## Domain Pack Usage in Bank

| Domain Pack | Scenarios |
|-------------|-----------|
| software-engineering | 18 |
| architecture | 8 |
| legal-ops | 5 |
| research | 5 |
| finance-ops | 5 |
| security-compliance | 5 |
| hr-recruiting | 5 |
| data-analysis | 5 |
| office-assistant | 4 |
| product-management | 4 |
| concierge | 2 |
| sales-crm | 2 |

## Domain Pack Structure

```
universal_runtime/
  WolfFacade
  ContextResolver
  AgentRunner
  TraceSystem
  ScenarioRouter
  ModelRouter
  PolicyCore (base)

domain_packs/
  <domain>/
    config.yaml          # domain-specific settings
    skills/              # imported or native skills
    tools/               # tool definitions + adapters
    artifacts/           # templates + lifecycle rules
    policies/            # domain policy overlays
    gates/               # domain-specific gates
    personas/            # domain personas
    workflows/           # reusable workflow definitions
```

## Cross-Domain Scenarios

**Finding:** 4 cross-domain scenarios exist in bank:
- `legal_product.roadmap.liability_review.049` (legal + product)
- `sec_finance.audit.payment_compliance.050` (security + finance)
- `research_sales.pitch.market_research_summary.051` (research + sales)
- `arch_sec.adr.threat_model_review.052` (architecture + security)
- `arch_sec.cross_domain.external_review.080` (architecture + security, L5)

## DomainPackCoordinator: Need or Not?

**Verdict:** Not needed now.

**Rationale:**
1. Cross-domain scenarios (5 of 80 = 6.25%) are still rare.
2. Current cross-domain scenarios work via `domain_pack` + `explicit_config` without coordinator.
3. Composition rules (policy union, artifact merge) are sufficient for 2-domain cases.
4. `DomainPackCoordinator` becomes necessary only with 3+ domain orchestration or dynamic domain switching.
5. **Defer** to post-MVP when cross-domain scenarios exceed 15% of bank.

## Domain-Specific Policy Overlays

| Domain | Key Policies | Key Gates |
|--------|--------------|-----------|
| software_engineering | file_write_asks, test_coverage_gate | file_write_approval, test_coverage_gate, release_gate |
| legal_ops | legal_advice_without_gate | expert_gate_legal_advice, legal_advice_disclaimer |
| finance_ops | financial_action_without_approval | budget_adjustment_approval, payroll_approval, bank_transfer_approval |
| security_compliance | secrets_exposure | secrets_handling_gate, security_review_gate |
| hr_recruiting | personal_data_exposure | pii_handling_gate, offer_send_approval |
