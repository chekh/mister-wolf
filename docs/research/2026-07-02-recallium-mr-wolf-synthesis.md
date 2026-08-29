# Синтез: лучшие решения Recallium и Mr. Wolf для Mr. Wolf

> Date: 2026-07-02  
> Status: research / proposal  
> Sources:
>
> - Recallium: README, install guide, SKILL.md, website (`recallium.ai`, `/help`, `/concepts`, `/comparisons`), GitHub repo structure.> - Mr. Wolf: current codebase (`src/` on branch `dev`, commit `a7a3290`), `docs/concept-v3.md`, `docs/guide/user-guide.md`, `docs/superpowers/specs/2026-06-30-project-memory-harness-base-concept.md`, `docs/superpowers/specs/2026-06-30-phase-2-decisions-and-blockers-design.md`, `docs/superpowers/specs/2026-07-01-mcp-server-integration-design.md`, `docs/superpowers/specs/2026-07-02-phase-6-governance-design.md`, `docs/superpowers/specs/2026-07-02-session-wrap-up-habit-design.md`, `MEMORY.md`. <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->

## 1. Предмет сравнения

### 1.1. Recallium

Recallium позиционирует себя как **"memory OS for AI coding agents"**. Это self-hosted сервер памяти, поставляемый через Docker, с универсальным MCP-over-HTTP транспортом. Сам сервер — closed-source (ELv2), в открытом репозитории находятся инсталляторы, скиллы для Claude Code, расширение для Claude Desktop и документация.

Ключевые черты:

- **Агентоцентричность.** Память строится вокруг поведения агента в IDE: "Just say `recallium` in your IDE". Инструменты спроектированы так, чтобы агент сам решал, что сохранять, когда искать, какие правила применять.
- **Автоматизация захвата.** AI assistant "intelligently captures important moments" — решения, баги, код, инсайты. Пользователю не нужно вручную классифицировать каждую запись.
- **Гибридный поиск.** Semantic + keyword, с акцентом на "finds what you mean even when the words don't match".
- **Проекты как изолированные контейнеры.** Память scoped per project, но доступен cross-project analysis.
- **Правила как guardrails.** `rule` type с явным различием project-scope и global-scope (`__global__`). Правила auto-load в начале сессии.
- **Рассуждения first-class.** `start_thinking` / `add_thought` / `conclusion`, где conclusion автоматически сохраняется как `decision`.
- **Инсайты и паттерны.** `get_insights` — AI-powered meta-analysis across memories.
- **Таски lightweight.** Tasks linked to memories, но не заменяют полноценный task tracker.
- **UI и визуализация.** Web dashboard, knowledge graph, export/import.

### 1.2. Mr. Wolf

Mr. Wolf — **local-first project semantic memory layer**. Это не продукт "для пользователя", а substrate "для агентов". Фокус на том, чтобы проект, а не сессия, владел памятью.

Ключевые черты:

- **Проект first, not agent first.** Память принадлежит проекту, хранится в `.wolf/memory/` внутри репозитория.
- **Файлы как источник правды.** Markdown + YAML frontmatter canonical. SQLite/индексы/брифы — derived.
- **Явная структура артефактов.** `work-thread`, `info-request`, `article`, `decision`, `blocker`, `session-checkpoint`, `document`, `context`, `lesson`, `observation`, `open-question`, `session-summary`.
- **Протокол записи.** Не всё сохраняется, а только то, что меняет понимание проекта, объясняет решение, предотвращает ошибку или связывает артефакты.
- **Thread model.** `work-thread` — долгоживущая линия работы. `info-request` — отложенный вопрос, ответ на который станет reusable knowledge. `article` — reusable answer. Это **явный механизм deferred Q&A** без превращения в task manager.
- **Governance.** `memory_class`, `truth_role`, `lifetime`, `review_state`, lifecycle transitions.
- **Relations.jsonl.** Явный relation graph между артефактами.
- **Event log.** `events.jsonl` — append-only audit trail.
- **Архитектура.** Ports-and-adapters, domain imports nothing.

## 2. Концептуальная разница

### 2.1. Агент first vs проект first

