# Справочник CLI Mr. Wolf (v2.8.0)

Полный reference командного интерфейса Mr. Wolf. Все команды, флаги и описания сняты с фактического вывода help CLI версии 2.8.0 (`wolf --version`).

> Актуальность проверяй локально: `wolf help <command>` (или `wolf <command> --help`).

## Как читать этот документ

- `wolf` в примерах — сокращение для `node dist/bootstrap/cli.js`.
- Позиционные аргументы обозначаются как `<id>`, `<query>`; необязательные группы — `[options]`, необязательный аргумент опции — `[chars]`.
- Каждая команда поддерживает `-h, --help` (показать help) — в таблицах опций не повторяется. Корневая команда дополнительно поддерживает `-V, --version`.
- Таблица опций: колонки `Флаг` / `Аргумент` / `Описание`. Значения описаний, значения по умолчанию (`default:`) и допустимые значения (`choices`) — дословно из help. У булевых флагов колонка «Аргумент» пустая.
- «Без опций» = команда не имеет опций, кроме `-h, --help`.
- Примеры приводятся только для самих команд (с реалистичными аргументами); вывод команд не показан.

## Установка и скелет

### wolf init

Initialize Mr. Wolf memory for this project (interactive in TTY; non-interactive requires --model) — инициализирует память Mr. Wolf в проекте (интерактивно в TTY; неинтерактивный режим требует --model).

`Usage: wolf init [options]`

| Флаг         | Аргумент | Описание                                                                                   |
| ------------ | -------- | ------------------------------------------------------------------------------------------ |
| `--platform` | `<ids>`  | explicit platform list (comma-separated: opencode,claude); replaces the current set        |
| `--model`    | `<id>`   | model for Mr.Wolf and its agents (`<providerID>/<modelID>`); required when non-interactive |
| `--recreate` | —        | backup a corrupted .wolf/config.yaml and re-create it from defaults (default: false)       |

```bash
wolf init
wolf init --platform opencode,claude --model zai-coding-plan/glm-5.2
```

### wolf upgrade

Upgrade the global wolf installation to the latest npm version (runs npm install -g mister-wolf@latest); --check only compares versions, no install — обновляет глобальную установку wolf до последней npm-версии (`--check` — только сравнить версии, без установки).

`Usage: wolf upgrade [options]`

| Флаг      | Аргумент | Описание                                                |
| --------- | -------- | ------------------------------------------------------- |
| `--check` | —        | Only check for a newer version, do not install anything |

```bash
wolf upgrade --check
wolf upgrade
```

## Память

### wolf add

Add a memory object — добавляет объект памяти.

`Usage: wolf add [options]`

