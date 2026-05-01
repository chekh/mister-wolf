# Отчёт о миграции legacy-данных — Mr. Wolf Scenario Lab

**Дата:** 2026-05-02
**Источник:** `generated/schema-migration-report.md`
**Статус:** Выполнено

---

## 1. Общая статистика миграции

| Метрика | Значение |
|---------|----------|
| Сценариев обновлено | **20 / 20** (100%) |
| Playthroughs обновлено | **20 / 20** (100%) |

---

## 2. Детальная статистика по сценариям

| Тип изменения | Количество | Процент |
|---------------|-----------|---------|
| `execution_result` добавлен | 20 | 100% |
| `observability_requirements` добавлен | 14 | 70% (L3+) |
| `gates` преобразованы (string → object) | 12 | 60% |
| `external_capabilities` преобразованы (string → object) | 6 | 30% |
| `artifacts.outputs` преобразованы (string → object) | 19 | 95% |

### 2.1 Сценарии без gates (8 шт.)

Следующие сценарии не имели gates, поэтому миграция gates не применялась:
- `software.review.next_mvp.001` (L2, read-only)
- `software.explain.quick_answer.004` (L1, zero-config)
- `office.email.draft_followup.008` (L1, zero-config)
- `office.meeting.prep_board_pack.009` (L3, read-only)
- `finance.budget.scenario_plan.013` (L3, read-only)
- `product.roadmap.prioritize_features.015` (L2, read-only)
- `data.analysis.quarterly_report.020` (L3, read-only)

### 2.2 Сценарии без external capabilities (14 шт.)

Следующие сценарии не использовали external capabilities:
- Все L1–L2 сценарии (кроме `software.ci.github_mcp_pr.003`)
- Все L3 сценарии (кроме `research.literature.systematic_scan.011`)

### 2.3 Сценарий без output artifacts (1 шт.)

- `software.explain.quick_answer.004` (L1, simple answer) — не имеет output artifacts по дизайну.

---

## 3. Детальная статистика по playthroughs

| Тип изменения | Количество | Процент |
|---------------|-----------|---------|
| `gate_explanation` добавлен | 7 | 35% (approval_request steps) |
| `circuit_breaker` добавлен | 20 | 100% |
| `issues_detected` преобразованы (string → object) | 20 | 100% |

### 3.1 Playthroughs с approval_request steps (7 шт.)

Следующие playthroughs содержали approval_request steps и получили `gate_explanation`:
- `pt-software-refactor-legacy-002` — file_write_approval
- `pt-software-ci-github-mcp-003` — external_action_approval
- `pt-legal-contract-enterprise-006` — expert_gate_legal_advice
- `pt-office-calendar-conflict-010` — calendar_mutation_approval
- `pt-research-data-experiment-012` — experiment_plan_approval
- `pt-finance-expense-approval-014` — expense_approval_gate
- `pt-security-incident-018` — emergency_action_approval

### 3.2 Playthroughs без approval_request steps (13 шт.)

Следующие playthroughs не содержали approval_request steps (read-only или simple answer):
- Все L1–L2 playthroughs (кроме `pt-software-refactor-legacy-002`)
- Некоторые L3 playthroughs без gated actions

---

## 4. Результаты валидации

```
Loaded 20 scenarios

Warnings (1):
  - [4] id=software.explain.quick_answer.004 has no output artifacts

Errors (0):

Validation passed.
```

**Вывод:** Все 20 сценариев проходят валидацию по новой схеме. Единственное предупреждение — ожидаемое: L1 simple-answer сценарий не создаёт output artifacts.

---

## 5. Ambiguous migration decisions

### 5.1 Gate severity inference

Для нескольких gates пришлось выбирать severity на основе контекста:

| Gate | Выбранный severity | Обоснование |
|------|-------------------|-------------|
| `legal_advice_disclaimer` | `notify` | Это disclaimer, не blocking gate. Пользователь может продолжить после уведомления. |
| `pii_handling_gate` | `block` | PII требует явного подтверждения. Нельзя пропустить. |
| `experiment_plan_approval` | `block` | Эксперимент влияет на пользователей. Требуется явное одобрение. |
| `secrets_handling_gate` | `block` | Обнаружение secrets требует review. Нельзя автоматически продолжить. |
| `emergency_action_approval` | `block` | Экстренные действия необратимы. Требуется явное одобрение. |