| Recallium                                          | Mr. Wolf                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Память обслуживает агента в моменте.               | Память обслуживает проект на протяжении времени.                |
| "Что агенту нужно знать сейчас?"                   | "Что проекту нужно помнить всегда?"                             |
| `session_recap()` — загрузка контекста для агента. | `memory brief` + `thread brief` — формирование картины проекта. |
| Захват контекста автоматический (агент решает).    | Захват дисциплинированный (write protocol).                     |

Это не конфликт, а два ракурса одной проблемы. Recallium решает **retrieval в моменте**. Wolf решает **durability и governance**. Лучший синтез — дать Wolf сильные retrieval-паттерны Recallium, не теряя project-first основы.

### 2.2. Closed-source product vs open-source substrate

Recallium — продукт с UI, wizard, enterprise roadmap. Wolf — инфраструктурный слой. У Wolf нет обязанности быть "приложением для пользователя". Его цель — быть прозрачным, контролируемым, git-friendly.

Следствие: Wolf не должен копировать Docker/UI/wizard Recallium. Он должен копировать **агентские паттерны** (rules, recap, triggers, thinking sequences) и **таксономические идеи**, но реализовывать их через свою архитектуру.

### 2.3. Автоматический vs дисциплинированный захват

Recallium делает ставку на автоматический захват: "AI automatically stores context". Wolf настаивает на явной дисциплине: "Не пиши всё подряд", "info-request не для TODO", "preliminary answer required".

Автоматический захват хорош для adoption, но плох для signal/noise ratio. Дисциплинированный захват хорош для качества, но плох для friction. Синтез: **структурированные триггеры** (как в SKILL.md Recallium), но с write protocol Wolf и default-отклонением "мусора".

### 2.4. Database-first vs files-first

Recallium: PostgreSQL + pgvector — источник правды. Wolf: markdown-файлы — источник правды. Это фундаментальное архитектурное различие.

Для Wolf files-first — не эстетика, а стратегическое преимущество:

- Git-френдли (diff, blame, history).
- Нет vendor lock-in.
- Читаемо без Wolf.
- Проще backup и migration.
- Проще inspection и редактирование человеком.

Поэтому vector search / insights в Wolf должны быть **derived adapters**, не заменой файлов.

### 2.5. Magic word vs explicit commands

Recallium: `recallium` — magic word, который загружает всё. Wolf: explicit commands (`memory search`, `memory brief`, `memory thread brief`).

Magic word — хороший UX для агентов, потому что снижает cognitive load. Но он скрывает, что именно загружается. Wolf может иметь `memory recap` как magic-word-эквивалент, но с **прозрачным составом** (rules + active threads + blockers + open questions + recent decisions).

## 3. Что предлагается позаимствовать у Recallium

### 3.1. Агентский ритуал старта сессии (`memory recap`)

Recallium: `recallium` → loads global rules, project rules, recent activity, pending tasks, project briefs.

Wolf сейчас: `memory brief` (генерирует из scan + active memory) и `memory thread brief` (для конкретного треда).

Проблема `memory brief`: он требует scan и генерации, может быть медленным. Проблема `thread brief`: требует знания thread id.

Предлагается добавить `memory recap`:

- Быстрый, не требует scan.
- Возвращает структурированный контекст:
  - активные `rule` (project + global);
  - активные `work-thread` (последние N);
  - открытые `blocker`;
  - открытые `open-question`;
  - открытые `info-request`;
  - последние `decision`.
- Используется как session startup ritual в `.wolf/SKILL.md`.

Это не заменяет `memory brief`, а дополняет: `brief` — полный обзор проекта, `recap` — быстрый вход в сессию.

### 3.2. Тип `rule` и правила как guardrails

Recallium выделяет `rule` в отдельный тип и требует explicit user request для создания. Правила делятся на project-scope и global-scope (`__global__`).

Wolf сейчас не имеет dedicated rule type. Есть `decision`, `lesson`, `observation`, но нет явного "always do X".

Предлагается:

- Добавить `rule` в `MEMORY_TYPES`.
- Поля:
  - `scope: 'project' | 'global'`;
  - `applies_to: string[]` — файлы, модули, ситуации, к которым относится;
  - `trigger: string` — когда применять ("before editing auth files", "when adding dependencies").
