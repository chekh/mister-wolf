# Отчёт Wave 2B — Mr. Wolf Scenario Lab

**Дата:** 2026-05-02
**Статус:** Завершено

---

## 1. Резюме

Волна 2B направлена на закрытие P1 gaps, добавление cross-domain сценариев и расширение банка новыми доменами. Добавлено 20 новых Scenario Cards, 20 Playthrough Records и 20 Extraction Reports. Общий банк вырос с 40 до 60 сценариев.

---

## 2. Новые Scenario Cards

Добавлено **20** новых сценариев (ID 041–060):

| # | ID | Домен | Уровень | Название |
|---|-----|-------|---------|----------|
| 1 | `legal.explain.contract_basics.041` | legal_ops | L1 | Explain basic contract terminology |
| 2 | `legal.cross_border.m_a_due_diligence.042` | legal_ops | L5 | Cross-border M&A due diligence |
| 3 | `office.doc.summarize_meeting_notes.043` | office_assistant | L2 | Summarize meeting notes and action items |
| 4 | `office.workflow.onboarding_automation.044` | office_assistant | L5 | Automate onboarding across systems |
| 5 | `security.explain.phishing_risks.045` | security_compliance | L1 | Explain phishing attack vectors |
| 6 | `security.docs.review_policy_document.046` | security_compliance | L2 | Review security policy for ISO 27001 gaps |
| 7 | `security.infra.run_vulnerability_scan.047` | security_compliance | L4 | Run vulnerability scan with approval |
| 8 | `software.plan.refactoring_roadmap.048` | software_engineering | L3 | Plan legacy refactoring roadmap |
| 9 | `legal_product.roadmap.liability_review.049` | legal_ops | L4 | Review product roadmap for legal risks |
| 10 | `sec_finance.audit.payment_compliance.050` | security_compliance | L4 | Audit payment processing for PCI-DSS/SOX |
| 11 | `research_sales.pitch.market_research_summary.051` | research | L3 | Synthesize research for sales pitch |
| 12 | `arch_sec.adr.threat_model_review.052` | architecture | L4 | Review ADR with threat modeling |
| 13 | `arch.explain.microservices_vs_monolith.053` | architecture | L2 | Explain microservices vs monolith |
| 14 | `arch.adr.create_decision_record.054` | architecture | L4 | Create ADR with approval |
| 15 | `concierge.answer.local_restaurants.055` | concierge | L1 | Recommend local restaurants |
| 16 | `concierge.plan.travel_itinerary.056` | concierge | L2 | Plan multi-city business travel |
| 17 | `sales_crm.plan.outreach_strategy.057` | sales_crm | L3 | Plan enterprise outreach strategy |
| 18 | `sales_crm.action.update_opportunity_stage.058` | sales_crm | L4 | Update CRM opportunity stages |
| 19 | `arch.plan.migration_roadmap.059` | architecture | L3 | Plan cloud migration roadmap |
| 20 | `concierge.plan.event_coordination.060` | concierge | L3 | Plan corporate event logistics |

---

## 3. Закрытые P1 Gaps

| Домен | Было | Стало | Закрытые уровни |
|-------|------|-------|-----------------|
| legal_ops | L2, L3, L4 | L1, L2, L3, L4, L5 | L1, L5 |
| office_assistant | L1, L3, L4 | L1, L2, L3, L4, L5 | L2, L5 |
| security_compliance | L3, L5 | L1, L2, L3, L4, L5 | L1, L2, L4 |
| software_engineering | L1, L2, L4, L5 | L1, L2, L3, L4, L5 | L3 |

Все P1 gaps из предыдущего отчёта закрыты.

---

## 4. Cross-Domain Сценарии

Добавлено **4** cross-domain сценария:

