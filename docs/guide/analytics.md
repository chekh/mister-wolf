# Аналитика эффективности: `wolf analytics`, `wolf dashboard`, снапшоты

Канон — спека `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md`.
Этот гайд — практическая документация команд витрины: что вызывать, как настраивать,
что лежит в JSON. Аналитика — только агрегация существующих логов, без LLM.

## Команды

### `wolf analytics` — выборки для Стюарда

| Вызов                                     | Ответ                                                         |
| ----------------------------------------- | ------------------------------------------------------------- |
| `--view memory --class dead --json`       | DEAD-объекты: id, тип, возраст, last_used, счётчики           |
| `--view memory --class sleeper [--top N]` | редко используемые объекты                                    |
| `--view memory [--type <тип>] [--top N]`  | полный memory ledger + garbage ratio                          |
| `--view rules [--silent]`                 | ranking по holdout_prevented; `--silent` — только молчащие    |
| `--view tools [--origin script\|native]`  | tool ledger: usage, ошибки, lifecycle, promotion-кандидаты    |
| `--view funnel [--weeks N]`               | конверсия write→deliver→trigger по неделям                    |
| `--view agents [--agent <имя>] [--top N]` | per-agent объём, стоимость, ошибки, жалобы, достижения        |
| `--view steward [--weeks N]`              | мутации, жалобная воронка, рецидивы, churn, доля авто-мутаций |
| `--view outliers [--top N]`               | самые дорогие прогоны (weighted; $ при pricing)               |
| `--view readiness`                        | готовность к экспериментам (доля прогонов с arm)              |
| `--view all`                              | все секции подряд                                             |

Общие флаги: `--json` (машинный вывод — дефолт для агентского потребления),
`--top N` (лимит строк, дефолт 20), `--weeks N` (окно воронки, дефолт 8).

Известное ограничение: фильтры `--class/--type/--origin/--agent/--silent`
сейчас применяются только к `--json`-выводу (и MCP-инструменту) — текстовый
рендер печатает секцию без фильтрации; строкам таблицы выше с этими флагами
нужен `--json`.

Lifecycle-классы памяти (D7) для `--view memory --class new|sleeper|workhorse|dead`:

- `WORKHORSE` — использований ≥ `workhorse_uses` (дефолт 3);
- `SLEEPER` — от 1 до `workhorse_uses − 1` (при дефолте — 1–2);
- `NEW` — 0 использований, возраст ≤ `new_days` (дефолт 14 дней);
- `DEAD` — 0 использований, возраст > `new_days` → кандидат на archive.

Пороги конфигурируются (`analytics.thresholds`, см. раздел «Конфигурация»).

Честное ограничение воронки: holdout-счётчики кумулятивны (без таймстампов),
поэтому `prevent` в недельную воронку `--view funnel` не входит —
`holdout_prevented` показывается суммарно в `--view rules`.

MCP-инструмент `analytics` принимает те же параметры (`view/class/type/origin/
agent/top/weeks/silent`) и возвращает тот же JSON, что `--json`.

### `wolf dashboard` — консольный дашборд

- без флагов — три секции в stdout: `health` (L1-статусы), `ledgers` (L2-таблицы),
  `trends` (L3-спарклайны `▁▂▃▄▅▆▇█` по снапшотам);
- `--tab health|ledgers|trends` — одна секция;
- `--json` — единый JSON-документ `DashboardData`;
- Unicode-таблицы и спарклайны рендерятся прямо в терминал, файлы НЕ пишутся
  (HTML-витрина отложена, решение D8 спеки).

### `wolf effectiveness --snapshot` — снапшоты и дельты

- `--snapshot` — сериализует полный отчёт и аппендит в
  `.wolf/metrics/effectiveness-snapshots.jsonl` (append-only, история для трендов);
- обычный вызов при наличии ≥1 снапшота печатает дельту к последнему
  (`delta vs <ts>` по числовым полям блоков).

### `wolf insights --type activity` — недельная динамика мутаций (M4)

Агрегация event-log по неделям (те же 8 бакетов, что density-линза), без LLM:

- **Weekly density** — новые объекты по неделям: decisions / lessons / debug / total;
- **Weekly mutations** — мутации по неделям: added / updated / superseded /
  resolved / transitioned + total — виден баланс «рождение vs вытеснение»;
- **Status tally** — текущее распределение объектов по статусам.

Отвечает на вопрос «растёт ли отдача памяти вместе с захватом» (Q6): если
added неделями опережает superseded/resolved — память растёт быстрее, чем
очищается (сигнал к `wolf learn decay` и аудиту шума,
см. [effectiveness.md](./effectiveness.md)).

## Конфигурация

`.wolf/config.yaml`:

```yaml
# $-конверсия: map модель -> $/Mtok; без блока $-поля скрыты (числа не выдумываем)
pricing:
  zai-coding-plan/glm-5.3:
    input: 0.6
    output: 2.2
    cache_read: 0.08

# пороги lifecycle-классификации памяти (D7: дефолты 14 дней / 3 использования)
analytics:
  thresholds:
    new_days: 14
    workhorse_uses: 3
```

## JSON-формат

`wolf analytics --view <v> --json` возвращает payload секции: `{view, rows, ...}`
(например, memory — `rows` per-object + `garbage {dead, base, ratioPct}`),
`--view all` — полный `AnalyticsReport`: ledgers (memory/tools/rules), funnel,
agents, steward, outliers, readiness.

`wolf dashboard --json` возвращает `DashboardData`:

- `generatedAt` — ISO-время сборки;
- `effectiveness` — полный `EffectivenessReport` (rules/tools/delivery/noise/
  routing + totals: суммы токенов, средняя duration, cost-per-success);
- `analytics` — полный `AnalyticsReport`;
- `snapshot` — `{prevTs, delta}`: дельта к последнему снапшоту
  (`{path, prev, curr, diff}` по числовым полям), `prevTs: null` — снапшотов ещё нет.

## Сбор данных

| Данные                                            | Источник                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| run-события (объём, токены, duration, experiment) | `.wolf/run-log.jsonl` + run-сигналы `.wolf/metrics/session-metrics.jsonl` |
| deliveries/жалобы/tool_error                      | сигнальный лог `.wolf/metrics/session-metrics.jsonl`                      |
| рождения/мутации/срабатывания                     | event log `.wolf/memory/events.jsonl` (actor, memory_id)                  |
| объекты памяти                                    | markdown-стор `.wolf/memory/`                                             |
| снапшоты для трендов                              | `.wolf/metrics/effectiveness-snapshots.jsonl`                             |

Всё уже пишется штатными командами (`run`, `complain`, `scaffold`, `tool expose`)
— аналитика только агрегирует, новых сборщиков нет.
