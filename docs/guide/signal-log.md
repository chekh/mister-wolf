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

| Событие      | Кто пишет                                       | Когда                                                  |
| ------------ | ----------------------------------------------- | ------------------------------------------------------ |
| `run`        | `wolf run`                                      | после каждого запуска (вместе с `.wolf/run-log.jsonl`) |
| `complaint`  | `wolf complain`                                 | при каждой жалобе                                      |
| `delivery`   | `wolf scaffold`, `wolf tool expose`             | доставка методики (рамка+playbook / SKILL.md)          |
| `tool_error` | `wolf run` (ошибка spawn) + `recordToolError()` | ошибка тула, класс — через классификатор               |

## Формат записи (OTEL GenAI-совместимый, Layer 1+2)

```jsonc
{
  "ts": "2026-08-30T12:00:00.000Z", // ISO8601
  "event": "run", // run | complaint | delivery | tool_error
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

### Новые опциональные поля run-события (M1 спеки аналитики 2026-09-03)

Обратно-совместимо: старые записи без этих полей читаются как раньше.

| Поле          | Тип                                      | Откуда                               |
| ------------- | ---------------------------------------- | ------------------------------------ |
| `duration_ms` | number                                   | замер `wolf run` вокруг spawn        |
| `tokens`      | `{input, output, cache_read}`            | суммы сырых токенов по step-finish   |
| `experiment`  | `{id, arm: 'wolf'\|'baseline', task_id}` | флаги `--experiment/--arm/--task-id` |

Тот же enrichment `wolf run` пишет и в `.wolf/run-log.jsonl` (поля `session`,
`duration_ms`, `tokens`, `experiment`): run-log остаётся источником блоков
экономики/роутинга, run-сигналы — блока абсолютов и agent ledger
(см. [analytics.md](./analytics.md)).

Семантика флагов: `experiment` записывается только полным набором
`--experiment` + `--arm` (arm обязателен). `--arm`/`--task-id` без
`--experiment` игнорируются, `--experiment` без `--arm` не записывается —
в обоих случаях `wolf run` печатает warning в stderr, прогон не ломается.

Пример записи:

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