| ID | Домены | Уровень | Описание |
|----|--------|---------|----------|
| `legal_product.roadmap.liability_review.049` | legal_ops + product_management | L4 | Юридическая оценка дорожной карты продукта |
| `sec_finance.audit.payment_compliance.050` | security_compliance + finance_ops | L4 | Аудит платёжной системы на соответствие PCI-DSS и SOX |
| `research_sales.pitch.market_research_summary.051` | research + sales_crm | L3 | Синтез исследований для sales-питча |
| `arch_sec.adr.threat_model_review.052` | architecture + security_compliance | L4 | Оценка ADR с threat modeling |

---

## 5. Новые Домены

Добавлено **3** новых домена:

| Домен | Сценарии | Уровни |
|-------|----------|--------|
| architecture | 4 | L2, L3, L4 |
| concierge | 3 | L1, L2, L3 |
| sales_crm | 2 | L3, L4 |

---

## 6. Playthroughs и Extraction Reports

| Метрика | Было | Стало | Дельта |
|---------|------|-------|--------|
| Playthrough Records | 40 | **60** | **+20** |
| Extraction Reports | 40 | **60** | **+20** |

Все 20 новых сценариев имеют playthrough и extraction report.

---

## 7. Результаты Validation

```
Loaded 60 scenarios

Warnings (1):
  - [4] id=software.explain.quick_answer.004 has no output artifacts

Errors (0):

Validation passed.
```

Единственное предупреждение — legacy L1 сценарий без output artifacts. Это ожидаемо и не связано с новыми сценариями.

---

## 8. Артефакты

### Новые артефакты (появились в Wave 2B)

| Артефакт | Домен | Описание |
|----------|-------|----------|
| `ADRReview` | architecture | Результат ревью ADR на предмет security gaps |
| `ActionItemList` | office_assistant | Извлечённые action items из meeting notes |
| `ComparisonReport` | architecture | Сравнительный отчёт (microservices vs monolith) |
| `DueDiligenceReport` | legal_ops | Отчёт due diligence для M&A |
| `EventCoordinationPlan` | concierge | План корпоративного мероприятия |
| `FeatureRiskMatrix` | legal_ops | Матрица рисков фич продукта |
| `GapAnalysis` | security_compliance | Анализ gap'ов политики безопасности |
| `ISO27001Mapping` | security_compliance | Маппинг политики на ISO 27001 |
| `ItineraryPlan` | concierge | План бизнес-поездки |
| `LiabilityRiskReport` | legal_ops | Отчёт о юридических рисках |
| `MeetingLogistics` | concierge | Логистика встреч |
| `MessagingGuide` | sales_crm | Гид по messaging для outreach |
| `MigrationRoadmap` | architecture | План миграции в облако |
| `MitigationPlan` | architecture | План митигации угроз |
| `OnboardingChecklist` | office_assistant | Чеклист онбординга |
| `OutreachStrategy` | sales_crm | Стратегия outreach |
| `RefactoringRoadmap` | software_engineering | План рефакторинга legacy |
| `SalesTalkingPoints` | research | Тезисы для sales-питча |
| `SetupConfirmation` | office_assistant | Подтверждение настройки систем |
| `StageUpdateLog` | sales_crm | Лог обновления стадий сделок |
| `SyncConfirmation` | sales_crm | Подтверждение синхронизации CRM |
| `ThreatModel` | architecture | Модель угроз для ADR |
| `VulnerabilityReport` | security_compliance | Отчёт сканирования уязвимостей |

### Распространённые артефакты

- `CaseTrace` — 60 сценариев (100%)
- `ContextBundle` — 50 сценариев (83%)
- `ScenarioDecision` — 50 сценариев (83%)
- `PolicyDecision` — 22 сценария (37%)
- `DecisionLog` — 18 сценариев (30%)
- `RiskRegister` — 8 сценариев (13%)

---

## 9. Компоненты

### Подтверждённые компоненты (top)

