# Отчёт Wave 2A — Mr. Wolf Scenario Lab

**Дата:** 2026-05-03
**Фокус:** P0 gaps (data_analysis, hr_recruiting, finance_ops, product_management, research)
**Статус:** Завершено

---

## 1. Общая статистика

| Метрика | Wave 1 (было) | Wave 2A (добавлено) | Итого |
|---------|---------------|---------------------|-------|
| Scenario Cards | 20 | **20** | **40** |
| Playthrough Records | 20 | **15** | **35** |
| Extraction Reports | 20 | **15** | **35** |
| Домены | 9 | 0 (только gaps) | 9 |

---

## 2. Закрытые P0 gaps

### 2.1 До Wave 2A

| Домен | Отсутствующие уровни |
|-------|---------------------|
| data_analysis | L1, L2, L4, L5 |
| hr_recruiting | L1, L3, L4, L5 |
| finance_ops | L1, L2, L5 |
| product_management | L1, L4, L5 |
| research | L1, L2, L5 |

### 2.2 После Wave 2A

| Домен | L1 | L2 | L3 | L4 | L5 | Статус |
|-------|----|----|----|----|----|--------|
| data_analysis | ✅ 1 | ✅ 1 | ✅ 2 | ✅ 1 | ✅ 1 | **P0 закрыт** |
| hr_recruiting | ✅ 1 | ✅ 2 | ✅ 1 | ✅ 1 | ✅ 1 | **P0 закрыт** |
| finance_ops | ✅ 1 | ✅ 1 | ✅ 1 | ✅ 2 | ✅ 1 | **P0 закрыт** |
| product_management | ✅ 1 | ✅ 1 | ✅ 1 | ✅ 1 | ✅ 1 | **P0 закрыт** |
| research | ✅ 1 | ✅ 1 | ✅ 1 | ✅ 1 | ✅ 1 | **P0 закрыт** |

**Все 5 P0 gaps закрыты.**

---

## 3. Новые сценарии (20 шт.)

### 3.1 По доменам

| Домен | Количество | Уровни |
|-------|-----------|--------|
| data_analysis | 5 | L1, L2, L3, L4, L5 |
| hr_recruiting | 5 | L1, L2, L3, L4, L5 |
| finance_ops | 4 | L1, L2, L4, L5 |
| product_management | 4 | L1, L4, L5 + L3 (jira ticket) |
| research | 4 | L1, L2, L3, L5 |

### 3.2 По уровням

| Уровень | Количество | Сценарии |
|---------|-----------|----------|
| L1 | 5 | explain_metric, explain_process, explain_cash_flow, explain_prioritization, explain_methodology |
| L2 | 4 | dataset_summary, candidate_compare, invoice_review, paper_summary |
| L3 | 4 | quality_assessment, interview_plan, (jira_ticket — L4), systematic_scan |
| L4 | 4 | predictive_model, send_offer, budget_variance, jira_ticket |
| L5 | 5 | bi_dashboard, full_cycle_hiring, payroll_integration, roadmap_sync, systematic_scan_with_citations |

---

## 4. Playthroughs (15 шт.)

### 4.1 Распределение по уровням

| Уровень | Количество | Приоритет |
|---------|-----------|----------|
| L5 | 6 | Все L5 (критично) |
| L4 | 4 | Все L4 |
| L3 | 2 | Часть L3 |
| L2 | 2 | Часть L2 |
| L1 | 2 | Fast path проверка |

### 4.2 Распределение по доменам

| Домен | Playthroughs |
|-------|-------------|
| data_analysis | 4 (L1, L2, L4, L5) |
| hr_recruiting | 4 (L1, L2, L3, L4, L5 — 5 сценариев, 4 playthroughs) |
| finance_ops | 3 (L1, L4, L5) |
| product_management | 3 (L1, L4, L5) |
| research | 3 (L1, L2, L5) |

**Примечание:** Не все сценарии получили playthrough (20 сценариев, 15 playthroughs). Оставшиеся 5 будут покрыты в Wave 2B.

---

## 5. Новые артефакты (28 шт.)

| Артефакт | Домен | Тип |
|----------|-------|-----|
| AdjustmentLog | finance_ops | log |
| AnomalyReport | finance_ops | report |
| Answer | data_analysis, hr_recruiting, finance_ops, product_management, research | answer |
| BackgroundCheckResult | hr_recruiting | report |
| CitationSyncLog | research | log |
| CleaningPlan | data_analysis | plan |
| ComparisonMatrix | hr_recruiting | table |
| CompetencyMatrix | hr_recruiting | matrix |
| DashboardConfig | data_analysis | config |
| DataSourceMapping | data_analysis | mapping |
| DatasetSummary | data_analysis | report |
| EmailDraft | hr_recruiting | draft |
| EvidenceTable | research | table |
| FeatureImportance | data_analysis | table |
| HiringCycleReport | hr_recruiting | report |
| InterviewPlan | hr_recruiting | plan |
| JiraTicketLink | product_management | link |
| OfferConfirmation | hr_recruiting | confirmation |
| PaperSummary | research | summary |
| PayrollReport | finance_ops | report |
| PredictionReport | data_analysis | report |
| QualityReport | data_analysis | report |
| RoadmapDiagram | product_management | diagram |
| SyncReport | product_management | report |
| TicketSpec | product_management | spec |
| TransferConfirmation | finance_ops | confirmation |
| VarianceReport | finance_ops | report |

