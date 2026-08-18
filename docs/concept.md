# Mr. Wolf v2: Project Memory Substrate + Selective Orchestration

**Версия:** 2.0 (синтез: concept v1.0 + ранняя 9-слойная концепция + эксперимент wolf-experiment + экспертные сессии)
**Дата:** 2026-08-18
**Статус:** Концепция. Не спецификация API.

**Протокол чтения.** Каждое утверждение маркировано: **[built]** — реализовано в mr-wolf (Phases 0–7); **[proven]** — измерено в wolf-experiment (8 серий, ~70 автономных прогонов, 42 находки, opencode v1.18.18); **[hypothesis]** — правдоподобно, не проверено; **[designed]** — спроектировано, не реализовано; **[deprecated]** — изъято. Источники цифр: `wolf-experiment/REPORT.md` (канон), `HANDOFF.md`.

---

## TL;DR

Mr. Wolf — local-first memory substrate для AI coding agents.

**Ключевые решения v2:**
- Память — ядро: всё есть память (markdown + frontmatter + relations + FTS5)
- Flat by default: иерархия не окупается на специфицируемых задачах (+157…+1141% токенов)
- Council Mode и изолированное ревью — единственные окупающиеся формы оркестрации (+31% дефектов)
- 3 уровня агентов: wolf (thin, 11–18k) → executor → worker (однозадачный)
- Треды — физические каталоги `threads/<id>/` с подкаталогами по типам
- Enforcement — permission-glob платформы (M2–M4), не capability tokens
- Frontmatter — канон, Registry отклонён

**Доказано:** +31% дефектов в ревью, −29% full-токенов, докат ≈0.7× стоимости.

**Не делает:** редактирование кода, IDE-интеграция, веб-интерфейс, распределённая работа.



## 0. Позиционирование

**Терминологическое замечание:** В этом документе "Mr. Wolf" используется в двух смыслах (полные определения — см. §12 Глоссарий):

1. **Mr. Wolf Memory Substrate** — пассивное ядро памяти: `.wolf/memory/`, relations, FTS5, governance. Не агент, не оркестратор. Хранит данные, не принимает решений.

2. **Mr. Wolf Coordinator Agent** — активный агент-координатор (`agents/wolf.md`, k3-256k). Читает reports, создаёт briefs, принимает решения (Decision Authority), управляет агентами. Это **и агент, и оркестратор** в одном лице.

Вместе они образуют **Mr. Wolf** — проектную платформу памяти + выборочной оркестрации.

Ядро — построенный и работающий memory harness (Phases 0–7): markdown-объекты с frontmatter, JSONL event log, relations, FTS5-поиск, governance, session wrap-up. Вокруг ядра — три отмеренных слоя:

1. **Выборочная оркестрация** — council и изолированное ревью, единственные эмпирически окупающиеся формы иерархии.
2. **Эффективное редактирование памяти** — функции WolfFS как фазы mr-wolf, scope ограничен `.wolf/memory`.
3. **Автономность** — Decision Authority; пока гипотеза, предмет AUTONOMY-001.

Mr. Wolf (substrate) — **не** агент. Mr. Wolf (coordinator) — **не** оркестратор общего назначения, **не** IDE-агент, **не** фреймворк. Эксперимент опроверг экономику иерархии на всех специфицируемых классах задач: налог +157…+1141% токенов при паритете качества; пик контекста переезжает на executor'а (56–76k), а не исчезает. Окупается ровно одно: изолированное ревью критичных документов (+31% найденных дефектов, major ×2.2, full-токены −29%) и советы для спорных решений (11 советов, пересчёт голосов 10/10).

**Формула v2:**

> **Память — ядро. Flat by default. Council для ревью. Hierarchy — гипотеза для неспецифицируемого.**

Ценность — не экономия токенов, а процессные гарантии: трассируемость, докат, системные границы, непрерывность между сессиями.

---

## 1. Память как ядро системы

> Пометки раздела: **[реализовано]** — работает в harness'е (Phases 0–7); **[предлагается]** — часть v2, требует реализации.

### 1.1. Философия «всё есть память»

Mr. Wolf Memory Substrate — пассивный слой хранения данных. Агенты (wolf-coordinator, executor, worker, council members) работают **с** substrate, но не являются им. Wolf-агент-координатор использует substrate для хранения briefs, reports, decisions, council opinions.

Память — не служебная подсистема рядом с оркестрацией, а **ядро**: всё, что производит или потребляет любой агент (wolf, executor, worker, советник), существует как объект памяти. Оркестрационные артефакты — brief, report, council opinion — не файлы в отдельных каталогах, а типы памяти со стандартным жизненным циклом.

**Как это реализовано сегодня:**

- **Единый объект памяти [реализовано].** Каждый артефакт — markdown-файл с YAML-frontmatter в `.wolf/memory/threads/<id>/<тип>/` или `.wolf/memory/shared/<тип>/`. Frontmatter — канон: `id`, `type`, `title`, `status`, `review_state`, `confidence`, `importance`, `created_at`, `created_by`, `source`, `related`, `superseded_by`. Список типов — `MEMORY_TYPES` в `src/domain/memory-types.ts` (13 типов, hardcoded).
- **Файлы — source of truth [реализовано].** SQLite с FTS5 (`.wolf/cache/index.sqlite`) — производный, перестраиваемый индекс. События — append-only `events.jsonl` (audit trail). Связи — `relations.jsonl` (канон; зеркала в frontmatter генерируются из него).
- **Жизненный цикл вместо удаления [реализовано].** Статусы: `draft → active → superseded/archived`, плюс доменные (`open → answered/resolved`, `proposed → accepted/rejected`). Объекты не удаляются: `wolf supersede` связывает старый с новым. Сканер помечает пропавшие документы как `stale`.
- **Governance [реализовано, Phase 6].** `memory_class`, `truth_role`, `lifetime` по умолчанию от `createdBy`. Тип `rule` создаётся только пользователем. Переходы статусов валидируются `ALLOWED_TRANSITIONS`.
- **Сессионная непрерывность [реализовано, Phases 4, 7].** `session-checkpoint` фиксирует состояние нити; `session-summary` автоматически создаётся после lifecycle-событий или вручную (`wolf session wrap-up`). `wolf brief` генерирует производный снимок активной памяти — стартовый контекст новой сессии.
- **Инкрементальная видимость [реализовано, Phase 3].** Любая запись мгновенно обновляет FTS5-индекс.

### 1.2. Таксономия памяти v2

**Существующие типы (Phases 0–7):** `work-thread`, `decision`, `blocker`, `lesson`, `observation`, `article`, `info-request`, `open-question`, `document` (по ссылке, не копия), `context`, `rule` (только пользователь), `session-checkpoint`, `session-summary`.

**Новые оркестрационные типы [предлагается].** Файловый протокол эксперимента (каталоги `coordinator/`, `executor/`, `councils/`) становится типами памяти — с даром получаемыми жизненным циклом, relations, FTS5-поиском и governance:

| Тип | Назначение | Кто создаёт | Кто читает | Связи |
|---|---|---|---|---|
| `task-brief` | Задание wolf → executor/worker: контекст, критерии приёмки, ограничения | wolf | executor/worker | `based_on → work-thread`, `related_to → decision/rule` |
| `report` | Отчёт исполнителя: summary, изменения, валидация, проблемы | executor/worker | wolf, пользователь | `answers → task-brief`, `supports → decision` |
| `council-question` | Вопрос совету: варианты, критерии, состав, кворум | wolf | члены совета | `related_to → task-brief/decision` |
| `council-opinion` | Мнение члена совета; VOTE-контракт сохраняется | council-member | wolf (считает по объектам, не по самоотчётам) | `answers → council-question` |
| `synthesis` | Синтез совета: рекомендация, разногласия, кворум, confidence | wolf | пользователь | `based_on → council-opinion[]`, `supports → decision` |
| `escalation` | Эскалация к человеку: вопрос, контекст, почему wolf не решает сам | wolf | пользователь | `resolved_by → decision` |
| `decision-request` | Запрос решения от executor к wolf | executor | wolf | `answered_by → decision` |

Дисциплина наследуется: агентские объекты — `review_state: proposed`; решения по итогам совета становятся `decision` только после синтеза/утверждения. Эти типы — кандидаты в **core pack** Phase 8 (schema-driven taxonomy): поля описываются конфигом, а не кодом.


**Примеры шаблонов:**

```yaml
# threads/csv-export/tasks/2026-07-03-TASK-001-parser.brief.md
---
id: TASK-001
type: task-brief
thread: csv-export
status: active
executor: executor-lead
priority: high
timeout: 30m
created_at: 2026-07-03T10:00:00Z
related:
  - csv-export-spec
---

# Task: Implement CSV parser

## Acceptance Criteria
- Parse CSV with headers
- Handle quoted fields
- Return array of objects

## Constraints
- Use approved library from rule/approved-libraries
- Max 500 lines
```