| Компонент | Подтверждений |
|-----------|---------------|
| WolfFacade | 60 |
| ContextResolver | 52 |
| AgentRunner | 49 |
| TraceSystem | 45 |
| ScenarioRouter / ScenarioRouterLight | 30 каждый |
| PolicyCore | 15 |
| ModelRouter | 8 |
| MCPWrapper | 6 |

### Новые компоненты (предложены в Wave 2B)

| Компонент | Сценарий | Обоснование |
|-----------|----------|-------------|
| `ExternalLegalDBAdapter` | legal L5 | Интеграция с внешними legal БД |
| `ActionItemExtractor` | office L2 | Извлечение action items из meeting notes |
| `OnboardingWorkflowEngine` | office L5 | Многошаговый онбординг через MCP |
| `FrameworkVersionChecker` | security L2 | Проверка актуальности compliance framework |
| `VulnerabilityScanGate` | security L4 | Gate для production vulnerability scan |
| `ADRTemplateSelector` | architecture L4 | Выбор шаблона ADR |
| `CrossDomainRiskAssessor` | legal+product L4 | Оценка рисков в cross-domain сценариях |
| `CrossDomainAuditEngine` | security+finance L4 | Аудит по двум framework'ам |
| `ToneAdapter` | research+sales L3 | Адаптация тона между research и sales |
| `ADLinkedThreatModeler` | architecture+security L4 | Связь threat model с ADR |
| `CRMSyncGate` | sales_crm L4 | Gate для CRM синхронизации |

---

## 10. Policy / Gate Findings

### Новые policy/gate паттерны

| Gate / Policy | Severity | Применение |
|---------------|----------|------------|
| `expert_review_gate` | block | M&A due diligence, legal-product reviews |
| `external_database_gate` | block | Внешние legal/данные БД |
| `external_system_gate` | block | Onboarding (Slack, Calendar, HRIS) |
| `hris_write_gate` | block | Запись в HRIS |
| `production_scan_gate` | block | Сканирование production |
| `shell_execution_gate` | block | Shell на production |
| `gdpr_feature_gate` | block | GDPR-чувствительные фичи |
| `audit_scope_gate` | block | Определение scope аудита |
| `security_review_gate` | block | Архитектурные изменения с security impact |
| `adr_approval_gate` | block | Утверждение ADR перед persist |
| `crm_sync_gate` | block | Синхронизация CRM |
| `legal_advice_gate` | block | Юридические оценки |
| `file_write_gate` | block | Запись файлов в репозиторий |

### Ключевые наблюдения

- **Cross-domain сценарии** требуют gate'ов из обоих доменов (например, `legal_advice_gate` + `gdpr_feature_gate`)
- **L5 сценарии** с MCP требуют 3+ gate'ов (external system, PII, domain-specific)
- **Emergency mode** не bypass'ит gates в новых сценариях

---

## 11. Configuration Findings

### Распределение configuration effort

| Mode | Количество | Доля |
|------|------------|------|
| generated_config | 22 | 37% |
| domain_pack | 19 | 32% |
| zero_config | 10 | 17% |
| explicit_config | 6 | 10% |
| custom_plugin | 3 | 5% |

### Наблюдения

- `zero_config` остаётся на 17% — хорошо для First Useful Product
- `custom_plugin` (3 сценария) — только L5 с внешними интеграциями
- Cross-domain сценарии требуют `domain_pack` с расширениями
- Новые домены (architecture, concierge, sales_crm) работают с `generated_config` и `domain_pack`

---

## 12. Failure Modes

### Новые failure modes (появились в Wave 2B)

