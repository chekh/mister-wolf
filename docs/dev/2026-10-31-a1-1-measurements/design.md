---
slug: a1-1-measurements
title: A1.1 — дизайн: importer usage-сигналов
status: draft
created: 2026-10-31
---

# A1.1 — дизайн

## Глоссарий

- **Источник** — локальная SQLite-база площадки OpenCode 2.2.5.
- **Turn** — строка `session_message` с `type='assistant'`.
- **Run** — сессия источника (`session_v2.id`); `run_id = session_id`.
- **Импорт** — перенос завершённых turn'ов в сигнальный лог как событий `run`.

## Контракты

### Источник (подтверждён 2026-10-31, OpenCode 2.2.5)

Файл по умолчанию: `~/.local/share/opencode/opencode.db` (WAL, 13.4 GB).
Открытие: `better-sqlite3` (уже зависимость проекта), `readonly: true`,
`fileMustExist: true`.

Актуальные таблицы: `session_v2` (6 079 строк), `session_message` (362 291),
индексы `session_message_time_created_idx` и
`session_message_session_time_created_id_idx`.

Образец записи (реальные значения, без содержимого сообщения):

```
session_message.id      = msg_19376c155001x669ikNHrjri12
session_message.session_id = ses_e6c92ca6effeG4PfxBW5MSpNxe
session_message.type    = assistant
data.time               = {created:1793475397271, streamed:1793475402233,
                           completed:1793475402426}
data.agent              = executor-lead
data.model              = {id:"ds-cp/deepseek-flash", providerID:"company",
                           variant:"default"}
data.tokens             = {input:88727, output:114, reasoning:0,
                           cache:{read:0, write:0}}
data.cost               = 0
data.finish             = "tool-calls"
data.retry              = {attempt:2, at:<ms>, error:{type:...}}   # опционально
session_v2.model/parent_id/agent/time_busy/idle_outcome — на уровне run
```

Исторические таблицы `session`/`message` (OpenCode ≤1.4.9, последняя запись
2026-10-11) срезом **не используются**: они перестали обновляться с переходом
на v2; чтение обеих схем дало бы второй контракт.

### Маппинг turn → `SignalEvent` (событие `run`)

| SignalEvent           | Источник                                                         | Если нет данных                         |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------- | --- |
| `ts`                  | ISO(`data.time.completed`)                                       | turn не импортируется                   |
| `event`               | `'run'`                                                          | —                                       |
| `session_id`          | `session_message.session_id`                                     | null                                    |
| `gen_ai.modelID`      | `data.model` → `${providerID}/${id}`; иначе `session_v2.model`   | `null`                                  |
| `gen_ai.agent`        | `data.agent`, иначе `session_v2.agent`                           | `null`                                  |
| `orchestration.task`  | всегда `null` (нет достоверной связи)                            | `null`                                  |
| `orchestration.actor` | `agent:<agent>`, иначе `opencode:unknown`                        | `opencode:unknown`                      |
| `tokens`              | `{input, output, cache_read}` из `data.tokens`                   | блок опущен                             |
| `weighted`            | `input + 0.1*cache_read + 5*output` — только при полном `tokens` | опущен                                  |
| `duration_ms`         | `completed - created` (оба поля есть, разница ≥ 0)               | опущен                                  |
| `outcome`             | `stop`/`tool-calls` → `ok`; `error` → `error`                    | опущен                                  |
| `run_id`              | `session_id`                                                     | опущен                                  |
| `trace_id`            | `session_v2.parent_id` (подтверждённая связь parent→child)       | опущен                                  |
| `attempt`             | `data.retry.attempt`                                             | опущен                                  |
| `task_id`             | явная карта `--task-map` (session → task)                        | опущен                                  |
| `event_id`            | `sha256("opencode-usage:v1                                       | " + message_id)` hex, первые 32 символа | —   |
| `schema_version`      | `2`                                                              | —                                       |

Инварианты:

1. `token input/output/cache_read` не вычисляются из длины текста: только поля
   источника.
2. `reasoning` и `cache.write` не прибавляются к `output` и не входят в
   `weighted` — семантика относительно `output` в источнике не документирована.
3. `cost` не импортируется (0 при отсутствии прайсинга).
4. `task_id` не восстанавливается по заголовку сессии или имени агента.
5. Незавершённый turn (`completed` отсутствует) не импортируется.

### Дедупликация

```
existing = new Set(readSignalLog(baseDir).events.flatMap(e => e.event_id ?? []))
for turn of turns:                       # детерминированный порядок (ts, id)
  id = usageEventId(turn.id)
  if existing.has(id) → duplicate += 1; continue
  appendSignal(baseDir, signalFromTurn(turn, {taskId, traceId}))
  existing.add(id); appended += 1
```

`event_id` зависит только от идентификатора исходного сообщения, поэтому
повторный импорт неизменного источника не добавляет строк, а два разных run
одной задачи (`attempt=1` в каждом) остаются двумя записями.

