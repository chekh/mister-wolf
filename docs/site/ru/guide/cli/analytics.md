# Аналитика

Аналитика эффективности агрегирует логи, которые платформа уже пишет, — сигнальный лог (с P1 — канонический источник run-метрик), event log памяти, исторический run-лог в переходном окне и `.wolf/router.log` плагина wolf-router — без вызовов LLM и без новых сборщиков. Ментальная модель — воронка ценности: write → deliver → trigger; каждый отчёт локализует, где воронка теряет (захват растёт, а эффект нет → проблема доставки; доставка растёт, а holdout пуст → память не меняет поведение). Аналитика поставляет данные, а не решения: архивирование, supersede и ремонт остаются за Стюардом по правилам governance.

## `wolf analytics`

Единая аналитическая поверхность: все окна состояния проекта рендерятся здесь (с 2.13 прежние отдельные команды `wolf effectiveness` / `wolf dashboard` / `wolf insights` — это view команды `wolf analytics`).

```text
Usage: wolf analytics [options]

Analytics state window: ledgers (memory/tools/rules), weekly activity, agents,
steward, councils, outliers, readiness, coordination, campaign, delivery,
acceptance, effectiveness, dashboard

Options:
  --view <view>      Analytics view (choices: "memory", "tools", "rules",
                     "weeklyActivity", "agents", "steward", "outliers",
                     "readiness", "councils", "coordination", "campaign",
                     "delivery", "acceptance", "effectiveness", "dashboard",
                     "all", default: "all")
  --class <class>    Memory lifecycle filter (choices: "new", "sleeper",
                     "workhorse", "dead")
  --type <type>      Memory type filter
  --origin <origin>  Tool origin filter (choices: "script", "native")
  --agent <agent>    Agent name filter
  --silent           Rules view: only silent rules (default: false)
  --top <n>          Row limit (default: 20)
  --weeks <n>        Weekly activity window in weeks (default: 8)
  --snapshot         Effectiveness view: append the report to
                     .wolf/metrics/effectiveness-snapshots.jsonl (default:
                     false)
  --json             Machine-readable JSON output (default: false)
  -h, --help         display help for command
```

Опции:

