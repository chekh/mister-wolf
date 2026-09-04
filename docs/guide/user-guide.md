# Руководство пользователя Mr. Wolf

**Версия CLI:** 0.1.0
**Статус:** активно развивается

Связанные документы:

- [Полный reference команд](../reference/cli.md) — все команды и флаги.
- [Концепция](../concept/concept.md) — зачем Mr. Wolf существует.
- [Индекс документации](../README.md) — карта всех документов.

> В примерах используется `wolf` — алиас для `node dist/bootstrap/cli.js`
> (запуск CLI из корня проекта). Если алиас не настроен, подставляйте полную форму.

---

## 1. Что такое Mr. Wolf

Mr. Wolf — локальный harness проекта для работы с AI-агентами. Он не заменяет агентов, OpenCode, документацию или тесты. Формула концепта v3:

> **Память — носитель. Процессы — суть. Агенты — форма. Инструменты — руки.**

Четыре слоя системы:

- **Память** — решения, вопросы, статьи, правила, уроки, препятствия: всё, что должно пережить текущую сессию.
- **Процессы** — сценарии работы: холодный старт сессии, structured thinking, совет (council), бутстрап проекта, протокол жалоб.
- **Агенты** — фреймы opencode (agent/skill/command) со своими playbook в памяти Wolf.
- **Инструменты** — переиспользуемые скрипты с контрактом (tool-экономика).

Вся память хранится в файлах Markdown с YAML frontmatter внутри `.wolf/memory/` — её можно читать и редактировать обычными инструментами. Служебные данные лежат рядом:

- `.wolf/memory/relations.jsonl` — явные связи между артефактами;
- SQLite-индекс — полнотекстовый поиск (перестраивается `rebuild-index`);
- `.wolf/tools/` — зарегистрированные скрипты-инструменты;
- `.wolf/run-log.jsonl` — журнал запусков с весовой стоимостью;
- `.wolf/templates/` — шаблоны для эволюции (GEPA);
- `.wolf/config.yaml` — конфигурация, включая таксономию типов.

---

## 2. Инициализация и доступ

| Команда     | Что делает                               |
| ----------- | ---------------------------------------- |
| `wolf init` | Инициализирует память Mr. Wolf в проекте |
| `wolf mcp`  | Запускает MCP-сервер (stdio)             |

- `init` — первый шаг для нового проекта: создаёт структуру `.wolf/`.
- `mcp` — подключение Wolf как MCP-сервера к агенту (инструменты `mr-wolf_*`).

Подсказка по любой команде: `wolf help` и `wolf <команда> --help`.

---

## 3. Память: базовые операции

Универсальные команды для объектов памяти любого типа.

### 3.1. add — создать объект

```bash
wolf add --type lesson \
  --title "codegraph_search вместо grep" \
  --body "Поиск символа по имени — codegraph_search, не grep." \
  --tags "codegraph,search" \
  --confidence high \
  --importance 0.7 \
  --created-by agent:worker
```

Ключевые флаги:

- `--type` — один из: `decision`, `lesson`, `observation`, `session-summary`, `open-question`, `context`, `work-thread`, `info-request`, `article`, `blocker`, `session-checkpoint`, `rule`, `document-ref`, `document-native`, `task-brief`, `report`, `council-question`, `council-opinion`, `synthesis`, `escalation`, `decision-request`, `call-injection`, `playbook`, `tool`.
- `--title`, `--body`, `--tags` (через запятую) — базовые поля.
- `--confidence low|medium|high`, `--importance 0..1` — оценка достоверности и важности.
- `--set k=v` — произвольное дополнительное поле (повторяемый; значение `[a,b]` — строковый массив).
- `--scope project|global` — для типов, у которых он есть (например, `rule`).
- `--created-by` — автор; по умолчанию берётся из переменной окружения `WOLF_ACTOR`, иначе `user:cli`.

### 3.2. get / list / search — чтение

```bash
# Объект по id; --latest идёт по цепочке superseded_by к актуальному
wolf get mem_20260823__c93eac --latest

# Список с фильтрами; --stale — не обновлялись 30 дней
wolf list --type decision --status active
wolf list --stale

# Полнотекстовый поиск с фильтрами
wolf search "relations" \
  --type decision \
  --tag memory \
  --min-importance 0.5 \
  --created-after 2026-08-01 \
  --limit 20 \
  --hide-superseded
```