| Флаг           | Аргумент       | Описание                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--type`       | `<type>`       | Memory type (choices: "decision", "lesson", "observation", "complaint", "session-summary", "open-question", "context", "work-thread", "info-request", "article", "blocker", "session-checkpoint", "rule", "document-ref", "document-native", "task-brief", "report", "council-question", "council-opinion", "synthesis", "escalation", "decision-request", "call-injection", "playbook", "tool") |
| `--title`      | `<title>`      | Title                                                                                                                                                                                                                                                                                                                                                                                            |
| `--body`       | `<body>`       | Body text                                                                                                                                                                                                                                                                                                                                                                                        |
| `--tags`       | `<tags>`       | Comma-separated tags                                                                                                                                                                                                                                                                                                                                                                             |
| `--confidence` | `<confidence>` | Confidence level (low\|medium\|high)                                                                                                                                                                                                                                                                                                                                                             |
| `--importance` | `<n>`          | Importance from 0 to 1                                                                                                                                                                                                                                                                                                                                                                           |
| `--set`        | `<k=v>`        | Extra field key=value (repeatable; "[a,b]" value is a string array) (default: [])                                                                                                                                                                                                                                                                                                                |
| `--scope`      | `<scope>`      | Scope field for types that declare one (rule: project\|global)                                                                                                                                                                                                                                                                                                                                   |
| `--created-by` | `<actor>`      | Creator actor (default: env WOLF_ACTOR, else user:cli)                                                                                                                                                                                                                                                                                                                                           |

```bash
wolf add --type lesson --title "RTK и пайпы" --body "Составные команды гонять через нативный bash" --tags cli,rtk --confidence high --importance 0.8
```

### wolf get

Get a memory object by id — возвращает объект памяти по идентификатору.

`Usage: wolf get [options] <id>`

Аргументы: `id` — Memory object id.

| Флаг       | Аргумент | Описание                                                              |
| ---------- | -------- | --------------------------------------------------------------------- |
| `--latest` | —        | Follow the superseded_by chain to the current object (default: false) |

```bash
wolf get mem_20260830_a1b2c3 --latest
```

### wolf list

List memory objects — список объектов памяти с фильтрами.

`Usage: wolf list [options]`

| Флаг       | Аргумент   | Описание                                                     |
| ---------- | ---------- | ------------------------------------------------------------ |
| `--type`   | `<type>`   | Filter by type                                               |
| `--status` | `<status>` | Filter by status                                             |
| `--stale`  | —          | List stale objects (not updated in 30 days) (default: false) |

```bash
wolf list --type lesson --stale
```

### wolf search

Search memory objects — поиск по объектам памяти с фильтрами.

`Usage: wolf search [options] <query>`

Аргументы: `query` — Search query.

| Флаг                   | Аргумент       | Описание                                                                            |
| ---------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `--type`               | `<type>`       | Filter by type                                                                      |
| `--status`             | `<status>`     | Filter by status                                                                    |
| `--tag`                | `<tag>`        | Filter by tag (repeatable) (default: [])                                            |
| `--confidence`         | `<confidence>` | Filter by confidence (low\|medium\|high)                                            |
| `--min-importance`     | `<n>`          | Minimum importance                                                                  |
| `--max-importance`     | `<n>`          | Maximum importance                                                                  |
| `--created-after`      | `<iso>`        | Created on or after date                                                            |
| `--created-before`     | `<iso>`        | Created on or before date                                                           |
| `--limit`              | `<n>`          | Maximum results                                                                     |
| `--file-path`          | `<path>`       | Filter by related/source file path                                                  |
| `--hide-superseded`    | —              | Hide superseded objects (shown and marked [superseded] by default) (default: false) |
| `--include-superseded` | —              | Deprecated no-op: superseded objects are shown by default (default: false)          |

```bash
wolf search "инкрементальная индексация" --type decision --limit 5
```

Синтаксис FTS-запроса: слова (поиск по префиксу, регистр и алфавит не важны);
неявный `AND` через пробел, заглавный `OR` — оператор (`NOT`/`NEAR` — обычные
слова); `field:value` — колоночный фильтр для колонок индекса `memory_id`,
`type`, `title`, `body`, `tags`, `status`, `review_state` (неизвестное поле
отбрасывается, значение ищется как слово); кавычки вырезаются, дефис —
разделитель (AND частей). При пустой выдаче CLI сам печатает hint с колонками.

### wolf supersede

Supersede a memory object with another — заменяет устаревший объект новым.

`Usage: wolf supersede [options] <old-id> <new-id>`

Аргументы: `old-id` — Id of the memory object to supersede; `new-id` — Id of the replacement memory object.

Без опций.

```bash
wolf supersede mem_20260601_old111 mem_20260830_new222
```

### wolf transition

Transition a memory object to a new status — переводит объект памяти в новый статус.

`Usage: wolf transition [options] <id> <status>`

Аргументы: `id` — Memory object id; `status` — New status.

| Флаг      | Аргумент  | Описание                                              |
| --------- | --------- | ----------------------------------------------------- |
| `--actor` | `<actor>` | Actor performing the transition (default: "user:cli") |

```bash
wolf transition mem_20260830_a1b2c3 superseded --actor agent:steward
```

### wolf update

Update triage fields of a memory object (whitelist: --set triage|resolution, --inc dispatch_ages|corroborations, --tags append) — обновляет триажные поля объекта памяти по белому списку.

`Usage: wolf update [options] <id>`

Аргументы: `id` — Memory object id.

| Флаг      | Аргумент    | Описание                                                                                               |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `--set`   | `<k=v>`     | Set a triage field: triage\|resolution (repeatable) (default: [])                                      |
| `--inc`   | `<field=n>` | Increment monotonic counter by integer n > 0: dispatch_ages\|corroborations (repeatable) (default: []) |
| `--tags`  | `<tags>`    | Append comma-separated tags                                                                            |
| `--actor` | `<actor>`   | Actor performing the update (default: "user:cli")                                                      |

```bash
wolf update mem_20260830_a1b2c3 --set triage=accepted --inc corroborations=1 --tags "audited,phase-b"
```

### wolf rebuild-index

Rebuild the SQLite search index from memory objects — перестраивает поисковый индекс SQLite из объектов памяти.

`Usage: wolf rebuild-index [options]`

Без опций.

```bash
wolf rebuild-index
```

## Скан и брифы

### wolf scan

Scan the project and save a context snapshot — сканирует проект и сохраняет снапшот контекста.

`Usage: wolf scan [options]`

Без опций.

```bash
wolf scan
```

### wolf brief

Generate the agent brief from the latest scan and memory — генерирует агентский бриф из последнего скана и памяти.

`Usage: wolf brief [options]`

Без опций.

```bash
wolf brief
```

### wolf call

Get active call injections — возвращает активные call-инъекции.

`Usage: wolf call [options]`

| Флаг        | Аргумент      | Описание                               |
| ----------- | ------------- | -------------------------------------- |
| `--for`     | `<topic>`     | Topic to match injections against      |
| `--thread`  | `<thread-id>` | Thread id for thread mode              |
| `--compact` | `[chars]`     | Compact budget in chars (default 1200) |

```bash
wolf call --for rtk
```

### wolf recap

Summarize active project memory: rules, threads, blockers, questions, decisions — сводка активной памяти проекта.

`Usage: wolf recap [options]`

Без опций.

```bash
wolf recap
```

## Work threads и артефакты

### wolf thread

Manage work threads — управление рабочими потоками.

`Usage: wolf thread [options] [command]`

Подкоманды:

- `create [options]` — Create a work thread
- `list` — List work threads
- `brief <thread-id>` — Generate a brief for a work thread

#### wolf thread create

Create a work thread — создаёт рабочий поток.

`Usage: wolf thread create [options]`

| Флаг              | Аргумент  | Описание                            |
| ----------------- | --------- | ----------------------------------- |
| `--title`         | `<title>` | Thread title                        |
| `--goal`          | `<goal>`  | Thread goal                         |
| `--current-state` | `<state>` | Current state (default: "")         |
| `--next-steps`    | `<steps>` | Comma-separated next steps          |
| `--created-by`    | `<actor>` | Creator actor (default: "user:cli") |

```bash
wolf thread create --title "Рефакторинг индексации" --goal "Убрать полные пересборки индекса" --next-steps "профилировать,прототип инкремента"
```

#### wolf thread list

List work threads — список рабочих потоков.

`Usage: wolf thread list [options]`

Без опций.

```bash
wolf thread list
```

#### wolf thread brief

Generate a brief for a work thread — бриф рабочего потока.

`Usage: wolf thread brief [options] <thread-id>`

Аргументы: `thread-id` — Thread id.

Без опций.

```bash
wolf thread brief mem_20260824_refactor_12b412
```

### wolf diff

Show thread changes since a checkpoint — изменения потока с момента чекпоинта.

`Usage: wolf diff [options] <thread-id>`

Аргументы: `thread-id` — Thread id.

| Флаг      | Аргумент          | Описание      |
| --------- | ----------------- | ------------- |
| `--since` | `<checkpoint-id>` | Checkpoint id |

```bash
wolf diff mem_20260824_refactor_12b412 --since mem_20260826_ckpt9f2c
```

### wolf decision

Manage decisions — управление решениями.

`Usage: wolf decision [options] [command]`

Подкоманды:

- `add [options]` — Add a decision
- `list [options]` — List decisions

#### wolf decision add

Add a decision — добавляет решение.

`Usage: wolf decision add [options]`

| Флаг           | Аргумент      | Описание                                               |
| -------------- | ------------- | ------------------------------------------------------ |
| `--title`      | `<title>`     | Decision title                                         |
| `--body`       | `<body>`      | Decision body                                          |
| `--thread`     | `<thread-id>` | Parent thread id                                       |
| `--based-on`   | `<ids>`       | Comma-separated artifact ids this decision is based on |
| `--created-by` | `<actor>`     | Creator actor (default: "user:cli")                    |

```bash
wolf decision add --title "FTS5 вместо LIKE" --body "Поиск переведён на FTS5" --thread mem_20260824_refactor_12b412 --based-on mem_20260828_bench_77aa01
```

#### wolf decision list

List decisions — список решений.

`Usage: wolf decision list [options]`

| Флаг       | Аргумент      | Описание         |
| ---------- | ------------- | ---------------- |
| `--thread` | `<thread-id>` | Filter by thread |

```bash
wolf decision list --thread mem_20260824_refactor_12b412
```

### wolf blocker

Manage blockers — управление блокерами.

`Usage: wolf blocker [options] [command]`

Подкоманды:

- `add [options]` — Add a blocker
- `list [options]` — List blockers
- `resolve [options] <id>` — Resolve a blocker

#### wolf blocker add

Add a blocker — добавляет блокер.

`Usage: wolf blocker add [options]`

| Флаг           | Аргумент       | Описание                            |
| -------------- | -------------- | ----------------------------------- |
| `--title`      | `<title>`      | Blocker title                       |
| `--impact`     | `<impact>`     | Blocker impact                      |
| `--workaround` | `<workaround>` | Possible workaround                 |
| `--thread`     | `<thread-id>`  | Parent thread id                    |
| `--created-by` | `<actor>`      | Creator actor (default: "user:cli") |

```bash
wolf blocker add --title "Нет доступа к CI-раннеру" --impact "E2E не запускаются" --workaround "Локальный прогон vitest"
```

#### wolf blocker list

List blockers — список блокеров.

`Usage: wolf blocker list [options]`

| Флаг       | Аргумент      | Описание         |
| ---------- | ------------- | ---------------- |
| `--thread` | `<thread-id>` | Filter by thread |

```bash
wolf blocker list --thread mem_20260824_refactor_12b412
```

#### wolf blocker resolve

Resolve a blocker — закрывает блокер.

`Usage: wolf blocker resolve [options] <id>`

Аргументы: `id` — Blocker id.

| Флаг   | Аргумент        | Описание                           |
| ------ | --------------- | ---------------------------------- |
| `--by` | `<artifact-id>` | Artifact that resolves the blocker |

```bash
wolf blocker resolve mem_20260829_blk_3c3c3c --by mem_20260830_art_4d4d4d
```

### wolf info-request

Manage info requests — управление запросами информации.

`Usage: wolf info-request [options] [command]`

Подкоманды:

- `create [options]` — Create an info request
- `list [options]` — List info requests

#### wolf info-request create

Create an info request — создаёт запрос информации.

`Usage: wolf info-request create [options]`

| Флаг                   | Аргумент      | Описание                                        |
| ---------------------- | ------------- | ----------------------------------------------- |
| `--title`              | `<title>`     | Request title                                   |
| `--thread`             | `<thread-id>` | Parent thread id                                |
| `--question`           | `<question>`  | Question to answer                              |
| `--detour-reason`      | `<reason>`    | Why this derails the main session               |
| `--expected-answer`    | `<answers>`   | Comma-separated expected answer items           |
| `--needed-for`         | `<items>`     | Comma-separated items this answer is needed for |
| `--preliminary-answer` | `<answer>`    | Preliminary answer (default: "")                |
| `--created-by`         | `<actor>`     | Creator actor (default: "user:cli")             |

```bash
wolf info-request create --title "Формат playbook" --question "Какую структуру выбрать для playbook?" --detour-reason "Уводит в дизайн за рамками задачи" --expected-answer "шаблон,пример" --needed-for "scaffold,docs"
```

#### wolf info-request list

List info requests — список запросов информации.

`Usage: wolf info-request list [options]`

| Флаг       | Аргумент      | Описание         |
| ---------- | ------------- | ---------------- |
| `--thread` | `<thread-id>` | Filter by thread |

```bash
wolf info-request list --thread mem_20260824_refactor_12b412
```

### wolf article

Manage articles — управление статьями (итоговыми артефактами ответов).

`Usage: wolf article [options] [command]`

Подкоманды:

- `add [options]` — Add an article
- `list [options]` — List articles

#### wolf article add

Add an article — добавляет статью.

`Usage: wolf article add [options]`

| Флаг           | Аргумент      | Описание                                    |
| -------------- | ------------- | ------------------------------------------- |
| `--title`      | `<title>`     | Article title                               |
| `--thread`     | `<thread-id>` | Parent thread id                            |
| `--summary`    | `<summary>`   | Article summary                             |
| `--body`       | `<body>`      | Article body                                |
| `--answers`    | `<ids>`       | Comma-separated answered info-request ids   |
| `--supports`   | `<items>`     | Comma-separated items this article supports |
| `--evidence`   | `<items>`     | Comma-separated evidence items              |
| `--created-by` | `<actor>`     | Creator actor (default: "user:cli")         |

```bash
wolf article add --title "Почему FTS5" --thread mem_20260824_refactor_12b412 --summary "Сравнение подходов к поиску" --body "FTS5 даёт префиксные запросы и ранжирование" --answers mem_20260829_ir_6b6b6b
```

#### wolf article list

List articles — список статей.

`Usage: wolf article list [options]`

| Флаг       | Аргумент      | Описание         |
| ---------- | ------------- | ---------------- |
| `--thread` | `<thread-id>` | Filter by thread |

```bash
wolf article list --thread mem_20260824_refactor_12b412
```

### wolf session

Manage sessions and checkpoints — управление сессиями и чекпоинтами.

`Usage: wolf session [options] [command]`

Подкоманды:

- `checkpoint [options]` — Create a checkpoint for a work thread
- `wrap-up [options]` — Manually create a session-summary of recent events

#### wolf session checkpoint

Create a checkpoint for a work thread — создаёт чекпоинт рабочего потока.

`Usage: wolf session checkpoint [options]`

| Флаг           | Аргумент      | Описание                            |
| -------------- | ------------- | ----------------------------------- |
| `--thread`     | `<thread-id>` | Thread id                           |
| `--created-by` | `<actor>`     | Creator actor (default: "user:cli") |

```bash
wolf session checkpoint --thread mem_20260824_refactor_12b412
```

#### wolf session wrap-up

Manually create a session-summary of recent events — вручную создаёт итоговую сводку сессии.

`Usage: wolf session wrap-up [options]`

| Флаг      | Аргумент  | Описание             |
| --------- | --------- | -------------------- |
| `--title` | `<title>` | Summary title        |
| `--tags`  | `<tags>`  | Comma-separated tags |

```bash
wolf session wrap-up --title "Спринт: индексация" --tags sprint,indexing
```

### wolf rule

Manage rules — управление правилами.

`Usage: wolf rule [options] [command]`

Подкоманды:

- `add [options]` — Add a rule (user only)
- `list` — List rules

#### wolf rule add

Add a rule (user only) — добавляет правило (только пользователь).

`Usage: wolf rule add [options]`

| Флаг           | Аргумент    | Описание                            |
| -------------- | ----------- | ----------------------------------- |
| `--title`      | `<title>`   | Rule title                          |
| `--body`       | `<body>`    | Rule body                           |
| `--scope`      | `<scope>`   | Rule scope (project\|global)        |
| `--applies-to` | `<items>`   | Comma-separated paths/patterns      |
| `--trigger`    | `<trigger>` | When to apply the rule              |
| `--created-by` | `<actor>`   | Creator actor (default: "user:cli") |

```bash
wolf rule add --title "Тесты перед отчётом" --body "Перед сдачей подзадачи — npx vitest run" --scope project --applies-to "src/**" --trigger "конец подзадачи"
```

#### wolf rule list

List rules — список правил.

`Usage: wolf rule list [options]`

Без опций.

```bash
wolf rule list
```

## Связи и таксономия

### wolf relation

Manage relations between memory objects — управление связями между объектами памяти.

`Usage: wolf relation [options] [command]`

Подкоманды:

- `add [options] <subject> <predicate> <object>` — Record a relation between two memory objects

#### wolf relation add

Record a relation between two memory objects — фиксирует связь между двумя объектами памяти.

`Usage: wolf relation add [options] <subject> <predicate> <object>`

Аргументы: `subject` — Subject memory object id; `predicate` — Relation predicate; `object` — Object memory object id.

| Флаг       | Аргумент   | Описание                           |
| ---------- | ---------- | ---------------------------------- |
| `--source` | `<source>` | Relation source (default: "agent") |

```bash
wolf relation add mem_20260830_a1b2c3 based_on mem_20260829_d4e5f6 --source agent
```

### wolf taxonomy

Manage memory taxonomy — управление таксономией памяти.

`Usage: wolf taxonomy [options] [command]`

Подкоманды:

- `sync` — Regenerate memory_types.core in .wolf/config.yaml from code canon
- `show` — Print effective taxonomy (code canon + project types)

#### wolf taxonomy show

Print effective taxonomy (code canon + project types) — печатает эффективную таксономию (код-канон + проектные типы).

`Usage: wolf taxonomy show [options]`

Без опций.

```bash
wolf taxonomy show
```

#### wolf taxonomy sync

Regenerate memory_types.core in .wolf/config.yaml from code canon — перегенерирует memory_types.core в .wolf/config.yaml из код-канона.

`Usage: wolf taxonomy sync [options]`

Без опций.

```bash
wolf taxonomy sync
```

### wolf validate

Validate memory store integrity — проверяет целостность хранилища памяти.

`Usage: wolf validate [options]`

| Флаг    | Аргумент | Описание                                   |
| ------- | -------- | ------------------------------------------ |
| `--fix` | —        | Quarantine broken objects (default: false) |

```bash
wolf validate --fix
```

## Мышление и совет

### wolf think

Structured thinking sequences (goal -> thoughts -> conclusion) — структурированные последовательности мышления.

`Usage: wolf think [options] [command]`

Подкоманды:

- `start [options]` — Start a thinking sequence
- `add [options]` — Add a thought to a thinking sequence
- `conclude [options]` — Conclude a thinking sequence into a decision with an embedded thinking trace
- `abandon [options]` — Abandon a thinking sequence without creating a decision

#### wolf think start

Start a thinking sequence — начинает последовательность мышления.

`Usage: wolf think start [options]`

| Флаг           | Аргумент      | Описание                                                                                    |
| -------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `--goal`       | `<goal>`      | Goal of the thinking sequence                                                               |
| `--thread`     | `<thread-id>` | Parent thread id                                                                            |
| `--created-by` | `<actor>`     | Creator actor (accepted for surface parity; not persisted on scratch) (default: "user:cli") |

```bash
wolf think start --goal "Выбрать стратегию миграции индекса" --thread mem_20260824_refactor_12b412
```

#### wolf think add

Add a thought to a thinking sequence — добавляет мысль в последовательность.

`Usage: wolf think add [options]`

| Флаг         | Аргумент | Описание                                                                 |
| ------------ | -------- | ------------------------------------------------------------------------ |
| `--sequence` | `<id>`   | Thinking sequence id                                                     |
| `--type`     | `<type>` | Thought type (choices: "hypothesis", "reasoning", "evidence", "concern") |
| `--text`     | `<text>` | Thought text                                                             |

```bash
wolf think add --sequence seq_20260830_7e1f --type hypothesis --text "Инкрементальная переиндексация снимет 80% времени сборки"
```

#### wolf think conclude

Conclude a thinking sequence into a decision with an embedded thinking trace — завершает последовательность решением со встроенным трейсом мышления.

`Usage: wolf think conclude [options]`

| Флаг           | Аргумент  | Описание                            |
| -------------- | --------- | ----------------------------------- |
| `--sequence`   | `<id>`    | Thinking sequence id                |
| `--title`      | `<title>` | Decision title                      |
| `--body`       | `<body>`  | Decision body                       |
| `--created-by` | `<actor>` | Creator actor (default: "user:cli") |

```bash
wolf think conclude --sequence seq_20260830_7e1f --title "Решение: инкрементальный индекс" --body "Переходим на инкрементальные обновления"
```

#### wolf think abandon

Abandon a thinking sequence without creating a decision — прерывает последовательность без создания решения.

`Usage: wolf think abandon [options]`

| Флаг         | Аргумент | Описание             |
| ------------ | -------- | -------------------- |
| `--sequence` | `<id>`   | Thinking sequence id |

```bash
wolf think abandon --sequence seq_20260830_7e1f
```

### wolf council

Council operations — операции совета.

`Usage: wolf council [options] [command]`

Подкоманды:

- `tally [options]` — Tally council votes
- `synthesize [options]` — Create synthesis from council opinions

#### wolf council tally

Tally council votes — подсчитывает голоса совета.

`Usage: wolf council tally [options]`

| Флаг            | Аргумент | Описание                                 |
| --------------- | -------- | ---------------------------------------- |
| `--question-id` | `<id>`   | Question ID                              |
| `--quorum`      | `<n>`    | Minimum votes required                   |
| `--threshold`   | `<x>`    | Consensus threshold (0-1) (default: 0.5) |

```bash
wolf council tally --question-id mem_20260829_q_5a5a5a --quorum 3 --threshold 0.6
```

#### wolf council synthesize

Create synthesis from council opinions — создаёт синтез из мнений совета.

`Usage: wolf council synthesize [options]`

| Флаг               | Аргумент  | Описание                            |
| ------------------ | --------- | ----------------------------------- |
| `--question-id`    | `<id>`    | Question ID                         |
| `--recommendation` | `<text>`  | Recommendation text                 |
| `--created-by`     | `<actor>` | Creator actor (default: "user:cli") |

```bash
wolf council synthesize --question-id mem_20260829_q_5a5a5a --recommendation "Принять вариант B"
```

### wolf solve

Build a solve pack for a memory problem — собирает solve-пак для проблемы памяти.

`Usage: wolf solve [options] <problem>`

Аргументы: `problem` — Problem description.

| Флаг       | Аргумент | Описание                     |
| ---------- | -------- | ---------------------------- |
| `--save`   | —        | Save a memory repair request |
| `--thread` | `<id>`   | Thread the repair request    |

```bash
wolf solve "Дубликаты document-ref после миграции" --save --thread mem_20260824_refactor_12b412
```

## Агенты и процессы

### wolf scaffold

Scaffold opencode frame (agent\|skill\|command) + playbook in Wolf memory — создаёт каркас opencode (agent/skill/command) и playbook в памяти Wolf.

`Usage: wolf scaffold [options] <kind> <name>`

Аргументы: `kind` — Frame kind (choices: "agent", "skill", "command"); `name` — Frame name.

| Флаг              | Аргумент  | Описание                                                 |
| ----------------- | --------- | -------------------------------------------------------- |
| `--persona`       | `<text>`  | Agent frame body text (agent only)                       |
| `--model`         | `<model>` | Agent frontmatter model (agent only)                     |
| `--from-playbook` | `<id>`    | Reuse existing playbook id instead of creating a new one |
| `--created-by`    | `<actor>` | Creator actor (default: env WOLF_ACTOR, else user:cli)   |

```bash
wolf scaffold agent triager --persona "Триаж входящих вопросов памяти" --model glm-5.2
```

### wolf run

Run opencode with the model from the Wolf routing object; log weighted token cost — запускает opencode с моделью из routing-объекта Wolf и логирует взвешенную стоимость токенов (run-сигнал в сигнальный лог).

`Usage: wolf run [options] <prompt>`

Аргументы: `prompt` — Prompt passed to opencode.

| Флаг           | Аргумент   | Описание                                                                           |
| -------------- | ---------- | ---------------------------------------------------------------------------------- |
| `--agent`      | `<name>`   | opencode agent name                                                                |
| `--title`      | `<title>`  | Run label written to the log                                                       |
| `--session`    | `<sid>`    | opencode session id to continue                                                    |
| `--tool`       | `<name>`   | Mark this run as using tool(s) (repeatable) (default: [])                          |
| `--experiment` | `<id>`     | Experiment id (comparative methodologies, e.g. RCT)                                |
| `--arm`        | `<choice>` | Experiment arm (choices: "wolf", "baseline")                                       |
| `--task-id`    | `<id>`     | Task id (written as top-level task_id; duplicated in experiment when --experiment) |
| `--campaign`   | `<id>`     | Campaign id (written as top-level campaign_id; groups runs for --view campaign)    |
| `--trace-id`   | `<id>`     | Trace id (defaults to a fresh uuid)                                                |
| `--attempt`    | `<n>`      | Attempt number within the task                                                     |

Семантика экспериментальных флагов и identity-поля v2 (`event_id`, `run_id`,
`config_hash` и др.) — [signal-log.md](../guide/signal-log.md).

```bash
wolf run "Обнови roadmap-v2 по итогам фазы" --agent build --title "docs: roadmap" --tool read --tool write
wolf run "Fix the failing test" --session ses-ab-wolf --campaign eval-01 --task-id fix-failing-test --trace-id 7f3a… --attempt 1
```

### wolf complain

File a complaint about a rule/playbook/agent as a memory object (type complaint, status open) — подаёт жалобу на правило/playbook/агента как объект памяти (тип complaint, статус open).

`Usage: wolf complain [options]`

| Флаг           | Аргумент     | Описание                                                      |
| -------------- | ------------ | ------------------------------------------------------------- |
| `--about`      | `<about>`    | Complaint target: agent id, skill:\<name\> or existing mem-id |
| `--rule`       | `<rule>`     | Which rule is bad (pointer + what it requires)                |
| `--evidence`   | `<evidence>` | Proof: verbatim quote + what happened (file/test/numbers)     |
| `--text`       | `<text>`     | Deprecated alias for --evidence                               |
| `--proposal`   | `<proposal>` | Proposed change to the rule                                   |
| `--created-by` | `<actor>`    | Creator actor (default: env WOLF_ACTOR, else user:cli)        |

Обязательны `--about`, `--rule`, `--proposal` и `--evidence` (или deprecated
`--text`). Протокол обработки — [complaint-protocol.md](../guide/complaint-protocol.md).

```bash
wolf complain --about skill:apprentice --rule "Правило требует vitest перед отчётом" --evidence "e2e red, лог-цитата" --proposal "STOP-гейт в playbook"
```

### wolf bootstrap

Scan the project and draft starting memory: proposed rules, document-refs, work thread — сканирует проект и черновит стартовую память: предполагаемые правила, document-refs, рабочий поток.

`Usage: wolf bootstrap [options]`

| Флаг           | Аргумент  | Описание                                               |
| -------------- | --------- | ------------------------------------------------------ |
| `--created-by` | `<actor>` | Creator actor (default: env WOLF_ACTOR, else user:cli) |

```bash
wolf bootstrap
```

## Инструменты

### wolf tool

Tool librarian: register/list/use/expose/deprecate/revive — библиотекарь инструментов.

`Usage: wolf tool [options] [command]`

Подкоманды:

- `register [options] <script-path>` — Register a script as tool memory object (copies script to .wolf/tools/)
- `list [options]` — List registered tools
- `use <name-or-id>` — Mark tool as used (increments usage_count, prints contract reminder)
- `expose <name-or-id>` — (Re)generate .opencode/skills/\<name\>/SKILL.md from tool object (idempotent)
- `deprecate [options] <name-or-id>` — Deprecate a tool (requires reason)
- `revive <name-or-id>` — Revive a deprecated tool (deprecated → active)
- `stats` — Usage counters per tool + reuse economy (signal log + legacy run-log)

#### wolf tool register

Register a script as tool memory object (copies script to .wolf/tools/) — регистрирует скрипт как объект-инструмент (копирует в .wolf/tools/).

`Usage: wolf tool register [options] <script-path>`

Аргументы: `script-path` — путь к скрипту.

| Флаг             | Аргумент     | Описание                                               |
| ---------------- | ------------ | ------------------------------------------------------ |
| `--name`         | `<name>`     | Tool name (unique)                                     |
| `--language`     | `<language>` | Script language (typescript, python, bash, ...)        |
| `--contract-in`  | `<text>`     | Input contract                                         |
| `--contract-out` | `<text>`     | Output contract                                        |
| `--contract-env` | `<text>`     | Environment contract                                   |
| `--notes`        | `<text>`     | Notes (stored as object body)                          |
| `--force`        | —            | Skip similar-tools check (default: false)              |
| `--created-by`   | `<actor>`    | Creator actor (default: env WOLF_ACTOR, else user:cli) |

```bash
wolf tool register scripts/extract-signals.ts --name extract-signals --language typescript --contract-in ".wolf/signals/*.jsonl" --contract-out "JSON-сводка в stdout"
```

#### wolf tool list

List registered tools — список зарегистрированных инструментов.

`Usage: wolf tool list [options]`

| Флаг       | Аргумент   | Описание                                                                    |
| ---------- | ---------- | --------------------------------------------------------------------------- |
| `--status` | `<status>` | Filter by status (choices: "active", "candidate", "deprecated", "archived") |

```bash
wolf tool list --status deprecated
```

#### wolf tool use

Mark tool as used (increments usage_count, prints contract reminder) — отмечает использование инструмента (инкрементирует счётчик, печатает напоминание контракта).

`Usage: wolf tool use [options] <name-or-id>`

Аргументы: `name-or-id` — имя или идентификатор инструмента.

Без опций.

```bash
wolf tool use extract-signals
```

#### wolf tool expose

(Re)generate .opencode/skills/\<name\>/SKILL.md from tool object (idempotent) — (пере)генерирует SKILL.md из объекта-инструмента (идемпотентно).

`Usage: wolf tool expose [options] <name-or-id>`

Аргументы: `name-or-id` — имя или идентификатор инструмента.

Без опций.

```bash
wolf tool expose extract-signals
```

#### wolf tool deprecate

Deprecate a tool (requires reason) — помечает инструмент устаревшим (требуется причина).

`Usage: wolf tool deprecate [options] <name-or-id>`

Аргументы: `name-or-id` — имя или идентификатор инструмента.

| Флаг       | Аргумент | Описание           |
| ---------- | -------- | ------------------ |
| `--reason` | `<text>` | Deprecation reason |

```bash
wolf tool deprecate old-scan --reason "Заменён на incremental-scan"
```

#### wolf tool revive

Revive a deprecated tool (deprecated → active) — возвращает устаревший инструмент в активные.

`Usage: wolf tool revive [options] <name-or-id>`

Аргументы: `name-or-id` — имя или идентификатор инструмента.

Без опций.

```bash
wolf tool revive old-scan
```

#### wolf tool stats

Usage counters per tool + reuse economy (signal log + legacy run-log) — счётчики использования по инструментам и экономика переиспользования (канон — сигнальный лог; legacy run-log читается compat-мержем до архивации `wolf migrate run-log`).

`Usage: wolf tool stats [options]`

Без опций.

```bash
wolf tool stats
```

## Самообучение и эффективность

### wolf learn

Self-learning loop: pattern digest, signal-log health, draft propose/validate/activate — контур самообучения.

`Usage: wolf learn [options] [command]`

Подкоманды:

- `digest` — Active patterns with live counts, recent examples, evidence refs and post-audit drafts
- `status` — Signal-log health: volumes, threshold, Layer 1-2 meta-metrics, decay drift, last events
- `propose [options] <pattern-key>` — Create a draft lesson/rule from an active pattern (mechanical generator, no LLM)
- `validate <draft-id>` — Sandbox Replay Holdout: replay the draft on tool_error events after its creation
- `activate [options] <draft-id>` — Activate a validated draft (gate: holdout pass, or --human-approved)
- `gate` — STOP-гейт (Ф23): pressure-сценарии доставки + read-only zone probe (отдельный запуск, вне check)
- `decay [options]` — Ф26: decay-прогон по пробегу (сессии) — review_required-очередь, реактивация, drift
- `evolve [options] <template-id>` — Ф24 GEPA: кандидат vs текущий шаблон (.wolf/templates/\<id\>.md) по детерминированной метрике; активация — только человек
- `route [options]` — Ф25: эвристика глубины ревью по признакам задачи (рекомендация; решение — за человеком)

#### wolf learn digest

Active patterns with live counts, recent examples, evidence refs and post-audit drafts — активные паттерны с живыми счётчиками, примерами, ссылками на evidence и черновиками после аудита.

`Usage: wolf learn digest [options]`

Без опций.

```bash
wolf learn digest
```

#### wolf learn status

Signal-log health: volumes, threshold, Layer 1-2 meta-metrics, decay drift, last events — здоровье сигнального лога.

`Usage: wolf learn status [options]`

Без опций.

```bash
wolf learn status
```

#### wolf learn propose

Create a draft lesson/rule from an active pattern (mechanical generator, no LLM) — создаёт черновик lesson/rule из активного паттерна (механический генератор, без LLM).

`Usage: wolf learn propose [options] <pattern-key>`

Аргументы: `pattern-key` — ключ паттерна.

| Флаг           | Аргумент  | Описание                                                        |
| -------------- | --------- | --------------------------------------------------------------- |
| `--negative`   | —         | Negative constraint: anti-rule banning the tool entirely        |
| `--created-by` | `<actor>` | Creator actor (default: env WOLF_ACTOR, else steward:archivist) |

```bash
wolf learn propose tool_error:rtk:pipes
```

#### wolf learn validate

Sandbox Replay Holdout: replay the draft on tool_error events after its creation — реплей черновика на событиях tool_error после его создания.

`Usage: wolf learn validate [options] <draft-id>`

Аргументы: `draft-id` — идентификатор черновика.

Без опций.

```bash
wolf learn validate mem_20260830_draft_9a9a9a
```

#### wolf learn activate

Activate a validated draft (gate: holdout pass, or --human-approved) — активирует валидированный черновик (гейт: пройденный holdout или --human-approved).

`Usage: wolf learn activate [options] <draft-id>`

Аргументы: `draft-id` — идентификатор черновика.

| Флаг               | Аргумент  | Описание                                                   |
| ------------------ | --------- | ---------------------------------------------------------- |
| `--human-approved` | —         | Human review override for text drafts (needs_human_review) |
| `--created-by`     | `<actor>` | Actor (default: env WOLF_ACTOR, else steward:archivist)    |

```bash
wolf learn activate mem_20260830_draft_9a9a9a --human-approved
```

#### wolf learn gate

STOP-гейт (Ф23): pressure-сценарии доставки + read-only zone probe (отдельный запуск, вне check) — гейт доставки с pressure-сценариями и пробой read-only зоны.

`Usage: wolf learn gate [options]`

Без опций.

```bash
wolf learn gate
```

#### wolf learn decay

Ф26: decay-прогон по пробегу (сессии) — review_required-очередь, реактивация, drift — decay-прогон по сессиям.

`Usage: wolf learn decay [options]`

| Флаг        | Аргумент | Описание                                 |
| ----------- | -------- | ---------------------------------------- |
| `--dry-run` | —        | Посчитать без записи изменений в объекты |

```bash
wolf learn decay --dry-run
```

#### wolf learn evolve

Ф24 GEPA: кандидат vs текущий шаблон (.wolf/templates/\<id\>.md) по детерминированной метрике; активация — только человек — сравнение кандидата с текущим шаблоном по метрике.

`Usage: wolf learn evolve [options] <template-id>`

Аргументы: `template-id` — идентификатор шаблона.

| Флаг      | Аргумент | Описание                                                                             |
| --------- | -------- | ------------------------------------------------------------------------------------ |
| `--write` | —        | Записать кандидат-файл \<id\>.candidate.md (НЕ активация; активация — гейт человека) |

```bash
wolf learn evolve steward-learn-propose --write
```

#### wolf learn route

Ф25: эвристика глубины ревью по признакам задачи (рекомендация; решение — за человеком) — рекомендация глубины ревью по признакам задачи.

`Usage: wolf learn route [options]`

| Флаг                  | Аргумент | Описание                                                |
| --------------------- | -------- | ------------------------------------------------------- |
| `--type`              | `<t>`    | Тип задачи: feature\|bugfix\|refactor\|docs\|experiment |
| `--files`             | `<n>`    | Число файлов в изменении                                |
| `--lines`             | `<n>`    | Число строк в изменении                                 |
| `--blast-radius`      | `<x>`    | Blast radius 0..1                                       |
| `--touches-read-only` | —        | Изменение касается read-only зоны (гейты/логи/скелет)   |
| `--security`          | —        | Безопасность: доверенные границы, секреты               |
| `--metricless`        | —        | Нет детерминированной метрики качества                  |

```bash
wolf learn route --type bugfix --files 12 --lines 340 --blast-radius 0.4 --touches-read-only --security --metricless
```

### wolf effectiveness

Memory effectiveness panel: rules holdout, tool economy, delivery, noise, routing (aggregation only, no LLM) — панель эффективности памяти (только агрегация, без LLM).

`Usage: wolf effectiveness [options]`

| Флаг         | Аргумент | Описание                                                              |
| ------------ | -------- | --------------------------------------------------------------------- |
| `--snapshot` | —        | Append the full report to .wolf/metrics/effectiveness-snapshots.jsonl |

```bash
wolf effectiveness
wolf effectiveness --snapshot
```

### wolf insights

Heuristic pattern analysis over project memory (Level 1, no LLM) — эвристический анализ паттернов по памяти проекта (уровень 1, без LLM).

`Usage: wolf insights [options]`

| Флаг      | Аргумент  | Описание                                                                                                       |
| --------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `--topic` | `<topic>` | Filter by topic: exact tag match or substring in title/body                                                    |
| `--type`  | `<type>`  | Analysis lens (choices: "patterns", "technical_debt", "decisions", "lessons", "activity", default: "patterns") |

```bash
wolf insights --topic rtk --type lessons
```

### wolf analytics

Effectiveness analytics: ledgers (memory/tools/rules), weekly activity, agents, steward view, councils, outliers, experiment readiness, memory lifecycle & coordination, campaigns & per-memory ROI — выборки аналитики эффективности (агрегация, без LLM). Подробности: [analytics.md](../guide/analytics.md).

`Usage: wolf analytics [options]`

| Флаг       | Аргумент   | Описание                                                                                                                                                                            |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--view`   | `<view>`   | Analytics view (choices: "memory", "tools", "rules", "weeklyActivity", "agents", "steward", "outliers", "readiness", "councils", "coordination", "campaign", "all", default: "all") |
| `--class`  | `<class>`  | Memory lifecycle filter (choices: "new", "sleeper", "workhorse", "dead")                                                                                                            |
| `--type`   | `<type>`   | Memory type filter                                                                                                                                                                  |
| `--origin` | `<origin>` | Tool origin filter (choices: "script", "native")                                                                                                                                    |
| `--agent`  | `<agent>`  | Agent name filter                                                                                                                                                                   |
| `--silent` | —          | Rules view: only silent rules (default: false)                                                                                                                                      |
| `--top`    | `<n>`      | Row limit (default: 20)                                                                                                                                                             |
| `--weeks`  | `<n>`      | Weekly activity window in weeks (default: 8)                                                                                                                                        |
| `--json`   | —          | Machine-readable JSON output (default: false)                                                                                                                                       |