---

## 6. Policy / Gate Findings

### 6.1 Новые gates (12 шт.)

| Gate | Severity | Домен |
|------|----------|-------|
| model_run_approval | block | data_analysis |
| external_action_approval | block | data_analysis |
| data_access_approval | block | data_analysis |
| legal_advice_disclaimer | notify | legal_ops (уже был) |
| offer_send_approval | block | hr_recruiting |
| budget_adjustment_approval | block | finance_ops |
| payroll_approval | block | finance_ops |
| bank_transfer_approval | block | finance_ops |
| ticket_creation_approval | block | product_management |
| external_update_approval | block | product_management |
| notification_approval | notify | product_management |
| external_api_approval | block | research |
| citation_sync_approval | notify | research |

### 6.2 Новые hard-deny policies

- `auto_assign_without_review`
- `auto_hire_without_review`
- `auto_publish_without_review`
- `auto_transfer_without_approval`

---

## 7. Failure Modes (53 новых)

**Топ категории:**
- External API unavailable (12): Jira, Confluence, Slack, ERP, bank, Tableau, Zotero, arXiv
- Data issues (10): missing, stale, outdated, insufficient
- Policy conflicts (6): adjustment, data_access, external_action, sync, transfer
- Model/AI issues (4): hallucination, bias, leakage

---

## 8. Configuration Findings

### 8.1 Configuration mode distribution (новые сценарии)

| Mode | Количество | Процент |
|------|-----------|---------|
| zero_config | 5 | 25% |
| generated_config | 5 | 25% |
| explicit_config | 5 | 25% |
| domain_pack | 5 | 25% |

### 8.2 Governance distribution

| Уровень | Количество | Процент |
|---------|-----------|---------|
| autonomous | 5 | 25% |
| supervised | 5 | 25% |
| gated | 10 | 50% |

---

## 9. Валидация

```
Loaded 40 scenarios

Warnings (1):
  - [4] id=software.explain.quick_answer.004 has no output artifacts

Errors (0):

Validation passed.
```

**Вывод:** Все 40 сценариев валидны. Единственное предупреждение — legacy L1 сценарий без output artifacts.

---

## 10. Proposed Vocabulary Extensions

Новые artifact types, не входящие в текущий vocabulary:
- `config` (DashboardConfig)
- `mapping` (DataSourceMapping)
- `matrix` (CompetencyMatrix)
- `confirmation` (OfferConfirmation, TransferConfirmation)
- `link` (JiraTicketLink)
- `spec` (TicketSpec)
- `log` (AdjustmentLog, ContainmentLog, CitationSyncLog)

**Рекомендация:** Добавить эти типы в `references/vocabularies.md` → `artifact_types` перед Wave 2B.

---

## 11. Рекомендации для Wave 2B

### 11.1 Что сделать

1. **Докрыть оставшиеся playthroughs:** 5 сценариев без playthrough (data_analysis L3, hr_recruiting L3, finance_ops L2, product_management L3, research L3).
2. **Закрыть P1 gaps:**
   - legal_ops: L1, L5
   - office_assistant: L2, L5
   - security_compliance: L1, L2, L4
   - software_engineering: L3
3. **Добавить cross-domain сценарии:** legal + product, security + finance, research + sales.
4. **Обновить vocabulary:** Добавить новые artifact types.

### 11.2 Цели Wave 2B

| Метрика | Цель |
|---------|------|
| Сценарии | 50 (добавить 10) |
| Playthroughs | 45 (добавить 10) |
| Domains | 9 (закрыть P1 gaps) |

---

## 12. Open Questions

1. **Artifact type vocabulary:** Нужно ли расширять controlled vocabulary или использовать generic `artifact` type?
2. **L1 без output artifacts:** Стоит ли требовать `AnswerArtifact` для всех L1?
3. **Gate severity для `notify`:** Достаточно ли 2 уровней (block/notify) или нужен `silent`?
4. **External capability fallback:** Нужно ли тестировать fallback paths в playthroughs?

---

**Резюме:** Wave 2A закрыл все 5 P0 gaps. Добавлено 20 сценариев, 15 playthroughs, 15 extraction reports. Всего 40 сценариев, 35 playthroughs. Валидация пройдена. Готов к Wave 2B.
