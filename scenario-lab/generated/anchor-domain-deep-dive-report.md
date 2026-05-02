# Anchor Domain Deep Dive Report
**Date:** 2026-05-05
**Scope:** 20 new Scenario Cards (software_engineering + architecture)
**Wave:** Anchor Domain Deep Dive (061–080)

---

## 1. Сводка добавленных сценариев

- **software_engineering:** 16 сценариев
- **architecture:** 4 сценариев
- **Всего:** 20 сценариев

### Распределение по уровням

| Уровень | Количество | Сценарии |
|---------|-----------|----------|
| L1 | 2 | software.spec.explain_spec_first.061, software.adr.explain_adr_adl.062 |
| L2 | 3 | software.spec.review_acceptance_criteria.063, software.adr.summarize_decision_history.064, software.release.explain_readiness.065 |
| L3 | 7 | software.spec.create_technical_spec.066, software.spec.create_tasks_from_spec.067, software.test.create_test_plan.068, software.api.design_openapi_contract.069, software.release.create_readiness_plan.070, arch.adl.create_adl.076, arch.migration.plan_with_adl.077 |
| L4 | 6 | software.impl.generate_impl_plan.071, software.tdd.tdd_workflow.072, software.legacy.modernize_with_rollback.073, software.ci.stabilize_with_coverage.074, software.security.security_sensitive_change.075, arch.adr.update_with_approval.078 |
| L5 | 2 | software.spec.full_spec_first_flow.079, arch_sec.cross_domain.external_review.080 |

### software_engineering сценарии

- `software.spec.explain_spec_first.061` — Explain specification-first workflow (L1, rapid_prototyping, specification_first)
- `software.adr.explain_adr_adl.062` — Explain ADR vs ADL and when to use each (L1, rapid_prototyping, adr_first, adl_first)
- `software.spec.review_acceptance_criteria.063` — Review specification and identify missing acceptance criteria (L2, lightweight_review, specification_first)
- `software.adr.summarize_decision_history.064` — Summarize architecture decision history from ADR and ADL files (L2, lightweight_review, adr_first, adl_first)
- `software.release.explain_readiness.065` — Explain release readiness checklist for current repository (L2, lightweight_review, release_readiness)
- `software.spec.create_technical_spec.066` — Create TechnicalSpecification from user feature request (L3, spec_driven, specification_first)
- `software.spec.create_tasks_from_spec.067` — Create TaskList and AcceptanceCriteria from TechnicalSpecification (L3, spec_driven, specification_first, checklist_based)
- `software.test.create_test_plan.068` — Create TestPlan and TestCaseList for a proposed change (L3, spec_driven, tdd, checklist_based)
- `software.api.design_openapi_contract.069` — Design API contract with OpenAPI draft (L3, spec_driven, api_contract_design)
- `software.release.create_readiness_plan.070` — Create release readiness plan with CIReport and ChangeLog (L3, checklist_based, release_readiness)
- `software.impl.generate_impl_plan.071` — Generate ImplementationPlan and execute gated file changes (L4, spec_driven, specification_first, checklist_based)
- `software.tdd.tdd_workflow.072` — TDD workflow: generate tests first, then implementation (L4, tdd, specification_first, checklist_based)
- `software.legacy.modernize_with_rollback.073` — Legacy modernization with MigrationPlan and RollbackPlan (L4, checklist_based, legacy_modernization, adr_first)
- `software.ci.stabilize_with_coverage.074` — Stabilize CI pipeline and generate CoverageReport (L4, checklist_based, tdd, release_readiness)
- `software.security.security_sensitive_change.075` — Security-sensitive feature with ThreatModel and SecurityReviewReport (L4, checklist_based, security_sensitive_change, expert_review)
- `software.spec.full_spec_first_flow.079` — Full specification-first implementation flow with memory links (L5, specification_first, tdd, release_readiness, checklist_based)

### architecture сценарии

- `arch.adl.create_adl.076` — Create Architecture Decision Language (ADL) record for system boundaries (L3, adl_first, adr_first, checklist_based)
- `arch.migration.plan_with_adl.077` — Plan architecture migration with ADL and CompatibilityMatrix (L3, adl_first, adr_first, checklist_based, legacy_modernization)
- `arch.adr.update_with_approval.078` — Update ADR and ADL with approval gate and file write (L4, adr_first, adl_first, expert_review, checklist_based)
- `arch_sec.cross_domain.external_review.080` — Cross-domain architecture and security review with external tool fallback (L5, adr_first, adl_first, security_sensitive_change, expert_review, checklist_based)

