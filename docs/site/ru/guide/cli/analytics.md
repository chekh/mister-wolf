# Аналитика

Аналитика эффективности агрегирует логи, которые платформа уже пишет, — сигнальный лог (с P1 — канонический источник run-метрик), event log памяти, исторический run-лог в переходном окне — без вызовов LLM и без новых сборщиков. Ментальная модель — воронка ценности: write → deliver → trigger; каждый отчёт локализует, где воронка теряет (захват растёт, а эффект нет → проблема доставки; доставка растёт, а holdout пуст → память не меняет поведение). Аналитика поставляет данные, а не решения: архивирование, supersede и ремонт остаются за Стюардом по правилам governance.

## `wolf analytics`

Выборки для Стюарда: ledger'ы, недельная активность, view по агентам и steward view.

```text
Usage: wolf analytics [options]

Effectiveness analytics: ledgers (memory/tools/rules), weekly activity, agents,
steward view, councils, outliers, experiment readiness, memory lifecycle &
coordination

Options:
  --view <view>      Analytics view (choices: "memory", "tools", "rules",
                     "weeklyActivity", "agents", "steward", "outliers",
                     "readiness", "councils", "coordination", "campaign",
                     "all", default: "all")
  --class <class>    Memory lifecycle filter (choices: "new", "sleeper",
                     "workhorse", "dead")
  --type <type>      Memory type filter
  --origin <origin>  Tool origin filter (choices: "script", "native")
  --agent <agent>    Agent name filter
  --silent           Rules view: only silent rules (default: false)
  --top <n>          Row limit (default: 20)
  --weeks <n>        Weekly activity window in weeks (default: 8)
  --json             Machine-readable JSON output (default: false)
  -h, --help         display help for command
```

Опции:

| Опция               | Описание                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--view <view>`     | Выборка: `memory`, `tools`, `rules`, `weeklyActivity`, `agents`, `steward`, `outliers`, `readiness`, `councils`, `coordination`, `campaign`, `all` (дефолт: `all`) |
| `--class <class>`   | Фильтр по lifecycle-классу памяти: `new`, `sleeper`, `workhorse`, `dead`                                                                                           |
| `--type <type>`     | Фильтр по типу памяти                                                                                                                                              |
| `--origin <origin>` | Фильтр по tool origin: `script`, `native`                                                                                                                          |
| `--agent <agent>`   | Фильтр по имени агента                                                                                                                                             |
| `--silent`          | Rules view: только молчащие правила (дефолт: false)                                                                                                                |
| `--top <n>`         | Лимит строк (дефолт: 20)                                                                                                                                           |
| `--weeks <n>`       | Окно недельной активности в неделях (дефолт: 8)                                                                                                                    |
| `--json`            | Машинный JSON-вывод (дефолт: false)                                                                                                                                |

Выборки:

| Выборка          | Что возвращает                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory`         | Memory ledger: возраст, доставки, срабатывания, жалобы, last_used, lifecycle-класс на объект; garbage ratio (DEAD / active); воронка стадий added→retrieved→injected→cited→applied; attribution; per-memory ROI (P3) |
| `tools`          | Tool ledger: usage, доля ошибок, lifecycle (script-инструменты); атрибуции `tools` из сигнального лога (model-native); promotion-кандидаты                                                                           |
| `rules`          | Ранжирование правил по `holdout_prevented`; список молчащих правил                                                                                                                                                   |
| `weeklyActivity` | Недельная активность: writes / delivers / triggers по неделям                                                                                                                                                        |
| `agents`         | Прогоны по агентам: weighted-стоимость, длительность, доля process-провалов, завершённые и принятые задачи, жалобы, prevented                                                                                        |
| `steward`        | Мутации Стюарда по видам, жалобная воронка, нарушения SLA (dispatch ages), рецидивы, churn, доля авто-мутаций                                                                                                        |
| `councils`       | Консилиумы: созывы (всего / за окно / открытые), мнений на вопрос, участие по агентам, распределение голосов, доля синтезов и медианное время вопрос→синтез, недельная активность, открытые вопросы                  |
| `coordination`   | Координационные события: counts по парам kind × источник, последние 20 событий, пары blocker открыт→закрыт по ref                                                                                                    |
| `campaign`       | Кампании → когорты с/без injected-памяти в сессии прогона: n, медиана weighted, доля accepted, pfail; честные n/a на малых выборках (P3)                                                                             |
| `outliers`       | Самые дорогие прогоны (weighted; `$` при pricing)                                                                                                                                                                    |
| `readiness`      | Готовность к экспериментам: доля прогонов с arm, размер выборки по группам                                                                                                                                           |
| `all`            | Все секции подряд (дефолт)                                                                                                                                                                                           |

