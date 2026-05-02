# Domain Depth Audit — Mr. Wolf Scenario Lab
**Scope:** 60 Scenario Cards across 12 domains.
**Date:** 2026-05-02
**Method:** Automated analysis of scenario bank JSONL against controlled vocabulary.
---

## architecture
**Scenarios:** 4 (`arch_sec.adr.threat_model_review.052`, `arch.explain.microservices_vs_monolith.053`, `arch.adr.create_decision_record.054`, `arch.plan.migration_roadmap.059`)
**Depth Score:** 16/22 | **Verdict:** `deep` | **Recommendation:** `required_now`

### 1. Level Coverage
- **Covered:** L2, L3, L4
- **Missing:** L1, L5

### 2. Domain Modes
- **Covered:** enterprise, personal
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, product...

### 3. Methodologies
- **Covered:** adr_first, checklist_based, expert_review, lightweight_review, rapid_prototyping, spec_driven
- **Missing target methods:** specification_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** adr_adl, audit_heavy, decision_log, minimal, report_based, spec_based
- **Missing:** compliance_heavy, diagram_heavy, draft_communication, evidence_table

### 5. Artifact Depth
- **Output artifacts:** ADR, ADRReview, ComparisonReport, MigrationRoadmap, MitigationPlan, RiskRegister, ThreatModel
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 4 (severities: block)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config

### 8. External Capability Depth
- **None**

### 9. Memory Depth
- **Read:** previous_adrs, previous_architecture_cases, previous_migrations, previous_threat_models
- **Write candidates:** adr_summary, architecture_comparison_summary, migration_roadmap_summary, threat_model_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`required_now`

---

## concierge
**Scenarios:** 3 (`concierge.answer.local_restaurants.055`, `concierge.plan.travel_itinerary.056`, `concierge.plan.event_coordination.060`)
**Depth Score:** 15/22 | **Verdict:** `deep` | **Recommendation:** `required_now`

### 1. Level Coverage
- **Covered:** L1, L2, L3
- **Missing:** L4, L5

### 2. Domain Modes
- **Covered:** enterprise, personal
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, product...

### 3. Methodologies
- **Covered:** checklist_based, concierge_planning, rapid_prototyping, spec_driven
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** decision_log, minimal, report_based, spec_based
- **Missing:** adr_adl, audit_heavy, compliance_heavy, diagram_heavy, draft_communication, evidence_table

### 5. Artifact Depth
- **Output artifacts:** Answer, Checklist, EventCoordinationPlan, ItineraryPlan, MeetingLogistics
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 0 (severities: none)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, generated_config, zero_config

### 8. External Capability Depth
- **None**

### 9. Memory Depth
- **Read:** previous_events, previous_travel_plans
- **Write candidates:** event_coordination_summary, travel_itinerary_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`required_now`

---

## data_analysis
**Scenarios:** 6 (`data.analysis.quarterly_report.020`, `data.analysis.explain_metric.021`, `data.analysis.dataset_summary.022`, `data.analysis.quality_assessment.023`, `data.analysis.predictive_model.024`, `data.analysis.bi_dashboard.025`)
**Depth Score:** 20/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** enterprise, personal, product
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, production...

### 3. Methodologies
- **Covered:** checklist_based, expert_review, lightweight_review, rapid_prototyping, spec_driven
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** audit_heavy, decision_log, diagram_heavy, minimal, report_based
- **Missing:** adr_adl, compliance_heavy, draft_communication, evidence_table, spec_based

### 5. Artifact Depth
- **Output artifacts:** AnalysisReport, Answer, CleaningPlan, DashboardConfig, DataSourceMapping, DatasetSummary, FeatureImportance, ForecastModel, PredictionReport, QualityReport
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 3 (severities: block)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, llm_assisted_selection, zero_config

### 8. External Capability Depth
- `tableau.mcp` (mcp) — fallback: `draft dashboard config locally without Tableau connection`

### 9. Memory Depth
- **Read:** previous_analyses, previous_dashboards, previous_models, previous_quality_checks, previous_sales_reports
- **Write candidates:** dashboard_creation_summary, dataset_summary, model_run_summary, quality_assessment_summary, sales_analysis_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

## finance_ops
**Scenarios:** 6 (`finance.budget.scenario_plan.013`, `finance.expense.approval_workflow.014`, `finance.explain_cash_flow.031`, `finance.invoice_review.032`, `finance.budget_variance.033`, `finance.payroll_integration.034`)
**Depth Score:** 20/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** enterprise, personal, product
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, production...

### 3. Methodologies
- **Covered:** checklist_based, compliance_review, lightweight_review, rapid_prototyping, spec_driven
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** audit_heavy, decision_log, minimal, report_based
- **Missing:** adr_adl, compliance_heavy, diagram_heavy, draft_communication, evidence_table, spec_based