```yaml
# threads/csv-export/tasks/2026-07-05-TASK-001-parser.report.md
---
id: REPORT-001
type: report
thread: csv-export
status: completed
created_at: 2026-07-05T11:30:00Z
answers: TASK-001
---

# Report: CSV parser implemented

## Summary
Implemented CSV parser using PapaParse.

## Changes
- src/utils/csv-parser.ts (new, 120 lines)
- tests/csv-parser.test.ts (new, 45 lines)

## Validation
- All tests pass
- Coverage: 92%

## Issues
- None
```

### 1.3. Память как субстрат оркестрации

Оркестрация (там, где она оправдана эмпирикой) реализуется **чтением и записью объектов памяти**, а не отдельным файловым протоколом поверх каталогов.

- **Thin context wolf [предлагается, механики есть].** Контекст wolf'а собирается из памяти: `wolf recap`/`brief` (активные rules, нити, blockers, последние decisions) + `thread brief` для активной нити + обход графа `task-brief → council-question → council-opinion[] → synthesis` по `relations.jsonl`. Эмпирика: thin wolf 11–18k токенов реален, если wolf читает метаданные, а не тела документов **[proven]**.
- **Executor и workers [предлагается].** Executor стартует с одного объекта: `wolf get <task-brief-id>`; всё необходимое подтянуто по relations. Worker пишет результат как `report`. Нет report-объекта — нет результата. Побочный вопрос — `info-request` с обязательным `preliminary_answer` **[реализовано]**: механика «не раздуй контекст» уже существует.
- **Докат после прерывания [механика реализована, применение предлагается].** В эксперименте докат обеспечивал файловый протокол (kill+resume ≈ 0.7× стоимости **[proven]**). В v2 это свойство памяти: новая сессия восстанавливается из объектов — brief нити + последний checkpoint + открытые `task-brief` без `report` = недоделанная работа. Отдельный `state.json` нити (layout ранней 9-слойной концепции) не нужен и изымается.
- **Эскалация к человеку [предлагается].** Эскалация — объект `escalation` со статусом `open`, не сообщение в чат. Ответ пользователя — `decision` (`accepted`), связанный `resolved_by`. Открытые эскалации видны в `wolf recap`: пользователь получает очередь вопросов, а не поток прерываний.
- **Handoff между сессиями [реализовано].** `session-summary` (авто + wrap-up) — последняя запись уходящей сессии; `wolf recap` — первое чтение приходящей. Handoff = пара объектов памяти, а не ручной пересказ.

### 1.4. Структура хранения

**Физическое разделение по тредам, подкаталоги по типам внутри треда.**

```text
.wolf/
  config.yaml                # таксономия, artifact_sources [Phase 8]
  memory/
    threads/                 # Треды (физические каталоги)
      csv-export/            # Тред = каталог
        WORK-THREAD.md       # {id: csv-export, status: active}
        documents/           # Спеки, планы, ревью
          2026-07-01-spec.md
          2026-07-02-plan.md
          2026-07-15-spec.md         # обновлённая версия
        tasks/               # Task briefs и reports (пары)
          2026-07-03-TASK-001-parser.brief.md
          2026-07-05-TASK-001-parser.report.md
        decisions/           # ADR
          2026-07-04-ADR-001-library.md
        councils/            # Советы
          2026-07-08-QUESTION-001.md
          2026-07-08-OPINION-001-architect.md
          2026-07-08-SYNTHESIS-001.md
        sessions/            # Checkpoints и summaries
          2026-07-09-checkpoint.md
      auth-refactor/
        ...
    shared/                  # Shared объекты
      rules/
        2026-06-01-coding-standards.md
      decisions/
        2026-06-10-tech-stack.md
    relations.jsonl          # канон для связей
    events.jsonl             # audit trail
    briefs/                  # производные снимки
  cache/index.sqlite         # производный FTS5-индекс
```

**Почему физическая группировка:**
- **Удаление треда** — `rm -rf threads/<id>/` + обновление индексов. Атомарно.
- **Визуальная навигация** — без grep видно что принадлежит треду.
- **Изоляция** — параллельная работа без конфликтов.

**Почему подкаталоги по типам:**
- Человек ищет файлы по типу ("где спеки?")
- 100+ файлов в плоском каталоге нечитабельны
- Агентам всё равно (они через FTS5)
- Git-история стабильна

**Обязательные подкаталоги:**
- `documents/` — спеки, планы, ревью
- `tasks/` — task briefs и reports

**Опциональные (создаются при первом объекте):**
- `decisions/`, `councils/`, `escalations/`, `lessons/`, `blockers/`, `sessions/`

#### Правила именования файлов

**Формат:** `YYYY-MM-DD-<slug>.md`

- Дата создания объекта (ISO 8601), сортируется лексикографически
- Slug: kebab-case, описательный
- Разделитель: `-`

**Версионирование:**
- Новая версия = новый файл с новой датой
- Старый файл помечается `superseded` в frontmatter
- Связь через `supersedes` в relations.jsonl
- Не использовать `-v1`, `-v2` в имени

**Парные объекты (brief/report):**
- ID задачи в имени для парности
- Дата у каждого объекта своя (дата создания)

**Объекты одного совета:**
- Все имеют одну дату (дату создания вопроса)

**Scope:**
- `threads/<id>/` — объекты треда, изолированы
- `shared/` — объекты, видимые всем тредам (`thread: null` в frontmatter)

**Код остаётся кодом.** Документы проекта регистрируются **по ссылке** (`document` с `source.path`, content hash, `stale` при пропаже) **[реализовано]**. Копирование тел документов в память — анти-паттерн.

**Каталоги эксперимента (`coordinator/`, `executor/`, `councils/`) упраздняются**: их содержимое — типы памяти, их протокол — use-case'ы harness'а.

### 1.5. Связи и навигация

`relations.jsonl` — канонический граф; предикаты: `answers/answered_by`, `supports/supported_by`, `based_on/basis_for`, `updates/updated_by`, `supersedes/superseded_by`, `blocks/blocked_by`, `resolves/resolved_by`, `related_to`, `produced_by` **[реализовано, Phase 4]**. Этого достаточно для оркестрационной цепочки:

```text
work-thread
  └─ task-brief ──based_on──▶ decision/rule
       ├─ answered_by ──▶ report ──supports──▶ decision ──basis_for──▶ lesson
       └─ council-question ──answered_by──▶ council-opinion[]
              └─ synthesis ──based_on──▶ opinion[] ──supports──▶ decision
escalation ──resolved_by──▶ decision
```

Wolf использует граф как механизм селекции контекста: стартовая точка (нить) → обход на 1–2 ребра → в контекст попадают только связанные объекты нужного типа и статуса. Superseded-цепочки дают историю решений без шума.

**Пример relations.jsonl:**

```jsonl
{"source": "2026-07-03-TASK-001-parser", "predicate": "based_on", "target": "2026-07-01-csv-export-spec", "created_at": "2026-07-03T10:00:00Z"}
{"source": "2026-07-05-TASK-001-parser-report", "predicate": "answers", "target": "2026-07-03-TASK-001-parser", "created_at": "2026-07-05T11:30:00Z"}
{"source": "2026-07-15-csv-export-spec", "predicate": "supersedes", "target": "2026-07-01-csv-export-spec", "created_at": "2026-07-15T14:00:00Z"}
```

Формат: одна строка = одна связь. JSON с полями `source`, `predicate`, `target`, `created_at`. Append-only.

### 1.6. Пробелы памяти (честно)

1. **Schema-driven taxonomy [Phase 8, roadmap-v2]** — типы hardcoded; оркестрационные типы должны войти через core pack + `.wolf/config.yaml`.
2. **Reference-индекс** — ссылки вида REQ-001 внутри тел не извлекаются; нужен сканер ссылок, порождающий relations из тел.
3. **Запросы по графу** — нет user-facing обхода («покажи цепочку brief → report → decision»); нужна команда вида `wolf thread graph <id>`.
4. **Оркестрационные use-case'ы** — создание `task-brief`/`council-*`/`synthesis`/`escalation`, подсчёт VOTE по объектам, проверка кворума — новые use-case'ы поверх существующего write protocol и governance.
5. **Открытые вопросы активной памяти** — расширяемость предикатов relations; snapshot vs ids в checkpoint'ах.


### 1.7. Треды (workstreams)

**Тред** — **физический каталог** в `.wolf/memory/threads/<id>/` с подкаталогами по типам объектов. Логическая связь дополнительно отражается полем `thread` в frontmatter (для FTS5-поиска и relations).