```bash
wolf analytics --view memory --top 5
wolf analytics --view campaign --json
```

### wolf dashboard

Console dashboard: health, ledgers, trends (unicode tables and sparklines; no files written) — консольный дашборд: health/ledgers/trends (unicode-таблицы и спарклайны, без записи файлов).

`Usage: wolf dashboard [options]`

| Флаг     | Аргумент | Описание                                                             |
| -------- | -------- | -------------------------------------------------------------------- |
| `--tab`  | `<tab>`  | Render a single section (choices: "health", "ledgers", "trends")     |
| `--json` | —        | Machine-readable JSON output of the whole dashboard (default: false) |

```bash
wolf dashboard
wolf dashboard --tab trends
```

### wolf task-eval

Record a task verdict into the signal log (event task_evaluated) — записывает вердикт по задаче в сигнальный лог (событие task_evaluated).

`Usage: wolf task-eval [options]`

| Флаг                 | Аргумент    | Описание                                                                                                  |
| -------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `--verdict`          | `<verdict>` | Task verdict (choices: "accepted", "rejected", "partial", "inconclusive")                                 |
| `--scorer`           | `<scorer>`  | Who evaluated the task (choices: "human", "deterministic", "llm_judge", "hidden_tests", default: "human") |
| `--session`          | `<id>`      | Session id                                                                                                |
| `--task-id`          | `<id>`      | Task id                                                                                                   |
| `--campaign`         | `<id>`      | Campaign id (written as detail.campaign_id)                                                               |
| `--note`             | `<text>`    | Free-form note                                                                                            |
| `--criteria-passed`  | `<n>`       | Criteria passed count                                                                                     |
| `--criteria-total`   | `<m>`       | Criteria total count                                                                                      |
| `--critical-failure` | —           | Mark a critical failure (default: false)                                                                  |