### 5. Artifact Depth
- **Output artifacts:** AdjustmentLog, AnomalyReport, Answer, DecisionLog, ExpenseReportReview, PayrollReport, RiskRegister, ScenarioPlan, TransferConfirmation, VarianceReport
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 5 (severities: block)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, llm_assisted_selection, zero_config

### 8. External Capability Depth
- `erp.api` (direct_api) — fallback: `process expense locally without ERP sync`
- `erp.mcp` (mcp) — fallback: `process payroll locally without ERP sync`
- `bank.api` (direct_api) — fallback: `generate transfer instructions for manual processing`

### 9. Memory Depth
- **Read:** expense_policies, previous_budgets, previous_invoices, previous_payrolls
- **Write candidates:** budget_adjustment_summary, budget_scenario_summary, expense_review_summary, invoice_review_summary, payroll_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

## hr_recruiting
**Scenarios:** 6 (`hr.recruit.screen_candidates.019`, `hr.recruit.explain_process.026`, `hr.recruit.candidate_compare.027`, `hr.recruit.interview_plan.028`, `hr.recruit.send_offer.029`, `hr.recruit.full_cycle.030`)
**Depth Score:** 20/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** enterprise, personal, product
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, production...

### 3. Methodologies
- **Covered:** checklist_based, compliance_review, lightweight_review, rapid_prototyping, spec_driven
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** audit_heavy, decision_log, draft_communication, evidence_table, minimal, report_based, spec_based
- **Missing:** adr_adl, compliance_heavy, diagram_heavy

### 5. Artifact Depth
- **Output artifacts:** Answer, BackgroundCheckResult, ComparisonMatrix, CompetencyMatrix, EmailDraft, HiringCycleReport, InterviewPlan, OfferConfirmation, RankedCandidateList, ScreeningReport
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 5 (severities: block)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, llm_assisted_selection, zero_config

### 8. External Capability Depth
- `ats.mcp` (mcp) — fallback: `manage hiring locally without ATS sync`
- `background_check.api` (direct_api) — fallback: `flag candidate for manual background verification`

### 9. Memory Depth
- **Read:** hiring_templates, previous_evaluations, previous_hiring_cycles, previous_interview_plans, previous_offers, previous_screening_criteria
- **Write candidates:** candidate_comparison_summary, hiring_cycle_summary, interview_plan_summary, offer_send_summary, screening_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

## legal_ops
**Scenarios:** 6 (`legal.nda.quick_review.005`, `legal.contract.enterprise_negotiation.006`, `legal.privacy.gdpr_assessment.007`, `legal.explain.contract_basics.041`, `legal.cross_border.m_a_due_diligence.042`, `legal_product.roadmap.liability_review.049`)
**Depth Score:** 20/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** enterprise, personal, regulated
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, product...

### 3. Methodologies
- **Covered:** checklist_based, compliance_review, expert_review, rapid_prototyping
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** audit_heavy, compliance_heavy, decision_log, evidence_table, minimal, report_based
- **Missing:** adr_adl, diagram_heavy, draft_communication, spec_based

### 5. Artifact Depth
- **Output artifacts:** Answer, ComplianceReport, CounterProposalDraft, DueDiligenceReport, EvidenceTable, FeatureRiskMatrix, LiabilityRiskReport, NDASummary, RiskRegister
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 10 (severities: block, notify)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, llm_assisted_selection, zero_config

### 8. External Capability Depth
- `external_legal_db.api` (direct_api) — fallback: `use internal precedent memory without external query`
- `legal_database.api` (direct_api) — fallback: `draft checklist locally without live queries`
- `patent_registry.api` (direct_api) — fallback: `request manual IP verification`

### 9. Memory Depth
- **Read:** precedent_decisions, previous_assessments, previous_due_diligence_cases, previous_legal_product_reviews, recent_contract_patterns, recent_negotiation_cases
- **Write candidates:** due_diligence_summary, gdpr_assessment_summary, liability_review_summary, nda_review_summary, negotiation_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

## office_assistant
**Scenarios:** 5 (`office.email.draft_followup.008`, `office.meeting.prep_board_pack.009`, `office.schedule.calendar_conflict.010`, `office.doc.summarize_meeting_notes.043`, `office.workflow.onboarding_automation.044`)
**Depth Score:** 19/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** enterprise, personal
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, product...

### 3. Methodologies
- **Covered:** checklist_based, concierge_planning, lightweight_review, rapid_prototyping, spec_driven
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** audit_heavy, decision_log, diagram_heavy, draft_communication, minimal, report_based
- **Missing:** adr_adl, compliance_heavy, evidence_table, spec_based