---

## 2. Закрытые methodology gaps

**Новые методологии:** adl_first, api_contract_design, legacy_modernization, release_readiness, security_sensitive_change, specification_first, tdd

| Методология | Сценарии |
|-------------|----------|
| `adl_first` | software.adr.explain_adr_adl.062, software.adr.summarize_decision_history.064, arch.adl.create_adl.076, arch.migration.plan_with_adl.077, arch.adr.update_with_approval.078, arch_sec.cross_domain.external_review.080 |
| `api_contract_design` | software.api.design_openapi_contract.069 |
| `legacy_modernization` | software.legacy.modernize_with_rollback.073, arch.migration.plan_with_adl.077 |
| `release_readiness` | software.release.explain_readiness.065, software.release.create_readiness_plan.070, software.ci.stabilize_with_coverage.074, software.spec.full_spec_first_flow.079 |
| `security_sensitive_change` | software.security.security_sensitive_change.075, arch_sec.cross_domain.external_review.080 |
| `specification_first` | software.spec.explain_spec_first.061, software.spec.review_acceptance_criteria.063, software.spec.create_technical_spec.066, software.spec.create_tasks_from_spec.067, software.impl.generate_impl_plan.071, software.tdd.tdd_workflow.072, software.spec.full_spec_first_flow.079 |
| `tdd` | software.test.create_test_plan.068, software.tdd.tdd_workflow.072, software.ci.stabilize_with_coverage.074, software.spec.full_spec_first_flow.079 |

---

## 3. Добавленные artifact chains

### 3.1 spec → tasks → implementation → tests

- `TechnicalSpecification` — `software.spec.create_technical_spec.066`
- `TaskList` — `software.spec.create_tasks_from_spec.067`
- `AcceptanceCriteria` — `software.spec.review_acceptance_criteria.063`, `software.spec.create_tasks_from_spec.067`
- `ImplementationPlan` — `software.impl.generate_impl_plan.071`, `software.spec.full_spec_first_flow.079`
- `TestPlan` — `software.test.create_test_plan.068`, `software.spec.full_spec_first_flow.079`
- `TestCaseList` — `software.tdd.tdd_workflow.072`, `software.test.create_test_plan.068`
- `CoverageReport` — `software.tdd.tdd_workflow.072`, `software.ci.stabilize_with_coverage.074`

### 3.2 ADR/ADL → decision evolution

- `ADR` — `arch.adr.update_with_approval.078`, `software.spec.full_spec_first_flow.079`
- `ADL` — `arch.adl.create_adl.076`, `arch.migration.plan_with_adl.077`, `arch.adr.update_with_approval.078`
- `DecisionLog` — `software.adr.summarize_decision_history.064`, `arch.adr.update_with_approval.078`
- `ArchitectureDiagram` — `software.adr.summarize_decision_history.064`
- `SystemDiagram` — `arch.adl.create_adl.076`, `arch_sec.cross_domain.external_review.080`

### 3.3 release → changelog → notes

- `ReleaseChecklist` — `software.release.create_readiness_plan.070`, `software.spec.full_spec_first_flow.079`
- `CIReport` — `software.release.create_readiness_plan.070`, `software.ci.stabilize_with_coverage.074`
- `ChangeLog` — `software.release.create_readiness_plan.070`, `software.spec.full_spec_first_flow.079`
- `ReleaseNotes` — *не добавлен отдельно, включён в ChangeLog*

### 3.4 migration → rollback → compatibility

- `MigrationPlan` — `software.legacy.modernize_with_rollback.073`, `arch.migration.plan_with_adl.077`
- `CompatibilityMatrix` — `software.legacy.modernize_with_rollback.073`, `arch.migration.plan_with_adl.077`
- `RollbackPlan` — `software.legacy.modernize_with_rollback.073`, `software.release.create_readiness_plan.070`
- `RiskRegister` — `software.legacy.modernize_with_rollback.073`

### 3.5 API contract → implementation → tests

- `InterfaceContract` — `software.spec.create_technical_spec.066`, `software.api.design_openapi_contract.069`
- `OpenAPISpec` — `software.api.design_openapi_contract.069`
- `DataModel` — `software.spec.create_technical_spec.066`, `software.api.design_openapi_contract.069`
- `ContractTestPlan` — *покрыто через TestPlan в `software.test.create_test_plan.068`*
- `APICompatibilityReport` — *покрыто через CompatibilityMatrix*

