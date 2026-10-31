# expert-007: Logging Standards — OTEL GenAI SemConv и схема сигнального лога

**От:** Внешний эксперт (Qwen)
**Кому:** Mr.Wolf (координатор проекта)
**Дата:** 2026-08-28
**В ответ на:** wolf-007-verdikt-po-expert-006.md
**Закрывает:** Q20.x (OTEL for LLMs, сверка с `session-metrics.json`) + замечание о двухступенчатой нормализации из эксперта 006

---

## 0. Статус

Тема 20 (logging standards) — закрыта в этом файле. Тема 21 (кластеризация) уже закрыта в эксперте 006.
**Прогресс программы:** 4 из 9 тем закрыто (sandbox, decay, clustering, logging). Осталось 5:
- 27. GEPA / prompt optimization
- 28. Self-Harness engineering (обзор)
- 29. Tool hallucination / lazy-tool-call detection
- 30. ReasoningBank / skill reuse
- 31. Multi-agent collective evolution (SkillClaw)

---

## 1. OpenTelemetry GenAI Semantic Conventions (стандарт 2026)

OTel GenAI semantic conventions — официальный отраслевой стандарт для наблюдаемости LLM-приложений. В мае 2026 Microsoft (James Newton-King) опубликовал подробный обзор в блоге OpenTelemetry [[source-1]], спецификация доросла до версии v1.41 [[source-2]].

### 1.1. Ключевые атрибуты (Layer 1: LLM Spans)

| Атрибут | Тип | Назначение | Пример |
|---|---|---|---|
| `gen_ai.request.model` | string | Запрошенная модель | `gpt-4o` |
| `gen_ai.response.model` | string | Фактически использованная модель | `gpt-4o-2024-08-06` |
| `gen_ai.usage.input_tokens` | int | Токены на входе | 1024 |
| `gen_ai.usage.output_tokens` | int | Токены на выходе | 256 |
| `gen_ai.usage.cache_read_input_tokens` | int | Прочитанные из кэша токены | 5120 |
| `gen_ai.client.operation.duration` | histogram | Latency операции (ms) | — |
| `gen_ai.response.finish_reasons` | array | Причины остановки генерации | `["stop"]`, `["tool_calls"]` |
| `gen_ai.system_instructions` | string/array | Системный промпт | *(opt-in, sensitive)* |
| `gen_ai.input.messages` | array | Входные сообщения | *(opt-in, sensitive)* |
| `gen_ai.output.messages` | array | Выходные сообщения | *(opt-in, sensitive)* |

**Цитата:**
> «By default, no prompt content or tool arguments are captured with GenAI telemetry, as these can contain sensitive data. Only metadata like model names, token counts, and durations are included.» [[source-1]]

**Инсайт для Wolf:** По умолчанию OTel-совместимые клиенты (VS Code Copilot, OpenAI Codex, Claude Code) **уже** эмитят нужные нам атрибуты. Наш сигнальный лог должен уметь их принимать.

### 1.2. Layer 2: Agent & Workflow Spans (новое в v1.41)

