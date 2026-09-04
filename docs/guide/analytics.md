# Аналитика эффективности: `wolf analytics`, `wolf dashboard`, снапшоты

Канон — спека `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md`.
Этот гайд — практическая документация команд витрины: что вызывать, как настраивать,
что лежит в JSON. Аналитика — только агрегация существующих логов, без LLM.

## Команды

### `wolf analytics` — выборки для Стюарда

| Вызов                                     | Ответ                                                           |
| ----------------------------------------- | --------------------------------------------------------------- |
| `--view memory --class dead --json`       | DEAD-объекты: id, тип, возраст, last_used, счётчики             |
| `--view memory --class sleeper [--top N]` | редко используемые объекты                                      |
| `--view memory [--type <тип>] [--top N]`  | полный memory ledger + garbage ratio                            |
| `--view rules [--silent]`                 | ranking по holdout_prevented; `--silent` — только молчащие      |
| `--view tools [--origin script\|native]`  | tool ledger: usage, ошибки, lifecycle, promotion-кандидаты      |
| `--view weeklyActivity [--weeks N]`       | недельная активность: writes/delivers/triggers по неделям       |
| `--view agents [--agent <имя>] [--top N]` | per-agent объём, стоимость, process-провалы, completed/accepted |
| `--view steward [--weeks N]`              | мутации, жалобная воронка, рецидивы, churn, доля авто-мутаций   |
| `--view councils [--weeks N]`             | консилиумы: созывы, участие, голоса, синтезы, открытые вопросы  |
| `--view outliers [--top N]`               | самые дорогие прогоны (weighted; $ при pricing)                 |
| `--view readiness`                        | готовность к экспериментам (доля прогонов с arm)                |
| `--view all`                              | все секции подряд                                               |

Общие флаги: `--json` (машинный вывод — дефолт для агентского потребления),
`--top N` (лимит строк, дефолт 20), `--weeks N` (окно недельной активности, дефолт 8).
Фильтры `--class/--type/--origin/--agent/--silent` работают в обоих режимах
(текст и `--json`), как и в MCP-инструменте.

Lifecycle-классы памяти (D7) для `--view memory --class new|sleeper|workhorse|dead`:

- `WORKHORSE` — использований ≥ `workhorse_uses` (дефолт 3);
- `SLEEPER` — от 1 до `workhorse_uses − 1` (при дефолте — 1–2);
- `NEW` — 0 использований, возраст ≤ `new_days` (дефолт 14 дней);
- `DEAD` — 0 использований, возраст > `new_days` → кандидат на archive.

Пороги конфигурируются (`analytics.thresholds`, см. раздел «Конфигурация»).

Честное ограничение: holdout-счётчики кумулятивны (без таймстампов),
поэтому `prevent` в недельную активность `--view weeklyActivity` не входит —
`holdout_prevented` показывается суммарно в `--view rules`.
Delivery-события кратны сессиям (не уникальны), поэтому `delivers` может
превышать `writes` — это счётчики активности по неделям, а не конверсия.
Пример реального вывода:

```bash
wolf analytics --view weeklyActivity --weeks 4
```

```text
== Weekly activity ==
┌────────────┬────────┬──────────┬──────────┐
│ week       │ writes │ delivers │ triggers │
├────────────┼────────┼──────────┼──────────┤
│ 2026-08-10 │ 0      │ 0        │ 0        │
│ 2026-08-17 │ 27     │ 0        │ 0        │
│ 2026-08-24 │ 298    │ 4427     │ 8        │
│ 2026-08-31 │ 311    │ 20123    │ 10       │
└────────────┴────────┴──────────┴──────────┘
```

### `--view councils` — консилиумы

Агрегация council-объектов (`council-question` / `council-opinion` / `synthesis`)
и relations между ними (`answers`, `based_on`):

- **Созывы** — всего вопросов, за окно `--weeks`, открытых сейчас (статус `open`);
- **Участие** — мнений на вопрос (min/avg/max по всем вопросам) и per-agent
  счётчик мнений (`created_by` = голосующий);
- **Голоса** — распределение значений `vote` (парсер общий с подсчётом голосов
  `tally`: поле `vote` → строка `VOTE:` в теле → `TIMEOUT`); значения свободные
  строки, набор не хардкодится;
- **Результативность** — доля вопросов с синтезом (синтез связан `based_on`
  с мнениями вопроса) и медианное время вопрос → синтез;
- **Недельная активность** — те же 8 бакетов, что `--view weeklyActivity`;
- **Открытые вопросы** — id, дней открыт, мнений, сводка голосов.

Пример реального вывода:

```bash
wolf analytics --view councils
```