### 3.6 security review → approval

- `ThreatModel` — `software.security.security_sensitive_change.075`, `arch_sec.cross_domain.external_review.080`
- `SecurityReviewReport` — `software.security.security_sensitive_change.075`, `arch_sec.cross_domain.external_review.080`
- `PolicyDecision` — `software.security.security_sensitive_change.075`
- `ApprovalGate` — *встроено в gates всех L4–L5 сценариев*

---

## 4. Новые artifact types (proposed vocabulary extensions)

**Всего предложено:** 20 типов

- `TechnicalSpecification`
- `TaskList`
- `AcceptanceCriteria`
- `ImplementationPlan`
- `TestPlan`
- `TestCaseList`
- `CoverageReport`
- `OpenAPISpec`
- `InterfaceContract`
- `ContractTestPlan`
- `APICompatibilityReport`
- `ReleaseChecklist`
- `ChangeLog`
- `ReleaseNotes`
- `CompatibilityMatrix`
- `RollbackPlan`
- `SecurityReviewReport`
- `ADL`
- `ArchitectureDiagram`
- `SystemDiagram`

---

## 5. Core development artifacts для Mr. Wolf

На основе anchor domain deep dive следующие артефакты должны стать first-class:

1. **`TechnicalSpecification`** — anchor для specification-first workflow. Должен связываться с TaskList, TestPlan, ImplementationPlan.
2. **`TaskList`** — разбиение spec на исполняемые задачи. Должен связываться с ImplementationPlan.
3. **`TestPlan` + `TestCaseList`** — обязательны для TDD и release readiness. Должны связываться с CoverageReport.
4. **`ADR` + `ADL`** — архитектурные решения. Должны связываться между собой и с SystemDiagram.
5. **`ReleaseChecklist` + `ChangeLog`** — release readiness. Должны связываться с CIReport.
6. **`ThreatModel` + `SecurityReviewReport`** — security-sensitive changes. Должны связываться с PolicyDecision.

---

## 6. Workflow necessity vs overkill

### Necessary workflows

- **specification-first flow (L3–L5)** — `software.spec.create_technical_spec.066` → `software.spec.create_tasks_from_spec.067` → `software.test.create_test_plan.068` → `software.impl.generate_impl_plan.071`. Необходим для профессионального SE.
- **TDD workflow (L4)** — `software.tdd.tdd_workflow.072`. Test-first order с coverage gate. Необходим для quality assurance.
- **security-sensitive change workflow (L4)** — `software.security.security_sensitive_change.075`. Expert gate + ThreatModel. Необходим для regulated domains.
- **release readiness workflow (L3–L5)** — `software.release.create_readiness_plan.070` → `software.spec.full_spec_first_flow.079`. Необходим для production readiness.
- **cross-domain architecture/security review (L5)** — `arch_sec.cross_domain.external_review.080`. External tool + expert gate. Необходим для enterprise architecture.

### Overkill signals

- **L1 explanation scenarios** (`software.spec.explain_spec_first.061`, `software.adr.explain_adr_adl.062`) — zero-config, no workflow. Correctly lightweight.
- **L3 ADL creation** (`arch.adl.create_adl.076`) — dry-run only, no file write. Appropriate for planning stage.
- **Full spec-first flow (L5)** (`software.spec.full_spec_first_flow.079`) — 6 artifacts + Jira sync + 3 gates. May be heavy for MVP, but conceptually correct for enterprise. **Recommendation:** split into L3 planning + L4 implementation + L5 sync in production.

---

## 7. Specification-first и domain pack

**Вывод:** specification-first требует отдельного skill/domain pack `software-engineering-spec-first`.

Причины:
1. Spec creation, task breakdown, test planning, implementation и release — это разные sub-skills.
2. Каждый шаг требует разных personas (technical_writer → project_manager → qa_engineer → senior_engineer → release_manager).
3. Artifact chains требуют explicit linking в memory.
4. Gates различаются по этапам: spec review → test coverage → file write → release approval.
5. Конфигурация явно требует `explicit_config` или `domain_pack` для L3+.

---

## 8. Gates для critical operations