### 5. Artifact Depth
- **Output artifacts:** ActionItemList, EmailDraft, ExecutiveSummary, MeetingBrief, OnboardingChecklist, RescheduleConfirmation, SetupConfirmation
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 6 (severities: block, notify)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, llm_assisted_selection, zero_config

### 8. External Capability Depth
- `google_calendar.api` (mcp) — fallback: `propose slots without calendar update`
- `slack.mcp` (mcp) — fallback: `draft manual Slack invite instructions`
- `google_calendar.api` (mcp) — fallback: `propose calendar invites without auto-creation`
- `hris.api` (mcp) — fallback: `draft HRIS setup checklist without API write`

### 9. Memory Depth
- **Read:** previous_board_packs, previous_meeting_summaries, previous_onboarding_cases, recent_meeting_notes_optional, scheduling_preferences
- **Write candidates:** board_pack_summary, meeting_summary, onboarding_summary, reschedule_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

## product_management
**Scenarios:** 5 (`product.roadmap.prioritize_features.015`, `product.user.research_synthesis.016`, `product.explain_prioritization.035`, `product.jira.ticket.036`, `product.roadmap.sync.037`)
**Depth Score:** 20/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** enterprise, personal, product
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, production...

### 3. Methodologies
- **Covered:** checklist_based, expert_review, kanban, lightweight_review, rapid_prototyping, research_protocol, spec_driven
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** decision_log, diagram_heavy, evidence_table, minimal, report_based, spec_based
- **Missing:** adr_adl, audit_heavy, compliance_heavy, draft_communication

### 5. Artifact Depth
- **Output artifacts:** Answer, CapacityRiskSummary, EvidenceTable, JiraTicketLink, PrioritizedBacklog, ResearchSynthesis, RoadmapDiagram, SyncReport, TicketSpec
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 4 (severities: block, notify)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, llm_assisted_selection, zero_config

### 8. External Capability Depth
- `jira.mcp` (mcp) — fallback: `draft ticket locally without Jira creation`
- `jira.mcp` (mcp) — fallback: `draft updates locally without Jira sync`
- `confluence.mcp` (mcp) — fallback: `draft docs locally without Confluence sync`
- `slack.mcp` (mcp) — fallback: `log notification to CaseTrace without sending`

### 9. Memory Depth
- **Read:** previous_research_syntheses, previous_roadmaps, previous_tickets
- **Write candidates:** prioritization_summary, research_synthesis_summary, roadmap_sync_summary, ticket_creation_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

## research
**Scenarios:** 6 (`research.literature.systematic_scan.011`, `research.data.experiment_design.012`, `research.explain_methodology.038`, `research.paper.summary.039`, `research.systematic.scan.040`, `research_sales.pitch.market_research_summary.051`)
**Depth Score:** 20/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** enterprise, personal, product, research
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, production...

### 3. Methodologies
- **Covered:** expert_review, lightweight_review, rapid_prototyping, research_protocol, spec_driven
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** evidence_table, minimal, report_based, spec_based
- **Missing:** adr_adl, audit_heavy, compliance_heavy, decision_log, diagram_heavy, draft_communication

### 5. Artifact Depth
- **Output artifacts:** Answer, CitationSyncLog, EvidenceTable, ExperimentPlan, MetricsDefinition, PaperSummary, ResearchSummary, SalesTalkingPoints
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 3 (severities: block, notify)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, llm_assisted_selection, zero_config

### 8. External Capability Depth
- `arxiv.api` (direct_api) — fallback: `use cached search results without live query`
- `semantic_scholar.api` (direct_api) — fallback: `use cached search results without live query`
- `arxiv.api` (direct_api) — fallback: `use cached search results without live query`
- `semantic_scholar.api` (direct_api) — fallback: `use cached search results without live query`
- `zotero.mcp` (mcp) — fallback: `export citations locally without Zotero sync`

### 9. Memory Depth
- **Read:** previous_experiments, previous_research_topics, previous_sales_pitches, previous_scans, previous_summaries
- **Write candidates:** experiment_design_summary, paper_summary, research_summary, sales_synthesis_summary, systematic_scan_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

## sales_crm
**Scenarios:** 2 (`sales_crm.plan.outreach_strategy.057`, `sales_crm.action.update_opportunity_stage.058`)
**Depth Score:** 15/22 | **Verdict:** `deep` | **Recommendation:** `required_now`

### 1. Level Coverage
- **Covered:** L3, L4
- **Missing:** L1, L2, L5

### 2. Domain Modes
- **Covered:** enterprise
- **Missing:** audit_heavy, emergency, exploratory, legacy_maintenance, personal...

