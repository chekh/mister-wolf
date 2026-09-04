# Аналитика эффективности: `wolf analytics`, `wolf dashboard`, снапшоты

Канон — спека `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md`.
Этот гайд — практическая документация команд витрины: что вызывать, как настраивать,
что лежит в JSON. Аналитика — только агрегация существующих логов, без LLM.

## Команды

### `wolf analytics` — выборки для Стюарда

| Вызов                                     | Ответ                                                          |
| ----------------------------------------- | -------------------------------------------------------------- |
| `--view memory --class dead --json`       | DEAD-объекты: id, тип, возраст, last_used, счётчики            |
| `--view memory --class sleeper [--top N]` | редко используемые объекты                                     |
| `--view memory [--type <тип>] [--top N]`  | полный memory ledger + garbage ratio                           |
| `--view rules [--silent]`                 | ranking по holdout_prevented; `--silent` — только молчащие     |
| `--view tools [--origin script\|native]`  | tool ledger: usage, ошибки, lifecycle, promotion-кандидаты     |
| `--view funnel [--weeks N]`               | конверсия write→deliver→trigger по неделям                     |
| `--view agents [--agent <имя>] [--top N]` | per-agent объём, стоимость, ошибки, жалобы, достижения         |
| `--view steward [--weeks N]`              | мутации, жалобная воронка, рецидивы, churn, доля авто-мутаций  |
| `--view councils [--weeks N]`             | консилиумы: созывы, участие, голоса, синтезы, открытые вопросы |
| `--view outliers [--top N]`               | самые дорогие прогоны (weighted; $ при pricing)                |
| `--view readiness`                        | готовность к экспериментам (доля прогонов с arm)               |
| `--view all`                              | все секции подряд                                              |

Общие флаги: `--json` (машинный вывод — дефолт для агентского потребления),
`--top N` (лимит строк, дефолт 20), `--weeks N` (окно воронки, дефолт 8).
Фильтры `--class/--type/--origin/--agent/--silent` работают в обоих режимах
(текст и `--json`), как и в MCP-инструменте.

Lifecycle-классы памяти (D7) для `--view memory --class new|sleeper|workhorse|dead`:

- `WORKHORSE` — использований ≥ `workhorse_uses` (дефолт 3);
- `SLEEPER` — от 1 до `workhorse_uses − 1` (при дефолте — 1–2);
- `NEW` — 0 использований, возраст ≤ `new_days` (дефолт 14 дней);
- `DEAD` — 0 использований, возраст > `new_days` → кандидат на archive.

Пороги конфигурируются (`analytics.thresholds`, см. раздел «Конфигурация»).

Честное ограничение воронки: holdout-счётчики кумулятивны (без таймстампов),
поэтому `prevent` в недельную воронку `--view funnel` не входит —
`holdout_prevented` показывается суммарно в `--view rules`.

Отношения воронки (`W->D`/`D->T`) сверх 100% печатаются множителем `×N.N`:
delivery-события кратны сессиям (не уникальны), проценты сверх 100% вводили бы
в заблуждение. Пример реального вывода:

```bash
wolf analytics --view funnel --weeks 4
```

```text
== funnel ==
┌────────────┬────────┬──────────┬──────────┬───────┬──────┐
│ week       │ writes │ delivers │ triggers │ W->D  │ D->T │
├────────────┼────────┼──────────┼──────────┼───────┼──────┤
│ 2026-08-10 │ 0      │ 0        │ 0        │ -     │ -    │
│ 2026-08-17 │ 27     │ 0        │ 0        │ 0.0%  │ -    │
│ 2026-08-24 │ 298    │ 4427     │ 8        │ ×14.9 │ 0.2% │
│ 2026-08-31 │ 292    │ 18112    │ 10       │ ×62.0 │ 0.1% │
└────────────┴────────┴──────────┴──────────┴───────┴──────┘
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
- **Недельная активность** — те же 8 бакетов, что воронка;
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
  консилиумов);
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
agents, steward, councils, outliers, readiness. Секция councils — объект
`CouncilsView`: `questions {total, inWindow, open}`, `opinions {total,
perQuestionMin/Avg/Max}`, `participation [{agent, opinions}]`, `votes`
(Record: значение голоса → число), `synthesis {questionsWithSynthesis,
sharePct, medianHours}`, `weeks [{week, questions, opinions, syntheses}]`,
`openQuestions [{id, title, daysOpen, opinions, votes}]`.

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
| связи консилиумов (вопрос↔мнение↔синтез)          | relation log `.wolf/memory/relations.jsonl` (`answers`, `based_on`)       |
| объекты памяти                                    | markdown-стор `.wolf/memory/`                                             |
| снапшоты для трендов                              | `.wolf/metrics/effectiveness-snapshots.jsonl`                             |

Всё уже пишется штатными командами (`run`, `complain`, `scaffold`, `tool expose`)
— аналитика только агрегирует, новых сборщиков нет.
