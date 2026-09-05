# Аналитика эффективности: `wolf analytics`, `wolf dashboard`, снапшоты

Канон — спека `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md`.
Этот гайд — практическая документация команд витрины: что вызывать, как настраивать,
что лежит в JSON. Аналитика — только агрегация существующих логов, без LLM.

## Команды

### `wolf analytics` — выборки для Стюарда

| Вызов                                     | Ответ                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `--view memory --class dead --json`       | DEAD-объекты: id, тип, возраст, last_used, счётчики                                            |
| `--view memory --class sleeper [--top N]` | редко используемые объекты                                                                     |
| `--view memory [--type <тип>] [--top N]`  | полный memory ledger + garbage ratio + воронка стадий + attribution (P2) + per-memory ROI (P3) |
| `--view rules [--silent]`                 | ranking по holdout_prevented; `--silent` — только молчащие                                     |
| `--view tools [--origin script\|native]`  | tool ledger: usage, ошибки, lifecycle, promotion-кандидаты                                     |
| `--view weeklyActivity [--weeks N]`       | недельная активность: writes/delivers/triggers по неделям                                      |
| `--view agents [--agent <имя>] [--top N]` | per-agent объём, стоимость, process-провалы, completed/accepted                                |
| `--view steward [--weeks N]`              | мутации, жалобная воронка, рецидивы, churn, доля авто-мутаций                                  |
| `--view councils [--weeks N]`             | консилиумы: созывы, участие, голоса, синтезы, открытые вопросы                                 |
| `--view coordination`                     | координация: counts kind×from, последние события, blocker-пары (P2)                            |
| `--view campaign`                         | кампании → когорты with_memory/no_memory: n, медиана, accepted-%, pfail (P3)                   |
| `--view outliers [--top N]`               | самые дорогие прогоны (weighted; $ при pricing)                                                |
| `--view readiness`                        | готовность к экспериментам (доля прогонов с arm)                                               |
| `--view all`                              | все секции подряд                                                                              |

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

### Воронка жизненного цикла памяти (P2)

`--view memory` (текст и JSON) дополняет ledger воронкой стадий
`added → retrieved → injected → cited → applied` (события `memory_stage`,
см. [signal-log.md](./signal-log.md)):

- `added` — все объекты store (уникальные id; `events` = `-`, рождения это
  event log памяти, не сигнальный лог);
- `retrieved`/`injected`/`cited`/`applied` — события + `unique_ids` (уникальные
  `memory_ids` на стадии): сколько объектов дошло до стадии, а не сколько
  событий записано;
- `appliedUniqueIds` (JSON) — отсортированный список id, дошедших до `applied`.

`attribution: accepted X/Y (Z%)` — доля accepted-вердиктов `task_evaluated`,
перед которыми в той же `session_id` была инъекция (`memory_stage injected`,
`ts` инъекции ≤ `ts` вердикта). Честные null: если данных нет, печатается
`attribution: n/a (<reason>)` — `no task_evaluated` / `no injected` /
`no accepted verdicts`; injected без `session_id` в атрибуции не участвуют.

Живой вывод (сокращён до релевантных строк):

```text
== memory ==
┌──────────────────────────────────────────┬──────────┬───────────┬──────────┬────────────┬──────────┬────────────┬──────────────────────────┐
│ id                                       │ type     │ lifecycle │ age_days │ deliveries │ triggers │ complaints │ last_used                │
├──────────────────────────────────────────┼──────────┼───────────┼──────────┼────────────┼──────────┼────────────┼──────────────────────────┤
│ mem_20260904_docs_example_blocker_416c08 │ blocker  │ sleeper   │ 0        │ 0          │ 1        │ 0          │ 2026-09-04T19:44:50.567Z │
│ ...                                      │          │           │          │            │          │            │                          │
└──────────────────────────────────────────┴──────────┴───────────┴──────────┴────────────┴──────────┴────────────┴──────────────────────────┘
garbage: dead/base = 0/13 = 0.0%
┌───────────┬────────┬────────────┐
│ stage     │ events │ unique_ids │
├───────────┼────────┼────────────┤
│ added     │ -      │ 13         │
│ retrieved │ 1      │ 1          │
│ injected  │ 1      │ 2          │
│ cited     │ 1      │ 1          │
│ applied   │ 1      │ 1          │
└───────────┴────────┴────────────┘
attribution: accepted 1/1 (100.0%)
```

### Координационная аналитика (P2)

`--view coordination` агрегирует события `coord_event` (writer — `wolf coord`,
см. [signal-log.md](./signal-log.md) и [harness-integration.md](./harness-integration.md)):