- Default governance: `memory_class: canonical`, `truth_role: source_of_truth` (только если создано пользователем).
- Создание только по explicit request: агент не может создать `rule` сам, только предложить через `decision` или `open-question`.
- Auto-load: `memory recap` и `memory brief` всегда включают активные правила.
- Global rules: хранятся в `.wolf/memory/objects/rules/` текущего проекта, но помечены `scope: global` и `project_name: __global__` (или отдельный storage path).

### 3.3. Триггеры сохранения (`.wolf/SKILL.md`)

Recallium SKILL.md даёт агенту чёткую карту: trigger → memory type. Это снижает friction при сохранении, не превращаясь в автоматический спам.

Wolf уже имеет `MEMORY.md` с правилами, но не в формате skill и без явной trigger → type таблицы. <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->

Предлагается создать `.wolf/SKILL.md` (или раздел в `MEMORY.md`) с такой таблицей: <!-- MEMORY.md заархивирован 2026-08-25 -> docs/archive/MEMORY.md -->

| Trigger                            | Memory type    | Required fields                                              |
| ---------------------------------- | -------------- | ------------------------------------------------------------ |
| Completed feature/capability       | `feature`      | problem, solution, files                                     |
| Wrote focused code/utility         | `code-snippet` | pattern, files                                               |
| Fixed bug / investigated issue     | `debug`        | root cause, fix, files                                       |
| Designed architecture/APIs         | `design`       | context, options, recommendation                             |
| Made choice with rationale         | `decision`     | rationale, rejected alternatives                             |
| Discovered insight                 | `lesson`       | what was surprising, why                                     |
| Gathered external info             | `research`     | findings, references                                         |
| Hit milestone/checkpoint           | `progress`     | what changed, what's next                                    |
| User explicitly asks "always do X" | `rule`         | scope, trigger, applies_to                                   |
| Deferred question, answer reusable | `info-request` | question, detour_reason, expected_answer, preliminary_answer |
| Reusable answer prepared           | `article`      | summary, body, answers/supports                              |
| Obstacle stopping work             | `blocker`      | impact, workaround                                           |

Это сохраняет дисциплину Wolf, но добавляет recallium-подобную ясность для агентов.

### 3.4. Structured thinking (`memory think`)

Recallium: `start_thinking(goal, project_name)` → `add_thought(sequence_id, thought, thought_type)` → `conclusion` auto-stores as `decision`.

Wolf сейчас: `decision add --based-on ...`. Нет явного механизма для intermediate reasoning.

Предлагается:

- Добавить `thinking-sequence` как временный artifact (или как relation-структуру).
- CLI/MCP:
  - `memory think start --goal "..." --thread <id>` → returns sequence_id.
  - `memory think add --sequence <id> --type hypothesis|reasoning|evidence|concern`.
  - `memory think conclude --sequence <id> --title "..." --body "..."` → создаёт `decision` с `based_on` связями на все thoughts sequence.
- Sequence может быть сохранён как `decision` с embedded reasoning log или как отдельный `working-notes` artifact, связанный с `decision`.

Это усиливает `decision` в Wolf, давая traceable rationale.

### 3.5. Расширенная таксономия

Recallium имеет 11 типов, Wolf — 12. Но наборы различаются.

Типы Recallium, которых нет в Wolf и которые стоит добавить:

- `rule` — см. 3.2.
- `debug` — root cause + fix + files changed. В Wolf есть `lesson`, но `debug` более специфичен и лучше подходит для recurring bugs.
- `code-snippet` — reusable patterns. В Wolf можно было бы отнести к `lesson` или `article`, но dedicated type улучшает поиск.
- `design` — architecture explorations, system design notes. Близок к `article`, но `design` — это процесс, `article` — результат.
- `feature` — design notes, implementation approach. Может пересекаться с `work-thread`, но `feature` — это captured outcome, а `work-thread` — контекст работы.

Типы Wolf, которых нет в Recallium и которые стоит сохранить/усилить:

- `work-thread` — long-running context.
- `info-request` / `article` — deferred Q&A flow. Это ключевой unique feature Wolf.
- `blocker` — obstacle tracking.
- `session-checkpoint` — diffable snapshots.
- `document` / `context` — project-native reference registration.

Рекомендация по merge:

| Wolf type            | Recallium equivalent | Action                                                                       |
| -------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `decision`           | `decision`           | Keep, add structured thinking                                                |
| `blocker`            | нет                  | Keep                                                                         |
| `lesson`             | `learning`           | Keep `lesson`, optionally alias `learning`                                   |
| `observation`        | `working-notes`      | Keep `observation`                                                           |
| `session-summary`    | `progress`           | Keep both; `progress` for milestones, `session-summary` for session outcomes |
| `open-question`      | `working-notes`      | Keep `open-question`                                                         |
| `document`           | document uploads     | Keep reference-first; add optional ingest                                    |
| `context`            | нет                  | Keep                                                                         |
| `work-thread`        | нет                  | Keep                                                                         |
| `info-request`       | нет                  | Keep                                                                         |
| `article`            | нет                  | Keep                                                                         |
| `session-checkpoint` | нет                  | Keep                                                                         |
| `rule`               | `rule`               | Add                                                                          |
| `debug`              | `debug`              | Add                                                                          |
| `code-snippet`       | `code-snippet`       | Add                                                                          |
| `design`             | `design`             | Add                                                                          |
| `feature`            | `feature`            | Add optionally                                                               |

### 3.6. Инсайты и pattern analysis (`memory insights`)

Recallium: `get_insights(analysis_type)` — patterns, quality, technical_debt, learning, productivity, progress, comprehensive.

Wolf сейчас: `memory brief` — агрегация активной памяти, но без анализа.

Предлагается:

- Добавить `memory insights --topic <topic> --type <type>`.
- Реализовать двумя уровнями:
  - **Level 1 (no LLM):** эвристики на файлах — топ тегов, частые `related.files`, устаревшие решения, conflicting status, density of decisions/lessons/debug.
  - **Level 2 (optional LLM adapter):** LLM анализирует отфильтрованные объекты и выдаёт summary.
- Типы анализа:
  - `patterns` — повторяющиеся темы/файлы/решения.
  - `technical_debt` — `superseded`, `stale`, `conflicting`, устаревшие `decision`.
  - `decisions` — summary активных решений по теме.
  - `lessons` — recurring lessons по тегам.
  - `activity` — что менялось за период.

Level 1 работает без зависимостей и без API-ключей. Level 2 — optional adapter.

### 3.7. Гибридный поиск (semantic + keyword)

Recallium: hybrid search, 88% P@1. Wolf: SQLite FTS5 keyword search.

Предлагается:

- Оставить FTS5 как default (дешево, локально, нет зависимостей).
- Добавить **optional vector search adapter**:
  - Port: `EmbeddingProvider` + `VectorSearchIndex`.
  - Adapters: local (sentence-transformers via ONNX or `nomic-embed-text`), pgvector, OpenAI.
  - `search_mode: 'keyword' | 'semantic' | 'hybrid'`.
- При `hybrid` комбинировать FTS rank и cosine similarity.
- Добавить `file_path` filter (как у Recallium: `file_path='%auth.ts%'`).

Важно: vector index — derived, пересоздаваем из markdown-файлов. Файлы остаются canonical.

### 3.8. Session wrap-up habit

Wolf уже approved session wrap-up habit. Recallium предлагает похожий ритуал: "Summarize what we accomplished and save it".

Синтез:

- Auto-triggers на lifecycle events (`resolveBlocker`, `createDecision`, `createArticle`, `supersede`, terminal transitions).
- Manual `wolf memory session wrap-up`.
- `session-summary` object с агрегацией events.jsonl за период.
- Dedup: не чаще одного summary в 5 минут.

Это дополняет `memory recap`: `wrap-up` фиксирует итоги уходящей сессии, `recap` загружает контекст новой.

## 4. Что оставить и усилить в Mr. Wolf

### 4.1. Info-request / article flow — core differentiator

Это самая важная уникальная черта Wolf. Она решает проблему, которую Recallium не решает явно: **как отложить вопрос так, чтобы он не превратился в задачу, но стал reusable knowledge**.

Recallium имеет `research` и `discussion`, но нет эквивалента `info-request` → `article`. Это не task, не ticket, не subagent message. Это **knowledge acquisition protocol**:

1. В сессии возникает вопрос, ответ на который отвлечёт.
2. Агент обязан дать `preliminary_answer` (не избегать мышления).
3. Вопрос регистрируется как `info-request`, привязанный к `work-thread`.
4. В другой сессии (или вручную) готовится `article` — reusable answer.
5. `article` отвечает на `info-request` через relation `answers`.
6. `work-thread brief` показывает открытые и отвеченные запросы.

Этот flow должен остаться центральным. Его стоит усилить:

- Автоматическое обнаружение "висящих" `info-request` в `memory recap`.
- `article` может отвечать на несколько `info-request`.
- `info-request` может иметь `needed_for` — какому решению/блокеру он нужен.
- Автоматический переход `info-request` в `answered` при создании связанного `article`.

### 4.2. Files as source of truth

Это стратегическое преимущество Wolf. Recallium делает БД источником правды — это проще для продукта, но создаёт lock-in и скрывает данные от пользователя.

Wolf должен:

- Сохранить markdown canonical.
- Сделать vector search / insights derived.
- Поддерживать "Wolf-agnostic" чтение данных: любой markdown parser + YAML frontmatter достаточен.

### 4.3. Governance model

Recallium использует `importance_score` и `inactivate`. Wolf использует более формальную систему:

- `memory_class`: `working` / `canonical`.
- `truth_role`: `proposed_knowledge` / `accepted_knowledge` / `source_of_truth`.
- `lifetime`: `session` / `short_term` / `long_term`.
- `review_state`: `proposed` / `accepted` / `rejected`.
- lifecycle transitions с `ALLOWED_TRANSITIONS`.

Это сильнее, чем у Recallium. Стоит сохранить и расширить:

- `rule` → `canonical` + `source_of_truth`.
- `document` (registered source) → `canonical` + `source_of_truth`.
- `decision` от агента → `working` + `proposed_knowledge`.
- `article` → `canonical` + `accepted_knowledge` после review.

### 4.4. Relations.jsonl как canonical relation graph

Recallium использует `related_files` и links, но не имеет явного канонического relation graph. Wolf имеет `relations.jsonl` с предикатами.

Стоит сохранить и расширить предикаты:

- `answers` / `answered_by`
- `supports` / `supported_by`
- `based_on` / `basis_for`
- `updates` / `updated_by`
- `supersedes` / `superseded_by`
- `blocks` / `blocked_by`
- `resolves` / `resolved_by`
- `related_to`
- `produced_by`
- Добавить: `needs` / `needed_by` (info-request → decision/blocker), `contradicts` / `contradicted_by`.

### 4.5. Event log и аудит

`events.jsonl` — сильная сторона Wolf, которую Recallium не демонстрирует явно. Стоит использовать event log для:

- session wrap-up;
- activity insights;
- provenance tracking;
- debugging "what changed".

### 4.6. MCP как inbound adapter, не основной интерфейс

Recallium — это прежде всего MCP server. Wolf — это прежде всего CLI + файлы, с MCP как одним из inbound adapters.

Это правильно. MCP даёт интеграцию с IDE, но файлы дают универсальность и контроль.

## 5. Сравнительная матрица (детальная)

| Аспект                 | Recallium                               | Mr. Wolf                           | Синтез для Wolf                                               |
| ---------------------- | --------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| **Философия**          | Агент-first memory OS                   | Project-first memory substrate     | Сохранить project-first, добавить agent-first retrieval       |
| **Deployment**         | Docker, HTTP MCP                        | npm CLI, stdio MCP, files          | Оставить CLI/files; HTTP MCP — optional adapter позже         |
| **Source of truth**    | PostgreSQL                              | Markdown + YAML                    | Сохранить файлы; БД/vector — derived                          |
| **Лицензия**           | ELv2, closed-source server              | MIT, fully open                    | Сохранить open-source как преимущество                        |
| **Таксономия**         | 11 типов, developer-tuned               | 12 типов, structural artifacts     | Добавить `rule`, `debug`, `code-snippet`, `design`            |
| **Deferred Q&A**       | Нет явного flow                         | `info-request` → `article`         | Усилить как core differentiator                               |
| **Session continuity** | `recallium` magic word, `session_recap` | `memory brief`, `thread brief`     | Добавить `memory recap`                                       |
| **Правила**            | `rule` type, auto-load, global/project  | Нет dedicated type                 | Добавить `rule` с explicit creation                           |
| **Поиск**              | Hybrid semantic + keyword               | FTS5 keyword                       | Оставить FTS5 default, добавить optional vector adapter       |
| **Рассуждения**        | `start_thinking` sequence               | `decision` с `based_on`            | Добавить `memory think` sequences                             |
| **Инсайты**            | `get_insights` (LLM-powered)            | `memory brief` only                | Добавить `memory insights` (level 1 эвристики + optional LLM) |
| **Governance**         | importance_score, inactivate            | memory_class, truth_role, lifetime | Сохранить и расширить governance                              |
| **Relations**          | related_files, task links               | relations.jsonl с предикатами      | Сохранить relations.jsonl, расширить предикаты                |
| **Аудит**              | Не видно явно                           | events.jsonl                       | Сохранить и использовать для wrap-up/insights                 |
| **UI**                 | Web dashboard, setup wizard             | CLI, generated briefs              | Не добавлять обязательный UI; brief — markdown                |
| **Кросс-проект**       | Insights across projects                | Single project                     | Отложить до явной необходимости                               |
| **Документы**          | PDF ingest, chunk, embed                | Register by reference              | Оставить reference-first; добавить optional ingest            |