**Риск:** `notify` vs `block` для некоторых gates может быть спорным. Например, `legal_advice_disclaimer` мог бы быть `block` в enterprise-контексте.

### 5.2 External capability type inference

| Capability | Выбранный type | Обоснование |
|------------|---------------|-------------|
| `github.mcp` | `mcp` | Явно MCP-интеграция. |
| `google_calendar.api` | `mcp` | В сценарии используется через MCP. |
| `slack.mcp` | `mcp` | Явно MCP-интеграция. |
| `erp.api` | `direct_api` | Прямой HTTP-вызов, не MCP. |
| `external_legal_db.api` | `direct_api` | Прямой HTTP-вызов к внешней БД. |
| `arxiv.api` / `semantic_scholar.api` | `direct_api` | Прямые HTTP-вызовы к API. |
| `pagerduty.api` | `direct_api` | Прямой HTTP-вызов. |

**Риск:** Некоторые external capabilities могут быть reclassified при появлении wrapper layer. Например, `pagerduty.api` может стать `wrapper`, если появится абстракция над alerting.

### 5.3 Artifact lifecycle_state inference

Все artifacts получили `lifecycle_state: created`, потому что сценарии описывают создание, а не валидацию или персистенс. Для более точного определения нужен explicit lifecycle mapping per scenario.

### 5.4 execution_result для L1

Сценарий `software.explain.quick_answer.004` (L1) получил `execution_result` с `envelope_type: Answer`. Это соответствует концепции, но для L1 сценариев `execution_result` мог бы быть optional.

### 5.5 observability_requirements defaults

Для сценариев без явных observability rules использовались defaults:
- L3: `metrics: false, spans: false, alerts: []`
- L4: `metrics: true, spans: false, alerts: ["gate_triggered"]`
- L5: `metrics: true, spans: true, alerts: ["gate_triggered", "external_capability_failure"]`

Это может быть слишком generic. Domain-specific observability (например, security compliance) требует кастомизации.

---

## 6. Оставшиеся warnings

| Warning | Количество | Причина | Действие |
|---------|-----------|---------|----------|
| `has no output artifacts` | 1 | L1 simple answer | Ожидаемо, не требует действия |

Нет errors. Все 20 сценариев валидны.

---

## 7. Изменённые файлы

| Файл | Тип изменения |
|------|--------------|
| `data/scenarios/scenarios.jsonl` | Мигрирован (20 сценариев) |
| `data/playthroughs/playthroughs.jsonl` | Мигрирован (20 playthroughs) |
| `scripts/extract_catalogs.py` | Исправлен для работы с новым форматом artifacts |
| `generated/coverage-matrix.md` | Пересобран |
| `generated/artifact-catalog.md` | Пересобран |
| `generated/component-demand-map.md` | Пересобран |
| `generated/policy-pattern-catalog.md` | Пересобран |
| `generated/configuration-effort-map.md` | Пересобран |
| `generated/failure-mode-catalog.md` | Пересобран |

---

## 8. Рекомендации

1. **Gate severity review:** Пересмотреть severity для `legal_advice_disclaimer` при enterprise deployment (возможно, `block` вместо `notify`).
2. **External capability taxonomy:** Добавить `wrapper` type при появлении adapter layer.
3. **Artifact lifecycle:** Для следующей волны сценариев явно указывать lifecycle_state (created/validated/persisted).
4. **Observability customization:** Добавить domain-specific observability rules (например, для security_compliance).
5. **JSON Schema:** Обновить formal JSON Schema (`schemas/scenario-card.schema.json`) на основе мигрированных данных.

---

**Резюме:** Миграция 20 сценариев и 20 playthroughs выполнена. Все данные валидны. Осталось 1 expected warning. 5 ambiguous decisions задокументированы.