### File write
- `file_write_approval` (block) — `software.impl.generate_impl_plan.071`, `software.tdd.tdd_workflow.072`, `software.security.security_sensitive_change.075`
- `adr_approval_gate` (block) — `arch.adr.update_with_approval.078`

### Release
- `release_gate` (block) — `software.spec.full_spec_first_flow.079`
- `ci_config_approval` (block) — `software.ci.stabilize_with_coverage.074`

### Migration
- `migration_approval` (block) — `software.legacy.modernize_with_rollback.073`
- `rollback_verification` (block) — `software.legacy.modernize_with_rollback.073`

### Security-sensitive changes
- `security_review_gate` (block) — `software.security.security_sensitive_change.075`, `arch.adr.update_with_approval.078`
- `expert_review_gate` (block) — `arch_sec.cross_domain.external_review.080`
- `external_tool_approval` (block) — `arch_sec.cross_domain.external_review.080`

---

## 9. Memory links между артефактами

Для specification-first flow необходимы следующие memory links:

1. **spec → tasks:** `TechnicalSpecification` → `TaskList` (via `spec_reference` memory)
2. **tasks → implementation:** `TaskList` → `ImplementationPlan` (via `task_reference` memory)
3. **spec → tests:** `TechnicalSpecification` → `TestPlan` (via `spec_reference` memory)
4. **tests → coverage:** `TestPlan` → `CoverageReport` (via `test_reference` memory)
5. **ADR → ADL:** `ADR` → `ADL` (via `adr_reference` memory)
6. **ADL → implementation:** `ADL` → `ImplementationPlan` (via `adl_reference` memory)
7. **implementation → release:** `ImplementationPlan` → `ReleaseChecklist` (via `impl_reference` memory)
8. **release → changelog:** `ReleaseChecklist` → `ChangeLog` (via `release_reference` memory)

**Концептуальное требование:** memory schema должна поддерживать artifact_link с direction и link_type.

---

## 10. Изменения в concept v2

### Must add
1. **Artifact chain schema** — explicit linking между spec, tasks, tests, implementation, release.
2. **Specification-first skill** — отдельный skill или sub-workflow в software-engineering domain pack.
3. **TDD workflow gate** — test coverage gate как built-in policy для TDD scenarios.
4. **Security review gate** — mandatory expert gate для `security_sensitive_change`.
5. **ADR/ADL lifecycle** — created → reviewed → updated → deprecated с explicit linking.

### Should add
1. **Release readiness skill** — checklist + CI report + changelog generation.
2. **Migration skill** — migration plan + compatibility matrix + rollback plan.
3. **API contract skill** — OpenAPI spec + interface contract + contract tests.
4. **Artifact versioning** — для ADR/ADL и spec artifacts.

### Can defer
1. **Full L5 spec-first flow** — для MVP достаточно L3 planning + L4 implementation.
2. **External threat modeling tool** — fallback к lightweight threat modeling достаточен для MVP.
3. **Auto-sync с Jira/Confluence** — manual approval + draft generation достаточны.

---

## 11. Оставшиеся gaps

1. **`adl_first`** — присутствует только в 4 сценариях architecture. Нет ADL-first в software_engineering (только ADR-first).
2. **`release_readiness`** — нет L5 release-only scenario без implementation.
3. **`api_contract_design`** — нет L4/L5 scenario с external API consumer validation.
4. **`legacy_modernization`** — только 1 L4 scenario. Нет L5 с external legacy analysis tool.
5. **`security_sensitive_change`** — только 1 L4 scenario. Нет L5 с multiple security frameworks (SOC2 + ISO27001 + PCI-DSS).
6. **Artifact chain gaps:**
   - `ReleaseNotes` — не добавлен как отдельный artifact.
   - `ContractTestPlan` — не добавлен как отдельный artifact.
   - `APICompatibilityReport` — не добавлен как отдельный artifact.
7. **Memory links:** не протестированы в playthroughs. Нужны dedicated memory-link test scenarios.

---

## 12. Итоговая статистика

| Метрика | Значение |
|---------|----------|
| Новых сценариев | 20 |
| software_engineering | 16 |
| architecture | 4 |
| L1 | 2 |
| L2 | 3 |
| L3 | 7 |
| L4 | 6 |
| L5 | 2 |
| Новых методологий | 7 |
| Новых artifact types | 20 |
| Playthroughs | 20 |
| Extraction Reports | 20 |

---

*Отчёт сгенерирован автоматически по результатам Anchor Domain Deep Dive.*