## 6. Предлагаемая унифицированная модель памяти

### 6.1. Типы памяти

| Тип                  | Назначение                            | Источник  |
| -------------------- | ------------------------------------- | --------- |
| `rule`               | Behavioral guardrails                 | Recallium |
| `decision`           | Архитектурный/процессный выбор        | Оба       |
| `blocker`            | Препятствие, остановившее работу      | Wolf      |
| `debug`              | Root cause + fix + changed files      | Recallium |
| `code-snippet`       | Reusable pattern                      | Recallium |
| `design`             | Architecture exploration notes        | Recallium |
| `feature`            | Implementation approach/outcome       | Recallium |
| `lesson`             | Неочевидный инсайт из ошибки          | Wolf      |
| `observation`        | Важный факт                           | Wolf      |
| `research`           | Внешние находки                       | Recallium |
| `progress`           | Milestone / where you left off        | Recallium |
| `session-summary`    | Итоги сессии                          | Wolf      |
| `open-question`      | Нерешённая гипотеза                   | Wolf      |
| `work-thread`        | Долгоживущий контекст работы          | Wolf      |
| `info-request`       | Отложенный вопрос                     | Wolf      |
| `article`            | Reusable answer                       | Wolf      |
| `session-checkpoint` | Снимок треда для diff                 | Wolf      |
| `document`           | Зарегистрированный проектный документ | Wolf      |
| `context`            | Скан проекта                          | Wolf      |

### 6.2. Конфигурируемая таксономия с immutable core pack

Типы памяти не hardcoded. Они объявляются в `.wolf/config.yaml`, но ядро поставляет **immutable core pack**, который агент не может изменить.

```yaml
memory_types:
  core: # immutable, managed by Mr. Wolf
    - decision
    - blocker
    - lesson
    - observation
    - session-summary
    - open-question
    - document
    - context
    - work-thread
    - info-request
    - article
    - session-checkpoint
    - rule
    - debug
    - code-snippet
    - design
  project: # mutable, project-specific extensions
    - api-contract
    - incident
```

Каждый тип конфигурируется:

```yaml
memory_type_config:
  rule:
    fields:
      scope:
        type: enum
        values: [project, global]
      applies_to:
        type: string_list
      trigger:
        type: string
    governance:
      memory_class: canonical
      truth_role: source_of_truth
      lifetime: long_term
  debug:
    fields:
      root_cause: { type: string }
      fix: { type: string }
      changed_files: { type: string_list }
```

Команды управления таксономией:

```bash
# List all available types (core + project)
wolf type list

# Add a project-specific type
wolf type add api-contract \
  --fields "owner:string,status:enum(open,closed),contract_path:string"

# Remove a project-specific type (only if no objects exist)
wolf type remove api-contract

# Show type schema
wolf type get api-contract
```

Правила:

- Core pack immutable. Агент и пользователь не могут его изменить.
- Project types могут добавлять только поля; не могут переопределять core types.
- Агент может добавлять project types, но не core types.
- Удаление project type возможно только при отсутствии объектов этого типа.
- CLI/MCP schemas генерируются из конфига.