| Failure Mode | Сценарии | Описание |
|--------------|----------|----------|
| `jurisdiction_mismatch` | legal L1, L5 | Несоответствие юрисдикции |
| `expert_gate_timeout` | legal L5 | Таймаут expert gate |
| `external_db_unavailable` | legal L5 | Недоступность внешней legal БД |
| `model_hallucination_on_legal_terms` | legal L5 | Галлюцинации на юридических терминах |
| `api_rate_limit` | office L5, sales L4 | Rate limit внешних API |
| `mcp_unavailable` | office L5 | Недоступность MCP |
| `runaway_workflow` | security L4 | Неконтролируемый workflow |
| `missing_infrastructure_docs` | security L4, arch L4 | Отсутствие инфраструктурной документации |
| `secrets_in_configs` | security L2, L4 | Секреты в конфигах |
| `policy_conflict_on_file_write` | architecture L4 | Конфликт policy при записи файлов |
| `stale_data` | concierge L1, L2 | Устаревшие данные (рестораны, отели) |
| `currency_mismatch` | concierge L2 | Несоответствие валют |
| `missing_sales_data` | sales L3 | Отсутствие sales данных |

### Частые failure modes

- `model_hallucination` — 11 сценариев
- `stale_compliance_framework` — 6 сценариев
- `missing_infrastructure_docs` — 5 сценариев

---

## 13. Proposed Vocabulary Extensions

На основе Wave 2B предлагаются следующие расширения controlled vocabulary:

### Новые artifact types
- `decision_record` — для ADR
- `checklist` — для онбординга и event coordination
- `logistics` — для travel/event logistics
- `guide` — для messaging guide
- `confirmation` — для подтверждений sync/setup

### Новые analysis tags
- `cross_domain` — для cross-domain сценариев
- `mcp_multi` — для сценариев с несколькими MCP
- `expert_gate` — для сценариев с expert review gate

### Новые capability types
- `legal_database.api`
- `hris.api`
- `vuln_scanner.api`
- `salesforce.mcp`

**Примечание:** Окончательное добавление в vocabularies.md требует отдельной команды.

---

## 14. Рекомендации для Следующей Волны

### 14.1 Приоритетные Gaps (P0 для Wave 3)

| Домен | Недостающие уровни |
|-------|-------------------|
| architecture | L1, L5 |
| concierge | L4, L5 |
| sales_crm | L1, L2, L5 |

### 14.2 Цели Wave 3

1. **Добавить 20–30 сценариев** для закрытия оставшихся gaps
2. **Довести каждый домен до минимум 5 сценариев** с уровнями L1–L5
3. **Увеличить external capability coverage** до ≥20% от общего числа
4. **Добавить Memory-heavy сценарии** (≥10% банка)
5. **Улучшить observability requirements** для L4–L5: добавить конкретные SLI/SLO

### 14.3 Технические рекомендации

1. **Gate severity levels:** Добавить `notify` → `block` escalation path для L4–L5
2. **Cross-domain orchestration:** Исследовать, нужен ли `DomainPackCoordinator` для одновременной загрузки нескольких domain packs
3. **Artifact lifecycle:** Установить правила для `immutable` артефактов (incident reports, audit logs)
4. **MCP fallback:** Все L5 сценарии должны иметь чёткий `fallback_action` без bypass gates
5. **Emergency mode:** Уточнить, что emergency mode не bypass'ит gates — только ускоряет routing

### 14.4 Anti-Patterns для Wave 3

- Не добавлять L5 без L1–L4 в том же домене
- Не создавать новые artifact types без 3+ сценариев использования
- Не увеличивать custom_plugin долю выше 10%
- Не генерировать roadmap внутри Scenario Cards

---

## 15. Итоговая Статистика

| Метрика | Было | Стало |
|---------|------|-------|
| Scenario Cards | 40 | **60** |
| Playthrough Records | 40 | **60** |
| Extraction Reports | 40 | **60** |
| Домены | 9 | **12** |
| L1 Coverage | 5 доменов | **9 доменов** |
| L5 Coverage | 5 доменов | **8 доменов** |
| Cross-domain | 0 | **4** |

**Validation:** Пройдено. 0 errors. 1 legacy warning.

---

*Отчёт сгенерирован автоматически по результатам Wave 2B.*