**Почему физическая группировка:**
- Удаление треда = `rm -rf threads/<id>/` (атомарно)
- Визуальная навигация без grep
- Изоляция при параллельной работе
- Поле `thread` в frontmatter дублирует каталог для поиска

#### Структура

```text
.wolf/memory/
├── threads/
│   ├── csv-export/
│   │   ├── WORK-THREAD.md
│   │   ├── documents/
│   │   │   ├── 2026-07-01-spec.md
│   │   │   ├── 2026-07-02-plan.md
│   │   │   └── 2026-07-15-spec.md      # superseded
│   │   ├── tasks/
│   │   │   ├── 2026-07-03-TASK-001-parser.brief.md
│   │   │   └── 2026-07-05-TASK-001-parser.report.md
│   │   ├── decisions/
│   │   │   └── 2026-07-04-ADR-001-library.md
│   │   └── sessions/
│   │       └── 2026-07-09-checkpoint.md
│   └── auth-refactor/
│       └── ...
└── shared/
    ├── rules/
    │   └── 2026-06-01-coding-standards.md
    └── decisions/
        └── 2026-06-10-tech-stack.md
```

**Scope:**
- `threads/<id>/` — физический каталог треда, объекты изолированы
- `shared/` — каталог общих объектов (`thread: null` в frontmatter)

**Удаление треда:**
```bash
wolf thread delete csv-export  # rm -rf threads/csv-export/ + обновление индексов
```

**Архивация треда:**
```bash
wolf thread archive csv-export  # mv threads/csv-export/ → archive/csv-export/
```

#### Жизненный цикл

```
create → active → completed → archived
```

**Активные треды видны в `wolf thread list --status active`.** Завершённый тред не удаляется — история сохраняется.

#### Handoff между сессиями

**Ключевой механизм для параллельной работы:**

1. **Конец сессии**: `wolf session wrap-up`
   - Создаёт `session-summary` с `thread: csv-export`
   - Создаёт `session-checkpoint` с `thread: csv-export`

2. **Начало новой сессии**: `wolf recap`
   - Читает последний `session-summary` для активного треда
   - Загружает активные `task-brief` без `report`
   - Восстанавливает контекст ~5k токенов, не перечитывая все документы

**Результат:** Два треда могут работать параллельно, контекст не смешивается.

#### Поиск внутри треда

```bash
wolf search "parser" --thread csv-export   # только в треде
wolf search "parser"                       # все треды, группировка по тредам
```

#### Связь с оркестрацией

- Council Mode: `council-question`, `council-opinion`, `synthesis` создаются с `thread: <id>`
- Decision Authority: `decision` и `escalation` с `thread: <id>`
- Executor: `task-brief` и `report` с `thread: <id>`

Все объекты совета/решений видны в контексте треда.

#### Пробелы

1. **Миграция между тредами** — изменить `thread` и пересоздать relations
2. **Cross-thread dependencies** — связи через `related_to` с явным указанием
3. **Thread merging** — если два треда оказались одной задачей


---


**Пример session-checkpoint:**

```yaml
# threads/csv-export/sessions/2026-08-19-checkpoint.md
---
id: CHECKPOINT-2026-08-19-14-30
type: session-checkpoint
thread: csv-export
created_at: 2026-08-19T14:30:00Z
related:
  - 2026-07-01-csv-export-spec
  - 2026-07-02-csv-export-plan
open_tasks: [TASK-003, TASK-004]
open_escalations: []
context_refs:
  - approved-libraries
  - coding-standards
  - csv-library
---

# Checkpoint

## Context Restored
- 2 active tasks pending
- 0 open escalations
- Spec and plan locked
```

## 2. Агенты и оркестрация

> Статусный протокол раздела: **[доказано]** — измерено в wolf-experiment; **[гипотеза]** — не проверено; **[опровергнуто]** — измерено и отвергнуто.

### 2.1. Философия: flat-first, selective orchestration

Эксперимент опроверг посылку «иерархия окупается на сложных задачах». Скорректированные налоги оркестрации против flat-агента той же сильной модели:

| Класс задачи | Эксперимент | Налог ORCH | Качество | Вердикт |
|---|---|---|---|---|
| Малые код-задачи | COST-001 | +274…+1141% new, время ×4–9 | паритет | FLAT |
| Реализация / миграция | LONG-001/002 | +157…+347% new, время ×1.5–2 | паритет | FLAT |
| Исследование + веб-синтез | RESEARCH-001 | +258% new, время ×1.35; источников вдвое меньше | паритет | FLAT |
| Итеративное ревью зрелого документа | REVIEW-001 | new +46%, **full −29%**, время ×1.7 | **дефектов +31%, major ×2.2** | ORCH |

**[доказано]** Специфицируемая задача — однопроходная для сильной модели 2026 года (находка 28). Иерархия на таких задачах — процессный налог, не экономия.

Решение о схеме принимает **роутер задач** — классификатор в wolf, работающий до спавна кого-либо:

| Сигнал в запросе | Маршрут | Основание |
|---|---|---|
| Задача специфицируема (спека, критерии приёмки, Definition of Done): реализация, миграция, исследование | **FLAT** — один агент сильной модели | COST/LONG/RESEARCH: паритет при налоге +157…+1141% |
| Зрелый критичный документ требует ревью; решение с конфликтом перспектив | **COUNCIL / изолированное ревью** | REVIEW-001 + 11 советов |
| Задача неспецифицируема: отладка legacy без спеки, противоречивые требования, «сделай как лучше» | **HIERARCHY** | **[гипотеза]** — capacity-предел flat не воспроизведён (находка 22). До проверки — не заявлять как факт |

При сомнении — FLAT: дешевле, и эскалация к оркестрации возможна в середине работы, обратная — нет.

### 2.2. Три уровня агентов

```text
wolf (координатор, k3-256k)         — брифы, решения, синтез; кода не касается
└── executor (менеджер задачи, glm-5.x) — декомпозиция, диспетчеризация, отчёт
    └── workers (однозадачные, glm-5-turbo) — одна подзадача, без права спавна
```

- **wolf — thin.** Пик контекста 11–18k на широких задачах — втрое тоньше flat-агента (47–51k). **[доказано]** Работает только с метаданными: brief / decision / report / VOTE / VERDICT.
- **executor — честное признание.** Пик контекста **не исчезает, а переезжает**: 56–76k, в 2 из 3 прогонов выше пика flat. **[доказано, находка 27]** Заявлять можно «тонкий координатор», не «экономию контекста схемы». В ревью-схеме пик распараллеливается: каждый ревьюер в чистой сессии.
- **worker — однозадачный.** Одна подзадача в промпте; `task: deny`; результат — короткий статус + файлы по allowlist'у брифа.

Контекст-бюджеты как дисциплина брифов: воркеру — только подзадача; executor'у — бриф, не кодовая база; wolf'у — отчёты, не код. Распухший wolf = утечка исполнения наверх.

### 2.3. Режимы работы wolf: 3 вместо 6

- **Discovery** — прояснение нечёткого запроса: wolf сам, без спавнов, диалог до специфицируемости. Итог — классификация роутером.
- **Execution** — исполнение по выбранной схеме (FLAT / COUNCIL / HIERARCHY), контракты памяти, приёмка по отчётам и независимой верификации.
- **Review** — отчёт пользователю, утверждение, эскалации.

**Monitoring и Quick Lookup — не режимы, а поведение**: проверка журналов и быстрый ответ по памяти случаются внутри любого режима. Council — не режим wolf'а, а маршрут задачи. Измеренной пользы от 6-режимной машины эксперимент не показал.

### 2.4. Council Mode

**[доказано]**: 11 советов, 8 сценариев; пересчёт голосов по файлам совпал с синтезами wolf'а 10/10.

- **Составы** — роли-перспективы: architect, security (сильная модель), performance, ux, cost (быстрые). Член совета read-only: ровно один объект мнения, без task, без bash.
- **VOTE-контракт**: `VOTE: A|B|C|ABSTAIN|TIMEOUT` — машиносчитаемо. Отсутствующее мнение = TIMEOUT. Wolf считает **строго по объектам, не по самоотчётам** (находка 9).
- **Кворум и консенсус**: quorum — минимум валидных голосов; consensus_threshold — доля победителя (1.0 — единогласие, для security-советов). В конфиге совета.
- **Эскалация**: консенсус не достигнут ИЛИ вопрос human_required → wolf не решает; пишет `escalation`, останавливается; решение человека — вторым запуском, `final-decision`.
- **Триггер «бриф с развилками» (SPLIT-001, находки 14–16)**: раскол планов требует **задачи-развилки**, не конфликта приоритетов. При свободном брифе планировщики с конфликтующими философиями сошлись на аттракторе. Совет собирается, когда бриф содержит реальные развилки без критерия выбора; если критерий есть — wolf разрешает сам. Если нужен гарантированный human-in-the-loop — помечать решение human_required явно.