```bash
wolf task-eval --verdict accepted --task-id docs-v2.5.0-rename --scorer human --note "v2.5.0 docs sync"
```

### wolf memory-stage

Record a memory lifecycle stage into the signal log (event memory_stage) — фиксирует стадию жизненного цикла памяти в сигнальном логе.

`Usage: wolf memory-stage [options]`

| Флаг        | Аргумент  | Описание                                                                      |
| ----------- | --------- | ----------------------------------------------------------------------------- |
| `--stage`   | `<stage>` | Memory lifecycle stage (choices: "retrieved", "injected", "cited", "applied") |
| `--ids`     | `<ids>`   | Comma-separated memory object ids                                             |
| `--actor`   | `<actor>` | Actor attribution (default: WOLF_ACTOR env or user:cli)                       |
| `--session` | `<id>`    | Session id                                                                    |

```bash
wolf memory-stage --stage applied --ids mem_20260904_a1b2c3 --actor agent:worker
```

### wolf coord

Record a coordination event into the signal log (event coord_event) — фиксирует факт координации между агентами в сигнальном логе.

`Usage: wolf coord [options]`

| Флаг      | Аргумент  | Описание                                                                                      |
| --------- | --------- | --------------------------------------------------------------------------------------------- |
| `--kind`  | `<kind>`  | Coordination event kind (choices: "handoff", "review", "acceptance", "blocker", "escalation") |
| `--from`  | `<actor>` | Source actor (default: WOLF_ACTOR env or user:cli)                                            |
| `--to`    | `<actor>` | Target actor                                                                                  |
| `--ref`   | `<ids>`   | Comma-separated referenced object ids (default: [])                                           |
| `--note`  | `<text>`  | Free-form note                                                                                |
| `--actor` | `<actor>` | Writer actor attribution (default: WOLF_ACTOR env or user:cli)                                |

