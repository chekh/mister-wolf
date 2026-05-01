# Отчёт о миграции схемы — Mr. Wolf Scenario Lab

**Дата:** 2026-05-02
**Источник:** `generated/decision-log.md` + `generated/proposed-schema-updates.md`
**Статус:** Выполнено

---

## 1. Изменённые файлы

| Файл | Тип изменения | Причина |
|------|--------------|---------|
| `references/scenario-card-schema.md` | Обновление | Новые поля схемы Scenario Card |
| `references/playthrough-schema.md` | Обновление | Новые поля схемы Playthrough |
| `references/vocabularies.md` | Обновление | Новые analysis tags, configuration mode ordering |
| `templates/scenario-card.yaml` | Обновление | Шаблон с новыми полями |
| `templates/playthrough.yaml` | Обновление | Шаблон с новыми полями |
| `scripts/validate_scenario_bank.py` | Обновление | Новые validation rules |
| `generated/coverage-matrix.md` | Пересобран | Обновление после валидации |
| `generated/artifact-catalog.md` | Пересобран | Обновление после валидации |
| `generated/component-demand-map.md` | Пересобран | Обновление после валидации |
| `generated/policy-pattern-catalog.md` | Пересобран | Обновление после валидации |
| `generated/configuration-effort-map.md` | Пересобран | Обновление после валидации |
| `generated/failure-mode-catalog.md` | Пересобран | Обновление после валидации |

---

## 2. Добавленные поля

### 2.1 Scenario Card (`scenario-card-schema.md`)

| Поле | Тип | Обязательность | Описание |
|------|-----|---------------|----------|
| `execution_result` | object | Optional (recommended for L2+) | Unified output wrapper: envelope_type, summary, confidence, trace_reference |
| `execution_result.envelope_type` | enum | Required if execution_result present | Answer / Plan / Artifact / Refusal / PartialResult |
| `observability_requirements` | object | Required for new L3+ scenarios | metrics, spans, alerts |
| `gates[].gate_name` | string | Required if gate object | Имя gate |
| `gates[].severity` | enum | Optional (default: block) | silent / notify / block |
| `gates[].rationale` | string | Optional | Объяснение для пользователя |
| `artifacts.outputs[].name` | string | Required if structured output | Имя артефакта |
| `artifacts.outputs[].type` | string | Required if structured output | Тип артефакта |
| `artifacts.outputs[].lifecycle_state` | enum | Optional | created / validated / persisted |
| `artifacts.outputs[].domain_specific` | boolean | Optional (default: false) | Является ли артефакт специфичным для домена |
| `capabilities.external[].type` | enum | Required if structured external | mcp / direct_api / imported_skill / wrapper |
| `capabilities.external[].trust_level` | enum | Required if structured external | trusted / untrusted / sandboxed |
| `capabilities.external[].fallback_action` | string | Required if structured external | Действие при недоступности |

### 2.2 Playthrough (`playthrough-schema.md`)

| Поле | Тип | Обязательность | Описание |
|------|-----|---------------|----------|
| `interaction_steps[].gate_explanation` | string | Optional | Объяснение, почему нужен approval |
| `runtime_path.circuit_breaker_triggered` | boolean | Optional | Сработал ли circuit breaker |
| `runtime_path.circuit_breaker_reason` | string | Optional | Причина срабатывания |
| `issues_detected[].description` | string | Required if structured issue | Описание проблемы |
| `issues_detected[].severity` | enum | Optional | critical / major / minor / info |
| `issues_detected[].category` | enum | Optional | architecture / security / ux / performance / domain |

### 2.3 Vocabularies (`vocabularies.md`)

| Категория | Новые значения |
|-----------|---------------|
| analysis_tags (execution) | `fast_path`, `emergency_mode`, `circuit_breaker_triggered` |
| analysis_tags (governance) | `audit_trail`, `policy_override`, `emergency_override` |
| analysis_tags (observability) | `metrics_required`, `tracing_required`, `alert_triggered` |
| configuration_mode_order | Числовой порядок для всех 12 режимов конфигурации |

---

## 3. Добавленные validation rules

### 3.1 `validate_scenario_bank.py`