- **counts** — события по парам `kind × actor_from` (кто и что инициировал);
- **recent** — последние 20 событий: ts, kind, `from->to`, refs;
- **blockers** — пары «открыт → закрыт» по ref: `opened` — самый ранний
  `coord --kind blocker` с этим ref; `resolved` — первый `memory.resolved`
  из event log памяти (`wolf blocker resolve <id>`) не раньше opened;
  `-` — блокер ещё открыт. Резолвится пара именно резолвом блокера, а не
  вторым coord-событием.

Живой вывод (сокращён до релевантных строк):

```text
== coordination ==
counts:
┌────────────┬─────────────┬───────┐
│ kind       │ from        │ count │
├────────────┼─────────────┼───────┤
│ blocker    │ L1:lead     │ 3     │
│ acceptance │ L1:reviewer │ 1     │
│ handoff    │ L0:wolf     │ 1     │
│ review     │ L1:reviewer │ 1     │
└────────────┴─────────────┴───────┘
recent:
┌──────────────────────────┬────────────┬──────────────────────┬──────────────────────────────────────────┐
│ ts                       │ kind       │ from->to             │ refs                                     │
├──────────────────────────┼────────────┼──────────────────────┼──────────────────────────────────────────┤
│ 2026-09-04T19:45:14.265Z │ blocker    │ L1:lead              │ mem_20260904_docs_resolved_blocker_a28f… │
│ ...                      │            │                      │                                          │
└──────────────────────────┴────────────┴──────────────────────┴──────────────────────────────────────────┘
blockers:
┌──────────────────────────────────────────┬──────────────────────────┬──────────────────────────┐
│ ref                                      │ opened                   │ resolved                 │
├──────────────────────────────────────────┼──────────────────────────┼──────────────────────────┤
│ mem_20260904_docs_resolved_blocker_a28f… │ 2026-09-04T19:45:14.265Z │ 2026-09-04T19:45:14.575Z │
│ ...                                      │                          │                          │
└──────────────────────────────────────────┴──────────────────────────┴──────────────────────────┘
```

MCP-инструмент `analytics` принимает те же параметры (`view/class/type/origin/
agent/top/weeks/silent`) и возвращает тот же JSON, что `--json`.

### Кампании и когорты (P3)

`--view campaign` — A/B-витрина «та же задача, с памятью и без»: прогоны
группируются по `campaign_id` (топ-левел поле run-сигнала, флаг
`wolf run --campaign <id>`) и разбиваются на две когорты по наличию
injected-памяти в сессии прогона — join по `session_id` через
`memory_stage injected`, тот же паттерн, что у attribution (P2); ран с
`session_id: null` попадает в `no_memory`:

- **n** — раны когорты в кампании;
- **median_weighted** — медиана weighted ранов когорты; при n < 3 → `n/a`
  с note `n<3: min 3 runs` (минимум 3 рана), пустая когорта → note `no runs`;
- **accepted\_%** — доля accepted среди вердиктов когорты: вердикты входят в
  кампанию флагом `wolf task-eval --campaign <id>` (`detail.campaign_id`) и
  атрибутируются когорте той же связкой по сессии; кампания без вердиктов →
  `n/a` с note `no verdicts`;
- **pfail\_%** — доля ранов с `outcome !== 'ok'`.

Витрина корреляционная: p-values и доверительные интервалы на малых n
некорректны — это граница P3 (спека §3). Сравнение когорт — повод для
гипотезы, не доказательство.

Живой вывод (демо-лог: eval-01 — обе когорты по 3 рана с вердиктами;
eval-02 — малые выборки и кампания без вердиктов):

```text
== campaign ==
┌──────────┬─────────────┬───┬─────────────────┬────────────┬─────────┬─────────────────┐
│ campaign │ cohort      │ n │ median_weighted │ accepted_% │ pfail_% │ note            │
├──────────┼─────────────┼───┼─────────────────┼────────────┼─────────┼─────────────────┤
│ eval-01  │ with_memory │ 3 │ 5210            │ 100.0      │ 0.0     │                 │
│ eval-01  │ no_memory   │ 3 │ 8120            │ 0.0        │ 33.3    │                 │
│ eval-02  │ with_memory │ 2 │ n/a             │ n/a        │ 0.0     │ n<3: min 3 runs │
│ eval-02  │ no_memory   │ 3 │ 9100            │ n/a        │ 0.0     │ no verdicts     │
└──────────┴─────────────┴───┴─────────────────┴────────────┴─────────┴─────────────────┘
```

### Per-memory ROI (P3)

Хвост `--view memory` — какие объекты памяти ассоциированы с принятыми
задачами, а какие только занимают контекст:

- **assoc_accepted** — accepted-вердикты в сессиях, где id инъецировался не
  позже вердикта (`ts` инъекции ≤ `ts` вердикта);
- **assoc_applied** / **injected_total** — applied- / injected-события id;
- **last_activity** — max `ts` среди injected/applied-событий id.