### 3. Methodologies
- **Covered:** checklist_based, spec_driven
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** decision_log, minimal, report_based, spec_based
- **Missing:** adr_adl, audit_heavy, compliance_heavy, diagram_heavy, draft_communication, evidence_table

### 5. Artifact Depth
- **Output artifacts:** MessagingGuide, OutreachStrategy, StageUpdateLog, SyncConfirmation
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 2 (severities: block, notify)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config

### 8. External Capability Depth
- `salesforce.mcp` (mcp) — fallback: `draft stage update plan without CRM sync`

### 9. Memory Depth
- **Read:** previous_crm_updates, previous_outreach_plans
- **Write candidates:** crm_update_summary, outreach_strategy_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`required_now`

---

## security_compliance
**Scenarios:** 6 (`security.compliance.soc2_gap.017`, `security.incident.response_runbook.018`, `security.explain.phishing_risks.045`, `security.docs.review_policy_document.046`, `security.infra.run_vulnerability_scan.047`, `sec_finance.audit.payment_compliance.050`)
**Depth Score:** 20/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** audit_heavy, emergency, enterprise, personal, regulated
- **Missing:** exploratory, legacy_maintenance, product, production, prototype

### 3. Methodologies
- **Covered:** checklist_based, compliance_review, expert_review, incident_response, lightweight_review, rapid_prototyping
- **Missing target methods:** specification_first, adr_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** audit_heavy, compliance_heavy, decision_log, evidence_table, minimal, report_based
- **Missing:** adr_adl, diagram_heavy, draft_communication, spec_based

### 5. Artifact Depth
- **Output artifacts:** Answer, ComplianceGapReport, ContainmentLog, EvidenceTable, GapAnalysis, ISO27001Mapping, IncidentReport, RemediationPlan, VulnerabilityReport
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 8 (severities: block, notify)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, memory_adapted, zero_config

### 8. External Capability Depth
- `pagerduty.api` (direct_api) — fallback: `log incident to CaseTrace without PagerDuty alert`
- `slack.mcp` (mcp) — fallback: `log notification to CaseTrace without sending`
- `vuln_scanner.api` (direct_api) — fallback: `draft manual scan checklist without live execution`

### 9. Memory Depth
- **Read:** incident_runbooks, previous_assessments, previous_audit_results, previous_incidents, previous_policy_reviews, previous_scan_results
- **Write candidates:** audit_summary, compliance_gap_summary, incident_summary, policy_review_summary, vulnerability_scan_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

## software_engineering
**Scenarios:** 5 (`software.review.next_mvp.001`, `software.refactor.legacy_cleanup.002`, `software.ci.github_mcp_pr.003`, `software.explain.quick_answer.004`, `software.plan.refactoring_roadmap.048`)
**Depth Score:** 20/22 | **Verdict:** `deep` | **Recommendation:** `not_needed_yet`

### 1. Level Coverage
- **Covered:** L1, L2, L3, L4, L5
- **Missing:** none

### 2. Domain Modes
- **Covered:** enterprise, legacy_maintenance, personal, product
- **Missing:** audit_heavy, emergency, exploratory, production, prototype...

### 3. Methodologies
- **Covered:** adr_first, checklist_based, expert_review, iterative_mvp_planning, lightweight_review, rapid_prototyping, spec_driven
- **Missing target methods:** specification_first, adl_first, tdd, release_readiness, api_contract_design, legacy_modernization, security_sensitive_change

### 4. Artifact Profiles
- **Covered:** adr_adl, decision_log, minimal, report_based, spec_based
- **Missing:** audit_heavy, compliance_heavy, diagram_heavy, draft_communication, evidence_table

### 5. Artifact Depth
- **Output artifacts:** ADR, CISummary, NextMVPRecommendation, PRDescription, RefactorReport, RefactoringRoadmap, ReviewReport, RiskRegister, TestResults
- **Target artifacts missing:** TechnicalSpecification, TaskList, AcceptanceCriteria, ImplementationPlan, DesignPlan, ArchitectureDiagram, SystemDiagram, InterfaceContract...

### 6. Governance Depth
- **Gates:** 4 (severities: block)

### 7. Configuration Depth
- **Modes:** domain_pack, dynamic_persona, explicit_config, generated_config, llm_assisted_selection, rule_routing, zero_config

### 8. External Capability Depth
- `github.mcp` (mcp) — fallback: `draft PR description locally without CI polling`

### 9. Memory Depth
- **Read:** previous_refactoring_cases, recent_case_summaries_optional, recent_pr_patterns, recent_refactor_cases
- **Write candidates:** auth_module_refactor_summary, pr_creation_summary, project_review_summary, refactoring_roadmap_summary

### 10. Depth Verdict
`deep`

### 11. Deep-Dive Recommendation
`not_needed_yet`

---