```text
== councils ==
questions: total=2 inWindow=2 open=1
opinions: total=5 per-question min/avg/max = 2/2.5/3
participation:
┌────────────────────────────┬──────────┐
│ agent                      │ opinions │
├────────────────────────────┼──────────┤
│ user:cli                   │ 2        │
│ agent:pragmatist-dev       │ 1        │
│ agent:researcher-architect │ 1        │
│ agent:skeptic-reviewer     │ 1        │
└────────────────────────────┴──────────┘
votes:
┌────────────────────┬───────┐
│ vote               │ count │
├────────────────────┼───────┤
│ decision-audit     │ 1     │
│ session-resume     │ 1     │
│ solve-pack-anatomy │ 1     │
│ нет                │ 1     │
│ только измерив     │ 1     │
└────────────────────┴───────┘
synthesis: questions=1/2 (50.0%) median question->synthesis=0.0h
weeks:
┌────────────┬───────────┬──────────┬───────────┐
│ week       │ questions │ opinions │ syntheses │
├────────────┼───────────┼──────────┼───────────┤
│ 2026-08-24 │ 2         │ 5        │ 1         │
│ 2026-08-31 │ 0         │ 0        │ 0         │
└────────────┴───────────┴──────────┴───────────┘
open questions:
┌──────────────────────────┬───────────┬──────────┬──────────────────────────────────────────┐
│ id                       │ days_open │ opinions │ votes                                    │
├──────────────────────────┼───────────┼──────────┼──────────────────────────────────────────┤
│ mem_20260824_wolf_fd1b83 │ 10        │ 3        │ decision-audit=1, session-resume=1, sol… │
└──────────────────────────┴───────────┴──────────┴──────────────────────────────────────────┘
```

(weeks-таблица показана сокращённо — реально все 8 недель.)

MCP-инструмент `analytics` принимает те же параметры (`view/class/type/origin/
agent/top/weeks/silent`) и возвращает тот же JSON, что `--json`.

### `wolf dashboard` — консольный дашборд

- без флагов — три секции в stdout: `health` (L1-статусы), `ledgers` (L2-таблицы:
  memory, tools, rules, agents, открытые council-вопросы, outliers),
  `trends` (L3-спарклайны `▁▂▃▄▅▆▇█` по снапшотам + недельная активность
  консилиумов и строки `coverage`/`dataQuality`);
- `--tab health|ledgers|trends` — одна секция;
- `--json` — единый JSON-документ `DashboardData`;
- Unicode-таблицы и спарклайны рендерятся прямо в терминал, файлы НЕ пишутся
  (HTML-витрина отложена, решение D8 спеки).

### `wolf effectiveness --snapshot` — снапшоты и дельты

- `--snapshot` — сериализует полный отчёт и аппендит в
  `.wolf/metrics/effectiveness-snapshots.jsonl` (append-only, история для трендов);
- обычный вызов при наличии ≥1 снапшота печатает дельту к последнему
  (`delta vs <ts>` по числовым полям блоков).

### `wolf task-eval` — вердикты по задачам

Записывает вердикт завершённой задачи в сигнальный лог (событие
`task_evaluated`) — источник честного acceptance и coverage:

- `--verdict` — `accepted` | `rejected` | `partial` | `inconclusive`;
- `--scorer` — кто оценил: `human` (дефолт) | `deterministic` | `llm_judge` |
  `hidden_tests`;
- `--session <id>` / `--task-id <id>` — привязка вердикта к прогону/задаче
  (без привязки вердикт попадает в coverage, но не атрибутируется агенту);
- `--criteria-passed <n>` / `--criteria-total <m>` — численные критерии,
  `--critical-failure` — критический провал, `--note <text>` — заметка.

Завершённый прогон ≠ полезная задача: по вердиктам считаются `accepted` и
`costPerAcceptedTask` (блок acceptance) и покрытие прогонов оценками
(coverage, см. ниже).

```bash
wolf task-eval --verdict accepted --task-id docs-v2.5.0-rename --scorer human --note "v2.5.0 docs sync"
```

```text
task verdict recorded: verdict=accepted scorer=human
```

### Coverage, acceptance и dataQuality

`wolf analytics` (конец `--view all`) и `wolf dashboard` (секция trends)
печатают строки честности данных. Реальный вывод живого прогона:

```text
coverage: partial — scored 1/2 (50.0%)
dataQuality: valid 100.0% (malformed lines: 0)
duplicateEventRatePct: n/a
unknownModelRatePct: n/a
pricingCoveragePct: n/a
completeTraceRatePct: n/a (span model planned P2)
```

- `coverage: partial — scored X/Y (Z%)` — доля прогонов с вердиктом
  (сигналы `task_evaluated` / run-сигналы); `partial` — оценены не все
  прогоны, к per-run метрикам — осторожность;