### Run-итог (отчёт команды)

Агрегация записанных событий по `run_id`:

```
RunSummary = {
  run_id, session_id, trace_id|null, task_id|null, attempt|null,
  model|null, agent|null,
  tokens: {input, output, cache_read} | 'unknown',
  duration: {generation_ms, busy_ms|null} | 'unknown',
  events, outcomes: {ok, error, unknown}
}
```

`generation_ms` — сумма `duration_ms` импортированных turn'ов;
`busy_ms` — `session_v2.time_busy - session_v2.time_created`, если оба есть.
Отчёт печатает сводку и блок `source limitations` (см. requirements §6).
Пустой набор событий печатается как «unknown coverage», не как 0 расход.

### Ограничения чтения

`session_message` содержит полный JSON сообщения (включая текст), поэтому
окно импорта ограничено: по умолчанию `--since` = вчера, `--until` = сегодня.
Индекс `session_message_time_created_idx` обязателен, полное сканирование
таблицы без окна не выполняется.

## Компоненты и ответственность

- `src/domain/usage-signal.ts` — чистый маппинг и агрегация: `usageEventId`,
  `signalFromTurn`, `summarizeRuns`, типы `UsageTurn`/`UsageRun`.
  Ответственность: детерминированные значения и честные «неизвестно».
- `src/adapters/fs/opencode-usage-db.ts` — read-only чтение источника:
  `readUsageSource(dbPath, {since, until})` → `{runs, turns}`.
  Ответственность: SQL, режим read-only, отказ при недоступной БД.
- `src/app/use-cases/import-usage.ts` — `importUsage(baseDir, input)`:
  чтение лога, дедуп, запись через `appendSignal`, отчёт.
  Ответственность: идемпотентность и единственный путь записи.
- `src/adapters/cli/commands/usage.ts` — `wolf usage import`.
  Ответственность: аргументы (`--db`, `--since`, `--until`, `--task-map`,
  `--dry-run`, `--json`), человеческий вывод.
- `src/adapters/cli/cli-entry.ts` — регистрация команды (видимая, не hidden).

## ADR-карточки

**ADR-1. Источник — `session_message`/`session_v2` (OpenCode 2.2.5).**
Контекст: прежний аудит 2026-10-01 опирался на `message`/`session` (1.4.9);
эта таблица перестала обновляться 2026-10-11, актуальная запись идёт в v2.
Решение: читать только v2. Последствия: чтение legacy-таблиц не реализуется;
повторное появление обеих схем не поддерживается. Проверка: образец записи
выше и fixture из v2-полей.

**ADR-2. Единица события — один assistant-turn.**
Контекст: сессионные rollup-токены кумулятивны, а лог append-only.
Решение: событие на turn; `run_id` = сессия. Последствия: повторный импорт
идемпотентен по `event_id` = хеш id сообщения; частично завершённая сессия
дописывается недостающими turn'ами.

**ADR-3. Модель — из turn, fallback на сессию.**
Контекст: в v1 модель была только на сообщении, в v2 — и там, и в сессии.
Решение: `data.model` приоритетен (переключение модели в сессии наблюдаемо),
`variant` не переносится (нет поля в схеме). Последствия: variant остаётся
неизвестным и явно помечается в ограничениях.

**ADR-4. `task_id` — только из явной карты.**
Контекст: достоверной связи «сессия → поручение» в источнике нет; угадывание
по заголовку запрещено. Решение: `--task-map` JSON `{session_id: task_id}`.
Последствия: без карты `task_id` отсутствует и показывается как unknown.

**ADR-5. Стоимость не вычисляется.**
Контекст: `cost` источника = 0 без прайсинга, прайс-таблицы в конфиге нет.
Решение: `weighted` по существующей формуле, `cost` отсутствует.
Последствия: `costPerAcceptedTask` остаётся недоступным; это E2.

**ADR-6. Схема не расширяется.**
Контекст: REQ-23A запрещает новые публичные поля, включая `detail`.
Решение: importer пишет только существующие поля `SignalEventSchema`; отчёт
печатается в stdout, а не в память. Последствия: `reasoning`, `cache.write`,
`variant`, completeness — в документации как ограничения.

## Ссылки на NFR

- NFR-01: маппинг не требует новых полей → старые записи читаются
  `readSignalLog` без изменений.
- NFR-02: `event_id` — детерминированный хеш; см. «Дедупликация».
- NFR-03: `readonly: true` в контракте адаптера; запись только в
  `.wolf/metrics/session-metrics.jsonl`.
- NFR-04: окно по умолчанию 1 сутки; замер: 7 суток ≈ 29 163 turn / 39 с на
  13.4 GB (Slice Reality Check).

Покрытие REQ/NFR: RQ-01 → ADR-1, источник; RQ-02 → компоненты; RQ-03 →
таблица + дедупликация; RQ-04 → NFR-01; RQ-05 → ADR-3/5/6; RQ-06 → контракты
без изменения схемы.