В v1.41 добавлен новый класс спанов — **agent invocation** (GitHub issue #35 в семантик-конвеншн-репозитории) [[source-3]]. Атрибуты:

| Атрибут | Тип | Назначение |
|---|---|---|
| `gen_ai.agent.id` | string | Уникальный ID агента |
| `gen_ai.agent.name` | string | Имя агента |
| `gen_ai.agent.description` | string | Описание |
| `gen_ai.agent.version` | string | Версия |
| `gen_ai.operation.name` | string | `create_agent`, `invoke_agent`, `execute_tool`, `chat` |
| `gen_ai.provider.name` | string | `openai`, `anthropic`, `aws.bedrock`, `azure.ai.inference` |
| `gen_ai.tool.name` | string | Имя вызванного инструмента |
| `gen_ai.tool.call.id` | string | ID вызова инструмента |

**Цитата:**
> «Distributed tracing has HTTP spans, RPC spans, and DB spans, but nothing for "agent invocation." Layer 2 adds that.» [[source-2]]

**Инсайт для Wolf:** У нас уже есть сущность `agent:mr-wolf`, `agent:opencode`, `system:wolf`. Теперь мы можем маппить их напрямую на OTel-атрибуты, и Wolf-трейсы станут совместимыми с любыми OTLP-бэкендами (Aspire Dashboard, Datadog, Grafana Tempo, Arize Phoenix).

### 1.3. Adoption в индустрии (2026)

| Система | Поддержка OTEL GenAI | Источник |
|---|---|---|
| **VS Code Copilot** | Нативная (traces, metrics, events) | [[source-1]] |
| **OpenAI Codex** | Нативная (structured log events + OTel metrics) | [[source-1]] |
| **Claude Code** | Нативная (OTel, trace в бета) | [[source-1]] |
| **Datadog Agent Observability** | Нативная (маппинг в свой schema) | [[source-4]] |
| **MLflow Tracing** | Нативный OTLP-эндпоинт `/v1/traces` | [[source-5]] |
| **LangSmith** | Параллельная схема (LangChain callbacks), но совместимая | [[source-6]] |
| **Arize Phoenix / OpenInference** | OpenInference — параллельная схема; OTEL GenAI догоняет | [[source-7]] |
| **Elastic LLM Observability** | OTEL-нативный трейсинг | ранее |
| **Braintrust** | Trace Cluster Map | ранее |

**Вывод:** OTEL GenAI — де-факто стандарт. OpenInference (Arize) остаётся богатой альтернативой для LLM-специфичных деталей, но OTEL — это то, что понимают все бэкенды.

---

## 2. Структура трейса: отраслевой паттерн

Zylos (апрель 2026) формуализует каноническую иерархию спанов для агентских систем [[source-6]]:

```
[session_id] Agent Session (root span)
  ├── [turn_1] User Turn
  │   ├── [llm_1] LLM Call — plan generation
  │   ├── [tool_1] bash_execute — "ls -la /project"
  │   ├── [tool_2] read_file — "src/auth.py"
  │   ├── [llm_2] LLM Call — code analysis
  │   └── [tool_3] write_file — "src/auth.py" (modified)
  └── [turn_2] User Turn
      ├── [llm_3] LLM Call — review changes
      └── [llm_4] LLM Call — final response
```

**Соответствие сущностям Wolf:**

| Уровень Zylos | Сущность Wolf | Как мапится |
|---|---|---|
| `session_id` (root) | оркестрационная сессия | новый `session_id` в `session-metrics.json` |
| `turn` | user-сообщение / executor-решение | новый `turn_id` |
| `llm call` | вызов LLM внутри воркера | OTel span с `gen_ai.request.model` |
| `tool call` | `tool_call` события CLI | OTel span с `gen_ai.tool.name` |
| — | `wolf add/supersede/transition` | событие в `events.jsonl` (уже есть) |
| — | rejected-цикл | новое событие `orchestration.rejected_cycle` |
| — | FRICTION-событие | новое событие `orchestration.friction` |
| — | delivery (trigger hit) | новое событие `orchestration.delivery` (Фаза 20 из эксперта 005) |

---

## 3. Сверка с текущим Wolf: что уже есть

### 3.1. `events.jsonl` (существующий)

Текущая схема [[audit-current]]:

```json
{
  "id": "evt_20260629143919_fb671a",
  "type": "memory.added" | "memory.superseded",
  "timestamp": "2026-06-29T14:39:19.740Z",
  "actor": "user:cli" | "agent:mr-wolf" | "agent:opencode" | "system:wolf",
  "payload": {
    "memory_id": "mem_...",
    "type": "lesson" | "decision" | ...,
    // для superseded:
    "old_id": "mem_...",
    "new_id": "mem_..."
  }
}
```

**Сильные стороны:**
- Канонический JSONL, append-only
- Actor — готовая модель для `gen_ai.agent.name`
- Timestamp в ISO8601

**Пробелы:**
- Нет `session_id` / `turn_id` / `trace_id` — события не группируются по сессии
- Только 2 типа событий (`memory.added`, `memory.superseded`) — слишком грубо для контура обучения
- Нет метрик (токены, latency, rejected cycles, tool errors)
- Нет `error_class_id` для классификации ошибок

### 3.2. `scripts/bench-tokens.mjs` (существующий)

Скрипт читает SQLite БД OpenCode (read-only) [[audit-current]]:
- Окно `--since/--until YYYY-MM-DD`, топ-N сессий
- Формула: `weighted = input + 0.1 × cache_read + 5 × output` (null-токены → 0)
- Режим `--compare` («с Wolf / без Wolf», прокси по подстроке `/mister-wolf`)

**Сильные стороны:**
- Точная формула weighted-токенов уже зафиксирована
- Read-only гарантия от записи в SQLite OpenCode

**Пробелы:**
- Read-only прокси к чужой БД — хрупко при миграциях OpenCode
- Не per-session, а агрегат по окну
- Нет детализации по типу операции (tool call, LLM call, orchestration)

### 3.3. Отчёты оркестрации `report-*.md`

Секции (из эксперта 005): **Summary**, **Task Decomposition**, **Workers Used**, **Validation Results**, **Criteria**, **FRICTION**, **Open Questions**.

**Пробел:** Всё в markdown — нечитаемо для машины (как и отмечено в замечании wolf-007).

---

## 4. Gap Analysis: чего не хватает для контура обучения

Для контура (Фазы 20–26) нужно 4 типа сигналов:

| Сигнал | Источник | Текущее состояние | Проблема |
|---|---|---|---|
| **Token cost** (input/output/cache_read, weighted) | LLM calls | есть агрегат в `bench-tokens.mjs` | нет per-session |
| **Latency** (per operation) | LLM/tool spans | нет | — |
| **Tool errors** (count by type) | tool execution | только в markdown отчётов | нет структурированного лога |
| **Rejected cycles** (count, reasons) | orchestration | только в markdown | нет событизации |
| **Delivery events** (trigger hit) | `trigger_keywords` matching | нет | нет события |
| **FRICTION events** (multi-worker same tool) | executor protocol | только в markdown | нет события |

**Вывод:** Контур обучения Фаз 20–26 **не может** работать на текущих данных. Нужен машиночитаемый сигнальный лог поверх `events.jsonl`.

---

## 5. Схема `session-metrics.json` (пропозал)

**Принцип:** Файл — **производный** (не canonical). Canonical по-прежнему markdown-отчёты и `events.jsonl`. `session-metrics.json` — агрегат, пересобираемый из canonical-источников.

### 5.1. Имя и расположение

```
.wolf/orchestration/session-metrics.jsonl
```

Одна запись на завершённую сессию, JSONL для append-only и простого grep.

### 5.2. Схема записи

```typescript
interface SessionMetrics {
  session_id: string;             // OTel trace_id
  started_at: string;             // ISO8601
  ended_at: string;
  duration_ms: number;

  // OTel-compatible aggregates
  gen_ai: {
    llm_calls: number;
    tool_calls: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    weighted_tokens: number;      // формула из bench-tokens.mjs
    models_used: string[];        // уникальные gen_ai.request.model
  };

  // Orchestration metrics
  orchestration: {
    executor_id?: string;
    workers_spawned: number;
    worker_roles: string[];       // e.g., ["worker-reviewer", "worker-analyzer"]
    rejected_cycles: {
      total: number;
      by_reason: Record<string, number>;  // key = rejection_reason_id
    };
    friction_events: number;      // >=2 workers on same tool
    delivery_events: {
      rules_hit: number;
      lessons_hit: number;
      decisions_hit: number;
    };
  };

  // Outcome
  outcome: {
    status: "success" | "partial" | "failed" | "abandoned";
    criteria_passed: number;
    criteria_total: number;
    artifacts_created: { type: string; id: string }[];
    artifacts_superseded: { old_id: string; new_id: string }[];
  };

  // Tool errors — aggregated by error_class_id
  tool_errors: {
    total: number;
    by_class: Record<string, number>;  // key = error_class_id
  };

  // Links to canonical artifacts
  canonical: {
    report_path: string;          // .wolf/orchestration/report-*.md
    events_range: { first: string; last: string };  // evt_id bounds
  };
}
```

### 5.3. Классификация полей

| Поле | Статус | Источник |
|---|---|---|
| `session_id`, `started_at`, `ended_at`, `duration_ms` | OTel-standard | `trace_id` из root span |
| `gen_ai.*` | OTel-standard | aggregate from child spans |
| `weighted_tokens` | Wolf-specific (формула из `bench-tokens.mjs`) | `input + 0.1×cache_read + 5×output` |
| `orchestration.workers_spawned` | Wolf-specific | executor events |
| `orchestration.rejected_cycles.by_reason` | Wolf-specific | новое событие `orchestration.rejected_cycle` |
| `orchestration.delivery_events` | Wolf-specific (Фаза 20 из эксперта 005) | новое событие `orchestration.delivery` |
| `tool_errors.by_class` | Wolf-specific + нормализация (см. §6) | tool error events |
| `outcome.*` | Wolf-specific | парсинг markdown отчёта (детерминированный) |

---

## 6. Двухступенчатая нормализация `error_class_id`

**Замечание wolf-007:** В эксперте 006 §5.2 был предложен LLM-теггер `error_class_id` прямо в горячем пути логирования. Это нарушает инвариант ревизии 27.08 «запись без LLM».

**Решение (принятое в wolf-007):** Двухступенчатая нормализация, смещённая из записи в детекцию.

### 6.1. Этап 1 — горячий путь (детерминированный, при записи)

В `.wolf/config.yaml` — таблица маппинга:

```yaml
error_class_taxonomy:
  # tool:operation:pattern → error_class_id
  - pattern: "read_file:EACCES"
    class_id: "fs:permission_denied"
  - pattern: "bash_execute:exit_code_1"
    class_id: "bash:exit_1"
  - pattern: "bash_execute:command_not_found"
    class_id: "bash:command_not_found"
  - pattern: "web_search:timeout"
    class_id: "network:timeout"
  - pattern: "web_search:rate_limit"
    class_id: "network:rate_limit"
  - pattern: "llm_call:context_length_exceeded"
    class_id: "llm:context_overflow"
  - pattern: "llm_call:rate_limit"
    class_id: "llm:rate_limit"
  - pattern: "llm_call:invalid_json"
    class_id: "llm:parse_error"
```

**Функция классификации (псевдокод):**

```typescript
function classifyError(toolName: string, errorText: string): string {
  const taxonomy = config.error_class_taxonomy;
  for (const rule of taxonomy) {
    const [tool, kind] = rule.pattern.split(':');
    if (tool === toolName && match(errorText, kind)) {
      return rule.class_id;
    }
  }
  return "uncategorized";  // ← всегда возвращается валидный class_id
}
```

**Гарантии:**
- Запись всегда успешна (нет throw)
- Нет LLM-вызова в горячем пути (инвариант соблюден)
- `uncategorized` — легитимный исход, не сигнал отказа
- Таблица taxonomy — класс «параметры» (автономия B, правится куратором)

### 6.2. Этап 2 — холодный путь (периодический, на этапе детекции)

Раз в неделю (или по событию `wolf insights --batch`) запускается `ErrorClassRefiner`:

```typescript
async function refineUncategorized() {
  // 1. Собираем все ошибки с class_id = "uncategorized" за период
  const uncategorized = await readErrorEvents({
    since: lastRefinementDate,
    class_id: "uncategorized",
  });

  // 2. Группируем по (toolName, errorTextHash) — батч-дедуп
  const clusters = clusterByHash(uncategorized);

  // 3. Для каждого кластера ≥ 5 событий — LLM-классификатор
  for (const cluster of clusters) {
    if (cluster.events.length >= 5) {
      const suggested_class_id = await llmClassify(cluster.representative);
      // 4. Предлагаем куратору новый класс
      await proposeNewErrorClass({
        class_id: suggested_class_id,
        evidence_count: cluster.events.length,
        sample: cluster.representative,
      });
    }
  }
}
```

**Гарантии:**
- LLM вызывается только в холодном пути (не ломает запись)
- Требует гейта куратора (автономия B) — новая `class_id` не применяется без явного принятия
- Батч-дедуп снижает количество LLM-вызовов до ~O(unique error types)

**Маппинг на роли из self-learning-design:**
- **Измеритель** (детерминированный скрипт) — Этап 1
- **Analyzer-Worker** (LLM через `opencode run`) — Этап 2, но только для батч-классификации, не для draft-rule генерации
- **Куратор правил** — гейт принятия новой `class_id` в таксономию

---

## 7. Расширение `events.jsonl` — новые типы событий

Для покрытия сигналов из §4, `events.jsonl` расширяется:

### 7.1. Новые типы событий

```
orchestration.session_started   { session_id, started_at, user_request_hash }
orchestration.session_ended     { session_id, ended_at, outcome }
orchestration.rejected_cycle    { session_id, reason_id, worker_id, artifact_id }
orchestration.friction          { session_id, tool_name, workers_involved }
orchestration.delivery          { session_id, delivered_id, trigger_matched }
orchestration.tool_error        { session_id, tool_name, error_class_id, error_text_hash }
orchestration.llm_call          { session_id, model, input_tokens, output_tokens, duration_ms }
orchestration.worker_spawned    { session_id, worker_id, role, parent_id }
```

### 7.2. Совместимость

- Старые события (`memory.added`, `memory.superseded`) — не меняются
- Новые события — только с префиксом `orchestration.`
- `actor`-модель остаётся: `system:wolf` эмитит orchestration-события
- Схема — **open**: payload может расширяться, consumers обязаны игнорировать неизвестные поля

### 7.3. Back-fill

Исторические сессии (до включения логирования) — не backfill-ятся. Сигнальный лог строится с момента включения. Для baseline-метрик (Фаза 20) — это означает, что baseline = первая неделя работы с включённым логированием.

---

## 8. Что это меняет в Wolf

### 8.1. Фаза 20 (Сигнальный лог)

**Получает:**
- Чёткую схему `session-metrics.jsonl` (раздел 5)
- Расширение `events.jsonl` на 8 новых типов событий (раздел 7)
- Двухступенчатую нормализацию `error_class_id` (раздел 6)
- OTel-совместимые атрибуты (раздел 1)

**Ревизия спеки:** Раздел «Формат записи per-session» заменяется на конкретную схему из §5.2.

### 8.2. Фаза 21 (Паттерн-детекция)

**Получает:**
- Входной сигнал: `tool_errors.by_class` (с уже нормализованными `class_id`)
- Порог N≥3 применяется к `by_class[class_id]`, а не к сырому тексту
- `ErrorClassRefiner` (холодный путь) — как pre-step перед кластеризацией

### 8.3. Фаза 22 (ExpeL-рефлексия)

**Получает:**
- Holdout-валидация работает на структурированных сигналах с `class_id`
- Draft-rule может ссылаться на `class_id` как на формальный якорь

### 8.4. Фаза 24 (GEPA)

**Получает:**
- `gen_ai.weighted_tokens` из `session-metrics.jsonl` как сигнал стоимости
- `duration_ms` как сигнал времени
- `outcome.criteria_passed / criteria_total` как сигнал качества (детерминированный)

### 8.5. Таксономия (`.wolf/config.yaml`)

**Получает:**
- Новую секцию `error_class_taxonomy` (класс «параметры»)
- Гейт куратора для добавления новых классов через `ErrorClassRefiner`

### 8.6. CLI-команды

**Новые/расширенные:**

- `wolf insights --since --until --format json` — чтение `session-metrics.jsonl`
- `wolf errors refine` — ручной запуск `ErrorClassRefiner` (cold path)
- `wolf errors propose` — просмотр предложенных новых `class_id`
- `wolf events stream` — tail `events.jsonl` (для отладки)

### 8.7. Совместимость с внешними бэкендами

**OTLP-экспорт (опциональный, не в v1):**

Поскольку схема атрибутов совместима с OTEL GenAI, Wolf v1 может в будущем (не скоуп) эмитить трейсы напрямую в:
- Aspire Dashboard (локально, Docker)
- Datadog Agent Observability
- Grafana Tempo
- Arize Phoenix

**Не в v1** — только для справки; Wolf остаётся local-first.

---

## 9. Источники

### Якорные (OTel GenAI)

[source-1] **Inside the LLM Call: GenAI Observability with OpenTelemetry**
Автор: James Newton-King (Microsoft)
Дата: May 14, 2026
URL: https://opentelemetry.io/blog/2026/genai-observability/
Тип: официальный блог OpenTelemetry

[source-2] **How OpenTelemetry Traces LLM Calls, Agent Reasoning, and MCP Tools**
Источник: Greptime
Дата: May 9, 2026
URL: https://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions
Тип: технический блог, разбор v1.41

[source-3] **Semantic Conventions for Generative AI Agentic Systems (gen_ai.*)**
GitHub Issue #35
URL: https://github.com/open-telemetry/semantic-conventions-genai/issues/35
Тип: официальный proposal

[source-4] **Datadog Agent Observability natively supports OTel GenAI Semantic Conventions**
URL: https://www.datadoghq.com/blog/llm-otel-semantic-convention/
Тип: продукт-блог

[source-5] **OpenTelemetry GenAI Semantic Conventions** (MLflow docs)
URL: https://mlflow.org/docs/latest/genai/tracing/opentelemetry/genai-semconv/
Тип: документация

[source-6] **Agent Observability and Production Debugging**
Источник: Zylos.ai
Дата: April 29, 2026
URL: https://zylos.ai/research/2026-04-29-agent-observability-production-debugging/
Тип: research note

[source-7] **OpenInference vs OpenTelemetry GenAI for Agent Tracing**
Источник: Arthur.ai
URL: https://www.arthur.ai/column/openinference-vs-opentelemetry-genai-conventions-agent-tracing
Тип: сравнительный обзор

### Аудит текущего состояния Wolf

[audit-current] Прочитанные файлы:
- `.wolf/memory/events.jsonl` (30 строк)
- `.wolf/orchestration/report-2026-08-26-bench-tokens.md`
- `scripts/bench-tokens.mjs` (через отчёт)

---

## 10. Следующий шаг

Ожидаю вердикт. План — `expert-008-negative-constraints.md` (закрытие Q22.x про формулирование negative constraints из hard negatives; включает глоссарий Proofs Not Promises / Cassius как просили в wolf-005).

**Прогресс программы:** 4 из 9 тем закрыто, накоплено ~30 кандидатов правок спеки v2.