| Опция               | Описание                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--view <view>`     | Выборка: `memory`, `tools`, `rules`, `weeklyActivity`, `agents`, `steward`, `outliers`, `readiness`, `councils`, `coordination`, `campaign`, `delivery`, `acceptance`, `effectiveness`, `dashboard`, `all` (дефолт: `all`) |
| `--class <class>`   | Фильтр по lifecycle-классу памяти: `new`, `sleeper`, `workhorse`, `dead`                                                                                                                                                   |
| `--type <type>`     | Фильтр по типу памяти                                                                                                                                                                                                      |
| `--origin <origin>` | Фильтр по tool origin: `script`, `native`                                                                                                                                                                                  |
| `--agent <agent>`   | Фильтр по имени агента                                                                                                                                                                                                     |
| `--silent`          | Rules view: только молчащие правила (дефолт: false)                                                                                                                                                                        |
| `--top <n>`         | Лимит строк (дефолт: 20)                                                                                                                                                                                                   |
| `--weeks <n>`       | Окно недельной активности в неделях (дефолт: 8)                                                                                                                                                                            |
| `--snapshot`        | Effectiveness view: дописать отчёт в `.wolf/metrics/effectiveness-snapshots.jsonl` (дефолт: false)                                                                                                                         |
| `--json`            | Машинный JSON-вывод (дефолт: false)                                                                                                                                                                                        |

Выборки:

| Выборка          | Что возвращает                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory`         | Memory ledger: возраст, доставки, срабатывания, жалобы, last_used, lifecycle-класс на объект; garbage ratio (DEAD / active); воронка стадий added→retrieved→injected→cited→applied; attribution; per-memory ROI (P3)                    |
| `tools`          | Tool ledger: usage, доля ошибок, lifecycle (script-инструменты); атрибуции `tools` из сигнального лога (model-native); promotion-кандидаты                                                                                              |
| `rules`          | Ранжирование правил по `holdout_prevented`; список молчащих правил                                                                                                                                                                      |
| `weeklyActivity` | Недельная активность: writes / delivers / triggers по неделям                                                                                                                                                                           |
| `agents`         | Прогоны по агентам: weighted-стоимость, длительность, доля process-провалов, завершённые и принятые задачи, жалобы, prevented; честные JSON-имена: `completedRuns` (раны с `outcome: 'ok'`) и `processFailureRatePct`                   |
| `steward`        | Мутации Стюарда по видам, жалобная воронка, нарушения SLA (dispatch ages), рецидивы, churn, доля авто-мутаций                                                                                                                           |
| `councils`       | Консилиумы: созывы (всего / за окно / открытые), мнений на вопрос, участие по агентам, распределение голосов, доля синтезов и медианное время вопрос→синтез, недельная активность, открытые вопросы                                     |
| `coordination`   | Координационные события: counts по парам kind × источник, последние 20 событий, пары blocker открыт→закрыт по ref                                                                                                                       |
| `campaign`       | Кампании → когорты с/без injected-памяти в сессии прогона: n, медиана weighted, доля accepted, pfail; честные n/a на малых выборках (P3)                                                                                                |
| `outliers`       | Самые дорогие прогоны (weighted; `$` при pricing)                                                                                                                                                                                       |
| `readiness`      | Готовность к экспериментам: доля прогонов с arm, размер выборки по группам                                                                                                                                                              |
| `delivery`       | Панель доставки: топ доставляемых объектов с индикатором applied%, miss-rate по agent-id, средний размер инъекции (два канала), латентность resolve роутера p50/p90, счётчики вызовов скиллов (см. [Панель доставки](#панель-доставки)) |
| `acceptance`     | Машинная приёмка (метрики волн): miss-rate роутера по агентам, error-rate + p50/p90 по тулам, классы ошибок, burst'ы доставок, search→get follow, vitality за 72 ч, битые строки (см. [Машинная приёмка](#машинная-приёмка))            |
| `effectiveness`  | Панель эффективности памяти: rules holdout, tool economy, доставка, шум, роутинг; `--snapshot` дописывает отчёт в `.wolf/metrics/effectiveness-snapshots.jsonl` (см. [Эффективность](#эффективность-view-effectiveness))                |
| `dashboard`      | Консольный дашборд: health, ledgers, trends — Unicode-таблицы и спарклайны, ничего на диск (см. [Дашборд](#дашборд-view-dashboard))                                                                                                     |
| `all`            | Все секции подряд (дефолт)                                                                                                                                                                                                              |

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
┌──────────────────────────────────────────┬──────────┬───────────┬──────────┬────────────┬──────────┬────────────┬───────────┐
│ id                                       │ type     │ lifecycle │ age_days │ deliveries │ triggers │ complaints │ last_used │
├──────────────────────────────────────────┼──────────┼───────────┼──────────┼────────────┼──────────┼────────────┼───────────┤
│ mem_20260630_need_incremental_indexing_… │ note     │ dead      │ 91       │ 0          │ 0        │ 0          │ -         │
│ mem_20260630_use_decision_and_blocker_t… │ decision │ dead      │ 91       │ 0          │ 0        │ 0          │ -         │
│ mem_20260630__c0acde                     │ note     │ dead      │ 92       │ 0          │ 0        │ 0          │ -         │
└──────────────────────────────────────────┴──────────┴───────────┴──────────┴────────────┴──────────┴────────────┴───────────┘
garbage: dead/base = 422/732 = 57.7%
```

### Tool origin

Tool ledger разделяет два origin с разной экономикой:

- `script` — объекты, зарегистрированные в реестре инструментов (кастомные скрипты в `.wolf/tools/`, полный lifecycle register → use → expose → deprecate). Переиспользование скрипта экономит усилия на пересоздание.
- `model-native` — собственные инструменты модели (MCP, built-in): их нет в реестре, они видны только через атрибуции `tools` в сигнальном логе и события `tool_error`. Экономика создания к ним не применяется; они вне юрисдикции Wolf. Каждый вызов mr-wolf-\* MCP-тулзы сам инструментируется: событие `mcp_call` с `tool_name`, `duration_ms` и `outcome` (`ok` \| `error`; `error` — только throw_handler'а, текстовый «not found» — это `ok`), плюс `detail.method` (имя вызванного метода) и `detail.wolf_version` (runtime-версия из package.json — в одном логе видно поведение разных версий Wolf).

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

С 2.13 у событий стадий ровно один род writer'ов — **автоматические** (ручная команда `wolf memory-stage` удалена; стадии пишутся автоматически командами памяти):

- `wolf search`/`get` пишут `retrieved` при непустой выдаче; `wolf brief`/`call` пишут `injected`, когда инъекции реально доставлены. Нечего фиксировать — события нет: пустая выдача поиска не пишет `retrieved`, бриф без инъекций — `injected`.
- у `cited` и `applied` встроенного писателя больше нет; харнес, которому они нужны, аппендит события `memory_stage` в сигнальный лог напрямую (см. [Интеграция обёрток](#интеграция-обёрток-harness-integration)).

Строка `attribution: accepted X/Y (Z%)` — доля accepted-вердиктов `task_evaluated`, перед которыми в той же `session_id` была инъекция. Честные null: без данных — `attribution: n/a (<причина>)` (`no task_evaluated` / `no injected` / `no accepted verdicts`); injected без `session_id` в атрибуции не участвуют.

```bash
wolf analytics --view memory --top 3
```

```text
== memory ==
┌──────────────────────────────────────────┬──────────┬───────────┬──────────┬────────────┬──────────┬────────────┬──────────────────────────┐
│ id                                       │ type     │ lifecycle │ age_days │ deliveries │ triggers │ complaints │ last_used                │
├──────────────────────────────────────────┼──────────┼───────────┼──────────┼────────────┼──────────┼────────────┼──────────────────────────┤
│ mem_20260630_mr_wolf_schema_driven_memo… │ thread   │ sleeper   │ 92       │ 0          │ 1        │ 0          │ 2026-08-25T08:49:35.952Z │
│ mem_20260630_need_incremental_indexing_… │ note     │ dead      │ 91       │ 0          │ 0        │ 0          │ -                        │
│ mem_20260630_use_decision_and_blocker_t… │ decision │ dead      │ 91       │ 0          │ 0        │ 0          │ -                        │
└──────────────────────────────────────────┴──────────┴───────────┴──────────┴────────────┴──────────┴────────────┴──────────────────────────┘
garbage: dead/base = 422/732 = 57.7%
┌───────────┬────────┬────────────┐
│ stage     │ events │ unique_ids │
├───────────┼────────┼────────────┤
│ added     │ -      │ 803        │
│ retrieved │ 144    │ 272        │
│ injected  │ 5189   │ 50         │
│ cited     │ 0      │ 0          │
│ applied   │ 0      │ 0          │
└───────────┴────────┴────────────┘
attribution: accepted 0/1 (0.0%)
```

### Координационная аналитика

`--view coordination` агрегирует события `coord_event` — координационный лог, который писала удалённая команда `wolf coord`; view читает историю (писателя больше нет, kind'ы — исторические данные):

- **counts** — события по парам `kind × actor_from` (кто что инициировал);
- **recent** — последние 20 событий: ts, kind, `from->to`, refs;
- **blockers** — пары «открыт → закрыт» по ref: `opened` — самый ранний `coord --kind blocker` с этим ref, `resolved` — первый `memory.resolved` по объекту не раньше opened; `-` — ещё открыт. Пара закрывается резолвом связанного объекта (в текущей модели — ноты через `wolf transition`), а не вторым coord-событием.

```bash
wolf analytics --view coordination
```

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

### Кампании

`--view campaign` — A/B-витрина «та же задача, с памятью и без»: прогоны группируются по `campaign_id` (топ-левел поле run-сигнала, которое пишет харнес — см. [Интеграция обёрток](#интеграция-обёрток-harness-integration)) и разбиваются на две когорты по наличию injected-памяти в сессии прогона — join по `session_id` через `memory_stage injected`, тот же паттерн, что у attribution (P2); ран с `session_id: null` попадает в `no_memory`:

- **n** — раны когорты в кампании;
- **median_weighted** — медиана weighted ранов когорты; при n < 3 вся строка метрик когорты → `n/a` с note `n<3: min 3 runs` (доли на малых выборках не показываем); пустая когорта → note `no runs`;
- **accepted\_%** — доля accepted среди вердиктов когорты: вердикты входят в кампанию через скрытую plumbing-команду `wolf task-eval --campaign <id>` (`detail.campaign_id`) и атрибутируются когорте той же связкой по сессии; кампания без вердиктов → `n/a` с note `no verdicts`;
- **pfail\_%** — доля ранов с `outcome !== 'ok'` (в JSON когорты — `processFailureRatePct`).

Витрина корреляционная: p-values и доверительные интервалы на малых n некорректны — это осознанная граница P3. Сравнение когорт — повод для гипотезы, не доказательство.

Реальный вывод (демо-лог: eval-01 — обе когорты по 3 рана с вердиктами; eval-02 — малые выборки и кампания без вердиктов):

```text
== campaign ==
┌──────────┬─────────────┬───┬─────────────────┬────────────┬─────────┬─────────────────┐
│ campaign │ cohort      │ n │ median_weighted │ accepted_% │ pfail_% │ note            │
├──────────┼─────────────┼───┼─────────────────┼────────────┼─────────┼─────────────────┤
│ eval-01  │ with_memory │ 3 │ 5210            │ 100.0      │ 0.0     │                 │
│ eval-01  │ no_memory   │ 3 │ 8120            │ 0.0        │ 33.3    │                 │
│ eval-02  │ with_memory │ 2 │ n/a             │ n/a        │ n/a     │ n<3: min 3 runs │
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

### Панель доставки

`--view delivery` — взгляд на воронку доставки одной командой: что доставляется, какого оно размера и возвращается ли агент к доставленному. Новых сборщиков нет: агрегируются delivery-сигналы, `.wolf/router.log` (включая поля `ms=`/`bytes=`) и `.wolf/metrics/skill-invocations.jsonl`:

- **топ доставляемых** — count'ы delivery-сигналов по `detail.name` с индикатором **applied%**: доля доставок имени, за которыми в той же сессии последовал `wolf get`/`wolf search` по этому же id (join CLI-канала; у MCP-сессий session id null — они вне метрики). Applied% — индикатор, не приговор, но имя с `deliveries ≥ 10` и `applied% < 10%` попадает в строку-**подсветку**: доставляется много, не трогается никогда — кандидат в фильтр гнили конституции.
- **miss-rate по агентам** — доля строк `variant=fallback` в router.log по agent-id («промах» = канон не найден, доставлен универсальный fallback; промахи — подмножество доставок).
- **средний размер инъекции** — mean по двум каналам раздельно: `delivery_signals` (mean `detail.injection_bytes`) и `router_log` (mean `bytes=` playbook-инъекций).
- **латентность resolve роутера** — p50/p90 по полю `ms=` router.log; волновый порог приёмки (p90 < 500 мс) проверяется ровно по этому числу.
- **скиллы** — счётчики вызовов по имени скилла из пишемого плагином лога skill-invocations (см. [Базовый набор — плагины](/ru/guide/base-set#плагины--2--opencodeplugins)): до сих пор ценность скиллов была невидима.

Те же числа доступны на входе в сессию: `wolf recap` печатает строку `Delivery (7d)` — `доставок N, промахов M, топ промахов: <agent> (×k)…` (N = доставки canonical+fallback за 7 дней, M — из них fallback, топ-3 агентов по промахам). Нет router.log — секции нет.

```bash
wolf analytics --view delivery
```

```text
== delivery ==
top delivered:
┌──────────────────┬────────────┬─────────┬───────────┐
│ name             │ deliveries │ applied │ applied_% │
├──────────────────┼────────────┼─────────┼───────────┤
│ mem_…_prefer_vt… │ 14         │ 2       │ 14.3      │
└──────────────────┴────────────┴─────────┴───────────┘
highlight (deliveries>=10, applied<10%): -
miss-rate by agent:
┌──────────┬───────────┬───────┬────────┐
│ agent    │ fallbacks │ total │ miss_% │
├──────────┼───────────┼───────┼────────┤
│ reviewer │ 3         │ 12    │ 25.0   │
└──────────┴───────────┴───────┴────────┘
avg injection bytes: delivery_signals=812 router_log=1493
router resolve ms: p50=210 p90=433 (n=57)
skills:
┌────────────┬───────┐
│ skill      │ count │
├────────────┼───────┤
│ wolf-plan  │ 7     │
└────────────┴───────┘
```

`--json` возвращает те же секции машинно (`topDelivered`, `underApplied`, `missRateByAgent`, `avgInjectionBytes`, `routerMs`, `skills`).

### Машинная приёмка

`--view acceptance` — машинно-ориентированный отчёт приёмки: метрики, по которым проверяются волны и CI-гейты. Источники — сигнальный лог (`mcp_call`, `delivery`) и `.wolf/router.log` (сырые поля — см. [Телеметрия](/ru/guide/telemetry)):

- **router** — miss-rate доставки playbook по agent-id из лога роутер-плагина: hits, misses, `miss_%`;
- **tool calls** — по тулам, оба канала (MCP и CLI): вызовы, ошибки, `err_%`, латентность `p50_ms`/`p90_ms` (линейная интерполяция);
- **error classes** — ошибки по `detail.error_class_id` (детерминированный классификатор);
- **bursts** — серии доставок по сессиям: burst — группа delivery в одном `session_id` с гэпами ≤ 60 c; среднее доставок на burst, максимальный repeat-streak (подряд идущие доставки одного `detail.name`), доля burst'ов со streak ≤ 2 и отдельный счётчик доставок без сессии;
- **search → get follow** — доля поисков, за которыми в пределах 10 c последовал `get` одного из найденных id (join по `detail.memory_id` / `detail.memory_ids`);
- **vitality** — вызовы core-тулов (`search`, `get`, `list`, `add`, `transition`, `brief`, `recap`, `create_decision`, `create_blocker`, `resolve_blocker`) за последние 72 ч;
- **dataQuality** — битые строки сигнального лога.

Null-метрики честно печатаются как `n/a`.

```bash
wolf analytics --view acceptance
```

```text
== acceptance ==
router:
┌──────────┬──────┬────────┬────────┐
│ agent    │ hits │ misses │ miss_% │
├──────────┼──────┼────────┼────────┤
│ reviewer │ 2    │ 1      │ 33.3   │
└──────────┴──────┴────────┴────────┘
tool calls:
┌───────┬───────┬────────┬───────┬────────┬────────┐
│ tool  │ calls │ errors │ err_% │ p50_ms │ p90_ms │
├───────┼───────┼────────┼───────┼────────┼────────┤
│ get   │ 12    │ 0      │ 0.0   │ 3      │ 9      │
│ …     │       │        │       │        │        │
└───────┴───────┴────────┴───────┴────────┴────────┘
error classes:
┌────────────┬───────┐
│ class      │ count │
├────────────┼───────┤
│ not_found  │ 2     │
└────────────┴───────┘
bursts: 4 (deliveries 9, avg/burst 2.3, max repeat-streak 1, streak<=2 100.0%, no-session 0)
search->get follow: 3/7 (42.9%)
vitality: core calls 72h = 18
```

`--json` возвращает те же секции в машинном виде.

### Примеры

```bash
wolf analytics --view rules --top 3
```

```text
== rules ==
┌──────────────────────────────────────────┬───────────┬─────────┬────────┬──────────────────────────────────────────┐
│ id                                       │ prevented │ checked │ silent │ title                                    │
├──────────────────────────────────────────┼───────────┼─────────┼────────┼──────────────────────────────────────────┤
│ mem_20260703_update_project_docs_after_… │ 0         │ -       │ no     │ Update project docs after every impleme… │
│ mem_20260823__c93eac                     │ 0         │ -       │ no     │ Коммитить изменения после завершённой р… │
│ mem_20260823_e2e_5459cc                  │ 0         │ -       │ no     │ Полное E2E-тестирование после каждого в… │
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
│ 2026-09-07 │ 11     │ 267      │ 9        │
│ 2026-09-14 │ 0      │ 0        │ 0        │
│ 2026-09-21 │ 5      │ 878      │ 8        │
│ 2026-09-28 │ 57     │ 9980     │ 30       │
└────────────┴────────┴──────────┴──────────┘
```

Delivery-события считаются на сессию, а не на уникальный объект, поэтому `delivers` может превышать `writes` — это счётчики активности по неделям, а не конверсия.

### Дашборд (view=dashboard)

`--view dashboard` рендерит консольный дашборд: три секции прямо в терминал — Unicode-таблицы и текстовые спарклайны (`▁▂▃▄▅▆▇█`): health (L1-статусы, абсолюты, недельная активность текущего периода), ledgers (L2-таблицы: memory, tools, rules, agents, открытые council-вопросы, top-N) и trends (L3-спарклайны по снапшотам, недельная активность, cache-hit ratio, готовность к экспериментам, недельная активность консилиумов, строки coverage/dataQuality). Прежний флаг `--tab` отдельной команды `wolf dashboard` исчез: view рендерит все три секции; `--json` возвращает машинный `DashboardData`.

```bash
wolf analytics --view dashboard
```

```text
== health ==
rules: ✓ active=23 prevented/checked: 0/0
tools: · count=0 usage=0 economy: n/a: not enough data (tool runs: 0, total: 2, need ≥ 3 in each group)
delivery: · events=42482 triggered=34 silentRules=0 (n/a)
noise: ✗ 478/732 = 65.3%
routing: zai-coding-plan/glm-5.2: tasks=2 median=21368
totals: runs=2 weighted=42736
```

Только консоль, by design: дашборд рендерит в stdout и не пишет файлов; HTML-витрина сознательно отложена (опциональный флаг может появиться, когда будет спрос).

### Эффективность (view=effectiveness)

`--view effectiveness` печатает панель эффективности памяти — rules holdout, tool economy, доставка, шум, роутинг (агрегация без LLM). Флаг `--snapshot` сериализует полный отчёт и дописывает его в `.wolf/metrics/effectiveness-snapshots.jsonl` (append-only история для трендов).

Обычный вызов печатает панель; когда есть хотя бы один снапшот, дополнительно печатается дельта к последнему снапшоту (`delta vs <ts>` по числовым полям каждого блока).

Панель завершается блоком абсолютов: прогоны и process-провалы (`processFailures`), суммы токенов weighted и raw, cache-hit ratio, средняя длительность и `costPerCompletedRun` по моделям (`$cost / completedRuns`). `$`-поля появляются, только если настроен `pricing` (см. [Конфигурация](#конфигурация)).

```bash
wolf analytics --view effectiveness
```

```text
effectiveness panel (mileage aggregation, no LLM):
rules: active=23 | prevented/checked: 0/0
tools: count=0 | usage=0 | economy: n/a: not enough data (tool runs: 0, total: 2, need ≥ 3 in each group) [INFO]
delivery: events=42482 | triggered=34 | silentRules=0 (not enough delivery data)
noise: 478/732 = 65.3% [BAD]
documents: 0 (registered refs, not part of the noise metric) [INFO]
archived: 71 (outside the noise metric) [INFO]
routing: zai-coding-plan/glm-5.2: tasks=2 median=21368
totals: runs=2 processFailures=0 weighted=42736 cache=n/a avg=n/a
cost: n/a (no pricing configured)
model zai-coding-plan/glm-5.2: runs=2 processFailures=0 cost=n/a cost/completedRun=n/a
thresholds: noise ok<20 warn<=40 bad | silent ok<30
```

### Скрытые синонимы (deprecated)

Прежние отдельные аналитические команды ещё работают, но скрыты (их нет в `--help`) и будут **удалены в 2.15**:

| Старая команда       | Преобразуется в                       |
| -------------------- | ------------------------------------- |
| `wolf insights`      | `wolf analytics --view readiness`     |
| `wolf effectiveness` | `wolf analytics --view effectiveness` |
| `wolf dashboard`     | `wolf analytics --view dashboard`     |

Каждый скрытый синоним печатает одну строку в stderr и выполняет соответствующее view:

```text
[wolf] 'effectiveness' is deprecated since 2.13 and hidden: it now maps to "analytics --view effectiveness"; it will be removed in 2.15
```

Скрытый plumbing (жив, не deprecated, только для скриптов): `wolf task-eval` записывает вердикты по задачам (`task_evaluated`), на которых считаются acceptance-метрики, coverage и кампании.

## Coverage, acceptance и dataQuality

`wolf analytics` (конец `--view all`; view `dashboard` повторяет их в секции trends) печатает строки честности данных. Реальный вывод:

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

Авторам обёрток и плагинов доступны события v2 в сигнальном логе (`.wolf/metrics/session-metrics.jsonl`) — с ними их работа попадает в аналитику первого класса. Essentials:

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

**v2-поля идентичности** (все опциональны — но чем полнее, тем сквознее аналитика):

| Поле             | Тип / вид               | Семантика                                                  |
| ---------------- | ----------------------- | ---------------------------------------------------------- |
| `event_id`       | uuid                    | уникальный id события; дубликаты ловит data-quality v2     |
| `schema_version` | `2` (literal)           | версия схемы; отсутствие = читается как v1                 |
| `run_id`         | uuid                    | id прогона — сквозная цепочка задачи                       |
| `trace_id`       | uuid                    | трасса: объединяет раны одной задачи (от харнеса или uuid) |
| `parent_span_id` | string                  | родительский span (зарезервирован; span-модель — план P2)  |
| `role_level`     | `L0` \| `L1` \| `L2`    | уровень роли писателя по actor-конвенции                   |
| `attempt`        | number                  | номер попытки (retry) в рамках run                         |
| `task_id`        | string                  | общий id задачи                                            |
| `config_hash`    | sha256, первые 12 симв. | подпись `.wolf/config.yaml` на момент прогона              |
| `prompt_hash`    | sha256, первые 12 симв. | подпись текста промпта                                     |
| `tools`          | `string[]`              | инструменты прогона — источник tool-экономики              |

`campaign_id` — ключ группировки кампаний, см. [Кампании](#кампании).

**role_level по actor-конвенции**: L0 — координатор (диспетчеризация и приёмка; человек-владелец — здесь, на приёмке), L1 — lead/ревьюер, L2 — воркер/исполнитель. Дефолт — поле не писать.

**`WOLF_SESSION` связывает авто-писателей с сессией**: авто-писатели `memory_stage` (`wolf search`/`get` → `retrieved`, `wolf brief`/`call` → `injected`) берут id сессии из env `WOLF_SESSION` — симметрия с `WOLF_ACTOR`. Харнес, выставляющий `WOLF_SESSION` на старте агентской сессии, получает связку `injected` ↔ `task_evaluated` по `session_id` — атрибуция видит инъекции авто-путей. Без env события пишутся с `session_id: null` и в атрибуции не участвуют.

Механика: аппендь через `appendSignal(baseDir, event)` (или JSON-строка + `\n`); неизвестные поля отбрасываются Zod-схемой при чтении, записи без `schema_version` читаются как v1. Дубликаты `event_id` дедупятся аналитикой (первая копия остаётся, повторы видны как `duplicateEventRatePct`). Сбой телеметрии не должен ломать сам вызов — оборачивай в try/catch.

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

## MCP

С 2.13 аналитика — только CLI: прежний MCP-инструмент `analytics` удалён (оставшиеся MCP-тулы — core-набор: `search`, `get`, `list`, `add`, `transition`, `brief`, `recap`). Машинный вывод — `wolf analytics --json`.

## Ограничения

- `$`-поля скрыты, пока не настроен `pricing`, — цены даёт владелец, никогда код.
- Счётчики `holdout_prevented` кумулятивны (без таймстампов), поэтому prevented-количества не входят в недельную активность; они показываются суммарно в ранжировании правил.
- `--view dashboard` read-only: рендерит в stdout и не пишет файлов; HTML-витрина отложена by design.