### Lifecycle-классы

Объекты памяти классифицируются по числу использований и возрасту. Пороги конфигурируются (см. [Конфигурация](#конфигурация)); дефолты — 14 дней / 3 использования:

- `WORKHORSE` — использований ≥ `workhorse_uses` (дефолт 3)
- `SLEEPER` — от 1 до `workhorse_uses − 1` (при дефолте — 1–2)
- `NEW` — 0 использований, возраст ≤ `new_days` (дефолт 14)
- `DEAD` — 0 использований, возраст > `new_days`

Отфильтровать можно через `--class`, например `--class dead` — кандидаты на archive (фильтр работает и в текстовом, и в `--json`-режиме):

```bash
wolf analytics --view memory --class dead --top 3
```

```text
== memory ==
┌──────────────────────────────────────────┬──────────────┬───────────┬──────────┬────────────┬──────────┬────────────┬───────────┐
│ id                                       │ type         │ lifecycle │ age_days │ deliveries │ triggers │ complaints │ last_used │
├──────────────────────────────────────────┼──────────────┼───────────┼──────────┼────────────┼──────────┼────────────┼───────────┤
│ mem_20260630_need_incremental_indexing_… │ blocker      │ dead      │ 65       │ 0          │ 0        │ 0          │ -         │
│ mem_20260630_use_decision_and_blocker_t… │ decision     │ dead      │ 65       │ 0          │ 0        │ 0          │ -         │
│ mem_20260630__c0acde                     │ info-request │ dead      │ 65       │ 0          │ 0        │ 0          │ -         │
└──────────────────────────────────────────┴──────────────┴───────────┴──────────┴────────────┴──────────┴────────────┴───────────┘
garbage: dead/base = 27/465 = 5.8%
```

### Tool origin

Tool ledger разделяет два origin с разной экономикой:

- `script` — объекты, зарегистрированные в реестре инструментов (кастомные скрипты в `.wolf/tools/`, полный lifecycle register → use → expose → deprecate). Переиспользование скрипта экономит усилия на пересоздание.
- `model-native` — собственные инструменты модели (MCP, built-in): их нет в реестре, они видны только через атрибуции `tools` в сигнальном логе и события `tool_error`. Экономика создания к ним не применяется; они вне юрисдикции Wolf. Каждый вызов mr-wolf-\* MCP-тулзы сам инструментируется (событие `mcp_call` с длительностью и исходом).

Promotion-кандидаты: script-инструмент, чей `usage_count` достиг порога паттерна, — кандидат на expose; нативное имя, повторяющееся в логах без регистрации, — кандидат на register (прецедент: правило search-before-write).

### Steward view

`--view steward [--weeks N]` показывает, что делает Стюард и как он справляется: мутации по видам (update / supersede / resolve / transition / tool mutation), жалобная воронка (filed → resolved / rejected), нарушения SLA (dispatch ages), рецидивы (повторная жалоба на тот же объект), churn (объекты с ≥ 2 мутациями в окне) и доля авто-мутаций.

### Консилиумы

`--view councils [--weeks N]` агрегирует council-объекты (`council-question` / `council-opinion` / `synthesis`) и их связи (`answers`, `based_on`) — ноль новых сборщиков, только агрегация store:

- **Созывы** — всего вопросов, за окно `--weeks` и открытых сейчас (статус `open`);
- **Участие** — мнений на вопрос (min/avg/max по всем вопросам) и per-agent счётчик мнений (`created_by` = голосующий);
- **Голоса** — распределение значений `vote`; парсер общий с подсчётом голосов консилиума (поле `vote` → строка `VOTE:` в теле → `TIMEOUT`). Значения — свободные строки, набор не хардкодится;
- **Результативность** — доля вопросов с синтезом (синтез связан `based_on` с мнениями вопроса) и медианное время вопрос → синтез;
- **Недельная активность** — те же 8 недельных бакетов, что у `--view weeklyActivity`;
- **Открытые вопросы** — id, дней открыт, мнений, сводка голосов.

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

(В weeks-таблице реально все 8 бакетов — здесь сокращено. Строки голосов — те, что консилиум фактически использовал, включая голоса обычным языком.)

### Воронка жизненного цикла памяти

`--view memory` завершается воронкой стадий `added → retrieved → injected → cited → applied` (события `memory_stage`): какая доля store когда-либо находилась поиском, попадала в контекст агента, цитировалась в ответе и реально меняла код. `added` — все объекты store (`events` = `-`); каждая стадия — `events` + `unique_ids` (уникальные id, дошедшие до стадии); JSON добавляет `appliedUniqueIds`.

Строка `attribution: accepted X/Y (Z%)` — доля accepted-вердиктов `task_evaluated`, перед которыми в той же `session_id` была инъекция. Честные null: без данных — `attribution: n/a (<причина>)` (`no task_evaluated` / `no injected` / `no accepted verdicts`); injected без `session_id` в атрибуции не участвуют.

### Координационная аналитика

`--view coordination` агрегирует события `coord_event` (writer — `wolf coord`):

- **counts** — события по парам `kind × actor_from` (кто что инициировал);
- **recent** — последние 20 событий: ts, kind, `from->to`, refs;
- **blockers** — пары «открыт → закрыт» по ref: `opened` — самый ранний `coord --kind blocker` с этим ref, `resolved` — первый `memory.resolved` из event log (`wolf blocker resolve <id>`) не раньше opened; `-` — блокер ещё открыт. Пара закрывается резолвом блокера, а не вторым coord-событием.

### Кампании

`--view campaign` — A/B-витрина «та же задача, с памятью и без»: прогоны группируются по `campaign_id` (топ-левел поле run-сигнала, флаг `wolf run --campaign <id>`) и разбиваются на две когорты по наличию injected-памяти в сессии прогона — join по `session_id` через `memory_stage injected`, тот же паттерн, что у attribution (P2); ран с `session_id: null` попадает в `no_memory`:

- **n** — раны когорты в кампании;
- **median_weighted** — медиана weighted ранов когорты; при n < 3 → `n/a` с note `n<3: min 3 runs`; пустая когорта → note `no runs`;
- **accepted\_%** — доля accepted среди вердиктов когорты: вердикты входят в кампанию флагом `wolf task-eval --campaign <id>` (`detail.campaign_id`) и атрибутируются когорте той же связкой по сессии; кампания без вердиктов → `n/a` с note `no verdicts`;
- **pfail\_%** — доля ранов с `outcome !== 'ok'`.

Витрина корреляционная: p-values и доверительные интервалы на малых n некорректны — это осознанная граница P3. Сравнение когорт — повод для гипотезы, не доказательство.

Реальный вывод (демо-лог: eval-01 — обе когорты по 3 рана с вердиктами; eval-02 — малые выборки и кампания без вердиктов):

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

### Per-memory ROI

Хвост `--view memory` (P3): какие объекты памяти ассоциированы с принятыми задачами, а какие только занимают контекст:

- **assoc_accepted** — accepted-вердикты в сессиях, где id инъецировался не позже вердикта (`ts` инъекции ≤ `ts` вердикта);
- **assoc_applied** / **injected_total** — applied- / injected-события id;
- **last_activity** — max `ts` среди injected/applied-событий id.

Сортировка: `assoc_accepted` убыв., затем `injectedTotal` убыв., затем id по алфавиту; текст показывает топ-20 (`--top`), JSON — полный список. Заголовок секции — дисклеймер `correlational, not causal`: атрибуция идёт по сессии (объект был в контексте, когда задачу приняли) — это ассоциация, а не причинность.

Реальный вывод (хвост `--view memory` того же демо-лога):

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

### Примеры

```bash
wolf analytics --view rules --top 3
```

```text
== rules ==
┌──────────────────────────────────────────┬───────────┬─────────┬────────┬──────────────────────────────────────────┐
│ id                                       │ prevented │ checked │ silent │ title                                    │
├──────────────────────────────────────────┼───────────┼─────────┼────────┼──────────────────────────────────────────┤
│ mem_20260703_update_project_docs_after_… │ 0         │ 0       │ no     │ Update project docs after every impleme… │
│ mem_20260823__c93eac                     │ 0         │ 0       │ no     │ Коммитить изменения после завершённой р… │
│ mem_20260823_e2e_5459cc                  │ 0         │ 0       │ no     │ Полное E2E-тестирование после каждого в… │
└──────────────────────────────────────────┴───────────┴─────────┴────────┴──────────────────────────────────────────┘
```

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

Delivery-события считаются на сессию, а не на уникальный объект, поэтому `delivers` может превышать `writes` — это счётчики активности по неделям, а не конверсия.

## `wolf dashboard`

Консольный дашборд: три секции рендерятся прямо в терминал — Unicode-таблицы и текстовые спарклайны (`▁▂▃▄▅▆▇█`).

```text
Usage: wolf dashboard [options]

Console dashboard: health, ledgers, trends (unicode tables and sparklines; no
files written)

Options:
  --tab <tab>  Render a single section (choices: "health", "ledgers", "trends")
  --json       Machine-readable JSON output of the whole dashboard (default:
               false)
  -h, --help   display help for command
```

Опции:

| Опция         | Описание                                                                                                                                                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--tab <tab>` | Одна секция: `health` (L1-статусы, абсолюты, недельная активность текущего периода), `ledgers` (L2-таблицы: memory, tools, rules, agents, открытые council-вопросы, top-N), `trends` (L3-спарклайны по снапшотам, недельная активность, cache-hit ratio, готовность к экспериментам, недельная активность консилиумов, строки coverage/dataQuality) |
| `--json`      | Машинный JSON всего дашборда (`DashboardData`)                                                                                                                                                                                                                                                                                                      |

```bash
wolf dashboard --tab health
```

```text
== health ==
rules: ✓ active=17 prevented/checked: 0/0
tools: · count=0 usage=0 economy: n/a: not enough data (tool runs: 0, total: 3, need ≥ 3 in each group)
delivery: · events=21770 triggered=10 silentRules=0 (n/a)
noise: ✗ 391/460 = 85.0%
routing: zai-coding-plan/glm-5.2: tasks=3 median=22868.2
totals: runs=2 weighted=42736
```

Только консоль, by design: дашборд рендерит в stdout и не пишет файлов; HTML-витрина сознательно отложена (опциональный флаг может появиться, когда будет спрос).

## `wolf effectiveness`

```text
Usage: wolf effectiveness [options]

Memory effectiveness panel: rules holdout, tool economy, delivery, noise,
routing (aggregation only, no LLM)

Options:
  --snapshot  Append the full report to
              .wolf/metrics/effectiveness-snapshots.jsonl
  -h, --help  display help for command
```

Опции:

| Опция        | Описание                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `--snapshot` | Аппендить полный отчёт в `.wolf/metrics/effectiveness-snapshots.jsonl` (append-only история для трендов) |

Обычный вызов печатает панель; когда есть хотя бы один снапшот, дополнительно печатается дельта к последнему снапшоту (`delta vs <ts>` по числовым полям каждого блока).

Панель завершается блоком абсолютов: прогоны и process-провалы (`processFailures`), суммы токенов weighted и raw, cache-hit ratio, средняя длительность и `costPerCompletedRun` по моделям. `$`-поля появляются, только если настроен `pricing` (см. [Конфигурация](#конфигурация)).

```bash
wolf effectiveness
```

```text
effectiveness panel (mileage aggregation, no LLM):
rules: active=17 | prevented/checked: 0/0
...
noise: 416/485 = 85.8% [BAD]
routing: zai-coding-plan/glm-5.2: tasks=3 median=22868.2
totals: runs=2 processFailures=0 weighted=42736 cache=n/a avg=n/a
cost: n/a (no pricing configured)
model zai-coding-plan/glm-5.2: runs=2 processFailures=0 cost=n/a cost/completedRun=n/a
thresholds: noise ok<20 warn<=40 bad | silent ok<30
```

## Обогащение `wolf run`

Сама команда `wolf run` описана на странице [Платформа и обслуживание](/ru/guide/cli/platform#wolf-run); здесь — enrichment-флаги для сравнительных методик (RCT, golden tasks) и телеметрии-идентичности:

- `--tool <name>` — пометить прогон как использующий тул(ы) (повторяемый); источник tool-run экономики из сигнального лога
- `--experiment <id>` — id эксперимента (сравнительные методики, например RCT)
- `--arm <choice>` — arm эксперимента (`wolf` \| `baseline`)
- `--task-id <id>` — id задачи (пишется топ-левел всегда, когда передан — и вне эксперимента)
- `--campaign <id>` — id кампании (пишется топ-левел как `campaign_id`; группирует раны для `--view campaign`)
- `--trace-id <id>` — id трассы, объединяющий раны одной задачи (дефолт — свежий uuid)
- `--attempt <n>` — номер попытки в рамках задачи

Каждый прогон пишет raw-токены (`input`, `output`, `cache_read`), `duration_ms` и v2-поля идентичности (`event_id`, `run_id`, `trace_id`, `config_hash`, `prompt_hash`, `tools`, `schema_version: 2`) в сигнальный лог — с P1 сигнальный лог является единственным каноническим источником run-метрик, а `.wolf/run-log.jsonl` больше не пишется (существующая история читается в переходном окне экономики; запусти `wolf migrate run-log`, чтобы архивировать legacy-файл и убрать двойной счёт). Прогоны без новых флагов сохраняют старый формат записи — обогащение обратно совместимо.

```bash
wolf run "Fix the failing test" --experiment exp-20260904-x1 --arm wolf --task-id t3 --tool wolf-search --trace-id 7f3a2b1c-9d4e-4f6a-8b2c-1e5d7a9f0b3e
```

## `wolf task-eval`

Записывает вердикт по задаче в сигнальный лог (событие `task_evaluated`) — источник честных acceptance-метрик и coverage:

- `--verdict <verdict>` — `accepted`, `rejected`, `partial`, `inconclusive`
- `--scorer <scorer>` — кто оценил: `human` (дефолт), `deterministic`, `llm_judge`, `hidden_tests`
- `--session <id>` / `--task-id <id>` — привязка вердикта к прогону/задаче (без привязки вердикт считается в coverage, но не атрибутируется агенту)
- `--campaign <id>` — id кампании (пишется в `detail.campaign_id`; группирует вердикты для `--view campaign`)
- `--criteria-passed <n>` / `--criteria-total <m>` — численные критерии
- `--critical-failure` — критический провал; `--note <text>` — свободная заметка

Завершённый прогон ≠ полезная задача: по вердиктам считаются `accepted` и `costPerAcceptedTask` (блок acceptance) и coverage оценённых прогонов (см. ниже).

```bash
wolf task-eval --verdict accepted --task-id docs-v2.5.0-rename --scorer human --note "v2.5.0 docs sync"
```

```text
task verdict recorded: verdict=accepted scorer=human
```

## Coverage, acceptance и dataQuality

`wolf analytics` (конец `--view all`) и `wolf dashboard` (секция trends) печатают строки честности данных. Реальный вывод:

```text
coverage: partial — scored 1/2 (50.0%)
dataQuality: valid 100.0% (malformed lines: 0)
duplicateEventRatePct: n/a
unknownModelRatePct: n/a
pricingCoveragePct: n/a
completeTraceRatePct: n/a (span model planned P2)
```

- `coverage: partial — scored X/Y (Z%)` — доля прогонов с вердиктом (сигналы `task_evaluated` / run-сигналы); `partial` — оценены не все прогоны, к per-run метрикам — осторожность
- `acceptance` (JSON-блок) — `accepted` и `costPerAcceptedTask` (`$` при pricing): сколько задач реально принято и сколько стоит принятая задача
- `dataQuality` — честность данных (v2): `validEventRatePct` / `malformedLines` (валидность строк), `duplicateEventRatePct` (доля событий-дубликатов по `event_id`; вторая копия в аналитику не попадает), `unknownModelRatePct` (run с modelID null/'unknown'), `pricingCoveragePct` (run с tokens, чья модель в pricing), и `completeTraceRatePct: null` с reason — span-модель запланирована в P2. `n/a` = данных для метрики пока нет (v1-записи без `event_id`, не настроен pricing)

## Интеграция обёрток (harness integration)

Авторам обёрток и плагинов доступны события v2 в сигнальном логе (`.wolf/metrics/session-metrics.jsonl`) — с ними их работа попадает в аналитику первого класса. Полный формат — в гайде сигнального лога; essentials:

**Обязательные поля** (минимум, без них строка считается malformed):

```ts
{
  ts: new Date().toISOString(),          // ISO8601
  event: 'run',                          // тип события
  session_id: null,                      // id сессии или null
  gen_ai: { modelID: null, agent: null },
  orchestration: { task: null, actor: 'system:my-wrapper' },
}
```

**v2-поля идентичности** (опциональны, но чем полнее — тем сквознее аналитика): генерируй `event_id` (uuid) на каждое событие и пиши `schema_version: 2`; веди `run_id`/`trace_id` сквозь цепочку (один trace на задачу, один run на вызов); `attempt` — при ретраях; `config_hash`/`prompt_hash` — подписи входа (sha256, первые 12 символов).

**role_level по actor-конвенции**: L0 — человек/владелец, L1 — исполнитель (worker/CLI-прогон), L2 — координатор/оркестратор. Дефолт — поле не писать.

Механика: аппендь через `appendSignal(baseDir, event)` (или JSON-строка + `\n`); неизвестные поля отбрасываются Zod-схемой при чтении, записи без `schema_version` читаются как v1. Дубликаты `event_id` дедупятся аналитикой (первая копия остаётся, повторы видны как `duplicateEventRatePct`). Сбой телеметрии не должен ломать сам вызов — оборачивай в try/catch.

## `wolf insights --type activity`

Линза `activity` добавляет недельную разбивку мутаций — added / updated / superseded / resolved / transitioned — за то же 8-недельное окно, что и density-инсайты. Быстрый пульс: сколько памяти мутирует за неделю и какие недели были пиками захвата.

```bash
wolf insights --type activity --topic analytics
```

```text
Insights [activity] (topic: analytics), matched 15/643 objects
Scope: matched 15/643 objects, truth roles: accepted_knowledge 12 / proposed_knowledge 3
...

## Weekly mutations
- 2026-07-13: added 0, updated 0, superseded 0, resolved 0, transitioned 0 (total 0)
...
- 2026-08-17: added 27, updated 0, superseded 0, resolved 1, transitioned 0 (total 28)
- 2026-08-24: added 298, updated 0, superseded 20, resolved 3, transitioned 108 (total 429)
- 2026-08-31: added 286, updated 0, superseded 6, resolved 4, transitioned 3 (total 299)

## Status tally
- active (15)
```

## Конфигурация

`.wolf/config.yaml`:

```yaml
# $ conversion: model -> $/Mtok; without the block, $ fields are hidden
# (numbers are never invented)
pricing:
  zai-coding-plan/glm-5.2:
    input: 0.6
    output: 2.2
    cache_read: 0.08

# memory lifecycle thresholds (defaults: 14 days / 3 uses)
analytics:
  thresholds:
    new_days: 14
    workhorse_uses: 3
```

## MCP-инструмент

MCP-инструмент `analytics` зеркалит CLI: принимает те же параметры (`view`, `class`, `type`, `origin`, `agent`, `top`, `weeks`, `silent`) и возвращает тот же JSON, что `wolf analytics --json`. Терминальный рендеринг — только в CLI.

## Ограничения

- `$`-поля скрыты, пока не настроен `pricing`, — цены даёт владелец, никогда код.
- Счётчики `holdout_prevented` кумулятивны (без таймстампов), поэтому prevented-количества не входят в недельную активность; они показываются суммарно в ранжировании правил.
- `wolf dashboard` read-only: рендерит в stdout и не пишет файлов; HTML-витрина отложена by design.