| # | Правило | Уровень | Описание |
|---|---------|---------|----------|
| V1 | `zero_config` incompatibility | **Error** | `zero_config` несовместим с `explicit_config`, `domain_pack`, `custom_plugin` |
| V2 | Configuration mode span | **Error** (если нет zero_config) | `max(order) - min(order) <= 2` для modes одного сценария |
| V3 | Gate severity default | **Warning** | Если gate отсутствует `severity`, default = `block` |
| V4 | Gate rationale | **Warning** | Если gate отсутствует `rationale`, предупреждение |
| V5 | Observability requirements | **Error** (для новых L3+) | Требуется `observability_requirements` для новых сценариев Level 3+ |
| V6 | External capability taxonomy | **Error** (для structured) | Каждая external capability должна иметь `type`, `trust_level`, `fallback_action` |
| V7 | Execution result | **Warning** (для L2+) | Рекомендуется `execution_result` для Level 2+ |
| V8 | Legacy format warnings | **Warning** | Gates и external capabilities в строковом формате — предупреждение о миграции |

### 3.2 Backward compatibility

- Старые сценарии (20 шт.) остаются валидными без изменений.
- Новые поля — **optional** для существующих данных.
- `observability_requirements` проверяется как error только для сценариев с `execution_result` (маркер нового формата).
- Gates и external capabilities в строковом формате выдают **warning**, не **error**.

---

## 4. Результаты валидации

```
Loaded 20 scenarios

Warnings (45):
  - 20 × missing execution_result (recommended for L2+)
  - 16 × gates in string format (migrate to object with severity/rationale)
  - 7 × external capabilities in string format (migrate to object with type/trust_level/fallback_action)
  - 1 × has no output artifacts (L1 scenario, expected)

Errors (0):

Validation passed.
```

**Вывод:** Все 20 существующих сценариев проходят валидацию по новой схеме без ошибок. Предупреждения — ожидаемые, указывают на рекомендуемую миграцию legacy-формата в новый.

---

## 5. Backward-compatible изменения

| Изменение | Обратная совместимость | Пояснение |
|-----------|----------------------|-----------|
| `execution_result` | ✅ Да | Optional поле, отсутствие не ломает валидацию |
| `observability_requirements` | ✅ Да | Required только для сценариев с `execution_result` (новый формат) |
| `gates` как объекты | ✅ Да | Строковый формат принимается с warning |
| `capabilities.external` как объекты | ✅ Да | Строковый формат принимается с warning |
| `artifacts.outputs` как объекты | ✅ Да | Старый массив строк принимается (outputs проверяется на наличие, не на структуру) |
| Новые analysis tags | ✅ Да | Добавление в vocabulary не ломает существующие теги |
| Configuration mode ordering | ✅ Да | Проверка span применяется только если нет `zero_config` |
| Playthrough: `gate_explanation` | ✅ Да | Optional поле в step |
| Playthrough: `circuit_breaker_*` | ✅ Да | Optional поля в runtime_path |
| Playthrough: `issues_detected` structured | ✅ Да | Старый массив строк принимается |

---

## 6. Open Questions

| # | Вопрос | Приоритет | Ответственный |
|---|--------|-----------|---------------|
| Q1 | **SolveResult vs Artifact:** Should `execution_result.envelope_type: Artifact` duplicate `artifacts.outputs` или быть canonical source? | P1 | Architect |
| Q2 | **Gate severity granularity:** Silent/notify/block достаточно или нужен spectrum (1–5)? | P2 | UX + Security |
| Q3 | **Observability scope:** Metrics для L3+ only или gradually introduced с L2? | P2 | SRE |
| Q4 | **Domain affinity:** Should artifact types be strictly per-domain или shared с affinity scoring? | P2 | Domain Expert |
| Q5 | **Legacy data migration:** Когда мигрировать существующие 20 сценариев в новый формат gates/external/artifacts? | P1 | Data Owner |
| Q6 | **Artifact output structure:** Старый формат `outputs: ["Name"]` vs новый `outputs: [{name, type, lifecycle_state}]`. Нужен ли dual-format parser? | P1 | Developer |
| Q7 | **Configuration mode span rule:** `max - min <= 2` — достаточно ли это для предотвращения конфигурационного ада? | P2 | Architect |
| Q8 | **execution_result as required:** Когда сделать `execution_result` обязательным для всех L2+ (не только recommended)? | P2 | Product |

---

## 7. Следующие шаги

1. **Миграция legacy данных:** Обновить 20 существующих сценариев до нового формата (gates → objects, external → objects, execution_result → added).
2. **Шаблоны:** Убедиться, что все новые сценарии используют обновлённые templates.
3. **CI интеграция:** Подключить `validate_scenario_bank.py` к pre-commit hook.
4. **Schema JSON:** Создать formal JSON Schema (`schemas/scenario-card.schema.json`) на основе обновлённой документации.
5. **Решение open questions:** Провести concept sync для Q1–Q8.

---

**Резюме:** Миграция схемы выполнена. Все изменения backward-compatible. Существующие 20 сценариев валидны. Validator обновлён с 8 новыми правилами. Осталось 8 open questions для следующего concept sync.
