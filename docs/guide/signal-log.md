# Сигнальный лог контура самообучения (Ф20/Ф21)

Канон — спека `docs/superpowers/specs/2026-08-26-self-learning-design.md` §2.1 (сигналы),
§2.2 (паттерны), §16 (дефолты). Этот гайд — краткая документация формата D1.

## Что это

`.wolf/metrics/session-metrics.jsonl` — append-only лог измеренного опыта: события
сессий, жалобы, доставки методик, ошибки тулов. Derived-артефакт (инвариант §9:
rebuildable, в git не коммитится); markdown-отчёты контур НЕ парсит — только этот лог.
Запись детерминированная, без LLM (инвариант «запись без LLM»).

`wolf metrics emit` не существует и не вводится (решение Q3 §18): writer'ы — сами команды.

## Writer-матрица

| Событие          | Кто пишет                                                                                          | Когда                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `run`            | `wolf run`                                                                                         | после каждого запуска (с P1 — единственный источник run-метрик)        |
| `complaint`      | `wolf complain`                                                                                    | при каждой жалобе                                                      |
| `delivery`       | `wolf scaffold`, `wolf tool expose`                                                                | доставка методики (рамка+playbook / SKILL.md)                          |
| `tool_error`     | `wolf run` (ошибка spawn) + `recordToolError()`                                                    | ошибка тула, класс — через классификатор                               |
| `task_evaluated` | `wolf task-eval`                                                                                   | вердикт по задаче (P0); `--campaign` → `detail.campaign_id` (P3)       |
| `mcp_call`       | MCP-сервер (обёртка в `registerMemoryTools`)                                                       | каждый вызов mr-wolf-\* тулзы (P1 D5)                                  |
| `memory_stage`   | авто: `wolf search`/`get` (retrieved), `wolf brief`/`call` (injected); ручной: `wolf memory-stage` | стадия жизненного цикла памяти (P2 D1); cited/applied — внешние акторы |
| `coord_event`    | `wolf coord`                                                                                       | факт координации между агентами (P2 D3)                                |

## Формат записи (OTEL GenAI-совместимый, Layer 1+2)

```jsonc
{
  "ts": "2026-08-30T12:00:00.000Z", // ISO8601
  // run | complaint | delivery | tool_error | task_evaluated | mcp_call |
  // memory_stage | coord_event
  "event": "run",
  "session_id": "ses_...", // opencode session; null — вне сессии
  "gen_ai": { "modelID": "org/model", "agent": "worker" }, // modelID — ОБЯЗАТЕЛЬНОЕ поле
  // (спека §21 п.23); null — модель неизвестна
  "orchestration": { "task": "метка задачи", "actor": "user:cli" },
  "weighted": 12345, // run: input + 0.1×cache_read + 5×output
  "outcome": "ok", // run: ok | exit_<code>; error; complaint; delivered
  "tool_name": "opencode", // tool_error
  "error_class_id": "tool_not_found", // tool_error: класс из классификатора
  "detail": {}, // факты события (about/text, name/mechanism, message)
}
```