Сортировка: `assoc_accepted` убыв., затем `injectedTotal` убыв., затем id по
алфавиту; текст показывает топ-20 (`--top`), JSON — полный список. Заголовок
секции — дисклеймер `correlational, not causal`: атрибуция идёт по сессии
(объект был в контексте, когда задачу приняли) — это ассоциация, а не
причинность; принятая задача не обязательно принята благодаря памяти.

Живой вывод (хвост `--view memory` того же демо-лога):

```text
memory ROI (correlational, not causal):
┌──────────────────────────────────────────┬────────────────┬───────────────┬────────────────┬──────────────────────────┐
│ id                                       │ assoc_accepted │ assoc_applied │ injected_total │ last_activity            │
├──────────────────────────────────────────┼────────────────┼───────────────┼────────────────┼──────────────────────────┤
│ mem_20260905_write_signals_schema_v2_e4… │ 1              │ 0             │ 2              │ 2026-09-05T10:20:11.774Z │
│ mem_20260905_use_worktree_for_feature_b… │ 1              │ 1             │ 1              │ 2026-09-05T10:07:30.918Z │
│ mem_20260905_prefer_vitest_run_over_wat… │ 0              │ 0             │ 1              │ 2026-09-05T09:30:00.480Z │
└──────────────────────────────────────────┴────────────────┴───────────────┴────────────────┴──────────────────────────┘
```

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
- `--campaign <id>` — id кампании (пишется в `detail.campaign_id`; группирует
  вердикты для `--view campaign`, см. «Кампании и когорты (P3)»);
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
(например, memory — `rows` per-object + `garbage {dead, base, ratioPct}` +
`funnel {added, retrieved, injected, cited, applied, appliedUniqueIds}` +
`attribution {acceptedTotal, acceptedWithInjection, attributionCoveragePct,
reason?}` + `roi {rows: [{id, associatedAccepted, associatedApplied,
injectedTotal, lastActivity}]}`),
`--view all` — полный `AnalyticsReport`: ledgers (memory/tools/rules),
weeklyActivity, agents, steward, councils, outliers, readiness, acceptance,
coverage, dataQuality, coordination, campaign. Секция councils — объект
`CouncilsView`: `questions {total, inWindow, open}`, `opinions {total,
perQuestionMin/Avg/Max}`, `participation [{agent, opinions}]`, `votes`
(Record: значение голоса → число), `synthesis {questionsWithSynthesis,
sharePct, medianHours}`, `weeks [{week, questions, opinions, syntheses}]`,
`openQuestions [{id, title, daysOpen, opinions, votes}]`. Секция campaign —
`CampaignView`: `rows [{campaign, runs, hasVerdicts, withMemory, noMemory}]`,
когорта — `{cohort, n, medianWeighted, acceptedSharePct,
processFailureRatePct, reason}` (`null`-метрики = честные n/a текстового
рендера).

`wolf dashboard --json` возвращает `DashboardData`:

- `generatedAt` — ISO-время сборки;
- `effectiveness` — полный `EffectivenessReport` (rules/tools/delivery/noise/
  routing + totals: суммы токенов, средняя duration, costPerCompletedRun);
- `analytics` — полный `AnalyticsReport`;
- `snapshot` — `{prevTs, delta}`: дельта к последнему снапшоту
  (`{path, prev, curr, diff}` по числовым полям), `prevTs: null` — снапшотов ещё нет.

## Сбор данных

| Данные                                                                       | Источник                                                                                                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| run-события (объём, токены, duration, tools, experiment)                     | run-сигналы `.wolf/metrics/session-metrics.jsonl` (канон, P1 D4) + compat-мерж исторического `.wolf/run-log.jsonl` (архируется командой `wolf migrate run-log`) |
| доставки/жалобы/tool_error                                                   | сигнальный лог `.wolf/metrics/session-metrics.jsonl`                                                                                                            |
| вердикты задач (`task_evaluated`)                                            | `wolf task-eval` → сигнальный лог `.wolf/metrics/session-metrics.jsonl`                                                                                         |
| стадии жизненного цикла памяти (`memory_stage`), координация (`coord_event`) | авто-писатели + `wolf memory-stage` / `wolf coord` → сигнальный лог `.wolf/metrics/session-metrics.jsonl`                                                       |
| рождения/мутации/срабатывания                                                | event log `.wolf/memory/events.jsonl` (actor, memory_id)                                                                                                        |
| связи консилиумов (вопрос↔мнение↔синтез)                                     | relation log `.wolf/memory/relations.jsonl` (`answers`, `based_on`)                                                                                             |
| объекты памяти                                                               | markdown-стор `.wolf/memory/`                                                                                                                                   |
| снапшоты для трендов                                                         | `.wolf/metrics/effectiveness-snapshots.jsonl`                                                                                                                   |

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