### 6.3. Relation predicates

Добавить к существующим:

- `needs` / `needed_by` — info-request нужен для decision/blocker.
- `contradicts` / `contradicted_by` — конфликтующие решения/наблюдения.
- `implements` / `implemented_by` — code-snippet реализует decision/design.

## 7. Предлагаемая поверхность инструментов

### 7.1. CLI

```bash
# Session context
wolf recap                                 # новое: быстрый вход в сессию
wolf brief                                 # полный обзор проекта
wolf scan                                  # скан проекта

# Search
wolf search "..." --mode keyword|semantic|hybrid
wolf search "..." --file-path '%auth.ts%'
wolf insights --topic auth --type patterns

# Memory objects
wolf add --type rule --title "..." --scope global|project
wolf add --type debug --title "..." --related-files ...
wolf add --type code-snippet --title "..."
wolf add --type design --title "..."

# Thinking sequences
wolf think start --goal "..." --thread <id>
wolf think add --sequence <id> --type reasoning
wolf think conclude --sequence <id>

# Taxonomy management
wolf type list
wolf type add <name> --fields "..."
wolf type remove <name>
wolf type get <name>

# Documents
wolf ingest <path>                         # PDF/MD вне репо

# Existing commands kept
wolf thread ...
wolf info-request ...
wolf article ...
wolf decision ...
wolf blocker ...
wolf session checkpoint ...
wolf session wrap-up ...
```

### 7.2. MCP tools

| Tool                  | Source           | Notes                                   |
| --------------------- | ---------------- | --------------------------------------- |
| `recap`               | Recallium + Wolf | Быстрый session context                 |
| `search`              | Оба              | Добавить `mode`, `filePath`             |
| `insights`            | Recallium        | Pattern analysis                        |
| `get`                 | Wolf             |                                         |
| `list`                | Wolf             |                                         |
| `add`                 | Wolf             | Расширить типами                        |
| `create_decision`     | Wolf             |                                         |
| `create_blocker`      | Wolf             |                                         |
| `resolve_blocker`     | Wolf             |                                         |
| `create_thread`       | Wolf             |                                         |
| `create_info_request` | Wolf             |                                         |
| `create_article`      | Wolf             |                                         |
| `create_rule`         | Recallium        | Только по explicit request              |
| `get_rules`           | Recallium        | Project + global                        |
| `start_thinking`      | Recallium        |                                         |
| `add_thought`         | Recallium        |                                         |
| `conclude_thinking`   | Wolf             | Создаёт decision из sequence            |
| `scan`                | Wolf             |                                         |
| `brief`               | Wolf             |                                         |
| `session_wrap_up`     | Wolf             |                                         |
| `list_types`          | Wolf             | Core + project types                    |
| `add_type`            | Wolf             | Только project types, только агент/юзер |
| `remove_type`         | Wolf             | Только project types, только если пусто |
| `get_type`            | Wolf             | Schema of a type                        |

## 8. Архитектурный синтез

```text
┌─────────────────────────────────────────┐
│  CLI / MCP / future HTTP (inbound)      │
├─────────────────────────────────────────┤
│  app/use-cases                          │
│  - search (keyword / semantic / hybrid) │
│  - insights                             │
│  - recap                                │
│  - thinking sequences                   │
│  - wrap-up                              │
├─────────────────────────────────────────┤
│  domain: schemas, governance, policies  │
├─────────────────────────────────────────┤
│  ports                                  │
│  - MemoryStore (markdown files)         │
│  - SearchIndex (FTS5 / vector adapter)  │
│  - EventLog (jsonl)                     │
│  - RelationLog (jsonl)                  │
│  - ProjectScanner                       │
│  - InsightsEngine (optional LLM)        │
│  - EmbeddingProvider (optional)         │
├─────────────────────────────────────────┤
│  adapters                               │
│  - fs / sqlite / vector / llm           │
└─────────────────────────────────────────┘
```

Принцип: **файлы canonical**, векторный индекс и LLM — optional derived adapters.

## 9. Приоритеты внедрения

### Phase 6 (текущая): Governance

- Уже approved. В рамках неё добавить `rule` type и `scope`.

### Phase 7.1: MCP + Agent guidance