- `acceptance` (JSON-блок) — `accepted` и `costPerAcceptedTask` (`$` при
  pricing): сколько задач реально принято и сколько стоит принятая задача;
- `dataQuality` — честность данных (v2, P1 D6): `validEventRatePct` /
  `malformedLines` (валидность строк), `duplicateEventRatePct` (доля
  событий-дубликатов по `event_id`; вторая копия в аналитику не попадает),
  `unknownModelRatePct` (run с modelID null/'unknown'),
  `pricingCoveragePct` (run с tokens, чья модель в pricing), и
  `completeTraceRatePct: null` с `reason` — span-модель запланирована в P2.
  `n/a` = данных для метрики пока нет (v1-записи без `event_id`, нет pricing).

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
`--view all` — полный `AnalyticsReport`: ledgers (memory/tools/rules),
weeklyActivity, agents, steward, councils, outliers, readiness, acceptance,
coverage, dataQuality. Секция councils — объект
`CouncilsView`: `questions {total, inWindow, open}`, `opinions {total,
perQuestionMin/Avg/Max}`, `participation [{agent, opinions}]`, `votes`
(Record: значение голоса → число), `synthesis {questionsWithSynthesis,
sharePct, medianHours}`, `weeks [{week, questions, opinions, syntheses}]`,
`openQuestions [{id, title, daysOpen, opinions, votes}]`.

`wolf dashboard --json` возвращает `DashboardData`:

- `generatedAt` — ISO-время сборки;
- `effectiveness` — полный `EffectivenessReport` (rules/tools/delivery/noise/
  routing + totals: суммы токенов, средняя duration, costPerCompletedRun);
- `analytics` — полный `AnalyticsReport`;
- `snapshot` — `{prevTs, delta}`: дельта к последнему снапшоту
  (`{path, prev, curr, diff}` по числовым полям), `prevTs: null` — снапшотов ещё нет.

## Сбор данных

| Данные                                                   | Источник                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| run-события (объём, токены, duration, tools, experiment) | run-сигналы `.wolf/metrics/session-metrics.jsonl` (канон, P1 D4) + compat-мерж исторического `.wolf/run-log.jsonl` |
| доставки/жалобы/tool_error                               | сигнальный лог `.wolf/metrics/session-metrics.jsonl`                                                               |
| вердикты задач (`task_evaluated`)                        | `wolf task-eval` → сигнальный лог `.wolf/metrics/session-metrics.jsonl`                                            |
| рождения/мутации/срабатывания                            | event log `.wolf/memory/events.jsonl` (actor, memory_id)                                                           |
| связи консилиумов (вопрос↔мнение↔синтез)                 | relation log `.wolf/memory/relations.jsonl` (`answers`, `based_on`)                                                |
| объекты памяти                                           | markdown-стор `.wolf/memory/`                                                                                      |
| снапшоты для трендов                                     | `.wolf/metrics/effectiveness-snapshots.jsonl`                                                                      |

Всё уже пишется штатными командами (`run`, `complain`, `task-eval`,
`scaffold`, `tool expose`) — аналитика только агрегирует, новых сборщиков нет.

## Harness integration (P1)

Как авторам обёрток/плагинов писать события v2 в сигнальный лог
(формат целиком — [signal-log.md](./signal-log.md)):

**Обязательные поля** (минимум, без них строка станет malformed):

```ts
{
  ts: new Date().toISOString(),          // ISO8601
  event: 'run',                          // тип события
  session_id: null,                      // id сессии или null
  gen_ai: { modelID: null, agent: null },
  orchestration: { task: null, actor: 'system:my-wrapper' },
}
```

**Identity-поля v2** (опциональны, но чем полнее — тем сквознее аналитика):
генерируй `event_id` (uuid) на каждое событие и пиши `schema_version: 2`;
для сквозной цепочки «задача → прогон» передавай `run_id`/`trace_id`
(один trace_id на задачу, run_id на прогон); `attempt` — при ретраях;
`config_hash`/`prompt_hash` — подписи входа (sha256, 12 символов).

**role_level по actor-конвенции**: L0 — человек/владелец, L1 — исполнитель
(worker/CLI-прогон), L2 — координатор/оркестратор. Дефолт — поле не писать.

Механика: аппендь через `appendSignal(baseDir, event)` (или `appendFileSync`
строки JSON + `\n` в `.wolf/metrics/session-metrics.jsonl`); неизвестные поля
будут отброшены Zod-схемой при чтении (strip), записи без `schema_version`
читаются как v1. Дубликаты `event_id` дедупятся аналитикой (первая копия
остаётся, повтор считается `duplicateEventRatePct`). Ошибка обёртки не должна
ломать сам вызов — телеметрия всегда в try/catch.

Живые примеры v2-строк (run и mcp_call) — в [signal-log.md](./signal-log.md).