```bash
wolf coord --kind handoff --from "L0:wolf" --to "L1:lead" --ref mem_20260904_report --note "phase B dispatch"
```

## Инфраструктура

### wolf mcp

Start the MCP server (stdio) — запускает MCP-сервер (stdio).

`Usage: wolf mcp [options]`

Без опций.

```bash
wolf mcp
```

### wolf sync

Re-render the wolf base set (stamped files only; memory untouched) — перегенерирует базовый набор агентов/скиллов/плагинов (только штампованные `wolf:rendered` файлы; память не трогает).

`Usage: wolf sync [options]`

Без опций.

```bash
wolf sync
```

### wolf doctor

Check all registered projects: binary vs schema version, platform configs, prune dead entries — проверяет все зарегистрированные проекты: версия бинаря против схемы, конфиги платформ, чистит мёртвые записи.

`Usage: wolf doctor [options]`

Без опций.

```bash
wolf doctor
```

### wolf migrate

One-time migration: objects/\<type\>/ -> threads/\<tid\>/\<subdir\>/ + shared/ — разовая миграция структуры хранилища.

> legacy: разовая миграция со старой структуры `objects/<type>/` на `threads/<tid>/<subdir>/ + shared/`; для нового хранилища не нужна.

`Usage: wolf migrate [options]`