- Доделать MCP server (stdio).
- Создать `.wolf/SKILL.md` с триггерами и session startup ritual.
- Добавить `memory_recap`.

### Phase 7.2: Расширенная таксономия

- Добавить `debug`, `code-snippet`, `design`.
- Расширить `memory_add` и MCP schemas.

### Phase 7.3: Поиск

- Добавить `search_mode` и vector search adapter (local embeddings first).
- Добавить `file_path` filter.

### Phase 7.4: Инсайты

- `memory insights` с эвристическими анализами.
- Optional LLM adapter для глубокого анализа.

### Phase 7.5: Thinking sequences

- `memory think start/add/conclude`.

### Phase 8 (future): Documents & cross-project

- `memory ingest` для PDF.
- Multi-project awareness (когда понадобится).

## 10. Риски и решения

| Риск                                      | Митигация                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Раздувание таксономии                     | Вводить поэтапно; merge близких типов; `rule` и `debug` — первый приоритет |
| Зависимость от LLM/эмбеддингов            | Все LLM-зависимые фичи — optional adapters; FTS5 остаётся default          |
| Усложнение local-first модели             | Векторный индекс derived, пересоздаваем; файлы canonical                   |
| Правила, созданные агентом без разрешения | `rule` только по explicit user request; валидация в use-case               |
| Конфликт "not a task manager" с tasks     | Tasks — relation predicate / lightweight link, не отдельная система        |
| Дублирование `lesson`/`learning`          | Оставить `lesson` как canonical, `learning` — alias или deprecated         |
| Сложность `info-request` flow             | Автоматические relation + status transition; tutorial в SKILL.md           |

## 11. Рекомендуемые решения (decisions)

1. **Сохранить `info-request` → `article` flow как core differentiator.**
2. **Добавить `rule` как first-class memory type** с `scope: project | global` и explicit creation requirement.
3. **Внедрить `wolf recap`** для session continuity (аналог `session_recap` Recallium), но с прозрачным составом.
4. **Сохранить files-as-source-of-truth**; векторный поиск и LLM-инсайты как optional adapters.
5. **Сделать таксономию конфигурируемой** с immutable core pack и project-specific extensions, управляемыми через `wolf type`.
6. **Расширить core pack**: `rule`, `debug`, `code-snippet`, `design`.
7. **Добавить `wolf think`** для structured reasoning, где conclusion → `decision`.
8. **Добавить `wolf insights`** для pattern analysis над активной памятью (level 1 эвристики + optional LLM).
9. **Добавить `.wolf/SKILL.md`** с триггерами сохранения и session startup ritual.
10. **Добавить vector search adapter** позже, после стабилизации Phase 8.
11. **Усилить governance**: `rule` и `document` → `canonical`/`source_of_truth`, агентские `decision` → `working`/`proposed_knowledge`.
12. **Перейти на плоский CLI namespace**: `wolf add`, `wolf search`, `wolf recap` вместо `wolf memory ...`.

## 12. Вывод

Recallium и Mr. Wolf — это два ответа на один вопрос, но с противоположных концов:

- **Recallium** начинает с агента: "чтобы агент не забыл, сделаем ему удобную память".
- **Mr. Wolf** начинается с проекта: "чтобы проект не потерял знания, сделаем durable память".

Recallium сильнее в **retrieval UX для агента**: rules, recap, thinking sequences, insights, hybrid search. Mr. Wolf сильнее в **durability, governance и архитектуре**: files-first, hexagonal, relations, events, explicit artifact model.

**Оптимальный синтез** — не превращать Wolf в Recallium, а усилить Wolf агентскими паттернами Recallium, сохранив его substrate-характер. Результат: open-source, local-first, file-native memory substrate, который агенты могут использовать так же естественно, как Recallium, но с полным контролем и прозрачностью для пользователя.

Ключевые добавления:

- `memory_recap` — session continuity.
- `rule` — behavioral guardrails.
- `.wolf/SKILL.md` — агентские триггеры.
- `memory think` — structured reasoning.
- `memory insights` — pattern analysis.
- `debug`, `code-snippet`, `design` — расширенная таксономия.
- Optional vector search — semantic retrieval.
- `info-request` → `article` — остаётся и усиливается как уникальный механизм deferred knowledge acquisition.