`gen_ai.modelID` присутствует в каждой записи — без него сравнение «до/после» теряет
смысл (роутинг делает модель пер-сессионной переменной, PoC#4).

### Опциональные поля run-события (M1 спеки аналитики 2026-09-03)

Обратно-совместимо: старые записи без этих полей читаются как раньше.

| Поле          | Тип                                      | Откуда                               |
| ------------- | ---------------------------------------- | ------------------------------------ |
| `duration_ms` | number                                   | замер `wolf run` вокруг spawn        |
| `tokens`      | `{input, output, cache_read}`            | суммы сырых токенов по step-finish   |
| `experiment`  | `{id, arm: 'wolf'\|'baseline', task_id}` | флаги `--experiment/--arm/--task-id` |

`.wolf/run-log.jsonl` больше НЕ пишется (P1 D4): сигнальный лог — единственный
writer-путь run-метрик. Существующий исторический run-log читается экономикой
на переходный период (deprecated; простая конкатенация источников без dedup —
медианы устойчивы к симметричному дублированию переходного окна, счётчики могут
завышаться; см. `src/app/use-cases/run-source.ts`). Запусти `wolf migrate run-log`,
чтобы архивировать legacy-файл в `.wolf/metrics/archive/` и закрыть переходное окно.

Пример v1-записи (без identity-полей — валидна и после P1):

```jsonc
{
  "ts": "2026-09-03T12:00:00.000Z",
  "event": "run",
  "session_id": "s-e2e",
  "gen_ai": { "modelID": "zai-coding-plan/glm-5.3", "agent": "dev" },
  "orchestration": { "task": "e2e", "actor": "user:cli" },
  "weighted": 205,
  "duration_ms": 1520,
  "tokens": { "input": 100, "output": 20, "cache_read": 50 },
  "experiment": { "id": "exp1", "arm": "wolf", "task_id": "t-1" },
  "outcome": "ok",
}
```

## Схема v2: identity-поля (P1)

Все поля опциональны → записи v1 валидны без изменений. Записи без
`schema_version` читаются как v1 (upcast на чтении: identity-поля остаются
`undefined`, файлы истории не переписываются). Неизвестные поля отбрасываются
Zod-схемой (`strip`).

| Поле             | Тип                        | Семантика                                                        |
| ---------------- | -------------------------- | ---------------------------------------------------------------- |
| `event_id`       | uuid                       | уникальный id события; дубликаты детектируются data-quality v2   |
| `schema_version` | `2` (literal)              | версия схемы; отсутствие = v1                                    |
| `run_id`         | uuid                       | id прогона `wolf run` — сквозная цепочка задачи                  |
| `trace_id`       | uuid                       | трасса: объединяет раны одной задачи (`--trace-id` или uuid)     |
| `parent_span_id` | string                     | родительский span (зарезервирован; span-модель — P2)             |
| `role_level`     | `'L0'\|'L1'\|'L2'`         | уровень роли писателя по actor-конвенции; дефолт — не писать     |
| `attempt`        | number                     | попытка (retry-номер) в рамках run                               |
| `task_id`        | string                     | общий id задачи (пишется всегда при передаче `--task-id`)        |
| `campaign_id`    | string                     | id кампании: `wolf run --campaign` / `task-eval --campaign` (P3) |
| `config_hash`    | sha256, первые 12 символов | подпись `.wolf/config.yaml` на момент прогона                    |
| `prompt_hash`    | sha256, первые 12 символов | подпись текста промпта                                           |
| `tools`          | `string[]`                 | инструменты прогона (из `--tool`) — источник tool-runs экономики |

`wolf run` (P1 D3) генерирует `event_id`/`run_id`/`trace_id` сам, считает хеши
и пишет `schema_version: 2` во все новые run-события. Семантика флагов:
`experiment` записывается только полным набором `--experiment` + `--arm`
(arm обязателен); `--arm` без `--experiment` игнорируется с warning в stderr;
`--task-id` — общий флаг (пишется и вне эксперимента); `--trace-id`/`--attempt`
пишутся в `trace_id`/`attempt`.

Живой пример v2-записи (реальный прогон `wolf run --tool wolf-search --tool bash
--trace-id 7f3a… --attempt 1 --task-id docs-p1 --campaign eval-01`):

```json
{
  "ts": "2026-09-04T16:28:24.672Z",
  "event": "run",
  "schema_version": 2,
  "session_id": "ses_docs",
  "gen_ai": { "modelID": "zai-coding-plan/glm-5.3-flash", "agent": "dev" },
  "orchestration": { "task": "docs-p1-example", "actor": "user:cli" },
  "weighted": 532,
  "outcome": "ok",
  "event_id": "cc4c8b4f-e28f-4a2a-8c61-44195f96ec7f",
  "run_id": "12f1ea76-ecf1-4e04-a88a-a6273455ace9",
  "trace_id": "7f3a2b1c-9d4e-4f6a-8b2c-1e5d7a9f0b3e",
  "attempt": 1,
  "task_id": "docs-p1",
  "campaign_id": "eval-01",
  "config_hash": "9e01d7617ab3",
  "prompt_hash": "83ba47079adb",
  "tools": ["wolf-search", "bash"],
  "duration_ms": 1060,
  "tokens": { "input": 320, "output": 40, "cache_read": 120 }
}
```

## Событие `mcp_call` (P1 D5)

Обёртка в `registerMemoryTools` пишет событие на КАЖДЫЙ вызов mr-wolf-\* тулзы:
`tool_name` (имя тулзы), `duration_ms` (замер вокруг handler), `outcome:
'ok'|'error'` (error — только throw; текстовые «not found» — это ok),
`detail.method` (имя вызванного метода) и `detail.wolf_version` (runtime-версия
Wolf из package.json на момент вызова — с P2 позволяет отличить поведение
версий в одном логе). Сборка дешёвая — append без IO-фанатизма,
сбой телеметрии не ломает вызов. Граница измерения: вызовы, отброшенные
input-схемой SDK до dispatch, до обёртки не доходят и не логируются.

Живой пример (вызов `list` через MCP stdio, wolf 2.6.1):

```json
{
  "ts": "2026-09-04T16:29:04.517Z",
  "event": "mcp_call",
  "session_id": null,
  "gen_ai": { "modelID": null, "agent": null },
  "orchestration": { "task": null, "actor": "system:wolf" },
  "outcome": "ok",
  "tool_name": "list",
  "duration_ms": 2,
  "detail": { "method": "list", "wolf_version": "2.6.1" }
}
```

## Событие `memory_stage` (P2 D1)

Стадия жизненного цикла памяти: `outcome` = стадия, `detail`:

```jsonc
{
  "stage": "retrieved", // retrieved | injected | cited | applied
  "memory_ids": ["mem_..."], // непустой массив id объектов
}
```

Семантика стадий:

- `retrieved` — объект достался из store (выдача поиска/чтения);
- `injected` — объект попал в контекст агента (бриф, call-injections);
- `cited` — агент процитировал объект в ответе/отчёте;
- `applied` — содержимое объекта внедрено в код/решение.

Кто какие пишет: `retrieved` — авто-писатели `wolf search`/`wolf get` и MCP-аналоги
(MCP — actor `system:wolf`; CLI — `WOLF_ACTOR` env или `user:cli`); `injected` —
`wolf brief`/`wolf call` при непустых
инъекциях; `cited`/`applied` — внешние акторы (агенты/харнессы) вручную:
`wolf memory-stage --stage cited --ids <id,...> [--actor agent:<имя>]`
(см. [harness-integration.md](./harness-integration.md)).

Событие НЕ пишется, когда нечего фиксировать: пустая выдача поиска → нет
`retrieved`; бриф без инъекций → нет `injected`; пустой `--ids` — ошибка CLI.
Контекст-событие: `signalKey` → null, пороги Ф21 не считаются. Для атрибуции
(см. [analytics.md](./analytics.md)) важно передавать `--session <id>` — атрибуция
связывает `injected` с `task_evaluated` по `session_id`.

Живые примеры (ручные cited/applied от агента-воркера и авто-retrieved от
`wolf search`):

```json
{"ts":"2026-09-04T19:44:41.276Z","event":"memory_stage","session_id":null,"gen_ai":{"modelID":null,"agent":null},"orchestration":{"task":null,"actor":"agent:worker"},"outcome":"cited","detail":{"stage":"cited","memory_ids":["mem_20260904_validate_fts_queries_against_real_index_67b487"]}}
{"ts":"2026-09-04T19:44:41.541Z","event":"memory_stage","session_id":null,"gen_ai":{"modelID":null,"agent":null},"orchestration":{"task":null,"actor":"agent:worker"},"outcome":"applied","detail":{"stage":"applied","memory_ids":["mem_20260904_use_append_only_jsonl_for_signal_log_03b132"]}}
{"ts":"2026-09-04T19:44:43.482Z","event":"memory_stage","session_id":null,"gen_ai":{"modelID":null,"agent":null},"orchestration":{"task":null,"actor":"user:cli"},"outcome":"retrieved","detail":{"stage":"retrieved","memory_ids":["mem_20260904_use_append_only_jsonl_for_signal_log_03b132"]}}
```

## Событие `coord_event` (P2 D3)

Факт координации между агентами: `outcome` = kind, `detail`:

```jsonc
{
  "kind": "handoff", // handoff | review | acceptance | blocker | escalation
  "actor_from": "L0:wolf", // источник
  "actor_to": "L1:lead", // опц. адресат
  "refs": ["mem_..."], // опц. id связанных объектов (отчёт, блокер, задача)
  "note": "...", // опц. свободная заметка
}
```

Пишется только вручную — `wolf coord --kind <k> [--from <актор>] [--to <актор>]
[--ref <id,...>] [--note <текст>]` (кто какие kind пишет — в
[harness-integration.md](./harness-integration.md)). `--from`/`--actor` дефолт —
`WOLF_ACTOR` env или `user:cli`. Контекст-событие: `signalKey` → null.
Аналитика пар вида «blocker открыт → закрыт» — в
[analytics.md](./analytics.md) (`--view coordination`).

Живой пример (handoff координатора лиду, ref — объект памяти):

```json
{
  "ts": "2026-09-04T19:44:42.093Z",
  "event": "coord_event",
  "session_id": null,
  "gen_ai": { "modelID": null, "agent": null },
  "orchestration": { "task": null, "actor": "user:cli" },
  "outcome": "handoff",
  "detail": {
    "kind": "handoff",
    "actor_from": "L0:wolf",
    "actor_to": "L1:lead",
    "refs": ["mem_20260904_validate_fts_queries_against_real_index_67b487"],
    "note": "P2 docs example"
  }
}
```

## Классификатор ошибок (D1.2)

`src/domain/error-class.ts`: детерминированная таблица (первое совпадение подстроки,
lowercase, порядок значим) → `error_class_id`. Нет совпадения — `uncategorized`
(вход для холодного ErrorClassRefiner, D2). Проектная таблица `error_class_taxonomy`
в `.wolf/config.yaml` матчится раньше дефолтной:

```yaml
error_class_taxonomy:
  - id: grpc_unavailable
    match: [grpc, unavailable]
```

## Паттерн-детекция (Ф21, D1.3)

Ключ кластера (`signalKey`): `tool_name:error_class_id` для ошибок;
`complaint:<about>` / `delivery:<name>` для остальных; `run` не кластеризуется.
Порог N≥3 — параметр процесса: `learning.pattern_threshold` в `.wolf/config.yaml`
(дефолт 3, спека §16). Триггер событийный: в момент записи, перевалившей порог,
паттерн фиксируется строкой в `.wolf/metrics/patterns.jsonl` — календарных прогонов нет.

Сводка: `wolf learn digest` (активные паттерны + evidence-ссылки на строки лога),
здоровье контура: `wolf learn status` (объёмы, Layer 1–2 meta-metrics, последние события).