| Флаг      | Аргумент | Описание                                                  |
| --------- | -------- | --------------------------------------------------------- |
| `--apply` | —        | perform the migration (default: dry-run) (default: false) |

```bash
wolf migrate --apply
```

Подкоманды:

- `doc-ids [options]` — One-time migration of document-ref ids to canonical format (spec 2.1.0 §2.6); --apply to perform
- `run-log` — Archive legacy .wolf/run-log.jsonl to .wolf/metrics/archive (idempotent)

#### wolf migrate doc-ids

One-time migration of document-ref ids to canonical format (spec 2.1.0 §2.6); --apply to perform — разовая миграция id document-ref'ов к каноническому формату.

`Usage: wolf migrate doc-ids [options]`

| Флаг      | Аргумент | Описание                                                  |
| --------- | -------- | --------------------------------------------------------- |
| `--apply` | —        | perform the migration (default: dry-run) (default: false) |

```bash
wolf migrate doc-ids --apply
```

#### wolf migrate run-log

Archive legacy .wolf/run-log.jsonl to .wolf/metrics/archive — архивирует устаревший run-лог, чтобы analytics не считала старые прогоны дважды (сигнальный лог — канонический источник).

`Usage: wolf migrate run-log`

Без опций. Перемещение — rename (содержимое не переписывается), целевое имя `run-log-<дата>-legacy.jsonl` (локальная дата; коллизия → суффикс `-2`, `-3`, …). Идемпотентно: файла нет → `nothing to migrate`, exit 0.

```bash
wolf migrate run-log
```

---

Полный список команд: `wolf --help`.