### 2.5. Изолированное ревью (паттерн REVIEW-001)

Единственная эмпирически доказанная ниша оркестрации:

- **Раунды по перспективам**: security → completeness → consistency; каждый ревьюер узкий (чужие замечания запрещены), в чистой сессии, read-only, машиносчитаемый формат issues + `SUMMARY: X critical / Y major / Z minor`. Автор применяет замечания между раундами.
- **Почему работает (находка 32)**: изоляция бьёт по слепым зонам саморевью. Плюс экономика full-токенов −29% (находка 33): каждый ревьюер читает документ один раз; flat перечитывает с накопленной историей.
- **VERDICT-контракт**: `VERDICT: APPROVED|CHANGES` первой строкой.
- **Слепой судья** — стандарт приёмки документ-продуцирующих задач: анонимные копии, seed-перемешивание, маппинг под спудом, независимая сессия. Дёшево и воспроизводимо.
- **Честные оговорки**: судья-дженералист не отличил финалы от базы (находка 34) — иерархическое ревью — процессор поиска дефектов, не генератор измеримо лучшего документа. Для молодых документов эффект может быть выше — **[гипотеза]**. Ревью «для галочки» зрелого документа — flat.

### 2.6. Системная дисциплина (enforcement): два слоя

**Слой 1 — платформенный (главный).** Механика opencode v1.18.18, реестр M1–M12 **[доказано]**:

- Тул `task` субагентам **denied по умолчанию** (M2); вложенный спавн включается `permission.task` с glob-границами «кто кого спавнит» (M3). Нарушение падает с информативной ошибкой. Без разрешения субагент импровизирует CLI-обход.
- `subagent_depth: 2` режет третий уровень в рантайме (M4).
- **Плагин spawn-logger**: JSONL-журнал всех спавнов + жёсткий лимит воркеров (throw в before-хуке). Before-хук срабатывает **до permission-проверки** (M7) — журнал видит и отклонённые попытки. Системная правда — журнал + независимые verify-скрипты, не самодекларации (находки 6, 8).

**Слой 2 — промптный.** Контракты ролей: «wolf не пишет код», «ревьюер read-only», VOTE/VERDICT-форматы, allowlist файлов в брифах воркеров.

**Честные отказы:**

- **Capability tokens из ранней концепции — избыточны** [deprecated]: permission.task + glob + depth делают то же нативно и жёстче.
- **Дыра M8 — известное ограничение**: permission-стена покрывает только встроенные тулы; MCP/кастом-тулы проходят мимо `bash: deny`. Помнить при выдаче MCP-тулов нижним уровням.
- Версия-зависимость: M1–M12 проверены на v1.18.18; при апгрейде — перепроверка smoke'ами.

### 2.7. Decision Authority

- **autonomous** — выбор из approved lists (библиотеки, паттерны, стандарты), реализация в рамках плана, мелкие фиксы.
- **advisory** — решения с конфликтом перспектив: совет, wolf решает по синтезу.
- **human_required** — scope, breaking changes, удаление функциональности, компромиссы между требованиями.