Фильтры `search`: `--type`, `--status`, `--tag` (повторяемый), `--confidence`, `--min-importance` / `--max-importance`, `--created-after` / `--created-before` (ISO-даты), `--limit`, `--file-path` (по связанному файлу), `--hide-superseded` (по умолчанию замещённые показываются с пометкой `[superseded]`).

### 3.3. supersede / transition — жизненный цикл

```bash
# Заменить устаревший объект новым (старый получит статус superseded)
wolf supersede mem_old123 mem_new456

# Перевести объект в другой статус
wolf transition mem_20260823__c93eac completed --actor agent:worker
```

### 3.4. relation — связи между объектами

```bash
wolf relation add mem_article_1 supports mem_decision_2 --source agent
```

Связь «субъект — предикат — объект» записывается в `relations.jsonl`; `--source` — источник связи (по умолчанию `agent`). Автоматические связи (через флаги `--answers`, `--based-on`, `--thread`, `--by`) описаны в разделе [10](#10-связи-между-сущностями).

### 3.5. taxonomy — таксономия типов

```bash
wolf taxonomy show  # эффективная таксономия: код-канон + проектные типы
wolf taxonomy sync  # регенерирует memory_types.core в .wolf/config.yaml из кода
```

### 3.6. rebuild-index / validate — обслуживание

```bash
wolf rebuild-index  # перестроить SQLite-индекс из объектов памяти
wolf validate       # проверка целостности хранилища
wolf validate --fix # поместить битые объекты в карантин
```

Когда использовать: после ручного редактирования файлов в `.wolf/memory/` (rebuild-index), при подозрении на повреждённые объекты (validate).

---

## 4. Work threads и артефакты

Ядро повседневной работы: долгоживущие линии работы и связанные с ними артефакты.

### 4.1. Work Thread (Рабочий тред)

**Что это:** долгоживущая линия работы, которая объединяет несколько сессий.

**Когда создавать:**

- когда работа займёт больше одной сессии;
- когда новая сессия должна быстро войти в контекст;
- когда появляются связанные вопросы, статьи и решения.

**Пример:**

```bash
wolf thread create \
  --title "Переход на schema-driven memory" \
  --goal "Сделать Mr. Wolf конфигурируемым движком памяти" \
  --current-state "Завершена Phase 1" \
  --next-steps "Phase 2: decisions и blockers"
```

`--next-steps` — список через запятую. `--created-by` — автор (по умолчанию `user:cli`).

**Что хранится в треде:**

- `title` — название;
- `goal` — цель;
- `current_state` — текущее состояние (обновляется вручную);
- `next_steps` — следующие шаги;
- `status` — `active`, `paused`, `completed`, `archived`.

### 4.2. Info Request (Запрос на информацию)

**Что это:** отложенный побочный вопрос, ответ на который должен стать частью проектной памяти.

**Когда создавать:**

- вопрос требует большого отступления от основной темы сессии;
- ответ будет полезен не только сейчас, но и в будущем;
- можете дать предварительный ответ, но нужна глубокая проверка.

**Не создавайте info-request:**

- для обычных TODO;
- чтобы избежать размышления;
- для вопросов, которые можно ответить прямо сейчас.

**Пример:**

```bash
wolf info-request create \
  --title "Где хранить relations?" \
  --thread <thread-id> \
  --question "Должны ли связи между артефактами храниться в relations.jsonl или в SQLite?" \
  --detour-reason "Сравнение хранилищ отвлечёт от проектирования поведения" \
  --expected-answer "Сравнение вариантов, рекомендация" \
  --needed-for "Phase 4: relations" \
  --preliminary-answer "Скорее всего, relations.jsonl для MVP."
```

**Обязательные поля:** `title`, `question`, `detour_reason`, `expected_answer`, `thread`. Дополнительно: `--needed-for` (для чего нужен ответ), `--preliminary-answer`.

### 4.3. Article (Статья)

**Что это:** переиспользуемый ответ на info-request или самостоятельная заметка о проекте.

**Когда создавать:**

- подготовили ответ на info-request;
- нужно зафиксировать объяснение, которое будут читать другие сессии;
- хотите собрать знание в структурированном виде.

**Пример:**

```bash
wolf article add \
  --title "Хранение relations в Mr. Wolf" \
  --thread <thread-id> \
  --summary "relations.jsonl — canonical source, SQLite индексирует связи." \
  --body '## Ответ

relations.jsonl — canonical source of truth для связей. SQLite перестраивается при необходимости.' \
  --answers <info-request-id> \
  --supports "Phase 4 design" \
  --evidence "docs/superpowers/specs/2026-06-29-memory-control-plane-design.md"
```

`--answers`, `--supports`, `--evidence` — списки через запятую.

**Рекомендуемые разделы тела статьи:** Summary, Context, Answer, Options Considered, Recommendation, Evidence, When To Revisit.

### 4.4. Decision (Решение)

**Что это:** зафиксированный выбор, который влияет на архитектуру, поведение или процесс проекта.

**Когда создавать:**

- выбрали подход, библиотеку, формат или соглашение — и хотите, чтобы будущие сессии знали почему;
- нужно отменить или заменить предыдущее решение;
- решение связано с тредом и должно отображаться в его контексте.

**Пример:**

```bash
wolf decision add \
  --title "Хранить связи в relations.jsonl" \
  --thread <thread-id> \
  --based-on <article-id> \
  --body "Источник правды для связей — relations.jsonl. SQLite-индекс перестраивается при необходимости."
```

`--based-on` — список id артефактов-оснований через запятую (создаёт связи `based_on` / `basis_for`).

**Что хранится в решении:** `title`, `body`, `thread` (опционально), `status` — `active`, `superseded`, `rejected`, `obsolete`.

### 4.5. Blocker (Препятствие)

**Что это:** проблема, которая останавливает или замедляет работу, с описанием влияния и возможного обходного пути.

**Когда создавать:**

- работа не может продолжаться, пока не решена внешняя или внутренняя проблема;
- нужно зафиксировать риск и его влияние на тред;
- нашли обходной путь, но хотите отслеживать первопричину.

**Пример:**

```bash
wolf blocker add \
  --title "Нет доступа к production API" \
  --thread <thread-id> \
  --impact "Невозможно проверить интеграцию с платёжным шлюзом" \
  --workaround "Использовать мок-сервер и тестовые учётные данные"
```

Отметить решённым (с опциональной ссылкой на артефакт-решение):

```bash
wolf blocker resolve <blocker-id> --by <artifact-id>
```

**Что хранится в препятствии:** `title`, `impact`, `workaround` (опционально), `thread` (опционально), `status` — `active`, `resolved`, `obsolete`.

### 4.6. Thread Brief (Бриф треда)

**Что это:** собранный контекст для старта новой сессии.

**Что показывает:** цель и текущее состояние треда; открытые info-request; статьи; отвеченные запросы; `next_steps`; `decisions`; `blockers`.

**Когда использовать:** в начале новой сессии, чтобы вспомнить, где остановились; перед продолжением работы после перерыва.

```bash
wolf thread brief <thread-id>
```

Списки артефактов: `wolf thread list`, `wolf info-request list --thread <id>`, `wolf article list --thread <id>`, `wolf decision list --thread <id>`, `wolf blocker list --thread <id>`.

### 4.7. Session: checkpoints и wrap-up

`session-checkpoint` — снимок состояния треда на момент завершения сессии (фиксирует `current_state` и связанные артефакты).

```bash
wolf session checkpoint --thread <thread-id>

# Что изменилось с момента чекпоинта (команда верхнего уровня diff):
wolf diff <thread-id> --since <checkpoint-id>
```

`diff` показывает: изменение `current_state`; добавленные и удалённые связанные артефакты; новые relations.

`session wrap-up` — вручную создать итоговую сводку недавних событий:

```bash
wolf session wrap-up --title "Phase 4 завершена" --tags "phase4,relations"
```

### 4.8. Rule (Правило)

**Что это:** правило поведения агентов в проекте. Создаётся только пользователем (`add` помечен «user only»).

```bash
wolf rule add \
  --title "Не запускать миграции без --dry-run" \
  --body "Любая миграция — сначала dry-run, потом --apply." \
  --scope project \
  --applies-to "src/migrations/**" \
  --trigger "Перед запуском migrate"
```

`--scope project|global`; `--applies-to` — пути/паттерны через запятую; `--trigger` — когда применять. Список: `wolf rule list`.

---

## 5. Состояние проекта и холодный старт

Протокол начала каждой новой сессии: сначала состояние проекта из памяти Wolf, потом работа.

| Команда         | Что делает                                                         |
| --------------- | ------------------------------------------------------------------ |
| `wolf scan`     | Сканирует проект и сохраняет снимок контекста                      |
| `wolf brief`    | Генерирует агентский бриф из последнего скана и памяти             |
| `wolf call`     | Выдаёт активные call-инъекции (правила/уроки, попавшие в контекст) |
| `wolf recap`    | Сводка активной памяти: правила, треды, блокеры, вопросы, решения  |
| `wolf insights` | Эвристический анализ паттернов памяти (Level 1, без LLM)           |

Холодный старт сессии:

```bash
wolf call --for "миграции памяти"   # инъекции по теме (бюджет --compact, по умолчанию 1200)
wolf brief                          # бриф проекта
```

Флаги `call`: `--for <topic>` (тема), `--thread <id>` (режим треда), `--compact [chars]` (бюджет компактного вывода).

`insights` — линзы анализа: `--type patterns|technical_debt|decisions|lessons|activity`, фильтр `--topic <topic>` (точный тег или подстрока в заголовке/теле).

### 5.1. solve — пакет решения проблемы памяти

Собирает контекст по проблеме памяти («solve pack»):

```bash
wolf solve "Поиск показывает устаревшие решения без пометки superseded" --save --thread <thread-id>
```

`--save` — сохранить запрос на починку памяти; `--thread` — привязать его к треду.

### 5.2. think — структурированное мышление

Последовательность «цель → мысли → решение» с сохранением трассировки в решение:

```bash
wolf think start --goal "Выбрать формат хранения связей" --thread <thread-id>
# ... возвращает sequence id
wolf think add --sequence <seq-id> --type hypothesis --text "relations.jsonl достаточно для MVP"
wolf think add --sequence <seq-id> --type evidence --text "Объём связей мал, joins не нужны"
wolf think conclude --sequence <seq-id> \
  --title "Связи в relations.jsonl" \
  --body "Canonical source — relations.jsonl; SQLite перестраивается."
```

Типы мысли: `hypothesis`, `reasoning`, `evidence`, `concern`. Передумали — `wolf think abandon --sequence <seq-id>` (без создания решения).

### 5.3. council — совет

Механика коллективных решений по `council-question`:

```bash
# Подсчёт голосов: кворум и порог консенсуса 0..1 (по умолчанию 0.5)
wolf council tally --question-id <qid> --quorum 3 --threshold 0.6

# Синтез рекомендации из мнений совета
wolf council synthesize --question-id <qid> --recommendation "Переходим на вариант B"
```

---

## 6. Процессы

### 6.1. bootstrap — двухуровневый старт проекта

Два уровня запуска Wolf в проекте:

1. **`wolf init`** — создать скелет памяти (структура `.wolf/`).
2. **`wolf bootstrap`** — просканировать проект и подготовить черновик стартовой памяти: предложенные правила, ссылки на документы (document-refs), рабочий тред. Наполнение курирует Стюард.

```bash
wolf bootstrap --created-by agent:steward
```

### 6.2. scaffold — фреймы opencode + playbook

Создаёт фрейм opencode (`agent` | `skill` | `command`) и playbook в памяти Wolf:

```bash
wolf scaffold agent api-reviewer \
  --persona "Ты ревьюер API-контрактов..." \
  --model "glm-4.7"

wolf scaffold skill db-migrations --from-playbook <playbook-id>
```

`--persona` и `--model` — только для `agent`; `--from-playbook` — переиспользовать существующий playbook вместо создания нового.

### 6.3. run — запуск opencode с маршрутизацией

Запускает opencode с моделью из routing-объекта Wolf и пишет весовую стоимость токенов в журнал:

```bash
wolf run "Проверь контракт add --set" \
  --agent api-reviewer \
  --title "Проверка контракта add" \
  --tool cli-dump
```

Флаги: `--agent <name>`, `--title` (метка в журнале), `--session <sid>` (продолжить сессию), `--tool <name>` (повторяемый — отметить используемые инструменты).

### 6.4. complain — жалоба на агента/методологию

Жалоба — «горячий сигнал» для Стюарда: она запускает пересмотр playbook и может привести к его новой версии. Подробности — [протокол жалоб](complaint-protocol.md).

```bash
wolf complain --about skill:apprentice --text "Игнорирует --latest при get и читает устаревшую версию"
```

`--about` — цель жалобы: id playbook, id агента или имя skill (например, `skill:apprentice`).

---

## 7. Инструменты (tool-экономика)

Скрипты регистрируются как объекты памяти с контрактом и переиспользуются вместо написания новых. Подробности — [гайд tool-экономики](tool-economy.md).

```bash
# Зарегистрировать скрипт (копируется в .wolf/tools/)
wolf tool register scripts/dump-help.ts \
  --name cli-dump \
  --language typescript \
  --contract-in "нет" \
  --contract-out "markdown-файлы с --help" \
  --contract-env "WOLF_ACTOR" \
  --notes "Дамп help для reference" \
  --force  # пропустить проверку похожих инструментов

# Посмотреть, что зарегистрировано (статусы: active|candidate|deprecated|archived)
wolf tool list --status active

# Отметить использование (счётчик + напоминание контракта)
wolf tool use cli-dump

# Сгенерировать .opencode/skills/<name>/SKILL.md из объекта (идемпотентно)
wolf tool expose cli-dump

# Вывести из эксплуатации и вернуть
wolf tool deprecate cli-dump --reason "Заменён на rtk"
wolf tool revive cli-dump

# Счётчики использования + экономика переиспользования (.wolf/run-log.jsonl)
wolf tool stats
```

`tool register` перед регистрацией проверяет похожие инструменты — не пишите новый скрипт, пока не искали существующий (search-before-write, см. [правила](#13-важные-правила)).

---

## 8. Самообучение и эффективность

Цикл самообучения Wolf: сигнал-лог → паттерны → черновик урока → валидация → активация. Подробности: [Стюард и обучение](steward-learn.md), [signal-log](signal-log.md).

```bash
# Активные паттерны: живые счётчики, свежие примеры, ссылки на evidence
wolf learn digest

# Здоровье сигнал-лога: объёмы, пороги, мета-метрики Layer 1-2, drift
wolf learn status

# Черновик урока/правила из активного паттерна (механический генератор, без LLM)
wolf learn propose repeated-grep-miss --negative  # --negative: анти-правило, запрещающее тул

# Sandbox Replay Holdout: повтор черновика на tool_error-событиях после его создания
wolf learn validate <draft-id>

# Активация валидированного черновика (гейт: holdout пройден или --human-approved)
wolf learn activate <draft-id> --human-approved
```

Специализированные прогоны:

- `wolf learn gate` — STOP-гейт (Ф23): pressure-сценарии доставки + проба read-only зоны; отдельный запуск, вне `check`.
- `wolf learn decay [--dry-run]` — Ф26: decay-прогон по пробегу (сессии) — очередь `review_required`, реактивация, drift.
- `wolf learn evolve <template-id> [--write]` — Ф24 (GEPA): кандидат против текущего шаблона `.wolf/templates/<id>.md` по детерминированной метрике; `--write` записывает `<id>.candidate.md`, активация — только человек.
- `wolf learn route` — Ф25: эвристика глубины ревью по признакам задачи (рекомендация; решение за человеком). Флаги: `--type feature|bugfix|refactor|docs|experiment`, `--files <n>`, `--lines <n>`, `--blast-radius 0..1`, `--touches-read-only`, `--security`, `--metricless`.

Панель эффективности памяти (агрегация, без LLM): rules holdout, tool economy, delivery, noise, routing:

```bash
wolf effectiveness
```

Подробности — [гайд effectiveness](effectiveness.md).

---

## 9. Legacy

- `wolf migrate [--apply]` — **разовая** миграция старой структуры памяти: `objects/<type>/` → `threads/<tid>/<subdir>/` + `shared/`. По умолчанию dry-run; `--apply` выполняет перенос. Для свежих проектов не нужна.
- `wolf migrate run-log` — архивирует устаревший `.wolf/run-log.jsonl` в `.wolf/metrics/archive/run-log-<дата>-legacy.jsonl` (rename, без перезаписи содержимого; коллизия имени → суффикс `-2`). Запусти после обновления, если `wolf run` раньше писал run-лог: пока legacy-файл на месте, analytics считает старые прогоны дважды. Идемпотентно: файла нет → `nothing to migrate`, exit 0.

---

## 10. Связи между сущностями

```text
work-thread
  ├── info-request
  │     └── answered_by article
  ├── article
  │     └── may support future decision
  ├── decision
  └── blocker
```

- `info-request` всегда привязан к `work-thread`.
- `article` привязан к `work-thread` и может отвечать на один или несколько `info-request`.
- `decision` и `blocker` могут быть привязаны к `work-thread` или существовать независимо.

Явные связи хранятся в `.wolf/memory/relations.jsonl`; frontmatter остаётся только для читаемости.

Автоматические связи:

- `article` с `--answers <ireq-id>` → `article answers info-request` и обратная `info-request answered_by article`;
- `decision` с `--based-on <artifact-id>` → `decision based_on article` и `article basis_for decision`;
- `blocker` с `--thread <thread-id>` → `blocker blocks work-thread`;
- `blocker resolve <id> --by <artifact-id>` → `artifact resolves blocker`.

Произвольные связи добавляются вручную: `wolf relation add <subject> <predicate> <object>`.

---

## 11. Типичный рабочий процесс

### Сессия A: холодный старт и основная работа

```bash
# 1. Холодный старт: состояние проекта из памяти
wolf call --for "тема задачи"
wolf brief

# 2. Создать тред (если работы ещё нет)
wolf thread create --title "Название задачи" --goal "Чего хотим достичь"

# 3. В процессе: решение и отложенный вопрос
wolf decision add --title "Выбор X" --thread <thread-id> --body "Почему X"
wolf info-request create \
  --title "Вопрос" \
  --thread <thread-id> \
  --question "..." \
  --detour-reason "..." \
  --expected-answer "..." \
  --preliminary-answer "..."

# 4. Зафиксировать урок (самообучение)
wolf add --type lesson --title "..." --body "..." --tags "..." --created-by agent:worker

# 5. В конце: чекпоинт и сводка
wolf session checkpoint --thread <thread-id>
wolf session wrap-up --title "Сессия A: сделано ..." --tags "thread-a"
```

### Сессия B: ответ на вопрос

```bash
wolf call --for "тема вопроса"
wolf info-request list --thread <thread-id>

wolf article add \
  --title "Ответ на вопрос" \
  --thread <thread-id> \
  --summary "..." \
  --body "..." \
  --answers <info-request-id>
```

### Сессия C: продолжение основной работы

```bash
wolf call --thread <thread-id>
wolf thread brief <thread-id>
wolf diff <thread-id> --since <checkpoint-id>   # что изменилось с прошлой сессии
```

---

## 12. Статусы артефактов

**Work thread:**

- `active` — в работе
- `paused` — приостановлен
- `completed` — завершён
- `archived` — в архиве

**Info request:**

- `open` — открыт
- `answered` — отвечен
- `rejected` — отклонён
- `obsolete` — устарел
- `archived` — в архиве

**Article:**

- `proposed` — предложен агентом
- `accepted` — принят
- `stale` — устарел
- `superseded` — замещён
- `archived` — в архиве

**Decision:**

- `active` — действует
- `superseded` — замещено новым решением
- `rejected` — отклонено
- `obsolete` — устарело

**Blocker:**

- `active` — активно мешает
- `resolved` — решено
- `obsolete` — устарело

**Tool (инструмент):**

- `active` — активен
- `candidate` — кандидат
- `deprecated` — выведен из эксплуатации
- `archived` — в архиве

---

## 13. Важные правила

1. **Не копируйте документы целиком.** Регистрируйте их по ссылке и добавляйте выжимку.
2. **Не используйте info-request как TODO.** Это для знаний, а не задач.
3. **Давайте предварительный ответ.** Перед созданием info-request скажите, что вы думаете сейчас.
4. **Обновляйте current_state треда.** В конце сессии кратко опишите, что изменилось.
5. **Используйте thread brief в начале сессии.** Это экономит контекст.
6. **Создавайте session checkpoint перед перерывом.** Это позволит потом сделать `diff`.
7. **Явно связывайте артефакты.** Relations помогают понять, почему появилось решение или статья.
8. **Search-before-write для скриптов.** Перед написанием нового скрипта ищите существующий: `wolf tool list`, `wolf search`. Регистрация (`tool register`) сама проверяет похожие инструменты — не обходите это флагом `--force` без причины.
9. **Атрибуция.** Указывайте автора: `--created-by <actor>` или переменная `WOLF_ACTOR`. Без атрибуции невозможно понять, кто и почему создал объект.
10. **Замещайте, а не удаляйте.** Устаревшее знание — `supersede` + `get --latest`, чтобы история сохранялась.
11. **Держите документацию в курсе.** Это руководство должно отражать актуальные команды и рабочий процесс; при изменении CLI обновляйте его.

---

## 14. Шпаргалка команд

```bash
# Инициализация и доступ
wolf init                          # создать скелет памяти
wolf mcp                           # MCP-сервер (stdio)

# Память: базовые операции
wolf add --type lesson --title "..." --body "..." [--tags ...] [--confidence high] [--importance 0.7]
wolf get <id> [--latest]           # объект по id (по цепочке superseded_by)
wolf list [--type <t>] [--status <s>] [--stale]
wolf search "запрос" [--type <t>] [--tag <tag>] [--min-importance <n>] [--limit <n>] [--hide-superseded]
wolf supersede <old-id> <new-id>   # заменить устаревший объект
wolf transition <id> <status> [--actor <actor>]
wolf relation add <subj> <pred> <obj> [--source agent]
wolf taxonomy show                 # эффективная таксономия
wolf taxonomy sync                 # memory_types.core из код-канона
wolf rebuild-index                 # перестроить SQLite-индекс
wolf validate [--fix]              # целостность хранилища (—fix: карантин)

# Work threads и артефакты
wolf thread create --title "..." --goal "..." [--current-state "..."] [--next-steps "a,b"]
wolf thread list
wolf thread brief <thread-id>
wolf diff <thread-id> --since <checkpoint-id>
wolf info-request create --title "..." --thread <id> --question "..." --detour-reason "..." --expected-answer "..."
wolf info-request list --thread <id>
wolf article add --title "..." --thread <id> --summary "..." --body "..." [--answers <ireq-id>] [--supports ...] [--evidence ...]
wolf article list --thread <id>
wolf decision add --title "..." --body "..." [--thread <id>] [--based-on <artifact-id>]
wolf decision list --thread <id>
wolf blocker add --title "..." --impact "..." [--workaround "..."] [--thread <id>]
wolf blocker list --thread <id>
wolf blocker resolve <blocker-id> [--by <artifact-id>]
wolf session checkpoint --thread <thread-id>
wolf session wrap-up --title "..." [--tags "..."]
wolf rule add --title "..." --body "..." --scope project [--applies-to "..."] [--trigger "..."]
wolf rule list

# Состояние проекта и холодный старт
wolf scan                          # снимок контекста проекта
wolf brief                         # агентский бриф
wolf call [--for <topic>] [--thread <id>] [--compact 1200]
wolf recap                         # сводка активной памяти
wolf insights [--topic <t>] [--type patterns|technical_debt|decisions|lessons|activity]
wolf solve "проблема" [--save] [--thread <id>]

# Structured thinking и совет
wolf think start --goal "..." [--thread <id>]
wolf think add --sequence <seq> --type hypothesis|reasoning|evidence|concern --text "..."
wolf think conclude --sequence <seq> --title "..." --body "..."
wolf think abandon --sequence <seq>
wolf council tally --question-id <qid> [--quorum <n>] [--threshold 0.5]
wolf council synthesize --question-id <qid> --recommendation "..."

# Процессы
wolf bootstrap                     # скан + черновик стартовой памяти
wolf scaffold agent|skill|command <name> [--persona "..."] [--model "..."] [--from-playbook <id>]
wolf run "prompt" [--agent <name>] [--title "..."] [--session <sid>] [--tool <name>]
wolf complain --about skill:apprentice --text "..."

# Инструменты (tool-экономика)
wolf tool register <script-path> --name <name> [--language typescript] [--contract-in ...] [--contract-out ...] [--contract-env ...] [--notes ...] [--force]
wolf tool list [--status active|candidate|deprecated|archived]
wolf tool use <name-or-id>
wolf tool expose <name-or-id>      # (пере)создать .opencode/skills/<name>/SKILL.md
wolf tool deprecate <name-or-id> --reason "..."
wolf tool revive <name-or-id>
wolf tool stats

# Самообучение и эффективность
wolf learn digest                  # активные паттерны
wolf learn status                  # здоровье сигнал-лога
wolf learn propose <pattern-key> [--negative]
wolf learn validate <draft-id>     # Sandbox Replay Holdout
wolf learn activate <draft-id> [--human-approved]
wolf learn gate                    # STOP-гейт (Ф23)
wolf learn decay [--dry-run]       # Ф26
wolf learn evolve <template-id> [--write]  # Ф24 GEPA
wolf learn route [--type feature] [--files <n>] [--lines <n>] [--blast-radius 0..1] [--touches-read-only] [--security] [--metricless]
wolf effectiveness                 # панель эффективности памяти

# Legacy
wolf migrate [--apply]             # разовая миграция старой структуры (dry-run по умолчанию)
```
