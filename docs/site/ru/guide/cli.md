# Справочник CLI

Бинарник `wolf` глобального пакета `mister-wolf`. У каждой команды есть `-h, --help`; дословный вывод — `wolf <cmd> --help`. Общие конвенции: `--created-by <actor>` — автор мутации (дефолт: env `WOLF_ACTOR`, иначе `user:cli`); `--tags`/`--applies-to` и прочие списки — через запятую.

## Память

### `wolf add`

Добавить объект памяти.

```bash
wolf add --type <type> --title <title> [options]
```

| Опция                       | Описание                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--type <type>`             | Тип памяти: decision, lesson, observation, session-summary, open-question, context, work-thread, info-request, article, blocker, session-checkpoint, rule, document-ref, document-native, task-brief, report, council-question, council-opinion, synthesis, escalation, decision-request, call-injection, playbook, tool |
| `--title <title>`           | Заголовок                                                                                                                                                                                                                                                                                                                |
| `--body <body>`             | Текст                                                                                                                                                                                                                                                                                                                    |
| `--tags <tags>`             | Теги через запятую                                                                                                                                                                                                                                                                                                       |
| `--confidence <confidence>` | Уверенность (low\|medium\|high)                                                                                                                                                                                                                                                                                          |
| `--importance <n>`          | Важность от 0 до 1                                                                                                                                                                                                                                                                                                       |
| `--set <k=v>`               | Доп. поле key=value (повторяемый; значение «[a,b]» — строковый массив)                                                                                                                                                                                                                                                   |
| `--scope <scope>`           | Поле scope для типов с ним (rule: project\|global)                                                                                                                                                                                                                                                                       |
| `--created-by <actor>`      | Автор (дефолт: env WOLF_ACTOR, иначе user:cli)                                                                                                                                                                                                                                                                           |

```bash
wolf add --type lesson --title "Вит-тесты падают от кэша" --body "В CI — флаг --no-cache" --tags "vitest,ci" --confidence medium
```

### `wolf list`

Список объектов памяти.

| Опция               | Описание                                      |
| ------------------- | --------------------------------------------- |
| `--type <type>`     | Фильтр по типу                                |
| `--status <status>` | Фильтр по статусу                             |
| `--stale`           | Только stale-объекты (не обновлялись 30 дней) |

```bash
wolf list --type decision --stale
```

### `wolf get`

Получить объект по id.

```bash
wolf get <id> [--latest]
```

`--latest` — пройти по цепочке `superseded_by` до актуального объекта.

```bash
wolf get mem_001 --latest
```

### `wolf search`

Поиск по объектам памяти (FTS).

```bash
wolf search <query> [options]
```

| Опция                                              | Описание                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `--type <type>` / `--status <status>`              | Фильтры по типу / статусу                                             |
| `--tag <tag>`                                      | Фильтр по тегу (повторяемый)                                          |
| `--confidence <confidence>`                        | low\|medium\|high                                                     |
| `--min-importance <n>` / `--max-importance <n>`    | Границы важности                                                      |
| `--created-after <iso>` / `--created-before <iso>` | Окно создания                                                         |
| `--limit <n>`                                      | Максимум результатов                                                  |
| `--file-path <path>`                               | По связанному/исходному файлу                                         |
| `--hide-superseded`                                | Скрыть superseded (по умолчанию показываются с пометкой [superseded]) |
| `--include-superseded`                             | Deprecated no-op: superseded показываются по умолчанию                |

```bash
wolf search "supersede" --type rule --hide-superseded
```

### `wolf supersede`

Заменить объект памяти другим: старому — `status: superseded` + `superseded_by`.

```bash
wolf supersede <old-id> <new-id>
```

### `wolf transition`

Сменить статус жизненного цикла объекта.

```bash
wolf transition <id> <status> [--actor <actor>]
```

`--actor <actor>` — автор перехода (дефолт `user:cli`).

```bash
wolf transition mem_002 accepted
```

### `wolf rebuild-index`

Перестроить SQLite-индекс поиска из объектов памяти.

```bash
wolf rebuild-index
```

## Сессии и контекст

### `wolf scan`

Сканировать проект и сохранить снимок контекста.

```bash
wolf scan
```

### `wolf brief`

Бриф агента по последнему scan + памяти.

```bash
wolf brief
```

### `wolf recap`

Сводка активной памяти: правила, треды, блокеры, вопросы, решения.

```bash
wolf recap
```

### `wolf call`

Получить активные call-инъекции (cold-start).

```bash
wolf call [--for <topic>] [--thread <thread-id>] [--compact [chars]]
```

| Опция                  | Описание                        |
| ---------------------- | ------------------------------- |
| `--for <topic>`        | Тема для матчинга инъекций      |
| `--thread <thread-id>` | Id треда для thread-режима      |
| `--compact [chars]`    | Бюджет в символах (дефолт 1200) |

```bash
wolf call --for "vitest" --compact
```

### `wolf insights`

Эвристический анализ памяти (Level 1, без LLM).

| Опция             | Описание                                                                        |
| ----------------- | ------------------------------------------------------------------------------- |
| `--topic <topic>` | Фильтр по теме: точный тег или подстрока в заголовке/тексте                     |
| `--type <type>`   | Линза: patterns, technical_debt, decisions, lessons, activity (дефолт patterns) |

```bash
wolf insights --type technical_debt
```

### `wolf session`

Сессии и чекпоинты.

**`wolf session checkpoint`** — чекпоинт рабочего треда. Опции: `--thread <thread-id>`, `--created-by <actor>` (дефолт `user:cli`).

```bash
wolf session checkpoint --thread thr_001
```

**`wolf session wrap-up`** — вручную создать session-summary недавних событий. Опции: `--title <title>`, `--tags <tags>`.

```bash
wolf session wrap-up --title "Сессия: настройка CI"
```

### `wolf diff`

Изменения треда с чекпоинта.

```bash
wolf diff <thread-id> [--since <checkpoint-id>]
```

## Управление работой

### `wolf thread`

Рабочие треды.

**`wolf thread create`** — создать тред. Опции: `--title <title>`, `--goal <goal>`, `--current-state <state>` (дефолт `""`), `--next-steps <steps>` (через запятую), `--created-by <actor>`.

```bash
wolf thread create --title "Релиз 1.1" --goal "Закрыть блокеры и опубликовать" --next-steps "CI,CHANGELOG"
```

**`wolf thread list`** — список тредов.

**`wolf thread brief <thread-id>`** — бриф треда.

### `wolf decision`

Решения.

**`wolf decision add`** — добавить решение. Опции: `--title <title>`, `--body <body>`, `--thread <thread-id>`, `--based-on <ids>` (артефакты-основания, через запятую), `--created-by <actor>`.

```bash
wolf decision add --title "SQLite вместо JSON" --body "FTS нужен" --based-on "mem_001,mem_002"
```

**`wolf decision list`** — список решений; `--thread <thread-id>` — фильтр по треду.

### `wolf blocker`

Блокеры.

**`wolf blocker add`** — добавить блокер. Опции: `--title <title>`, `--impact <impact>`, `--workaround <workaround>`, `--thread <thread-id>`, `--created-by <actor>`.

```bash
wolf blocker add --title "GitHub CI не стартует" --impact "релиз стоит" --workaround "локальный прогон check"
```

**`wolf blocker list`** — список блокеров; `--thread <thread-id>`.

**`wolf blocker resolve <id>`** — закрыть блокер; `--by <artifact-id>` — закрывший артефакт.

### `wolf info-request`

Запросы информации.

**`wolf info-request create`** — создать. Опции: `--title <title>`, `--thread <thread-id>`, `--question <question>`, `--detour-reason <reason>` (почему это уводит сессию в сторону), `--expected-answer <answers>` (через запятую), `--needed-for <items>`, `--preliminary-answer <answer>` (дефолт `""`), `--created-by <actor>`.

**`wolf info-request list`** — список; `--thread <thread-id>`.

### `wolf article`

Статьи (знания).

**`wolf article add`** — добавить. Опции: `--title <title>`, `--thread <thread-id>`, `--summary <summary>`, `--body <body>`, `--answers <ids>` (закрытые info-request id), `--supports <items>`, `--evidence <items>`, `--created-by <actor>`.

**`wolf article list`** — список; `--thread <thread-id>`.

### `wolf rule`

Правила.

**`wolf rule add`** — добавить правило (только пользователь). Опции: `--title <title>`, `--body <body>`, `--scope <scope>` (project\|global), `--applies-to <items>` (пути/паттерны), `--trigger <trigger>` (когда применять), `--created-by <actor>`.

```bash
wolf rule add --title "Коммит после работы" --body "Каждая завершённая задача коммитится" --scope project
```

**`wolf rule list`** — список правил.

### `wolf relation`

Связи между объектами.

**`wolf relation add <subject> <predicate> <object>`** — записать связь; `--source <source>` — источник связи (дефолт `agent`).

```bash
wolf relation add mem_001 supports mem_002
```

## Мышление и совет

### `wolf think`

Структурированные последовательности мышления (goal → мысли → вывод).

**`wolf think start`** — начать. Опции: `--goal <goal>`, `--thread <thread-id>`, `--created-by <actor>` (принимается для единообразия; на scratch не сохраняется).

**`wolf think add`** — добавить мысль. Опции: `--sequence <id>`, `--type <type>` (hypothesis, reasoning, evidence, concern), `--text <text>`.

**`wolf think conclude`** — завершить решением с встроенным trace мышления. Опции: `--sequence <id>`, `--title <title>`, `--body <body>`, `--created-by <actor>`.

**`wolf think abandon`** — отбросить без решения. Опции: `--sequence <id>`.

```bash
wolf think start --goal "Выбрать стратегию кэша"
wolf think add --sequence seq_001 --type hypothesis --text "SQLite-кэш снимет боль"
wolf think conclude --sequence seq_001 --title "SQLite-кэш" --body "FTS и один файл"
```

### `wolf council`

Операции совета.

**`wolf council tally`** — подсчитать голоса. Опции: `--question-id <id>`, `--quorum <n>` (минимум голосов), `--threshold <x>` (порог консенсуса 0–1, дефолт 0.5).

**`wolf council synthesize`** — синтез из мнений совета. Опции: `--question-id <id>`, `--recommendation <text>`, `--created-by <actor>`.

## Самообучение

### `wolf learn`

Контур самообучения: digest паттернов, здоровье сигнального лога, draft propose/validate/activate.

**`wolf learn digest`** — активные паттерны с живыми счётчиками, свежими примерами, ссылками на evidence и post-audit draft'ы.

**`wolf learn status`** — здоровье сигнального лога: объёмы, порог, метаметодики Layer 1–2, decay drift, последние события.

**`wolf learn propose <pattern-key>`** — draft урока/правила из активного паттерна (механический генератор, без LLM). Опции: `--negative` (анти-правило: полный запрет инструмента), `--created-by <actor>` (дефолт: env WOLF_ACTOR, иначе `steward:archivist`).

**`wolf learn validate <draft-id>`** — Sandbox Replay Holdout: повтор draft'а на событиях tool_error после его создания.

**`wolf learn activate <draft-id>`** — активировать валидированный draft (гейт: holdout pass или `--human-approved`). Опции: `--human-approved` (ручное подтверждение текстовых draft'ов), `--created-by <actor>`.

**`wolf learn gate`** — STOP-гейт (Ф23): pressure-сценарии доставки + read-only zone probe (отдельный запуск, вне check).

**`wolf learn decay`** — Ф26: decay-прогон по пробегу (сессии) — review_required-очередь, реактивация, drift. Опции: `--dry-run` (посчитать без записи изменений).

**`wolf learn evolve <template-id>`** — Ф24 GEPA: кандидат vs текущий шаблон (`.wolf/templates/<id>.md`) по детерминированной метрике; активация — только человек. Опции: `--write` (записать `<id>.candidate.md`; НЕ активация).

**`wolf learn route`** — Ф25: эвристика глубины ревью по признакам задачи (рекомендация; решение за человеком). Опции: `--type <t>` (feature|bugfix|refactor|docs|experiment), `--files <n>`, `--lines <n>`, `--blast-radius <x>` (0..1), `--touches-read-only`, `--security`, `--metricless`.

```bash
wolf learn digest
wolf learn propose <pattern-key>
wolf learn validate <draft-id>
wolf learn activate <draft-id>
```

### `wolf effectiveness`

Панель эффективности памяти: rules holdout, tool economy, доставка, шум, роутинг (только агрегация, без LLM).

```bash
wolf effectiveness
```

### `wolf complain`

Записать жалобу на поведение агента/методики (hot-signal для Стюарда).

| Опция                  | Описание                                                                  |
| ---------------------- | ------------------------------------------------------------------------- |
| `--about <about>`      | Адресат: playbook id, agent id или имя skill (например, skill:apprentice) |
| `--text <text>`        | Текст жалобы                                                              |
| `--created-by <actor>` | Автор (дефолт: env WOLF_ACTOR, иначе user:cli)                            |

```bash
wolf complain --about skill:apprentice --text "Игнорирует теги"
```

## Платформа и обслуживание

### `wolf init`

Инициализировать память Mr. Wolf для проекта (идемпотентно, неинтерактивно).

| Опция              | Описание                                                                      |
| ------------------ | ----------------------------------------------------------------------------- |
| `--platform <ids>` | Явный список платформ через запятую (opencode,claude); заменяет текущий набор |
| `--recreate`       | Забэкапить битый .wolf/config.yaml и пересоздать из дефолтов                  |

```bash
wolf init --platform opencode,claude
```

### `wolf bootstrap`

Сканировать проект и создать черновую стартовую память: proposed-правила, document-ref'ы, work-thread. Опции: `--created-by <actor>`.

```bash
wolf bootstrap
```

### `wolf mcp`

Запустить MCP-сервер (stdio).

```bash
wolf mcp
```

### `wolf scaffold`

Создать рамку платформы opencode (agent|skill|command) + playbook в памяти Wolf.

```bash
wolf scaffold <kind> <name> [options]
```

| Аргумент/опция         | Описание                                       |
| ---------------------- | ---------------------------------------------- |
| `<kind>`               | Тип рамки: agent, skill, command               |
| `<name>`               | Имя рамки                                      |
| `--persona <text>`     | Текст тела agent-рамки (только agent)          |
| `--model <model>`      | model во frontmatter агента (только agent)     |
| `--from-playbook <id>` | Переиспользовать существующий playbook id      |
| `--created-by <actor>` | Автор (дефолт: env WOLF_ACTOR, иначе user:cli) |

```bash
wolf scaffold agent apprentice --persona "Ты ученик" --model "your-model-id"
```

### `wolf tool`

Библиотекарь инструментов.

**`wolf tool register <script-path>`** — зарегистрировать скрипт как tool-объект (копирует в `.wolf/tools/`). Опции: `--name <name>` (уникальное), `--language <language>` (typescript, python, bash, ...), `--contract-in <text>`, `--contract-out <text>`, `--contract-env <text>`, `--notes <text>` (тело объекта), `--force` (пропустить проверку похожих тулов), `--created-by <actor>`.

**`wolf tool list`** — список; `--status <status>` (active, candidate, deprecated, archived).

**`wolf tool use <name-or-id>`** — отметить использование (+1 к usage_count, напомнит контракт).

**`wolf tool expose <name-or-id>`** — (пере)сгенерировать `.opencode/skills/<name>/SKILL.md` (идемпотентно).

**`wolf tool deprecate <name-or-id>`** — вывести тул в deprecated (требуется причина): `--reason <text>`.

**`wolf tool revive <name-or-id>`** — оживить deprecated-тул (deprecated → active).

**`wolf tool stats`** — счётчики использования + экономика переиспользования из `.wolf/run-log.jsonl`.

```bash
wolf tool register scripts/check.sh --name check --contract-in "нет" --contract-out "exit 0/1"
wolf tool list --status active
wolf tool use check
```

### `wolf taxonomy`

Таксономия памяти.

**`wolf taxonomy sync`** — регенерировать `memory_types.core` в `.wolf/config.yaml` из кода-канона.

**`wolf taxonomy show`** — напечатать эффективную таксономию (код-канон + проектные типы).

### `wolf migrate`

Разовая миграция layout: `objects/<type>/` → `threads/<tid>/<subdir>/` + `shared/`. По умолчанию dry-run; `--apply` — выполнить.

```bash
wolf migrate --apply
```

### `wolf validate`

Проверить целостность хранилища; `--fix` — карантин битых объектов.

```bash
wolf validate --fix
```

### `wolf doctor`

Проверить все зарегистрированные проекты: binary vs schema version, платформенные конфиги, чистка мёртвых записей.

```bash
wolf doctor
```

### `wolf run`

Запустить opencode с моделью из routing-объекта Wolf; записать взвешенную стоимость токенов в лог.

```bash
wolf run <prompt> [options]
```

| Опция             | Описание                                              |
| ----------------- | ----------------------------------------------------- |
| `--agent <name>`  | Имя агента opencode                                   |
| `--title <title>` | Метка запуска в логе                                  |
| `--session <sid>` | Продолжить сессию opencode                            |
| `--tool <name>`   | Пометить запуск как использующий тул(ы) (повторяемая) |

```bash
wolf run "Проведи ревью изменений" --title "review"
```

### `wolf solve`

Собрать solve pack для проблемы памяти.

```bash
wolf solve <problem> [--save] [--thread <id>]
```

`--save` — сохранить запрос на починку памяти; `--thread <id>` — привязать его к треду.

```bash
wolf solve "битые relation-ссылки" --save
```
