# Deep-Dive Priorities — Domain Depth Audit

**Date:** 2026-05-02
**Scope:** 60 scenarios, 12 domains.

## Top-5 Domains Requiring Deep Dive

1. **concierge** (score 15/22)
   - **Scenarios:** 3 (`concierge.answer.local_restaurants.055`, `concierge.plan.travel_itinerary.056`, `concierge.plan.event_coordination.060`)
   - **Why:** Missing levels L4, L5; limited methodologies (checklist_based, concierge_planning, rapid_prototyping, spec_driven); few output artifacts (5).
   - **Critical artifact gaps:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan
   - **Critical methodology gaps:** specification_first, adr_first, adl_first, tdd, release_readiness
   - **Deep-dive recommendation:** `required_now`

2. **sales_crm** (score 15/22)
   - **Scenarios:** 2 (`sales_crm.plan.outreach_strategy.057`, `sales_crm.action.update_opportunity_stage.058`)
   - **Why:** Missing levels L1, L2, L5; limited methodologies (checklist_based, spec_driven); few output artifacts (4).
   - **Critical artifact gaps:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan
   - **Critical methodology gaps:** specification_first, adr_first, adl_first, tdd, release_readiness
   - **Deep-dive recommendation:** `required_now`

3. **architecture** (score 16/22)
   - **Scenarios:** 4 (`arch_sec.adr.threat_model_review.052`, `arch.explain.microservices_vs_monolith.053`, `arch.adr.create_decision_record.054`, `arch.plan.migration_roadmap.059`)
   - **Why:** Missing levels L1, L5; limited methodologies (adr_first, checklist_based, expert_review, lightweight_review, rapid_prototyping, spec_driven); few output artifacts (7).
   - **Critical artifact gaps:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan
   - **Critical methodology gaps:** specification_first, adl_first, tdd, release_readiness, api_contract_design
   - **Deep-dive recommendation:** `required_now`

## Domains to Defer

- **office_assistant** (score 19/22) — sufficiently covered for current concept stage.
- **data_analysis** (score 20/22) — sufficiently covered for current concept stage.
- **finance_ops** (score 20/22) — sufficiently covered for current concept stage.
- **hr_recruiting** (score 20/22) — sufficiently covered for current concept stage.
- **legal_ops** (score 20/22) — sufficiently covered for current concept stage.
- **product_management** (score 20/22) — sufficiently covered for current concept stage.
- **research** (score 20/22) — sufficiently covered for current concept stage.
- **security_compliance** (score 20/22) — sufficiently covered for current concept stage.
- **software_engineering** (score 20/22) — sufficiently covered for current concept stage.

## software_engineering_and_architecture_findings

### software_engineering
- **Scenarios:** 5 (`software.review.next_mvp.001`, `software.refactor.legacy_cleanup.002`, `software.ci.github_mcp_pr.003`, `software.explain.quick_answer.004`, `software.plan.refactoring_roadmap.048`)
- **Levels:** L1, L2, L3, L4, L5 — missing none
- **Methodologies present:** adr_first, checklist_based, expert_review, iterative_mvp_planning, lightweight_review, rapid_prototyping, spec_driven
- **Methodologies missing:** specification_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change
- **Output artifacts:** ADR, CISummary, NextMVPRecommendation, PRDescription, RefactorReport, RefactoringRoadmap, ReviewReport, RiskRegister, TestResults
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract, DataModel, TestPlan, TestCaseList, CoverageReport, MigrationPlan, CompatibilityMatrix, RollbackPlan, ReleaseChecklist, CIReport, ChangeLog, ReleaseNotes, SecurityReviewReport
- **Artifact profiles:** adr_adl, decision_log, minimal, report_based, spec_based
- **Gates:** 4 (block)
- **External capabilities:** 1
- **Verdict:** `deep`

### architecture
- **Scenarios:** 4 (`arch_sec.adr.threat_model_review.052`, `arch.explain.microservices_vs_monolith.053`, `arch.adr.create_decision_record.054`, `arch.plan.migration_roadmap.059`)
- **Levels:** L2, L3, L4 — missing L1, L5
- **Methodologies present:** adr_first, checklist_based, expert_review, lightweight_review, rapid_prototyping, spec_driven
- **Methodologies missing:** specification_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change
- **Output artifacts:** ADR, ADRReview, ComparisonReport, MigrationRoadmap, MitigationPlan, RiskRegister, ThreatModel
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract, DataModel, TestPlan, TestCaseList, CoverageReport, MigrationPlan, CompatibilityMatrix, RollbackPlan, ReleaseChecklist, CIReport, ChangeLog, ReleaseNotes, SecurityReviewReport
- **Artifact profiles:** adr_adl, audit_heavy, decision_log, minimal, report_based, spec_based
- **Gates:** 4 (block)
- **External capabilities:** 0
- **Verdict:** `deep`

### Cross-cutting SE+Architecture Observations

- `architecture` has **0 external capabilities** and **0 L5** scenarios. For a domain that should validate runtime assembly and cross-domain orchestration, this is a critical gap.
- `software_engineering` lacks `specification_first`, `tdd` (only one scenario), `release_readiness`, `api_contract_design`. The anchor domain is under-developed in professional methodologies.
- Neither domain covers `test_heavy` or `release_heavy` artifact profiles. Testing and release are invisible in the scenario bank.
- `software_engineering` has only **5 scenarios** vs 6 in other domains; with the framework originating from dev-tooling, this is surprisingly shallow.
- Missing artifact chains: spec→tasks→implementation→tests; ADR→ADL→decision evolution; release→changelog→notes.

## Recommended Next-Wave Scenarios (No New Cards Generated)

The following scenario types should be generated in the next wave to close critical gaps:

1. **architecture L5** — Multi-cloud migration with external cost API and security gate. Validates cross-domain orchestration.
2. **software_engineering L4/L5** — API contract design with OpenAPI generation, test plan, and CI gate. Closes `api_contract_design` and `test_heavy` gaps.
3. **software_engineering L3** — Release readiness review with `ReleaseChecklist`, `ChangeLog`, `ReleaseNotes`. Closes `release_readiness` gap.
4. **concierge L4/L5** — Real-time booking via external API with fallback and PII gate. Closes shallow coverage.
5. **sales_crm L1/L2/L5** — Only 2 scenarios exist. Need simple answer (L1) and full CRM pipeline automation (L5).