**Статус: [не проверено].** Эксперимент измерял эффективность, не автономность. Частичное подтверждение: SPLIT-001 — wolf различает «конфликт без критерия» (эскалация) и «разрешимо критериями брифа» (решает сам). Полная проверка — **AUTONOMY-001** (долгий процесс 2–3 часа, метрики: число вопросов к пользователю, время ожидания, handoff'ы, качество решений).

**Канал эскалации в автономном прогоне**: wolf пишет escalation-объект, **останавливается**; человек докатывает решение вторым запуском — файловый протокол гарантирует продолжение с места остановки (M11).


**Approved Lists** — источники для автономных решений. Хранятся как объекты `rule` (Phase 6 governance, создание — только пользователем):

```text
.wolf/memory/shared/rules/
├── 2026-06-01-coding-standards.md      # Стиль, типизация, именование
├── 2026-06-02-approved-libraries.md    # CSV: PapaParse; HTTP: axios
└── 2026-06-15-approved-patterns.md     # Архитектурные паттерны
```

Wolf проверяет: выбор в approved list → `autonomous`; выбор не в списке → `advisory` или `human_required`. Списки живут в памяти — wolf читает их как любой другой `rule`-объект.

### 2.8. Живучесть

- **Файловый протокол — фундамент [доказано]**: артефакты переживают смерть процесса. Экономика доката: kill на ~50% + resume ≈ **0.7× стоимости** чистового прогона (160k против 226k, LONG-001).
- **Watchdog — только внешний.** Нативного таймаута в `opencode run` нет; зависшая сессия ждёт вечно (инцидент: 46 минут «монолитного зависа», находка 25). Протокол: `bg + poll 10с + kill по таймауту`. **In-process heartbeat не годится**: зависший процесс не пишет heartbeat; различить «завис» и «долго думает» может только внешний наблюдатель по журналам (spawn-log, mtime артефактов).
- **Токен-бюджеты**: учёт бесплатен из SQLite opencode (per-agent атрибуция, M12); лимит воркеров — в плагине; ретраи с паузами при параллельных сессиях одного провайдера (находка 36).
- **Инструментальная симметрия — предусловие честных метрик (находка 42)**: каждой роли — рабочая трасса тулов под её класс задачи. Compliant-модели ретраят запрещённый тул сотни раз; аудит показал: до 36% токенов ORCH в RESEARCH-001 — артефакт инструментального голодания. Перед любым A/B — сверка тул-статусов обеих веток по БД.

### 2.9. Модели и тиринг

Принцип «сложность уровня ↔ модель» **[доказано практикой]**. Матрица на 2026-08:

| Роль | Модель | Почему |
|---|---|---|
| wolf (координатор) | `kimi-for-coding/k3-256k` | синтез, подсчёт голосов, брифы; thin-нагрузка |
| executor / советники architect, security / ревьюеры перспектив / слепой судья | `zai-coding-plan/glm-5.3` (или `glm-5.2`) | декомпозиция, глубокая критика |
| воркеры | `zai-coding-plan/glm-5-turbo` | однозадачная механика; учитывать compliant-поведение (находка 42) |
| резерв воркерного тира | `minimax-coding-plan/MiniMax-M3` | при деградации/лимитах основного провайдера |

**Принцип обновления**: алиасы (low/medium/high) **отложены** — фиксированные модели в frontmatter агентов. Пересмотр матрицы — событийный, при выходе новых моделей. Если churn станет частым — вернуться к алиасам отдельным решением.

---


### 2.10. Скиллы: процедурные инструкции

Агенты знают **что** хранить (объекты памяти §1) и **как** оркестрироваться (§2.1–2.9), но не знают **как делать** — пошаговый процесс работы. Этот пробел закрывают **скиллы**.

**Скилл** — markdown-файл с процессом: шаги + API-вызовы + hard validators. Не является объектом памяти, не регистрируется в Wolf. Скилл — инструкция для агента, а не данные проекта.

```text
skills/
├── wolf-brainstorm.md      # Процесс: запрос → спека (§2.3 Discovery)
├── wolf-plan.md            # Процесс: спека → план
├── wolf-sdd.md             # Subagent-Driven Development (§2.2 Executor)
├── wolf-execute.md         # Исполнение плана
├── wolf-debug.md           # Систематическая отладка
├── wolf-review.md          # Изолированное ревью (§2.5)
└── wolf-handoff.md         # Передача контекста между сессиями
```

**Как связаны скиллы и агенты:**

| Агент | Скиллы | Модель |
|---|---|---|
| wolf | brainstorm, plan, review, handoff | k3-256k |
| executor | sdd, execute | glm-5.x |
| worker | (нет скилла — одна задача в промпте) | glm-5-turbo |
| council-member | (нет скилла — read-only, одно мнение) | glm-5.x |

**Принципы:**
- Скилл читается агентом при входе в режим/маршрут.
- Шаги скилла используют Wolf API (memory, thread, gate).
- Скилл не является памятью — это процедурное знание, а не данные.
- Дисциплина enforcement (§2.6) применяется к скиллам так же, как к агентам: permission.task, depth, квоты.

**Отличие от объектов памяти:** объект — «что решено/произошло» (данные); скилл — «как делать» (процедура). Скиллы живут в `skills/`, объекты памяти — в `.wolf/memory/objects/`.

---



**Полный пример скилла:**

```markdown
# skills/wolf-brainstorm.md

## Trigger
Discovery mode → специфицируемая задача → EXECUTION/FLAT

## Steps
1. `wolf thread create <id> --title "..."` — создаёт work-thread
2. `wolf search "<keywords>"` — исследование (shared rules + related threads)
3. `wolf create document --subtype spec --thread <id>` — создать спеку
4. 5-этапная валидация:
   - Stage 1: структура (hard, grep)
   - Stage 2: completeness (hard, no TBD/TODO)
   - Stage 3: consistency (soft, council если advisory)
   - Stage 4: measurability (soft)
   - Stage 5: readiness (human approval)
5. `wolf gate check create_plan --thread <id>`

## Hard Validators
- Обязательные секции: Goal, Requirements, Acceptance Criteria
- REQ-\d{3}: .+ (минимум 1)
- AC-\d{3}: .+ (ссылка на REQ)
- Нет паттернов: TBD, TODO, "implement later"

## Objects Created
- document (subtype: spec, thread: <id>)
- decision (если были выборы, thread: <id>)

## Handoff
На выходе: спека валидна → можно перейти к wolf-plan
```

### 2.11. Формат агентов: markdown + frontmatter

Агенты — markdown-файлы в `agents/` с YAML frontmatter. Интеграция с opencode через механику M1–M12.

**Пример: agents/wolf.md**

```yaml
---
model: kimi-for-coding/k3-256k
spawn_policy: dispatch_only
permission:
  task:
    allow:
      - "agents/executor.md"
      - "agents/council-*.md"
    deny:
      - "agents/worker.md"
---

# Mr. Wolf — Coordinator

You are Mr. Wolf, the project coordinator...

## Your Role
- Coordinate work through memory objects
- Do NOT write code directly
- Read reports, not implementations

## Decision Authority
- **autonomous**: approved lists (§2.7)
- **advisory**: council for conflicts (§2.4)
- **human_required**: scope changes, breaking changes
```

**Поля frontmatter:**

| Поле | Назначение | Механика |
|---|---|---|
| `model` | Фиксированная модель | §2.9 матрица |
| `spawn_policy` | Кто может спавнить | `dispatch_only` / `controlled` / `none` |
| `permission.task.allow` | Какие агенты доступны | M3 glob |
| `permission.task.deny` | Какие запрещены | M3 glob |

**Worker** (`spawn_policy: none`, `permission.task: deny` все) — однозадачный, не спавнит.
**Council member** (`tools: read-only`, `permission.task: deny` все) — только читает и пишет `council-opinion`.

## 3. Эффективная работа с файлами памяти

> Наследник слоя WolfFS ранней концепции. Scope: только `.wolf/memory/**`. Размещение: часть `mr-wolf` (`src/`), не отдельный пакет.

### 3.1. Зачем отдельный слой

**Решение по scope**: слой работает **только с файлами памяти** и **не трогает код проекта**. Редактирование кода — зона платформы (opencode имеет edit-тулы; Aider, SWE-agent, OpenHands решают патчинг кода на индустриальном уровне). Файлы памяти — собственный формат mr-wolf (markdown + frontmatter + zod-схемы + канонические relations), о котором платформа ничего не знает: её `edit` может сломать frontmatter и рассинхронизировать relations. Агенты правят объекты памяти часто — каждая правка «переписать файл целиком» — риск и токены.

**Проблемы, которые слой закрывает:**

1. **LLM галлюцинирует unified diff** — модели путают номера строк и контекстные маркеры; принимать udiff без валидации = молча портить файлы.
2. **Частичная запись ломает объекты** — прямой `writeFile` при падении оставляет усечённый markdown; один битый файл роняет `list`/`search` для всех.
3. **Frontmatter должен оставаться валидным** — правка обязана проходить zod-схему, иначе объект исчезает из индекса и API.
4. **Relations синхронны с контентом** — канон `relations.jsonl`, зеркала в frontmatter; правка ссылок должна атомарно отражаться в журнале связей.

**Принцип «агент видит результат»**: каждая операция возвращает **EditResult** — объект до/после, diff (генерируемый слоем, не агентом), контент-хэш. Агент получает доказательство правки, а не надежду.

### 3.2. Что уже есть [built]

- **Поиск**: FTS5 + BM25, фильтры по type/status/tags, исключение superseded, stale-детекция, инкрементальная индексация.
- **Хранилище**: markdown + YAML frontmatter, zod-валидация при чтении, CRUD.
- **Relations**: канонический `relations.jsonl`, зеркала.
- **Интерфейсы**: плоский CLI (`wolf *`) и MCP-тулы.
- **Не реализовано**: AST-редактирование, LLM-friendly патчинг, атомарная запись (сейчас прямой `fs.writeFile`), журнал правок контента, reference-индекс, EditResult.

### 3.3. Предлагаемые компоненты

Приоритеты: **P0** — базовая надёжность; **P1** — основной интерфейс правок; **P2** — углубление. Каждый компонент — use-case + порт + адаптер в существующей гексагональной структуре.

**[P0] Надёжная запись.**

- **Атомарная запись**: `write(tmp) → fsync → renameSync(tmp → target)` — читатель никогда не видит половину файла. Локализовано в `MarkdownMemoryStore`.
- **Валидация после правки**: «сериализовать → распарсить → schema.parse» *до* rename. Невалидный результат = правка отклонена, файл не тронут.
- **Журнал правок (edit log)**: `.wolf/memory/edit-log.jsonl` — `{ ts, object_id, op, patch_summary, before_hash, after_hash, actor }`. Минимальный откат и аудит.
- **Shadow Git — отложено осознанно** [deferred]: supersede-семантика (старые версии не удаляются) + event log + edit log покрывают откат и аудит; git-репозиторий внутри `.wolf/` — второй VCS рядом с git проекта, источник путаницы. Поднимаем при реальном кейсе «нужен blame по памяти».

**[P1] Патчинг: SEARCH/REPLACE + fuzzy** (эталон — Aider edit format).

```text
<<<<<<< SEARCH
- Should relation predicates be user-extensible
=======
- Relation predicates: fixed core set (decided)
>>>>>>> REPLACE
```

- SEARCH матчится **ровно один раз**; ноль — `patch_not_found`; больше одного — `ambiguous_match` со списком позиций.
- Точный матч не найден → **fuzzy matching** (diff-match-patch) с порогом; fuzzy-применение помечается в EditResult (`applied: "fuzzy", score`).
- **Unified diff от агентов не принимаем** — отклоняем с подсказкой «используй SEARCH/REPLACE».
- Реализация: ~100 строк парсера + `diff-match-patch` (единственная новая зависимость).

**[P1→P2] Структурное редактирование: AST секций.** Для правок, невыразимых текстом: `editSection` / `insertIntoSection` / `removeSection` поверх `unified` + `remark-parse` + `unist-util-visit`. AST-парсинг никогда не ломает markdown-синтаксис. P1 — только `editSection`/`insertIntoSection` (90% правок); перемещение секций и зоны — P2.

**[P2] Reference-индекс.** Таблица в SQLite: `(object_id, ref_kind, ref_value, location)`; заполняется тем же инкрементальным проходом, что и FTS. Источники: `relations.jsonl` + скан тела на паттерны `mem_*`, `REQ-\d+`, заголовки. API: `wolf refs <value>`.

### 3.4. Контракты

**EditResult:**

```typescript
interface EditResult {
  objectId: string;
  before: { hash: string; body: string };
  after: { hash: string; body: string };
  diff: string;                // unified diff, генерирует слой
  applied: 'exact' | 'fuzzy';
  fuzzyScore?: number;
  frontmatterValid: true;      // иначе — ошибка, правки нет
  warnings: string[];
}
```

**Ошибки (типизированные):** `patch_not_found` (перечитать объект), `ambiguous_match` (сузить контекст), `frontmatter_invalid` (файл не изменён), `section_not_found`, `object_superseded` (править наследника).

**Идемпотентность**: повторное применение патча возвращает `patch_not_found` с текущим хэшем — агент видит, что правка уже применена. Транзакционная граница: файл + edit log + переиндексация — один use-case, ошибка на любом шаге = откат всех трёх.

### 3.5. Связь с агентами

- Wolf / executors / workers работают через MCP-тулы и CLI (`wolf edit`, `wolf patch`, `wolf refs`) — новые тулы в существующих адаптерах.
- **Правило проекта**: агенты НЕ правят файлы `.wolf/memory/**` напрямую платформенными edit-тулами — только через API слоя.
- **Это правило, а не механика** — механически запретить обход нельзя (честное ограничение ранней концепции). Enforcement — через `rule`-объекты (Phase 6 governance) и промпты. Цена обхода мала: валидатор при чтении упадёт на битом объекте и укажет файл — нарушение детектируется, не молчит.


- **Почему не Registry.** Обсуждалась альтернатива: вынести метаданные в отдельный `registry.json`. Отказ: frontmatter + zod-валидация + post-edit проверка (P0) решают проблемы синхронизации, а «источник истины рядом с данными» проще для отладки и git-friendly. Registry — избыточный слой рассинхронизации.


**MCP-тулы (current, built):**

```typescript
// Memory operations
wolf_add(type: string, fields: object): string
wolf_list(filters?: {type?, thread?, status?}): Object[]
wolf_get(objectId: string): Object
wolf_search(query: string, options?: {thread?, type?}): SearchResult[]
wolf_supersede(oldId: string, newId: string): void
wolf_rebuild_index(): void
wolf_scan(): StaleObject[]

// Thread operations
wolf_thread_create(threadId: string, metadata?: object): void
wolf_thread_list(filters?: {status?}): Thread[]
wolf_thread_get(threadId: string): Thread
wolf_recap(threadId?: string): Recap

// Session operations
wolf_session_wrap_up(threadId: string): SessionSummary
wolf_brief(threadId?: string): Brief
```

**MCP-тулы (planned, Phase 11):**

```typescript
// Editing operations
wolf_edit(objectId: string, patch: SearchReplaceBlock[]): EditResult
wolf_patch(objectId: string, patchContent: string): EditResult
wolf_refs(refValue: string): Reference[]

// Graph operations
wolf_thread_graph(threadId: string, depth?: number): Graph
```

### 3.6. Границы: чего слой НЕ делает

1. Не редактирует код проекта (scope жёстко `.wolf/memory/**`).
2. Не заменяет git проекта. История памяти — supersede + event log + edit log.
3. Не делает семантической валидации («объект валиден» ≠ «объект содержит правду» — это зона ревью).
4. Не конкурентная запись: local-first, один процесс-писатель.

### 3.7. Сводка фаз

| Фаза | Содержимое | Новые зависимости |
|---|---|---|
| P0 | Атомарная запись, post-edit валидация, edit log | — |
| P1 | SEARCH/REPLACE + fuzzy, `editSection`/`insertIntoSection`, EditResult, `wolf edit/patch` + MCP | `diff-match-patch`, `unified`, `remark-parse`, `unist-util-visit` |
| P2 | Reference-индекс + `wolf refs`, остальные структурные операции | — |
| P2+ (опц.) | Shadow Git — только при подтверждённом кейсе | `isomorphic-git` |

---

## 4. Принципы v2

1. **Всё есть память** [built] — документы, решения, уроки, блокеры, briefs, reports, голоса советов — единый store, единый поиск.
2. **Local-first** [built] — SQLite FTS5 + файлы, ноль внешних сервисов.
3. **Frontmatter — канон, индексы — проекции** [решение v2].
4. **Flat by default** [proven] — специфицируемая задача = однопроходная для сильной модели.
5. **Иерархия — не экономия, а процессные гарантии** [proven] — налог токенов всегда; выигрыш по качеству — только в изолированном ревью.
6. **Пик контекста переезжает, а не исчезает** [proven, LONG-002] — wolf тонкий (11–18k), executor распухает (56–76k).
7. **Изоляция перспектив бьёт по слепым зонам** [proven, REVIEW-001] — узкий ревьюер в чистой сессии > широкое саморевью.
8. **Файловый протокол — фундамент живучести** [proven] — артефакты переживают смерть процесса; докат ≈0.7× стоимости.
9. **Самодекларациям — нет** [proven] — системная правда: плагин-журнал (пишет до permission-проверки) + независимый пересчёт по первичным файлам.
10. **Enforcement — на уровне платформы** [proven, M2–M4] — permission-glob + depth + квоты вместо промптовой дисциплины; M8 — известная дыра.
11. **Инструментальная политика — предусловие честных метрик** [proven, находка 42] — каждому воркеру рабочая трасса оболочки.
12. **Hard validators обязательны** [наследие] — детерминизм через grep/regex/verify-скрипты.
13. **Decision Authority: решай сам, когда можешь** [hypothesis, частично SPLIT-001] — wolf различает «разрешимо критериями» vs «нужна эскалация».
14. **Эскалация — объектом памяти** [proven протокол, M11] — нет синхронного канала; escalation + остановка + второй запуск.
15. **Эмпирическая честность** [мета-принцип] — каждое утверждение маркировано доказательством или «гипотеза»; опровергнутое удаляется, а не смягчается.

**Изъято из 25 принципов ранних версий:** «иерархия экономит токены» (опровергнуто), «иерархия для больших задач» (опровергнуто), 6 режимов, Shadow Git как обязательный, AST-editing как обязательный, model router, capability tokens, параллелизм как преимущество.

---

## 5. Матрица зрелости

| Возможность | Статус | Источник |
|---|---|---|
| Memory harness (объекты, event log, relations, governance, session wrap-up) | **built** | Phases 0–7 |
| FTS5-поиск + инкрементальная индексация | **built** | Phases 3, 5 |
| Council Mode (VOTE, кворум, синтез, эскалация) | **proven** | 11 советов, 8 сценариев, пересчёт 10/10 |
| Изолированное ревью по перспективам | **proven** | REVIEW-001: +31% issues, major ×2.2, full −29% |
| Файловый протокол + докат | **proven** | Докат 160k vs 226k (LONG-001) |
| Permission-дисциплина (glob, depth, квоты) | **proven** | M1–M4, M6, M7 |
| Thin wolf (11–18k) | **proven** | LONG-001/002 (но пик переезжает на executor'а) |
| Автономность / Decision Authority (полный цикл) | **hypothesis** | SPLIT-001 частично; AUTONOMY-001 не проведён |
| Hierarchy для неспецифицируемых задач | **hypothesis** | Находка 22: capacity-предел не построен |
| Редактирование памяти (SEARCH/REPLACE, AST, атомарность) | **designed** | §3; не реализовано |
| Наблюдаемость / watchdog | **designed** | В песочнице — внешний протокол bg+poll+kill |
| AUTONOMY-001 | **planned** | §6 |
| Shadow Git | **deferred** | Supersede + event log покрывают откат |
| WolfFS-пакет, Model Router, Platform Adapters, Capability Tokens, 6 режимов | **deprecated** | §7 |

---

## 6. Roadmap

**Phase 8 — Schema-driven taxonomy + оркестрационные типы.**
Core pack типов через `.wolf/config.yaml` (типы из кода — в конфиг); оркестрационные типы §1.2 (`task-brief`, `report`, `council-question`, `council-opinion`, `synthesis`, `escalation`, `decision-request`) входят через этот механизм. Use-case'ы совета: подсчёт VOTE по объектам, проверка кворума, синтез.

**Phase 9 — Flat-first роутер + Council Mode.**
Классификатор задач (специфицируемая / ревью / неспецифицируемая), md-агенты с permission-glob (по образцу wolf-experiment), spawn-logger с квотами в рабочий workspace. Tool policy: рабочая трасса тулов каждой роли.

**Phase 10 — Изолированное ревью как продукт.**
Команда `wolf review <doc>`: раунды security → completeness → consistency, узкие ревьюеры в чистых сессиях, VERDICT-контракт, слепой судья как стандарт приёмки.

**Phase 11 — Редактирование памяти (P0→P1).**
Атомарная запись, edit log, SEARCH/REPLACE + fuzzy, `editSection`, EditResult, `wolf edit/patch` + MCP-тулы.

**AUTONOMY-001 — проверка автономности.**
Долгий процесс (2–3 часа), 10+ решений средней важности, метрики: число вопросов к пользователю, время ожидания, handoff'ы, качество решений. Запуск после Phases 8–9 (нужны escalation-объекты и tool policy).

---



**Пример `.wolf/config.yaml` (Phase 8):**

```yaml
# .wolf/config.yaml
memory_types:
  # Core types (Phases 0-7)
  work-thread:
    required_fields: [title]
    lifecycle: [draft, active, completed, archived]
    relations: [related_to]

  decision:
    required_fields: [rationale]
    lifecycle: [proposed, accepted, rejected, superseded]
    relations: [based_on, supersedes]

  document:
    required_fields: [source_path]
    lifecycle: [active, stale, superseded]
    relations: [related_to]

  rule:
    required_fields: [content]
    lifecycle: [active, superseded]
    truth_role: user_only  # создание только пользователем
    relations: [supersedes]

  session-checkpoint:
    required_fields: [open_tasks]
    lifecycle: [active]
    relations: [related_to]

  session-summary:
    required_fields: [summary]
    lifecycle: [active]
    relations: [related_to]

  # Orchestration types (Phase 8)
  task-brief:
    required_fields: [executor, priority, timeout, related]
    lifecycle: [draft, active, completed, superseded]
    relations: [based_on, related_to, answered_by]

  report:
    required_fields: [summary]
    lifecycle: [draft, completed]
    relations: [answers, supports]

  council-question:
    required_fields: [question, quorum, consensus_threshold]
    lifecycle: [open, answered]
    relations: [related_to, answered_by]

  council-opinion:
    required_fields: [vote]
    lifecycle: [proposed, accepted]
    relations: [answers]
    enum:
      vote: [A, B, C, ABSTAIN, TIMEOUT]

  synthesis:
    required_fields: [recommendation, confidence]
    lifecycle: [draft, accepted]
    relations: [based_on, supports]

  escalation:
    required_fields: [question]
    lifecycle: [open, resolved, dismissed]
    relations: [resolved_by]

  decision-request:
    required_fields: [question]
    lifecycle: [open, answered]
    relations: [answered_by]
```



### Сводная таблица CLI команд

| Команда | Назначение | Статус |
|---|---|---|
| **Управление тредами** | | |
| `wolf thread create <id>` | Создать тред | built |
| `wolf thread list [--status active]` | Список тредов | built |
| `wolf thread complete <id>` | Завершить тред | built |
| `wolf thread archive <id>` | Архивировать тред | built |
| `wolf thread delete <id>` | Удалить тред | built |
| **Сессии и handoff** | | |
| `wolf recap` | Восстановить контекст | built |
| `wolf session wrap-up` | Создать handoff | built |
| `wolf brief` | Производный снимок памяти | built |
| **Поиск** | | |
| `wolf search <query> [--thread <id>]` | FTS5 поиск | built |
| `wolf get <object-id>` | Получить объект | built |
| `wolf list [--type <type>] [--thread <id>]` | Список объектов | built |
| **Жизненный цикл** | | |
| `wolf supersede <old> <new>` | Заменить объект | built |
| `wolf scan` | Найти stale объекты | built |
| **Редактирование памяти (Phase 11)** | | |
| `wolf edit <object-id>` | Редактировать объект | designed |
| `wolf patch <object-id>` | Применить SEARCH/REPLACE | designed |
| `wolf refs <value>` | Поиск по ссылкам | designed |
| **Ревью (Phase 10)** | | |
| `wolf review <doc>` | Изолированное ревью | planned |
| **Граф связей** | | |
| `wolf thread graph <id>` | Показать цепочку | planned |

## 7. Решённые противоречия

| # | Тема | Варианты | Решение v2 | Обоснование |
|---|---|---|---|---|
| 1 | Память | Ранняя: threads/state.json vs harness: markdown+frontmatter+relations+FTS5 | **Harness — канон** | Построен и работает; «всё есть память» расширяется оркестрационными типами |
| 2 | Enforcement | Capability tokens через API (обходимо) vs permission-glob платформы | **Платформенный слой; токены отменены** | M2/M3/M4 режут в рантайме системно; M8 — документированное ограничение |
| 3 | WolfFS | Отдельный пакет с AST/Shadow Git vs «убрать совсем» | **Функции — фазами внутри mr-wolf; scope — только память; Shadow Git отложен** | FTS5 уже совпал с референсами; supersede + event log покрывают откат |
| 4 | Model router | Алиасы vs фиксированные модели | **Фиксированные в frontmatter + процедура пересмотра** | Алиасы — слой без окупаемости; churn обрабатывается правкой frontmatter |
| 5 | Platform Adapter Layer | Переносимость vs нативность | **opencode-нативность; адаптеры вне scope** | Механика M1–M12 проверена на opencode; вторая платформа — спекуляция |
| 6 | Режимы | 6 vs 3 | **3: Discovery / Execution / Review** | Monitoring/Quick Lookup — поведение, не состояния |
| 7 | Реестр vs frontmatter | registry.json как канон vs frontmatter объектов | **Frontmatter — канон; индексы — проекции** | Источник истины один и лежит рядом с данными |
| 8 | Структура тредов | Логическая (поле `thread`) vs физическая (каталоги) | **Физическая** | Удаление/архивация атомарно, визуальная навигация, изоляция |
| 9 | Структура внутри треда | Плоская vs подкаталоги по типам | **Подкаталоги по типам** | 100+ файлов в плоском каталоге нечитабельны; агентам всё равно |
| 10 | Именование файлов | Slug без даты vs дата в имени | **Дата в имени** | Хронологическая сортировка, версионирование через дату, поиск по времени |

---

## 8. Открытые вопросы

1. **Capacity-тест** — класс задач, где flat объективно тонет (пик >200k), не воспроизведён; нужна неспецифицируемая задача, сопротивляющаяся скриптованию (находка 22).
2. **Взвешенные голоса совета** (участник ×2) — не проверялись.
3. **M8-дыра** — MCP/кастом-тулы мимо permission-стены; mitigation не спроектирован.
4. **Эскалация в unattended-прогоне** — эскалация = объект + остановка + второй запуск; кто «будит» wolf'а при длительном прогоне без человека?
5. **Ревью молодых документов** — эффект изоляции измерен на зрелой спеке; на черновиках выигрыш может быть выше — не проверено.
6. **Повтор RESEARCH-001** с рабочим веб-стеком у воркеров — текущие величины ORCH — верхняя граница (инструментальный артефакт).
7. **Расширяемость предикатов relations** — пользовательские предикаты или фиксированный core set.
8. **Checkpoint: snapshot vs ids** — полные снапшоты артефактов или только идентификаторы.
9. **Пересмотр моделей** — процедура задокументирована, триггеры и критерии смены не формализованы.
10. **Переносимость M1–M12** — при апгрейде opencode перепроверять smoke'ами.

---


## 9. Структура проекта

Полная структура Mr. Wolf — memory substrate, встроенный в проект:

```text
project/
├── agents/                          # Агенты opencode (markdown + frontmatter)
│   ├── wolf.md                      # Координатор (k3-256k, dispatch_only)
│   ├── executor.md                  # Менеджер задачи (glm-5.x, controlled)
│   ├── worker.md                    # Однозадачный (glm-5-turbo, none)
│   ├── reviewer.md                  # Ревьюер (glm-5.x, read-only)
│   └── council-*.md                 # Члены совета (glm-5.x, read-only)
│
├── skills/                          # Процедурные инструкции (§2.10)
│   ├── wolf-brainstorm.md
│   ├── wolf-plan.md
│   ├── wolf-sdd.md
│   ├── wolf-execute.md
│   ├── wolf-review.md
│   └── wolf-handoff.md
│
├── .wolf/                           # Memory substrate
│   ├── config.yaml                  # Таксономия типов (Phase 8)
│   ├── memory/
│   │   ├── threads/                 # Треды (физические каталоги)
│   │   │   ├── csv-export/          # Тред = каталог
│   │   │   │   ├── WORK-THREAD.md
│   │   │   │   ├── documents/       # Спеки, планы
│   │   │   │   ├── tasks/           # Briefs + reports
│   │   │   │   ├── decisions/       # ADR
│   │   │   │   ├── councils/        # Советы
│   │   │   │   └── sessions/        # Checkpoints
│   │   │   └── auth-refactor/
│   │   ├── shared/                  # Shared объекты
│   │   │   ├── rules/
│   │   │   └── decisions/
│   │   ├── relations.jsonl          # Граф связей (канон)
│   │   ├── events.jsonl             # Audit trail
│   │   └── briefs/                  # Производные снимки
│   └── cache/
│       └── index.sqlite             # FTS5-индекс (проекция)
│
└── src/                             # Исходный код mr-wolf (hexagonal)
    ├── domain/                      # Use-case'ы (порт depends на domain)
    ├── ports/                       # Интерфейсы
    └── adapters/                    # CLI, MCP, memory store
```


**Конфигурация советов:**

```text
.wolf/councils/
├── architecture.yaml    # quorum: 3, consensus: 0.75, members: [architect, security, ux]
├── security.yaml        # quorum: 2, consensus: 1.0, members: [security, architect]
└── performance.yaml     # quorum: 3, consensus: 0.67, members: [performance, ux, cost]
```

```yaml
# architecture.yaml
name: architecture-council
quorum: 3                    # минимум голосов для решения
consensus_threshold: 0.75    # доля победителя
members:
  - council-architect        # model: glm-5.3
  - council-security         # model: glm-5.3
  - council-ux               # model: glm-5-turbo
vote_contract: "VOTE: A|B|C|ABSTAIN|TIMEOUT"
```

**Границы:**
- `agents/` и `skills/` — знания агентов, **не** память проекта.
- `.wolf/memory/threads/` и `.wolf/memory/shared/` — единственное место хранения памяти.
- Код проекта (`src/`, `tests/`) — вне `.wolf/`, регистрируется по ссылке как `document` (§1.3).
- Код mr-wolf (`src/`) — не память и не агент, а инфраструктура.

---

## 10. Примеры workflow

### 10.1. FLAT: специфицируемая задача

```text
Пользователь: "Добавь CSV export"

Wolf [DISCOVERY]:
  → классифицирует: специфицируемая → FLAT
  → wolf thread create csv-export

Wolf [EXECUTION]:
  → wolf-brainstorm: исследование → спека {thread: csv-export}
     # threads/csv-export/documents/2026-08-19-csv-export-spec.md
  → wolf-plan: спека → план {thread: csv-export}
     # threads/csv-export/documents/2026-08-19-csv-export-plan.md
  → wolf-execute: один агент сильной модели
    → task-brief {thread: csv-export}
     # threads/csv-export/tasks/2026-08-19-TASK-001.brief.md
    → report {thread: csv-export}
     # threads/csv-export/tasks/2026-08-20-TASK-001.report.md

Wolf [REVIEW]:
  → показывает результат пользователю
  → wolf session wrap-up → session-summary {thread: csv-export}
```

Токены: ~50k (один агент). Налог оркестрации: +157…+1141% — **не окупается** (COST/LONG/RESEARCH).

### 10.2. COUNCIL: изолированное ревью документа

```text
Пользователь: "Проведи ревью спеки auth"

Wolf [EXECUTION, COUNCIL]:
  → wolf-review: раунды по перспективам
    Раунд 1: security reviewer (чистая сессия, read-only)
      → issues + SUMMARY: 2 critical / 5 major
    Автор применяет замечания
    Раунд 2: completeness reviewer (чистая сессия)
    Раунд 3: consistency reviewer (чистая сессия)
  → VERDICT: APPROVED | CHANGES
```

Качество: +31% дефектов, major ×2.2, full-токены −29% (REVIEW-001). Единственная эмпирически окупаемая форма иерархии.

### 10.3. COUNCIL: совет по архитектурному решению

```text
Executor → Wolf: "Decision Request: Redis или Memcached?"

Wolf [EXECUTION, COUNCIL]:
  → council-question (объект памяти)
  → спавнит council-architect, council-security, council-performance
  → каждый пишет council-opinion (VOTE: A|B|ABSTAIN)
  → wolf считает по объектам (не по самоотчётам)
  → synthesis: Redis 2/3, confidence 0.75
  → escalation? нет → решение
```

Совет — **read-only**: каждый член даёт одно мнение. Wolf считает голоса и синтезирует. Консенсус не достигнут → escalation к человеку.

### 10.4. Параллельная работа над тредами

```text
День 1:
  wolf thread create csv-export
  → работа над csv-export
  → wolf session wrap-up  # checkpoint для csv-export

  wolf thread create auth-refactor
  → работа над auth-refactor
  → wolf session wrap-up  # checkpoint для auth-refactor

День 2:
  wolf recap              # восстанавливает csv-export (~5k токенов)
  → работа
  → wolf session wrap-up

  wolf recap              # восстанавливает auth-refactor (~5k токенов)
  → работа
  → wolf session wrap-up

День 3:
  wolf recap              # csv-export
  → финальные задачи
  → wolf thread complete csv-export
```

**Результат:** Два треда параллельно, контекст не смешивается, handoff через session-summary + session-checkpoint (§1.7). Каждый тред изолирован, shared решения видны всем.



### 10.5. Recovery после прерывания

```text
День 1, 15:00:
  wolf thread csv-export
  → работа над TASK-003
  → process killed (OOM, user ctrl+c, etc.)
  → session-summary НЕ вызван явно
  → events.jsonl содержит последнюю запись:
    {ts: "15:45:00", op: "create", object: "TASK-003"}

День 2, 10:00:
  wolf recap
  → читает последний session-summary (если есть)
  → находит TASK-003 (active task-brief без report)
  → читает связанные объекты через relations
  → восстанавливает контекст ~5k токенов

Wolf [EXECUTION]:
  → продолжает с TASK-003, не с нуля
  → executor стартует с brief TASK-003

Токены: 0.7× от чистового прогона (LONG-001)
Механика:
  - events.jsonl — audit trail (что произошло)
  - relations.jsonl — граф связей (что связано)
  - task-brief без report — недоделанная работа
  - Файловый протокол переживает смерть процесса
```

## 11. Что НЕ входит в scope

1. **Редактирование кода проекта** — зона платформы (opencode edit-тулы, Aider, SWE-agent).
2. **IDE-интеграция** — не плагин для VSCode/Cursor; Wolf — memory substrate, доступный через CLI/MCP.
3. **Веб-интерфейс** — только CLI + MCP.
4. **Распределённая работа** — local-first, один процесс-писатель.
5. **Model Router** — фиксированные модели в frontmatter агентов; пересмотр — событийный.
6. **Capability Tokens** — permission-glob платформы делает то же жёстче (§2.6, M2–M4).
7. **Shadow Git** — supersede + event log + edit log покрывают откат и аудит.
8. **6 режимов работы** — сокращено до 3 (§2.3). Monitoring/Quick Lookup — поведение, не состояния.
9. **Параллелизм как преимущество** — доказано, что не окупается на специфицируемых задачах.


---

## 12. Глоссарий

### Базовые понятия

**Mr. Wolf Memory Substrate** — пассивное ядро хранения данных:
- `.wolf/memory/` с объектами, relations, FTS5
- Не принимает решений, не выполняет задач
- Предоставляет API для чтения/записи

**Mr. Wolf Coordinator Agent** — активный агент-координатор:
- Реализован как `agents/wolf.md`
- Модель: k3-256k
- Принимает решения, управляет агентами
- Использует substrate как хранилище

**Агент (Agent)** — активный участник с моделью LLM:
- Принимает решения на основе контекста
- Выполняет задачи (пишет код, создаёт документы)
- Может спавнить других агентов (или не может)
- Описан в `agents/*.md`

**Оркестратор (Orchestrator)** — координирует работу агентов:
- Распределяет задачи
- Контролирует прогресс
- Синтезирует результаты
- В Mr. Wolf эту роль играет Coordinator Agent

### Структурные понятия

**Тред (Thread)** — физический каталог в `threads/<id>/`:
- Группирует объекты по задаче/фиче
- Может быть удалён/архивирован атомарно
- Изолирует параллельную работу

**Shared** — каталог `shared/`:
- Объекты, видимые всем тредам
- Правила, стандарты, архитектурные решения

**Объект памяти** — markdown-файл с frontmatter:
- Хранится в `.wolf/memory/threads/<id>/` или `shared/`
- Тип определяется полем `type` в frontmatter
- Связи через `relations.jsonl`

**Скилл (Skill)** — markdown-файл в `skills/`:
- Процедурные инструкции для агентов
- Не является памятью
- Описывает "как делать"

### Оркестрационные понятия

**Task Brief** — задание от Coordinator для Executor:
- Объект памяти типа `task-brief`
- Содержит контекст, критерии, ограничения

**Report** — отчёт Executor для Coordinator:
- Объект памяти типа `report`
- Связан с task-brief через `answers`

**Council** — мини-совет агентов:
- Read-only члены совета
- Каждый пишет `council-opinion`
- Coordinator считает голоса и синтезирует

**Decision Authority** — уровни автономии Coordinator:
- `autonomous` — решает сам
- `advisory` — совет, решает по синтезу
- `human_required` — спрашивает пользователя

## 13. Приложения

**A. Механика opencode (M1–M12, v1.18.18)** — полный реестр: `wolf-experiment/HANDOFF.md` §5, детали в `REPORT.md` §4. Ключевое: task denied by default (M2), permission.task glob (M3), depth в рантайме (M4), плагины before-хук до permission (M6/M7), MCP мимо стены (M8), токены в SQLite (M12).

**B. Находки 1–42** — сквозная нумерация, указатель: `wolf-experiment/HANDOFF.md` §6, полные тексты в `REPORT.md` §5–9f.

**C. Активы песочницы для переноса** — 12 агентов с permission-границами, spawn-logger.ts, verify-скрипты, файловые контракты, SQL токен-учёта, протокол слепого судьи: `wolf-experiment/HANDOFF.md` §7.

**D. Источники концепции v2** — `docs/concept.md` (v1.0); ранняя 9-слойная концепция и экспертные сессии: память `mem_20260818_9_v2_75348f`, `mem_20260818_wolffs_218d25`, `mem_20260818_flat_first_selective_orchestration_7ff0e7`; тред `mem_20260818_mr_wolf_v2_18b2ed`.
