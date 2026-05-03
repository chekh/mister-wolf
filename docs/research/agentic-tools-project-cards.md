# Agentic Tools: Project Cards

**Generated:** 2026-05-03
**Scope:** Comparative research for Mr. Wolf framework
**Method:** Web-based repository analysis, README + source code review

---

## Project Card: Superpowers

### Basic
- **name:** Superpowers
- **repository:** https://github.com/obra/superpowers
- **host tool / ecosystem:** Claude Code, OpenAI Codex CLI/App, Cursor, OpenCode, Gemini CLI, GitHub Copilot CLI (multi-platform plugin)
- **primary purpose:** Методология разработки ПО и библиотека composable skills для coding-агентов. Обеспечивает дисциплину (TDD, brainstorming, code review) через prompt-инструкции, которые агент вызывает автоматически на основе триггеров.

### Integration surface
- **plugin** — применимо. Основная форма доставки: `.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`, `.opencode/plugins/superpowers.js`, gemini-extension.json. Каждый плагин инжектирует bootstrap (using-superpowers skill) в системный prompt или первое user-сообщение.
- **skill library** — применимо. Ядро проекта — управление библиотекой skills: 13 skills в каталоге `skills/<name>/SKILL.md` с YAML frontmatter (name, description). Description служит триггером для auto-discovery и принятия решения о загрузке.
- **subagent catalog** — применимо. Предопределённые агент-промпты в `agents/` (code-reviewer.md) с YAML frontmatter и system prompt.
- **command pack** — устарело. Команды в `commands/` депрекированы в пользу skills.
- **hook** — применимо. `hooks/session-start` + `hooks.json` для Claude Code; `experimental.chat.messages.transform` hook в OpenCode-плагине.
- **config pack** — частично. AGENTS.md, CLAUDE.md, GEMINI.md — project-level инструкции, но не формальный config pack.
- **MCP** — не применимо.
- **CLI** — не применимо. Нет standalone CLI; интеграция через плагины существующих агент-CLI.
- **tmux/runtime UI** — не применимо.
- **other** — Visual Companion (браузерный инструмент для brainstorming).

### Core primitives
- **agents** — да. Предопределённые system prompt-ы для subagent-ролей (code-reviewer, implementer, spec-reviewer).
- **subagents** — да. Ключевой primitive. `subagent-driven-development`, `dispatching-parallel-agents`, `executing-plans` — все построены на dispatch свежих subagent с изолированным контекстом.
- **skills** — да. Primary primitive. Markdown-файлы с YAML frontmatter. Два обязательных поля: `name`, `description`. Description служит триггером для auto-load.
- **commands** — депрекированы. Перешли на skills.
- **workflows** — да, неявно. Последовательность skills: `brainstorming` → `using-git-worktrees` → `writing-plans` → `subagent-driven-development`/`executing-plans` → `test-driven-development` → `requesting-code-review` → `finishing-a-development-branch`. Но это prompt-level workflow, не исполняемый граф.
- **hooks** — да. Session-start hook для bootstrap-инжекции.
- **artifacts** — минимально. Создаются markdown-файлы: design docs (`docs/superpowers/specs/`), implementation plans. Нет выделенной artifact-системы.
- **memory** — нет. Нет persistent memory между сессиями.
- **context** — да. Skills загружаются в prompt по требованию через `Skill` tool. Bootstrap (using-superpowers) инжектируется в каждую сессию.
- **policies** — да. Иерархия приоритетов: user instructions > superpowers skills > default system prompt.
- **approvals** — нет. Нет явных approval gates в framework.
- **traces/logs** — нет. Нет dedicated trace system.

### Model routing
**Классификация:** per agent / per category

**Описание:** Модель задаётся вручную при dispatch subagent. Skill `subagent-driven-development` прямо указывает: mechanical tasks → fast/cheap model, integration tasks → standard model, architecture/review → most capable model. Может меняться внутри процесса (разные subagents — разные модели). Нет automated routing engine; только guideline для human/agent выбора.

### Context strategy
**Как собирается context:** Bootstrap (using-superpowers) инжектируется в начало каждой сессии. При необходимости агент вызывает `Skill` tool, который загружает полное содержимое SKILL.md в контекст. Cross-references между skills используют имена, не force-load (`@` links избегаются для экономии токенов).

**Как skills/context попадают в prompt:** Через platform-specific hooks (system prompt transform или injection в первое user-сообщение). OpenCode использует `experimental.chat.messages.transform` для добавления bootstrap в первое сообщение, избегая token bloat от повторения system message каждый turn.

**Compaction strategy:** нет. Нет явного механизма compaction.

**Persistence на диск:** нет. Контекст не сохраняется между сессиями.

**Token visibility:** нет. Нет инструментов для мониторинга token usage.

**Context budget:** нет. Есть рекомендации по размеру skills (<150 words для getting-started, <200 для frequently-loaded, <500 для остальных), но нет жёсткого бюджета.

### Artifact / memory model
**Какие файлы создаются:** Markdown design specs (`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`), implementation plans, git commits. Работа ведётся в git worktrees на изолированных ветках.

**Markdown artifacts:** да, основной формат.

**Source of truth:** git-репозиторий проекта.

**Trace:** git history + commit messages. Нет dedicated trace artifact.

**Artifact lifecycle:** не формализован. Файлы создаются вручную skills, коммитятся в git. Нет automated lifecycle.

**Связи между artifacts:** нет. Нет системы связей или dependency graph между artifacts.

**Что переживает restart:** git-история и committed файлы. Контекст сессии, todo-листы, состояние skills — теряются.

### Safety / governance
**Approval gates:** нет. Только procedural guidance (HARD-GATE в brainstorming skill, "ask your human partner" в TDD). Нет enforced gates.

**Read-only constraints:** нет. Только инструкции в skills.

**Write restrictions:** нет. TDD skill требует удалить code written before tests, но это prompt-level требование без enforcement.

**Policy checks:** иерархия instruction priority (user > skills > default). Нет automated policy engine.

**Allowlists:** нет.

**Sandboxing:** нет.

**Undo/rollback:** только git (worktrees, branches, revert).

**Safety model:** отсутствует как формальный framework. Safety достигается через дисциплину skills (TDD, code review, verification-before-completion), но не через enforcement.

### Strengths
- Cross-platform: единая методология работает в Claude, Codex, Cursor, OpenCode, Gemini, Copilot.
- Battle-tested skills: 177k stars, adversarial pressure testing при разработке skills.
- Сильная дисциплина разработки: TDD с red-green-refactor, design-before-coding, two-stage code review.
- Subagent patterns: fresh context per task, parallel dispatch, role-based model selection.
- Skill auto-discovery: агент сам находит relevant skills по description.
- Zero dependencies.
- TDD для skills themselves: writing-skills skill применяет red-green-refactor к процессной документации.

### Limitations
- Нет runtime engine: workflow — это sequence of prompt instructions, не исполняемый state machine.
- Нет persistent memory/context между сессиями: каждая сессия начинается с чистого листа плюс bootstrap.
- Нет artifact management system: файлы создаются ad-hoc, нет lifecycle, relationships, indexing.
- Нет automated model routing: только guidelines, выбор делает агент/human.
- Нет approval/sandbox framework: safety полностью зависит от того, следует ли агент instructions.
- Нет formal workflow engine: нельзя declaratively задать DAG и отслеживать execution state.
- Single-session focus: не рассчитан на multi-session работу с восстановлением state.
- Нет observability: нет traces, token visibility, execution logs.

### What Wolf should reuse / learn
- Формат skill: YAML frontmatter + markdown body. Простой, searchable, version-controllable.
- Auto-trigger по description matching: агент решает загружать skill на основе его описания.
- Bootstrap injection: единый using-superpowers, который загружается в каждую сессию и определяет мета-правила.
- Instruction priority hierarchy: explicit priority (user > skills > default) для разрешения конфликтов.
- Subagent-driven-development: fresh subagent per task + two-stage review (spec compliance, then code quality).
- Model selection per role: guideline для выбора модели под задачу.
- TDD для процессов: applying red-green-refactor к документации и workflows.
- Cross-platform plugin architecture: адаптация под разные agent platforms через thin adapter layer.
- Rationalization tables и red flags: bulletproofing skills против обхода правил.
- Visual Companion как optional tool: не режим, а инструмент, который предлагается по необходимости.

### What Wolf should avoid
- Полная зависимость от prompt-based enforcement без runtime checks. Если агент игнорирует skill, нет fallback.
- Отсутствие persistent state между сессиями. Wolf должен иметь case store и context resolver.
- Отсутствие formal workflow engine. Skills хороши, но Wolf нужен executable DAG с state machine.
- Отсутствие artifact lifecycle. Файлы на диске ≠ managed artifacts.
- Отсутствие safety enforcement. Approval gates должны быть реальными, не только prompt instructions.
- Tight coupling к конкретным agent platforms — Wolf должен быть platform-agnostic runtime.
- Отсутствие observability. Нужны traces, execution logs, token metrics.

### Wolf gap / opportunity
- **Runtime engine поверх skills:** Wolf должен добавить исполняемый workflow engine (DAG, state machine, registry runners), который может orchestrate skills как шаги, а не просто предлагать их агенту.
- **Persistent state и context resolver:** Case store с SQLite index, позволяющий восстанавливать контекст между сессиями. MVP2 Context Resolver — именно это.
- **Artifact management:** Typed artifacts с lifecycle, relationships, source of truth, переживающие restart.
- **Policy engine с enforcement:** Не только prompt instructions, но и runtime checks, approval gates, allowlists.
- **Automated model router:** Динамический выбор модели на основе task complexity, не только guideline.
- **Multi-session continuity:** Сохранение todo, state, context между сессиями.
- **Observability layer:** Traces, execution logs, token budget visibility.
- **Safety framework:** Sandbox, undo/rollback beyond git, write restrictions.

---

## Project Card: opencode-agent-skills

### Basic
- **name:** opencode-agent-skills
- **repository:** https://github.com/joshuadavidthomas/opencode-agent-skills
- **host tool / ecosystem:** OpenCode (Anomaly)
- **primary purpose:** Динамический плагин для OpenCode, предоставляющий инструменты для обнаружения, загрузки и использования reusable AI agent skills внутри сессии.

### Integration surface
- **plugin** — Да. Это npm-плагин для OpenCode, подключается через `opencode.json`. Регистрирует 4 tool'а и обрабатывает события сессии.
- **skill library** — Да. Ядро проекта — управление библиотекой skills: обнаружение из нескольких источников, валидация frontmatter, загрузка в контекст.
- **hook** — Да. Использует хуки `chat.message`, `session.compacted`, `session.deleted` для инжекции и восстановления контекста.
- **other** — Обратная совместимость с экосистемой Claude Code (skills из `.claude/skills/` и `.claude/plugins/`).

### Core primitives
- **skills** — Да. Основной примитив: директория с `SKILL.md` (YAML frontmatter + markdown-инструкции). Также supporting files и executable scripts.
- **commands** — Нет в традиционном смысле. 4 tool'а: `use_skill`, `read_skill_file`, `run_skill_script`, `get_available_skills`.
- **hooks** — Да. Event-driven: перехват сообщений, compaction, удаление сессии.
- **context** — Да. Управление контекстом через synthetic message injection (`noReply` + `synthetic`).
- **agents / subagents / workflows / artifacts / memory / policies / approvals / traces** — Нет (плагин не оркестрирует агентов и не управляет артефактами).

### Model routing
- **Классификация:** none
- **Описание:** Модель задаётся OpenCode. Плагин только сохраняет `model` и `agent` из текущего сообщения и передаёт их при `injectSyntheticContent`, чтобы предотвратить нежелательное переключение модели. Routing между специалистами или шагами отсутствует.

### Context strategy
- **Сбор context:** Skills загружаются в контекст как synthetic-сообщения через OpenCode SDK. При старте сессии инжектируется список `<available-skills>`. При `use_skill` — полное содержимое SKILL.md.
- **Попадание skills в prompt:** Явный вызов `use_skill` или automatic semantic matching по user message.
- **Compaction strategy:** Да. Плагин слушает `session.compacted` и повторно инжектирует список skills + superpowers bootstrap.
- **Persistence на диск:** Только кэш embeddings (`~/.cache/opencode-agent-skills/embeddings/`). Контекст сессии и загруженные skills — ephemeral.
- **Token visibility / context budget:** Нет.

### Artifact / memory model
- **Файлы:** SKILL.md (markdown + YAML frontmatter), supporting files, executable scripts.
- **Markdown artifacts:** Да. Содержимое skill — это markdown-инструкции.
- **Source of truth:** Файловая система (`.opencode/skills/`, `.claude/skills/` и др.).
- **Trace / lifecycle / связи:** Нет. Skills — статичные файлы без trace или связей между собой.
- **Что переживает restart:** Файлы skills на диске. `loadedSkillsPerSession` и `setupCompleteSessions` — in-memory Map, сбрасываются при compaction/restart.

### Safety / governance
- **Approval gates:** Нет.
- **Read-only constraints / write restrictions:** Есть path safety check (`isPathSafe`) при `read_skill_file` для предотвращения directory traversal.
- **Policy checks:** В frontmatter есть поле `allowed-tools`, но оно не enforced плагином.
- **Allowlists / sandboxing:** Нет. Скрипты выполняются через OpenCode shell abstraction (`$`), CWD = директория skill.
- **Undo/rollback:** Нет.
- **Safety model:** Минимальный — safe YAML parsing (`core` schema, `maxAliasCount`), path sanitization, fuzzy matching для предотвращения ошибок имён.

### Strengths
- Чёткая фокусировка на одной задаче: discovery и доставка skills в контекст.
- Multi-source discovery с приоритетами (project > user > marketplace) и namespace resolution.
- Compaction resilience: skills переживают compaction длинных сессий.
- Semantic automatic skill matching через embeddings (Hugging Face `all-MiniLM-L6-v2`).
- Совместимость с существующей экосистемой Claude Code skills/plugins.

### Limitations
- Нет оркестрации workflows — только загрузка статичных инструкций.
- Нет persistent state между сессиями (per-session ephemeral memory).
- Нет enforcement декларативных policies (`allowed-tools` в frontmatter игнорируется).
- Нет model routing и multi-agent coordination.
- Semantic matching работает только по `description`, не по полному содержимому skill.
- Жёсткая привязка к OpenCode SDK.

### What Wolf should reuse / learn
- Механизм multi-source skill discovery с namespace priority.
- Synthetic message injection как способ сделать skills persistent в контексте.
- Compaction resilience через event hooks и re-injection.
- Semantic matching для автоматической подгрузки релевантных skills.
- Fuzzy matching и path safety для UX безопасности.
- Интеграция с существующими экосистемами (Claude Code skills).

### What Wolf should avoid
- Жёсткая привязка к одному host tool — Wolf должен быть агностичным к runtime.
- Декларативные policies без enforcement.
- Ephemeral per-session state без durable persistence.
- Отсутствие workflow engine (только static instruction loading недостаточно).
- Basic semantic matching без учёта полного содержимого skill.

### Wolf gap / opportunity
- Wolf должен добавить поверх: **workflow engine** (sequential + graph execution), **stateful persistence** (SQLite/file-based case store), **policy enforcement layer** (проверка allowed-tools и sandboxing), **artifact lifecycle management**, **model routing** и **multi-agent coordination**. Плагин решает «как доставить инструкции в контекст», Wolf должен решать «как оркестрировать работу агента на основе этих инструкций».

---

## Project Card: opencode-background-agents

### Basic
- **name:** opencode-background-agents (реестровое имя `kdco/background-agents`)
- **repository:** https://github.com/kdcokenny/opencode-background-agents
- **host tool / ecosystem:** OpenCode CLI
- **primary purpose:** Плагин для OpenCode, реализующий асинхронное фоновое делегирование задач агентам с персистентностью результатов. Позволяет запускать исследовательские и вычислительные задачи в изолированных сессиях, не блокируя основной диалог, и сохраняет результаты на диск в виде markdown-файлов, что гарантирует выживаемость данных при compaction контекста, перезапуске сессии или аварийном завершении процесса.

### Integration surface
- **plugin** — Да. OpenCode npm-плагин, подключается через `opencode.json`.
- **subagent catalog** — Частично. Управление фоновыми субагентами, но не каталог ролей.
- **CLI** — Нет standalone CLI.
- **hook** — Да. `session.status`, `session.idle`, `message.updated`, `tool.execute.before`, `experimental.chat.system.transform`, `experimental.session.compacting`.
- **skill library** — Нет.
- **command pack** — Нет.
- **tmux/runtime UI** — Нет внутри плагина, но совместим с opentmux.
- **config pack** — Нет.
- **MCP** — Нет.
- **other** — Нет.

### Core primitives
- **agents** — нет фиксированных ролей.
- **subagents** — Да. Фоновые read-only subagents с изолированными сессиями.
- **skills** — Нет.
- **commands** — 3 tool'а: `delegate`, `delegation_read`, `delegation_list`.
- **workflows** — Нет formal engine. Только fire-and-forget делегирование.
- **hooks** — Да. Event-driven lifecycle management.
- **artifacts** — Да. Markdown-файлы результатов делегаций на диске.
- **memory** — Частично. DelegationRecord в памяти + файловое хранение результатов.
- **context** — Минимальный. Synthetic message injection для compaction resilience.
- **policies** — Частично. Read-only constraints для фоновых агентов.
- **approvals** — Нет.
- **traces/logs** — Частично. Debug-логи + файлы результатов.

### Model routing
- **Классификация:** per agent (implicit)
- **Описание:** Модель задаётся при создании фоновой сессии через OpenCode API. Плагин сохраняет `model` и `agent` для synthetic injection. Нет dynamic routing — просто передача текущей конфигурации.

### Context strategy
- **Сбор context:** Минимальный. DelegationManager хранит in-memory Map записей. При compaction инжектирует список активных/непрочитанных делегаций.
- **Попадание в prompt:** Через synthetic message injection (`noReply`).
- **Compaction strategy:** Да. Re-injection при `session.compacted`.
- **Persistence на диск:** Файлы результатов делегаций (`~/.local/share/opencode/delegations/`), но runtime state (DelegatioRecord) — in-memory.
- **Token visibility:** Нет.
- **Context budget:** Нет.

### Artifact / memory model
- **Файлы:** Markdown-результаты делегаций в `~/.local/share/opencode/delegations/<project-id>/<root-session-id>/<id>.md`.
- **Markdown artifacts:** Да, основной формат результатов.
- **Source of truth:** Файловая система.
- **Trace:** Файлы результатов + git root commit hash для project-id.
- **Artifact lifecycle:** Статусы жизненного цикла (registered → running → terminal), но не управление артефактами как таковое.
- **Связи между artifacts:** Нет.
- **Что переживает restart:** Только файлы результатов на диске. In-memory state теряется.

### Safety / governance
- **Approval gates:** Нет.
- **Read-only constraints:** Да. Только read-only sub-agents (`edit="deny"`, `write="deny"`, `bash={"*":"deny"}`). Write-capable агенты должны использовать native `task`.
- **Write restrictions:** Да, через OpenCode permissions.
- **Policy checks:** Минимальные. Tool guards перехватывают native `task` для read-only агентов.
- **Allowlists:** Нет.
- **Sandboxing:** Нет.
- **Undo/rollback:** Нет.
- **Safety model:** Ограниченный — read-only by default, anti-recursion (отключение task/delegate/todowrite/plan_save во вложенных сессиях), grace period для чтения результатов.

### Strengths
- Persistence результатов на диске — переживает compaction, restart, crash.
- Read-only by default для фоновых задач.
- Graceful degradation (fallback на truncation при недоступности small_model).
- Cycle tokens для защиты от устаревших batch-уведомлений.
- Terminal-state protection.
- Persistence before notification.

### Limitations
- Только read-only sub-agents; write-capable агенты не могут использовать `delegate`.
- Hard timeout: 15 минут на делегацию.
- Не реплицирует внутренний AppState и task queue OpenCode.
- Нет нативной интеграции с undo/branching системой OpenCode для фоновых сессий.
- Не поддерживает real-time monitoring внутри плагина.
- Нет persistent runtime state (только файлы результатов).

### What Wolf should reuse / learn
- Персистентность результатов делегирования на диске.
- Read-only by default для background work.
- Graceful degradation и fallback patterns.
- Terminal-state protection и deterministic read.
- Synthetic message injection для compaction resilience.

### What Wolf should avoid
- Только read-only delegation — Wolf должен поддерживать оба режима с соответствующими policy controls.
- Hard timeout без configurability.
- Отсутствие persistent runtime state.
- Отсутствие real-time monitoring.

### Wolf gap / opportunity
- Wolf должен добавить **универсальный слой делегирования** с persistent state machine: запись делегаций в case store, отслеживание статусов, recovery после restart, integration с workflow engine.
- **Read-only background delegation by default** как policy primitive.
- **Artifact-aware delegation:** не просто сохранить markdown, а создать typed artifact в Wolf artifact store.
- **Cross-session delegation tracking** через SQLite index.

---

## Project Card: OpenCode Context Analysis Plugin

### Basic
- **name:** OpenCode Context Analysis Plugin
- **repository:** https://github.com/IgorWarzocha/Opencode-Context-Analysis-Plugin
- **host tool / ecosystem:** OpenCode (opencode.ai)
- **primary purpose:** Анализ распределения токенов в AI-сессиях — визуализация сколько токенов уходит на system prompts, user messages, assistant responses, tool outputs и reasoning traces.

### Integration surface
- **plugin** — Да. OpenCode plugin на базе `@opencode-ai/plugin`.
- **command pack** — Да. Slash-команда `/context` с аргументами (detailed, short, verbose, sessionID, limitMessages).
- **skill library** — Нет.
- **subagent catalog** — Нет.
- **CLI** — Нет.
- **hook** — Нет.
- **tmux/runtime UI** — Нет.
- **config pack** — Нет.
- **MCP** — Нет.
- **other** — Нет.

### Core primitives
- **commands** — `/context` с вариантами детализации и фильтрацией по sessionID/limitMessages.
- **context** — Читает историю сообщений через `client.session.messages()`, анализирует parts (text, reasoning, tool).
- **agents / subagents / skills / workflows / hooks / artifacts / memory / policies / approvals / traces/logs** — отсутствуют. Анализ эфемерный, без персистентности.

### Model routing
- **Классификация:** per session / dynamic
- **Описание:** Модель определяется динамически из метаданных сообщений сессии (`modelID`, `providerID`). Есть registry токенизаторов с fallback: сначала tiktoken для OpenAI-моделей, затем HuggingFace transformers для Claude/Llama/Mistral/DeepSeek, в крайнем случае — аппроксимация (chars/4). Если в сессии менялись модели, сканирует историю в обратном порядке и выбирает первую подходящую.

### Context strategy
- **Сбор context:** Читает полную историю сессии через OpenCode Client API, парсит `SessionMessage` с `parts` (text, reasoning, tool).
- **Попадание в prompt:** Не применимо — это инструмент анализа, не агент.
- **Compaction strategy:** Аргумент `limitMessages` (1–10) ограничивает глубину анализа.
- **Persistence на диск:** Отсутствует — анализ чисто in-memory.
- **Token visibility:** Полная — это единственная цель плагина.
- **Context budget:** Нет явного бюджета, только визуализация фактического потребления.

### Artifact / memory model
- **Создаваемые файлы:** Нет персистентных файлов. Вывод — inline ASCII bar chart и текстовый summary в чат.
- **Markdown artifacts:** Нет.
- **Source of truth:** Сообщения сессии из OpenCode API.
- **Trace:** Нет.
- **Artifact lifecycle:** Нет.
- **Связи между artifacts:** Нет.
- **Что переживает restart:** Ничего — анализ полностью эфемерный.

### Safety / governance
- Safety model отсутствует. Плагин только читает историю сессии и выводит текстовый отчёт.

### Strengths
- Мультитокенизаторная архитектура: tiktoken + HuggingFace transformers + fallback.
- Выравнивание с telemetry: масштабирует измеренные токены к реальным API-значениям.
- Визуализация: ASCII bar charts + проценты + top contributors.
- Агрегация по инструментам: показывает какой tool съедает больше всего токенов.
- Локальная обработка: ничего не уходит на внешние сервисы.

### Limitations
- Эфемерность — нет истории анализов, трендов, сравнений между сессиями.
- Только reactive — нужно вручную вызывать `/context`, нет proactive алертов.
- Нет интеграции с ценообразованием/бюджетом.
- Жёсткая привязка к экосистеме OpenCode.
- Нет действий на основе анализа — только наблюдение.

### What Wolf should reuse / learn
- Архитектура мультитокенизаторного движка с fallback-цепочкой.
- Методология выравнивания measured tokens с API telemetry.
- Категоризацию контекста по ролям (system/user/assistant/tools/reasoning).
- Агрегацию токенов на уровне отдельных инструментов.
- Формат визуального отчёта (bar chart + top contributors).

### What Wolf should avoid
- Хардкод эвристик идентификации системных промптов.
- Отсутствие персистентности анализов.
- Исключительно manual invocation без фонового мониторинга.
- Тесную связь с API единственной хост-платформы.

### Wolf gap / opportunity
- Wolf должен добавить **персистентный слой контекст-аналитики** поверх case-store: хранение истории токен-профилей по сессиям/воркфлоу/агентам для трендов и диагностики.
- **Proactive token budget alerts** как first-class policy primitive — триггеры на превышение лимитов по шагу/воркфлоу/агенту.
- **Контекстная compaction strategy** на основе usage patterns (рекомендации что урезать).
- **Интеграция аналитики с cost estimation** и billing в рамках Wolf runtime.

---

## Project Card: Oh My OpenAgent (Oh My OpenCode)

### Basic
- **name:** Oh My OpenAgent / Oh My OpenCode
- **repository:** https://github.com/code-yeongyu/oh-my-openagent
- **host tool / ecosystem:** OpenCode CLI (plugin), Claude Code compatible
- **primary purpose:** Multi-model agent orchestration harness для разработки: превращает один AI-агент в координированную команду специалистов с параллельным выполнением, category-based routing моделей и advanced tool integrations.

### Integration surface
- **plugin** — Да — публикуется как npm-пакет `oh-my-opencode`, подключается в `opencode.json`.
- **command pack** — Да — встроенные slash-команды (`/init-deep`, `/ralph-loop`, `/refactor`, `/start-work`, `/handoff`, `/ulw-loop` и др.).
- **skill library** — Да — skills с embedded MCP servers (`playwright`, `git-master`, `frontend-ui-ux`, `review-work`, `ai-slop-remover` и др.).
- **subagent catalog** — Да — 11+ специализированных агентов (Sisyphus, Hephaestus, Prometheus, Oracle, Librarian, Explore, Atlas, Metis, Momus, Multimodal-Looker, Sisyphus-Junior).
- **CLI** — Да — `bunx oh-my-opencode`, включая `doctor`, `refresh-model-capabilities`.
- **hook** — Да — 25+ встроенных hooks на событиях PreToolUse, PostToolUse, Message, Event, Transform, Params.
- **tmux/runtime UI** — Да — интеграция с tmux для запуска background агентов в отдельных panes с live output.
- **config pack** — Да — JSONC-конфиг (`oh-my-openagent.jsonc`) с агентами, категориями, fallback chains, permissions.
- **MCP** — Да — built-in MCPs (websearch/Exa, context7, grep_app) + skill-embedded MCPs on-demand.
- **other** — Hash-anchored edit tool (Hashline), LSP интеграция, AST-Grep, interactive_bash через tmux.

### Core primitives
- **agents** — Да — 11 специализированных агентов с фиксированными ролями, оптимизированными моделями и матрицами разрешений.
- **subagents** — Да — `task()` и `call_omo_agent()` для фонового/параллельного выполнения, включая `run_in_background`.
- **skills** — Да — domain-specific инструкции + embedded MCP servers, загружаемые из `.opencode/skills/*/SKILL.md`.
- **commands** — Да — slash-triggered workflows (`/init-deep`, `/start-work`, `/refactor` и др.).
- **workflows** — Да — `ultrawork`, Ralph Loop, Prometheus planning → Atlas execution, todo continuation, category-based delegation.
- **hooks** — Да — полный pipeline hooks (context injection, recovery, truncation, notifications, compaction).
- **artifacts** — Иерархические `AGENTS.md`, task JSON-файлы в `.sisyphus/tasks/`, handoff-документы для передачи между сессиями.
- **memory** — Wisdom accumulation (накопление learnings между задачами), session recovery, compaction.
- **context** — Auto-inject `AGENTS.md`, `README.md`, rules из `.claude/rules/`, conditional context injection.
- **policies** — Agent-level tool restrictions (blocked lists), permission matrix (ask/allow/deny), category-level tool disable.
- **approvals** — Permission gates для `edit`, `bash`, `webfetch`, `doom_loop`, `external_directory` на уровне агента.
- **traces/logs** — Session tools (`session_list`, `session_read`, `session_search`, `session_info`), background notifications.

### Model routing
- **Классификация:** per category
- **Описание:** Sisyphus делегирует не модель, а категорию (`visual-engineering`, `ultrabrain`, `deep`, `quick`, `artistry`, `writing` и др.). Каждая категория мапится на конкретную модель с вариантом (`max`, `high`, `xhigh`, `medium`). Модель может меняться внутри процесса через цепочки `fallback_models` (per-agent и per-category) и runtime fallback на ошибках API. Routing между specialists выполняется через category-based delegation: каждый specialist получает модель, оптимальную для типа работы.

### Context strategy
- **Сбор context:** Иерархические `AGENTS.md` авто-инжектируются при чтении файлов (directory-agents-injector), `README.md` для директорий, rules из `.claude/rules/` с glob/alwaysApply. Skills добавляют domain context и MCP tools в prompt.
- **Skills/context в prompt:** Через directory-agents-injector, rules-injector, category-skill-reminder, а также напрямую через SKILL.md (frontmatter + markdown body инжектируются в system prompt).
- **Compaction strategy:** Preemptive compaction, context-window-monitor, aggressive truncation, dynamic context pruning (экспериментально: deduplication, supersede_writes, purge_errors). Сохранение critical context через compaction-context-injector.
- **Persistence на диск:** Task system хранит JSON в `.sisyphus/tasks/`, AGENTS.md — в проекте, handoff — в сессии.
- **Token visibility:** context-window-monitor отслеживает потребление токенов.
- **Context budget:** Thinking budget (например, 32k для Sisyphus), maxTokens per agent/category, dynamic truncation на основе context window.

### Artifact / memory model
- **Создаваемые файлы:** Иерархические `AGENTS.md` (project-wide → module-specific → component-specific), task JSON в `.sisyphus/tasks/` (cross-session), handoff-документы.
- **Markdown artifacts:** Да, AGENTS.md как primary context artifact.
- **Source of truth:** AGENTS.md для контекста проекта, task files для плана выполнения.
- **Trace:** Session tools предоставляют доступ к истории сессий, но полноценный trace artifact не выделен.
- **Artifact lifecycle:** Task system имеет статусы (`pending`, `in_progress`, `completed`, `deleted`) и зависимости (`blockedBy`, `blocks`). AGENTS.md — long-lived. Нет явного garbage collection.
- **Связи между artifacts:** Tasks связаны через `blockedBy`/`blocks` (DAG зависимостей). Wisdom accumulation предполагает передачу learnings между задачами.
- **Переживание restart:** Tasks (файловое хранение), AGENTS.md (в репозитории), handoff-документы. Session memory теряется.

### Safety / governance
- **Approval gates:** Agent permissions (`ask`/`allow`/`deny`) для `edit`, `bash`, `webfetch`, `doom_loop`, `external_directory`.
- **Read-only constraints:** Oracle (read-only consultant), Librarian, Explore — не могут писать/редактировать/делегировать. Multimodal-Looker — whitelist: только `read`.
- **Write restrictions:** `write-existing-file-guard` блокирует перезапись без предварительного чтения. Hashline edit tool валидирует content hash перед применением изменений.
- **Policy checks:** Tool restrictions per agent (blocked lists), category-level tool disable.
- **Allowlists:** Нет явного allowlist для инструментов (кроме multimodal-looker).
- **Sandboxing:** Отсутствует.
- **Undo/rollback:** Edit-error-recovery hook, но нет явного rollback механизма.
- **Safety model:** Ограниченный — permissions на уровне агента + hooks для recovery, но нет комплексной governance модели.

### Strengths
- Мощная multi-model orchestration с category-based routing — автоматический выбор оптимальной модели под тип задачи.
- Hash-anchored edit tool (Hashline) — радикально снижает stale-line ошибки при редактировании файлов.
- Skill-embedded MCPs — lazy loading MCP servers, не раздувающие context window постоянно.
- Parallel background agents с tmux визуализацией — настоящая параллельная работа dev-команды.
- Hierarchical AGENTS.md — эффективная иерархическая контекстная система без ручного управления.
- IntentGate — классификация намерений перед действием, снижающая буквальные ошибки интерпретации.
- Высокая resilience: session recovery, runtime fallback, model fallback chains, preemptive compaction.
- Интеграция LSP + AST-Grep как first-class tools для агентов.
- Todo continuation enforcer — принудительное доведение задач до конца.

### Limitations
- Жёсткая зависимость от OpenCode CLI — не standalone runtime, а plugin.
- Отсутствие декларативного workflow engine (DAG, stages, conditions) — оркестрация через императивное делегирование.
- Нет долговременной памяти/vector store — wisdom accumulation упоминается, но не детализирована как система.
- Ограниченная safety/governance: нет sandboxing, нет сложных approval workflows, нет rollback.
- Конфигурация через JSONC — не декларативные reusable workflows.
- Нет явного artifact lifecycle management и связей между artifacts (кроме task dependencies).
- Нет dynamic routing на основе содержимого задачи — только предопределённые категории.

### What Wolf should reuse / learn
- Category-based model routing (per category delegation с fallback chains).
- Hash-anchored edit tool для надёжных файловых правок.
- Skill-embedded MCPs (lazy on-demand loading).
- Parallel background agents с runtime UI.
- Hierarchical AGENTS.md как стандарт контекстного документирования.
- IntentGate — классификация намерений перед действием.
- Agent permission matrix (tool restrictions + ask/allow/deny).
- Session recovery, runtime fallback и resilience patterns.
- Todo continuation enforcement.
- LSP/AST-Grep интеграция как first-class citizen для агентов.

### What Wolf should avoid
- Привязку к конкретному CLI — Wolf должен быть standalone runtime.
- JSONC-конфигурацию вместо декларативных reusable workflows.
- Отсутствие долговременной памяти и artifact lifecycle.
- Отсутствие sandboxing и rollback механизмов.
- Жёсткую привязку агентов к моделям без dynamic content-based routing.

### Wolf gap / opportunity
- Wolf должен добавить **standalone runtime** (не plugin к чужому CLI).
- **Декларативный workflow engine** (DAG, YAML-описание stages, conditions, parallel/sequential execution).
- **Долговременную память и vector store** для cross-session learning.
- **Artifact lifecycle management** — создание, версионирование, связывание и garbage collection artifacts.
- **Sandboxed execution environment** для безопасного выполнения операций.
- **Сложные approval workflows и policies** — не только per-agent permissions, но и project-level governance.
- **Cross-session context resolver** — автоматическое восстановление контекста между сессиями без ручного handoff.
- **Unified artifact store** — централизованное хранилище для всех artifacts с traceability.

---

## Project Card: oh-my-opencode-slim

### Basic
- **name:** oh-my-opencode-slim
- **repository:** https://github.com/alvinunreal/oh-my-opencode-slim
- **host tool / ecosystem:** OpenCode (plugin architecture)
- **primary purpose:** Мульти-агентная оркестрация внутри OpenCode — делегация задач специализированным агентам (Explorer, Oracle, Fixer, Designer, Librarian, Council) под управлением Orchestrator для баланса качества, скорости и стоимости.

### Integration surface
- **plugin** — Да. Регистрируется в `opencode.json`/`tui.json`, экспортирует `agent`, `tool`, `mcp`, `config()`, хуки жизненного цикла.
- **command pack** — Да — `/auto-continue`, `/preset`, команды interview и council.
- **skill library** — Да — skills как prompt-based конфигурации (`simplify`, `agent-browser`, `codemap`), назначаются per-agent через `skills: ["*"]`.
- **subagent catalog** — Да — фиксированный набор субагентов (Pantheon) + кастомные агенты через `agents.<name>` с `orchestratorPrompt`.
- **CLI** — Да — установщик `bunx oh-my-opencode-slim@latest install`, генерация конфигов.
- **hook** — Да — обширная система хуков OpenCode: `chat.headers`, `chat.message`, `experimental.chat.messages.transform`, `experimental.chat.system.transform`, `tool.execute.before/after`, `command.execute.before`, `event`.
- **tmux/runtime UI** — Да — интеграция с tmux/Zellij через `multiplexer` (спавн панелей для child sessions), TUI sidebar через `tui.json`.
- **config pack** — Да — JSONC-конфиг `~/.config/opencode/oh-my-opencode-slim.jsonc`, presets per agent, override через `.md` файлы.
- **MCP** — Да — встроенные MCP-серверы (`websearch`, `context7`, `grep_app`) с per-agent разрешениями.
- **other** — Divoom Bluetooth display интеграция, авто-обновление плагина.

### Core primitives
- **agents** — Да — 7+ встроенных специалистов + кастомные. Каждый — промпт + модель + temperature + permissions.
- **subagents** — Да — child sessions через OpenCode `Task` tool. Orchestrator делегирует через `@agent` упоминания. Subagent depth tracker для предотвращения рекурсии.
- **skills** — Да — prompt-based инструкции, инжектируемые в system prompt агента. `getSkillPermissionsForAgent` управляет доступом.
- **commands** — Да — `/auto-continue`, `/preset`, interview UI commands. Регистрируются в `opencodeConfig.command`.
- **workflows** — Да — неявные (prompt-driven): Understand → Path Selection → Delegation Check → Split/Parallelize → Execute → Verify. Нет формального workflow engine.
- **hooks** — Да — 10+ хуков для инжекции промптов, retry-логики, фильтрации skills, image stripping, JSON recovery, phase reminders.
- **artifacts** — Да — `codemap.md` (иерархическая карта кодовой базы), interview output (markdown файлы в `interview/`). Нет универсальной artifact-модели.
- **memory** — Частично — session reuse (in-memory, 2 сессии на тип агента), read-context tracking (последние файлы). Нет persistent memory на диск.
- **context** — Да — session-scoped context через child sessions. Orchestrator видит aliases resumable sessions + read context. `collapseSystemInPlace` для совместимости провайдеров.
- **policies** — Да — MCP permissions (`allow`/`deny`), skill permissions, agent mode (`primary`/`subagent`/`all`), disabled agents, subagent depth limit.
- **approvals** — Нет. Полагается на систему permissions OpenCode.
- **traces/logs** — Частично — `initLogger(sessionId)` для внутреннего логирования, no structured trace artifacts.

### Model routing
**Классификация:** per agent + dynamic fallback

**Описание:** Модель задаётся per agent в `presets.<preset>.<agent>.model`. Поддерживается `variant` (`low`/`medium`/`high`) для reasoning effort. Runtime preset switching через `/preset` команда. Fallback chains (`fallback.chains.<agent>`) с runtime failover через `ForegroundFallbackManager` при rate-limit/timeout. Модель может быть массивом с приоритетами (`_modelArray`). Council имеет отдельный слой: synthesizer model для Council agent + councillor models через `council.presets`. Нет dynamic routing внутри single prompt — routing происходит на уровне делегации между агентами.

### Context strategy
**Описание:** Context собирается ad-hoc через делегацию: Orchestrator предоставляет summary + ссылки на файлы, субагент читает сам. Skills инжектируются в system prompt через `filterAvailableSkillsHook`. Session management отслеживает последние child sessions (до 2 на тип) и read context (файлы ≥10 строк, max 8 файлов на сессию) — инжектируется в orchestrator prompt как compact reminder. **Compaction:** `collapseSystemInPlace` склеивает multiple system messages в одну; `processImageAttachments` вырезает image bytes из orchestrator messages и заменяет текстовым nudge делегировать `@observer`. **Persistence:** только in-memory, исчезает при restart. **Token visibility:** нет explicit token budget или visibility. Контекст ограничен размером orchestrator prompt + read context reminders.

### Artifact / memory model
**Описание:** Создаются `codemap.md` файлы (иерархическая документация директорий), interview output (markdown specs). Нет markdown artifacts для runtime задач. **Source of truth:** кодовая база + codemap.md. **Trace:** нет structured trace artifacts — только ephemeral chat history внутри OpenCode sessions. **Artifact lifecycle:** нет — codemap может обновляться, но нет версионирования или связей. **Связи:** нет. **Переживает restart:** только `codemap.md` и interview файлы на диске. Вся runtime memory (session reuse, read context) теряется.

### Safety / governance
**Описание:** Нет выделенной safety-модели. **Approval gates:** отсутствуют — полагается на OpenCode `permission.asked`/`question.asked`. **Read-only constraints:** Observer read-only, Explorer read-only, Librarian read-only (но через MCP). **Write restrictions:** на уровне permissions OpenCode. **Policy checks:** subagent depth limit, disabled agents, MCP allowlists, skill permissions, council timeout. **Allowlists:** `disabled_agents`, `disabled_mcps`, per-agent `mcps`/`skills` lists. **Sandboxing:** нет. **Undo/rollback:** нет. Сам plugin имеет `jsonErrorRecoveryHook` и `applyPatchHook` для best-effort recovery, но это не governance.

### Strengths
- Чёткая система делегации с экономически обоснованными правилами (когда делегировать, когда нет).
- Мульти-модельный consensus через Council (parallel councillors + synthesis).
- Per-agent model routing с fallback chains и runtime preset switching.
- Session reuse для child agents (контекстная непрерывность без повторных затрат).
- Интеграция с tmux/Zellij для визуального мониторинга parallel work.
- Skills как decoupled prompt-based capabilities.
- Codemap для масштабных кодовых баз.
- Низкий overhead: prompt-based агенты без heavy runtime.

### Limitations
- Полная зависимость от OpenCode как хоста — не standalone runtime.
- Нет persistent state/memory между сессиями (всё in-memory).
- Нет формального workflow engine — workflows полностью prompt-driven.
- Нет approval gates или structured governance внутри плагина.
- Нет artifact lifecycle management, traceability, или artifact graph.
- Нет context compaction strategy beyond image stripping.
- Нет sandboxing или undo/rollback.
- Council дорогой и используется редко (intentional).

### What Wolf should reuse / learn
- **Delegation rules with cost/benefit analysis** — explicit guidelines когда делегировать, когда нет, с привязкой к скорости/стоимости.
- **Per-agent model routing** — разные модели для разных ролей с fallback chains.
- **Multi-model consensus pattern** — Council как способ повысить уверенность для high-stakes решений.
- **Session reuse pattern** — remembered child sessions с read context для continuity.
- **Skills as prompt configs** — lightweight capability system без heavy infrastructure.
- **Codemap as hierarchical artifact** — структурированное представление кодовой базы для агентов.
- **Preset system** — быстрое переключение provider/model конфигураций.
- **Hook-based prompt injection** — модификация system/messages через lifecycle hooks.

### What Wolf should avoid
- **Hard coupling to single host tool** — архитектура должна быть portable между CLI/IDE/API.
- **Prompt-only workflows** — нужен формальный workflow engine с state machine.
- **Ephemeral memory** — Wolf должен иметь persistent case storage и cross-session memory.
- **Missing safety layer** — approval gates, policy enforcement, и traceability должны быть first-class.
- **No artifact lifecycle** — нужна модель artifacts с версионированием, связями и lifecycle hooks.
- **Ad-hoc context management** — нужен explicit context budget и compaction strategy.

### Wolf gap / opportunity
Wolf должен стать **runtime-слоем, на который такие плагины могут опираться** — или **абсорбировать их лучшие паттерны с добавлением недостающей инфраструктуры**. Конкретно:

- **Workflow Engine:** формальные YAML/JSON workflows с state machine, DAG, и runner registry — то, чего нет в prompt-driven подходе.
- **Persistent Case Storage:** SQLite/file-based persistence сессий, artifacts, traces, approvals — переживает restart.
- **Context Resolver** (MVP2): explicit context assembly с budget, compaction, и relevance scoring.
- **Safety/Governance Layer:** approval gates, policy checks, allowlists, и structured traceability поверх любого агентного набора.
- **Artifact Graph:** связи между artifacts, lifecycle, source of truth — то, что codemap делает ad-hoc.
- **Universal Facade:** Wolf Agent как единая точка входа, которая может использовать oh-my-opencode-slim-подобные паттерны делегации, но поверх формального workflow engine и persistent state.

---

## Project Card: opentmux

### Basic
- **name:** opentmux
- **repository:** https://github.com/AnganSamadder/opentmux
- **host tool / ecosystem:** OpenCode CLI
- **primary purpose:** Визуализация выполнения subagent'ов в реальном времени через автоматическое управление tmux-панелями.

### Integration surface
- **plugin** — применимо. Является официальным плагином OpenCode. Регистрируется через `opencode.json`, подписывается на события `session.created`.
- **tmux/runtime UI** — применимо. Полностью построен вокруг tmux как backend'а для отображения. Управляет layout, pane lifecycle, auto-cleanup.
- **CLI** — применимо. Предоставляет бинарник `opentmux`, который выступает обёрткой (wrapper) вокруг `opencode`. Обрабатывает multi-port allocation, авто-запуск tmux, zombie reaping.
- **hook** — применимо. Подписывается на `session.created` через OpenCode Plugin API.
- **config pack** — применимо. Конфигурация через JSON (`~/.config/opencode/opentmux.json`): layout, port, auto_close, reaper settings.
- **command pack** — не применимо. Не добавляет команд пользователю.
- **skill library** — не применимо.
- **subagent catalog** — не применимо.
- **MCP** — не применимо.
- **other** — shell alias injection. При установке модифицирует `.zshrc`/`.bashrc` для замены команды `opencode` на `opentmux`.

### Core primitives
- **agents** — отслеживает. Работает с subagent'ами OpenCode, определяя их по `parentID` в событии `session.created`.
- **subagents** — отслеживает. Основной объект визуализации — каждый subagent получает свою tmux-панель.
- **skills** — нет. Не оперирует понятием skill.
- **commands** — нет. Не регистрирует пользовательские команды.
- **workflows** — нет. Только реактивная обработка событий.
- **hooks** — да. Подписка на `session.created`, shutdown handlers (SIGINT, SIGTERM, SIGHUP, SIGQUIT, beforeExit).
- **artifacts** — нет. Не создаёт файлы, не управляет артефактами.
- **memory** — нет runtime persistence. Состояние (Map сессий) живёт только в памяти процесса.
- **context** — минимальный. Передаёт `serverUrl` и `directory` из OpenCode Plugin API.
- **policies** — нет.
- **approvals** — нет.
- **traces/logs** — да. Файл `/tmp/opentmux.log` и консольный вывод для debug. Структурированные логи через `log(message, data?)`.

### Model routing
**Классификация:** none

Проект не работает с LLM-моделями напрямую. Модель задаётся в OpenCode (host tool). `opentmux` — чистый UI/Runtime плагин без routing'а.

### Context strategy
**Контекст не управляется.** Плагин не собирает контекст для LLM, не делает compaction, не отслеживает токены. Получает только `ctx.directory` и `ctx.serverUrl` из OpenCode Plugin API. Контекстом оперирует хост (OpenCode), а не плагин.

### Artifact / memory model
**Нет персистентной модели.** Создаётся только runtime state:
- `Map<string, TrackedSession>` — соответствие sessionId ↔ paneId
- Нет markdown artifacts, нет source of truth на диске
- Нет trace между запусками
- Нет artifact lifecycle
- При restart OpenCode всё состояние теряется, zombie reaper чистит старые процессы

### Safety / governance
**Минимальная safety model, отсутствуют governance-слои:**
- **Approval gates:** нет
- **Read-only constraints:** нет
- **Write restrictions:** нет
- **Policy checks:** нет
- **Allowlists:** нет
- **Sandboxing:** нет
- **Undo/rollback:** нет

Есть только runtime safety:
- Graceful shutdown с закрытием pane
- SIGTERM → SIGKILL escalation при убийстве процессов
- ZombieReaper для очистки зависших `opencode attach` процессов
- Reclaim stale ports с проверкой foreground/tmux ancestry перед kill

### Strengths
- **Agent-agnostic визуализация** — работает с любым subagent'ом OpenCode без модификации.
- **Real-time pane spawning** — мгновенное создание панелей с `opencode attach` для live-наблюдения.
- **Layout management** — поддержка `main-vertical`, `main-horizontal`, `tiled`, кастомная multi-column раскладка с round-robin распределением.
- **Spawn Queue** — sequenced spawning с deduplication, backoff retry, debounced layout application.
- **Zombie Reaper** — надёжная очистка зависших attach-процессов и inactive серверов по grace period + checks.
- **Multi-port** — автоматическое обнаружение свободных портов 4096-4106 с reclaim/rotation.
- **Cross-platform** — macOS, Linux, Windows (PowerShell/WSL).
- **Wrapper binary** — прозрачная замена `opencode` команды через shell alias.

### Limitations
- **Жёсткая зависимость от tmux** — нет абстракции над UI backend'ом.
- **Жёсткая зависимость от OpenCode** — plugin API определяет всю архитектуру.
- **Отсутствие персистентности** — состояние теряется при перезапуске, нет recovery.
- **Нет safety/governance** — нет approval gates, sandboxing, audit trail.
- **Shell config mutation** — postinstall скрипт модифицирует `.zshrc`/`.bashrc`, что может быть нежелательно.
- **Нет работы с артефактами** — не создаёт файлы, не управляет результатами работы агентов.
- **Только наблюдение** — не управляет агентами, не влияет на их выполнение.

### What Wolf should reuse / learn
- **Live subagent visualization** — идея выделенного UI-потока для каждого subagent'а крайне полезна для observability.
- **ZombieReaper pattern** — grace period + multiple checks перед kill, self-destruct при abandonment, batch reap across ports.
- **Spawn Queue pattern** — sequenced spawning с coalescing дубликатов, exponential backoff, debounced layout update после drain.
- **Multi-instance port management** — автоматический поиск, reclaim с safety checks, rotation с kill oldest.
- **Graceful pane lifecycle** — отслеживание PID, SIGTERM → SIGKILL escalation, cleanup on shutdown.

### What Wolf should avoid
- **Жёсткая привязка к одному backend'у** — tmux-only подход не масштабируется. Wolf должен абстрагировать view layer.
- **Shell alias injection** — мутация shell config как primary integration method хрупкая и инвазивная.
- **Отсутствие персистентности** — runtime-only state не подходит для production framework.
- **Нулевая safety model** — плагин не должен запускать/убивать процессы без governance слоя.
- **Тесная coupling с host CLI** — архитектура полностью определяется OpenCode Plugin API, что ограничивает переносимость.

### Wolf gap / opportunity
**Wolf должен добавить абстрактный Runtime UI Layer** поверх подобного подхода:

1. **Backend-agnostic View Manager** — плагин tmux должен быть одним из backend'ов (наряду с web dashboard, desktop app, inline terminal). Wolf View Manager управляет pane/window lifecycle независимо от рендера.
2. **Persisted Session Registry** — связь agent ↔ view должна переживать restart через Case Store / SQLite index.
3. **Safety-aware Process Manager** — любой spawn/kill должен проходить через Policy Engine Wolf (approval gates, sandbox checks, audit log) до execution.
4. **Artifact-aware Views** — панели должны отображать не только stdout, но и артефакты, workflow state, context budget — через Artifact Plugins Wolf.
5. **Universal Plugin Adapter** — адаптер OpenCode Plugin API → Wolf Event Bus, чтобы opentmux-подобная логика работала с любым host tool (не только OpenCode).

---

## Project Card: Agentic (agentic-cli)

### Basic
- **name:** Agentic (agentic-cli)
- **repository:** https://github.com/Cluster444/agentic
- **host tool / ecosystem:** OpenCode (распространяет агентов и команды в директорию `.opencode` проекта)
- **primary purpose:** Инструмент контекст-инжиниринга и управления workflow для систематической разработки ПО с помощью AI через OpenCode. Снижает нагрузку на контекстное окно за счёт специализированных субагентов и сохраняет знания о проекте во времени.

### Integration surface
- **command pack** — да. Распространяет markdown-команды (`/research`, `/plan`, `/execute`, `/commit`, `/review`) в `.opencode/command/`.
- **subagent catalog** — да. Распространяет специализированных субагентов (`codebase-locator`, `codebase-analyzer`, `thoughts-locator` и др.) в `.opencode/agent/`.
- **CLI** — да. Собственный CLI `agentic` для `pull`, `status`, `init`, `metadata`, `config`.
- **config pack** — да. Создаёт `agentic.json` и структуру `thoughts/` при `init`.
- **skill library** — частично. Агенты функционально похожи на skills, но реализованы как markdown-файлы с фронтматтером, без явного registry skills.
- **hook** — нет. Упоминается в планах (pre-commit hooks, CI/CD), но не реализовано.
- **plugin** — нет.
- **tmux/runtime UI** — нет.
- **MCP** — нет.
- **other** — система управления знаниями `thoughts/` (architecture, tickets, research, plans, reviews, archive).

### Core primitives
- **agents** — да. Специализированные AI-ассистенты с фронтматтером (`mode: subagent`, `model`, `temperature`, `tools`).
- **subagents** — да. Агенты запускаются как субагенты OpenCode для выполнения конкретных задач.
- **commands** — да. Высокоуровневые workflow (`/research`, `/plan`, `/execute`, `/commit`, `/review`), вызываемые через slash в OpenCode.
- **workflows** — да. Фазовый подход: Research → Plan → Execute → Commit → Review.
- **skills** — нет явного примитива. Агенты заменяют skills, но нет registry или discovery.
- **hooks** — нет.
- **artifacts** — да. Markdown-документы в `thoughts/` (research, plans, reviews) с YAML frontmatter.
- **memory** — да. Директория `thoughts/` выступает как персистентная память проекта.
- **context** — да. Явный фокус на context engineering: сжатие контекста через субагентов, передача только существенной информации между фазами.
- **policies** — частично. Ограничения инструментов в фронтматтере агентов (`tools: read: false` и т.д.).
- **approvals** — да. Интерактивное планирование с подтверждением пользователя на ключевых этапах; execute останавливается при несоответствии и спрашивает.
- **traces/logs** — частично. Research и review документы служат trace; git history фиксирует изменения. Нет централизованного лога выполнения.

### Model routing
- **Классификация:** per agent.
- **Описание:** Каждый агент задаёт модель в YAML frontmatter (`model: anthropic/claude-opus-4-1-20250805`). Можно переопределить глобально через CLI (`--agent-model`), `agentic.json` (`agents.model`) или дефолт (`opencode/grok-code` / `sonic-fast`). Модель не меняется динамически внутри процесса. Разные агенты используют разные модели (`opus-4-1` для анализа кода, `haiku` для веб-поиска), что даёт неявный routing между specialists по типу агента, но без runtime диспетчеризации.

### Context strategy
- Контекст управляется вручную: каждая фаза рекомендуется запускать в fresh context window для максимального качества и снижения токенов.
- Skills/context попадают в prompt через распределение markdown-файлов агентов/команд в `.opencode/`.
- Субагенты сжимают контекст, возвращая только структурированные результаты с file:line ссылками.
- **Compaction strategy** отсутствует как автоматический механизм; полагается на human-in-the-loop перезапуск сессий.
- **Persistence** — файловая, в `thoughts/` с YAML frontmatter (дата, git_commit, branch).
- **Token visibility / context budget** — отсутствуют.

### Artifact / memory model
- **Файлы:** markdown-артефакты в `thoughts/` с поддиректориями `architecture/`, `tickets/`, `research/`, `plans/`, `reviews/`, `archive/`.
- **Markdown artifacts** — основной формат. Frontmatter содержит метаданные (date, git_commit, branch, topic, tags, status, last_updated).
- **Source of truth** — `thoughts/architecture/` для архитектурных решений.
- **Trace** — исследовательские документы (`thoughts/research/`) и review (`thoughts/reviews/`) с временными метками и git-контекстом.
- **Artifact lifecycle** — статусы в frontmatter (`researched`, `planned`, `implemented`, `reviewed`); устаревшие документы перемещаются в `archive/` (исключаются из поиска агентами).
- **Связи между artifacts** — явные перекрёстные ссылки в markdown (ticket → research → plan → review).
- **Переживает restart/compaction** — да, файловая система. Архив и frontmatter сохраняют историю.

### Safety / governance
- **Approval gates** — интерактивное подтверждение на этапах планирования; execute требует подтверждения при отклонениях.
- **Read-only constraints** — агенты по умолчанию read-only (`read: true, edit: false, write: false`); инструменты жёстко ограничены в frontmatter.
- **Write restrictions** — write/edit/patch/bash отключены у большинства субагентов; запись выполняется основным агентом OpenCode.
- **Policy checks** — только на уровне allowlist инструментов в фронтматтере агента.
- **Sandboxing / undo/rollback / allowlists** — отсутствуют как явные механизмы. Откат только через git.
- **Safety model** минимален и опирается на ограничения OpenCode + human review.

### Strengths
- Эффективное снижение нагрузки на контекстное окно через декомпозицию на специализированных субагентов (locator → analyzer).
- Чёткая структура фаз разработки с накоплением знаний в `thoughts/`.
- Хорошее разделение обязанностей агентов и явные стратегии поиска.
- Гранулярные ограничения инструментов per agent.
- Параллельное выполнение однотипных агентов с последовательными зависимостями между типами.

### Limitations
- Жёсткая привязка к экосистеме OpenCode.
- Отсутствие автоматического compaction и token budget management.
- Статическое назначение модели per agent без динамического routing по сложности задачи.
- Ручные переходы между фазами (требуется human для запуска новой сессии).
- Safety ограничен списком инструментов; нет sandbox, policy engine, rollback.
- Агенты stateless, без межагентного взаимодействия.
- `web-search-researcher` нефункционален (отсутствует инструмент поиска).

### What Wolf should reuse / learn
- Трёхфазная оркестрация субагентов: Locate → Find Patterns → Analyze с параллельным выполнением внутри фазы.
- Структурированная директория `thoughts/` как персистентная память проекта с архивом и frontmatter.
- Конфигурация агентов через YAML frontmatter с ограничением инструментов.
- Интерактивное планирование с чекпоинтами подтверждения пользователя.
- Явное документирование отклонений от плана в ходе execute.
- Связанные артефакты (ticket → research → plan → review) с перекрёстными ссылками.

### What Wolf should avoid
- Жёсткую зависимость от одного host tool.
- Полагаться на пользователя для ручного управления context windows.
- Статический выбор модели без динамического routing.
- Использовать tool restrictions как единственный механизм safety.
- Нефункциональные заглушки агентов.
- Связку механизма распространения (pull) и runtime в одном пакете.

### Wolf gap / opportunity
- Wolf должен предоставить runtime-агностичный оркестрационный слой, способный хостить подобные agent/command packs на разных фронтендах (OpenCode, Claude Code и др.).
- Добавить автоматический context compaction, token budgeting и динамический model routing по сложности задачи.
- Предоставить event-driven hook system для автоматизации workflow вместо ручных фазовых переходов.
- Реализовать настоящий skill registry и discovery mechanism вместо статического markdown-распределения.
- Добавить структурированные safety policies и approval gates поверх простых tool allowlists.

---

## Project Card: Awesome Claude Code Subagents

### Basic
- **name:** Awesome Claude Code Subagents
- **repository:** https://github.com/VoltAgent/awesome-claude-code-subagents
- **host tool / ecosystem:** Claude Code (Anthropic's CLI tool) / `claude` CLI plugin system
- **primary purpose:** Курируемая библиотека из 131+ специализированных subagent-определений (markdown-файлы с YAML frontmatter), которые Claude Code может загружать и использовать для делегации задач по категориям.

### Integration surface
- **plugin** — Да. Использует нативную систему плагинов Claude Code: `claude plugin marketplace add` + `claude plugin install <plugin-name>`. 10 плагинов по категориям (`voltagent-core-dev`, `voltagent-lang`, `voltagent-infra`, `voltagent-qa-sec`, `voltagent-data-ai`, `voltagent-dev-exp`, `voltagent-domains`, `voltagent-biz`, `voltagent-meta`, `voltagent-research`).
- **subagent catalog** — Да. Это основная форма проекта: каталог subagent-дефиниций, которые копируются в `~/.claude/agents/` (global) или `.claude/agents/` (project-local).
- **CLI** — Да. Bash-инсталлятор (`install-agents.sh`) с интерактивным TUI для выбора категорий, toggle-выбора агентов, установки/удаления.
- **command pack** — Нет. Нет CLI-команд самого проекта, только инсталлятор.
- **skill library** — Нет. Это не reusable skills, а полные subagent-определения.
- **hook** — Нет.
- **tmux/runtime UI** — Нет.
- **config pack** — Нет. Нет YAML/JSON конфигурации workflow или политик.
- **MCP** — Нет напрямую. Упоминается как домен (`mcp-developer` subagent), но сам проект не реализует MCP server.
- **other** — Markdown-файлы как единственный артефакт. Нет runtime-кода, фреймворка или исполняемой среды.

### Core primitives
- **agents** — Да. Каждый markdown-файл = определение агента с YAML frontmatter (`name`, `description`, `tools`, опционально `model`).
- **subagents** — Да. Это и есть суть проекта: специализированные subagents для делегации от основного Claude Code.
- **skills** — Нет. Нет reusable skill-дефиниций вне контекста subagent.
- **commands** — Нет. Нет коммандной модели.
- **workflows** — Частично. Meta-агенты (`workflow-orchestrator`, `multi-agent-coordinator`) описывают workflow-паттерны в своих промптах, но нет исполняемой workflow engine.
- **hooks** — Нет.
- **artifacts** — Нет.
- **memory** — Нет.
- **context** — Частично. `context-manager` агент описывает контекст-менеджмент в промпте, но нет реальной реализации.
- **policies** — Нет.
- **approvals** — Нет.
- **traces/logs** — Нет.

### Model routing
**Классификация:** per agent.
- Модель задаётся в YAML frontmatter конкретного агента (`model: opus`, `model: sonnet`).
- Нет динамического routing'а, нет переключения внутри процесса.
- Нет routing'а между specialists — выбор агента делает Claude Code auto-selection на основе `description`.

### Context strategy
- Context собирается через запросы от subagent к `context-manager` (описано в промптах как JSON-протокол).
- Skills/context попадают в prompt через загрузку markdown-файла агента в контекст Claude Code.
- Нет compaction strategy — полагаетесь на нативный context window Claude Code.
- Persistence на диск: только файлы агентов в `~/.claude/agents/` или `.claude/agents/`.
- Нет token visibility.
- Нет context budget.

### Artifact / memory model
- Создаются только markdown-файлы агентов как артефакты.
- Нет markdown artifacts в runtime.
- Нет единого source of truth.
- Нет trace.
- Нет artifact lifecycle.
- Нет связей между artifacts (кроме текстовых ссылок "Integration with other agents" в промптах).
- Между restart/compaction переживает только установленный агент-файл.

### Safety / governance
- **Tool permissions:** Каждый агент имеет явный список `tools` в YAML frontmatter (`Read, Write, Edit, Bash, Glob, Grep` и т.д.).
- **Read-only constraints:** Есть категория агентов с `Read, Grep, Glob` (reviewers, auditors).
- **Нет approval gates:** Нет явных gates перед write-операциями.
- **Нет policy checks:** Нет внешней policy engine.
- **Нет sandboxing:** Исполняется в среде Claude Code пользователя.
- **Нет undo/rollback:** Нет механизмов отката.
- **Safety model ограничен:** Только tool-level permissions в промпте.

### Strengths
- Отличная категоризация и discoverability (10 категорий, 131+ агентов).
- Простота установки (plugin marketplace, bash installer, manual copy).
- Глубокая специализация (от `powershell-5.1-expert` до `healthcare-admin` с 51 sub-agent).
- Меж-агентные коммуникационные протоколы описаны в промптах (JSON запросы между агентами).
- Работает "из коробки" с существующим Claude Code.
- Покрывает огромный спектр доменов: разработка, инфраструктура, безопасность, бизнес-анализ, исследования.

### Limitations
- Нет runtime: это только промпт-шаблоны, нет исполняемой среды.
- Нет workflow engine: описание workflow в промпте ≠ исполнение.
- Нет context resolution: описано в промпте, но не реализовано.
- Нет state persistence между сессиями.
- Нет оркестрации на уровне системы: "multi-agent-coordinator" — это просто промпт, нет реального координационного слоя.
- Нет safety/governance beyond tool permissions.
- Нет artifact management.
- Нет traces/logs для аудита.
- Привязка к Claude Code ecosystem.
- Нет model routing динамического.

### What Wolf should reuse / learn
- **Категоризация агентов:** 10 чётких категорий с plugin-разбиением.
- **Installability:** Интерактивный bash installer + plugin marketplace интеграция.
- **Специализация:** Глубокая доменная экспертиза в промптах (checklists, metrics, patterns).
- **Communication Protocol:** JSON-протокол меж-агентной коммуникации (`requesting_agent`, `request_type`, `payload`) — можно адаптировать для Wolf Message Bus.
- **Tool Assignment by Role:** Read-only / Research / Code writers / Documentation — чёткое разграничение permissions.
- **Integration patterns:** "Integration with other agents" секции — хороший способ документировать связи агентов.

### What Wolf should avoid
- **"Runtime through prompts":** Описывать оркестрацию в промпте вместо реализации engine — не масштабируется.
- **Отсутствие safety model:** Tool permissions недостаточны для production governance.
- **Нет state persistence:** Всё теряется между сессиями.
- **Нет compaction:** Полагаться на context window без стратегии.
- **Привязка к одному host tool:** Зависимость от Claude Code plugin system.

### Wolf gap / opportunity
Wolf должен добавить **runtime orchestration layer** поверх этого подхода:
- **Graph Execution Engine:** Реальное исполнение workflow с DAG, а не описание в промпте.
- **Context Resolver:** MVP2 — реальная система сбора, persistence и compaction контекста.
- **Policy Engine:** Проверка политик перед операциями, approval gates, allowlists.
- **Artifact System:** Создание, версионирование, lifecycle и связи между артефактами.
- **State Persistence:** SQLite + file-based store (уже частично есть в Wolf).
- **Subagent Catalog Integration:** Wolf может импортировать/использовать эти агенты как "skill packs" или "command packs", но оборачивать их в свою runtime-систему с оркестрацией, governance и context resolution.
- **Universal Facade:** Вместо 131 отдельных агентов — единый Wolf Agent, который динамически загружает нужную специализацию из каталога.

---

## Project Card: OpenAgents Control (OAC)

### Basic
- **name:** OpenAgents Control (OAC)
- **repository:** https://github.com/darrenhinde/OpenAgentsControl
- **host tool / ecosystem:** OpenCode CLI (основной runtime), Claude Code (плагин BETA), npm/bun
- **primary purpose:** Фреймворк для планово-управляемой разработки с AI-агентами: обучение агентов проектным паттернам через context system, планирование перед исполнением, approval gates, генерация production-ready кода под стандарты команды.

### Integration surface
- **plugin** — Claude Code plugin (`/oac:setup`, `/oac:plan`, 6-stage workflow).
- **command pack** — Slash commands: `/add-context`, `/commit`, `/test`, `/optimize`, `/context`, `/worktrees` и др.
- **skill library** — Skills: `task-management`, `context-manager`, `context7`, `smart-router-skill`.
- **subagent catalog** — 15+ subagents: ContextScout, ExternalScout, TaskManager, CoderAgent, TestEngineer, CodeReviewer, BuildAgent, DocWriter и др.
- **CLI** — `oac` CLI (npm-пакет `@nextsystems/oac-cli`) для установки/управления агентами и контекстом.
- **hook** — OpenCode plugin events lifecycle (`events.md`, `lifecycle.md`).
- **config pack** — `.opencode/` директория с агентами, контекстом, командами, конфигами.
- **MCP** — не обнаружено.
- **other** — Compatibility layer для Cursor/Claude Code/Windsurf (`@openagents-control/compatibility-layer`).

### Core primitives
- **agents** — Markdown-файлы с YAML frontmatter (model, temperature, permissions, mode). 3 основных: OpenAgent (универсальный), OpenCoder (production dev), SystemBuilder (генерация систем).
- **subagents** — Специализированные агенты-делегаты (CoderAgent, TestEngineer, CodeReviewer, BuildAgent, ContextScout, ExternalScout и др.). Вызываются через `task()` tool.
- **skills** — SKILL.md + router.sh + scripts. Примеры: task-management CLI, context-manager (8 операций: discover/fetch/harvest/extract/compress/organize/cleanup/process).
- **commands** — Markdown-файлы с инструкциями для slash-команд. Registry отслеживает зависимости.
- **workflows** — Описаны в markdown: 6-stage (Discover→Propose→Approve→Execute→Validate→Ship), 4-stage UI design (Layout→Theme→Animation→Implementation), parallel batch execution через TaskManager.
- **hooks** — OpenCode plugin lifecycle events (loading, activation, cleanup).
- **artifacts** — `.tmp/sessions/{id}/context.md` (контекстные бандлы), `.tmp/tasks/{feature}/subtask_NN.json` (JSON-таски), `.tmp/context/{session}/bundle.md`.
- **memory** — Нет персистентной памяти между сессиями. Контекст пересоздаётся через ContextScout при каждом запуске.
- **context** — Иерархия: core/ (универсальные стандарты) → workflows/ → development/ (язык/фреймворк) → project-intelligence/ (проектные паттерны). Local always wins.
- **policies** — Критические правила в агентах: `@approval_gate`, `@stop_on_failure`, `@report_first`, `@confirm_cleanup`. Permission matrix в frontmatter (bash/edit deny/ask).
- **approvals** — Обязательные approval gates перед ЛЮБЫМ исполнением (bash, write, edit, task). Read/list не требуют.
- **traces/logs** — Нет явного trace-логирования. Eval framework собирает результаты тестов в `evals/results/`.

### Model routing
- **Классификация:** per agent
- **Описание:** Модель задаётся в YAML frontmatter агента (`model: anthropic/claude-sonnet-4-5`). По умолчанию используется системная модель OpenCode. Можно настроить разные модели для разных агентов (дешёвые для простых, умные для сложных). Нет динамического routing'а внутри процесса — модель фиксируется frontmatter'ом агента. Нет специалист-routing'а по категориям запросов — делегация происходит на уровне subagent'ов с той же моделью, если не переопределено.

### Context strategy
- **Сбор контекста:** ContextScout выполняет discovery перед планированием — ищет релевантные markdown-файлы в `.opencode/context/`. Local-first resolution: локальные файлы проекта побеждают глобальные из `~/.config/opencode/`. ExternalScout догружает live-документацию внешних библиотек через Context7 API.
- **Попадание в prompt:** Агент явно читает context-файлы через Read tool перед исполнением (enforced `@critical_context_requirement`). При делегации — создаётся context bundle `.tmp/context/{session}/bundle.md` и передаётся subagent'у.
- **Compaction strategy:** MVI (Minimal Viable Information) — файлы <200 строк, lazy loading, isolation context для 80% задач. Есть операция `/context compact`.
- **Persistence на диск:** Контекст-файлы хранятся в репозитории (`.opencode/context/`), но runtime context (что загружено в prompt) — эфемерен, пересоздаётся каждую сессию.
- **Token visibility / budget:** Нет явного отслеживания токенов или бюджета. Утверждается 80% reduction за счёт MVI, но нет метрик или лимитов.

### Artifact / memory model
- **Создаваемые файлы:** `.tmp/sessions/{id}/context.md` (сессионный контекст), `.tmp/tasks/{feature}/task.json` + `subtask_NN.json` (план задач), `.tmp/context/{session}/bundle.md` (контекстный бандл для subagent).
- **Markdown artifacts** — Контекст — это markdown-файлы. Нет явного artifact-формата для результатов работы.
- **Source of truth** — `registry.json` (автогенерируемый), `.opencode/context/project-intelligence/technical-domain.md` (проектные паттерны).
- **Trace** — Нет единого trace-файла. Eval framework пишет результаты в `evals/results/history/`.
- **Artifact lifecycle** — `.tmp/` очищается по подтверждению пользователя (`@confirm_cleanup`). Нет версионирования артефактов.
- **Связи между artifacts** — Зависимости объявляются в `registry.json` (`dependencies: ["subagent:coder-agent", "context:standards-code"]`), но runtime не отслеживает связи.
- **Что переживает restart** — Только `.opencode/context/` (проектные паттерны, коммитятся в git). Всё в `.tmp/` — ephemeral.

### Safety / governance
- **Approval gates** — Обязательны перед ЛЮБЫМ bash/write/edit/task. Read/list исключены. ContextScout exempt от approval gate.
- **Read-only constraints** — Нет явного read-only режима. Все операции требуют approval.
- **Write restrictions** — Permission matrix в frontmatter: `**/*.env*`: deny, `**/*.key`: deny, `node_modules/**`: deny, `sudo *`: deny, `rm -rf /*`: deny.
- **Policy checks** — `@critical_rules` с абсолютным приоритетом. Tier 1 (safety) всегда overrides Tier 2/3.
- **Allowlists** — Нет явного allowlist'а команд bash. Только deny-лист в permissions.
- **Sandboxing** — Нет. Код исполняется в хостовой среде OpenCode CLI.
- **Undo/rollback** — Нет механизма rollback. `@report_first` + `@stop_on_failure`: при ошибке — остановка, отчёт, предложение фикса, новый approval.
- **Отсутствие safety model** — Нет политик на уровне workflow (только на уровне агента). Нет аудита действий. Нет rate limiting.

### Strengths
- Контроль паттернов: агенты учатся проектным стандартам через context system, код сразу соответствует проекту.
- Team-ready: контекст коммитится в репозиторий, новые разработчики наследуют стандарты автоматически.
- Редактируемые агенты: markdown-файлы без vendor lock-in, поведение меняется редактированием текста.
- ContextScout: умный discovery релевантного контекста перед генерацией, предотвращает лишнюю работу.
- ExternalScout: live-документация внешних библиотек через Context7, решение проблемы устаревших training data.
- Eval framework: автоматизированное тестирование агентов через YAML suites.

### Limitations
- Жёсткая привязка к OpenCode CLI как runtime — не работает автономно.
- Последовательное исполнение с approval gates — медленно для сложных многокомпонентных задач (parallel batches есть, но требуют ручной оркестрации).
- Отсутствие персистентного состояния между сессиями — каждый раз пересоздаётся контекст.
- Нет artifact lifecycle — `.tmp/` ephemeral, нет версионирования, нет trace-логов.
- Нет динамического model routing — модель задаётся статически в frontmatter.
- Нет графовой оркестрации — workflow linear или batch-parallel, но не DAG.
- Нет sandbox'а — код исполняется в хостовой ОС.

### What Wolf should reuse / learn
- **Context hierarchy** (core → domain → project-intelligence) с local-first resolution и override-правилами.
- **MVI principle** — размерные ограничения контекст-файлов (<200 строк) для токен-эффективности.
- **Approval gates как first-class citizen** — интеграция в workflow, не как afterthought.
- **Editable agent pattern** — агенты как markdown-файлы с frontmatter, редактируемые пользователем напрямую.
- **Registry system** — централизованный каталог компонентов с зависимостями и авто-валидацией.
- **ContextScout/ExternalScout pattern** — отделение discovery контекста от исполнения.
- **Eval framework** — YAML-based тестирование поведения агентов с метриками.

### What Wolf should avoid
- **Жёсткая привязка к одному CLI** — Wolf должен оставаться runtime-agnostic или иметь чёткий adapter layer.
- **Ephemeral всё** — отсутствие персистентности делает невозможным долгоживущие workflow и traceability.
- **Ручная оркестрация parallel batches** — Wolf должен иметь declarative graph orchestration (DAG) вместо императивных batch-инструкций.
- **Отсутствие sandbox'а** — Wolf должен поддерживать execution isolation по умолчанию.
- **Нет token budget / visibility** — Wolf должен отслеживать и лимитировать token usage явно.

### Wolf gap / opportunity
- **Persistent state & artifact layer** — Wolf может добавить SQLite/файловое хранилище артефактов, trace-логов, контекста между сессиями, чего нет в OAC.
- **Graph orchestration engine** — Wolf имеет DAG (MVP1C), OAC — только linear/batch. Wolf может предложить declarative workflow graphs с automatic dependency resolution.
- **Cross-platform runtime abstraction** — Wolf может быть runtime-agnostic kernel, работающий поверх OpenCode, Claude Code, Cursor или standalone.
- **Dynamic model router** — Wolf может добавить routing решений между моделями на уровне step/artifact, а не только per-agent.
- **Policy & governance layer** — Wolf может вынести политики (approval, permissions, audit) в отдельный управляемый слой, а не hardcode в markdown агентов.

---

## Project Card: OpenSpec

### Basic
- **name:** OpenSpec
- **repository:** https://github.com/Fission-AI/OpenSpec
- **host tool / ecosystem:** Node.js CLI, npm-пакет `@fission-ai/openspec`, интеграция с 25+ AI coding assistants (Claude Code, Cursor, GitHub Copilot, Codex, Kimi, Windsurf и др.)
- **primary purpose:** Spec-driven development (SDD) framework — структурированное планирование изменений через markdown-артефакты (proposal, specs, design, tasks) с delta-спецификациями и архивированием

### Integration surface
- **CLI** — основной человеческий интерфейс (`openspec init`, `archive`, `validate`, `status`, `config` и др.)
- **skill library** — генерация `SKILL.md` под каждый workflow step для каждого AI-инструмента (`openspec-propose`, `openspec-apply-change` и т.д.)
- **command pack** — генерация slash-command файлов (`/opsx:propose`, `/opsx:apply` и др.) в формате конкретного инструмента (адаптеры под Cursor, Claude Code, Copilot и др.)
- **config pack** — `openspec/config.yaml` с project context, per-artifact rules, schema selection
- **hook** — `postinstall` npm hook для авто-генерации skills после установки пакета
- plugin, subagent catalog, tmux/runtime UI, MCP — нет

### Core primitives
- **artifacts** — `proposal.md`, `specs/`, `design.md`, `tasks.md` (главные примитивы workflow)
- **workflows** — schema-driven dependency graph артефактов (по умолчанию `proposal → specs → design → tasks`)
- **commands** — CLI-команды и slash-команды для управления lifecycle change
- **skills** — `SKILL.md` с YAML frontmatter, инструкциями для AI-агента и command references
- **memory** — file-based: markdown файлы + checkbox-прогресс в `tasks.md`
- agents, subagents, hooks, context, policies, approvals, traces/logs — нет как явных примитивов

### Model routing
- **Классификация:** `none`
- **Описание:** Модель выбирает пользователь в своём AI-инструменте. OpenSpec лишь рекомендует high-reasoning модели (Opus 4.5, GPT 5.2). Routing между specialists отсутствует. Модель не может меняться внутри процесса — весь workflow выполняется одним AI-ассистентом.

### Context strategy
- Context собирается из трёх источников: (1) `openspec/config.yaml` — project context и per-artifact rules, (2) dependency artifacts — при создании артефакта читаются все `requires` зависимости, (3) schema template — шаблон артефакта
- Skills/context попадают в prompt через сгенерированные `SKILL.md` и command-файлы, которые AI-инструмент загружает автоматически
- **Compaction strategy:** отсутствует
- **Persistence на диск:** только markdown файлы в `openspec/`
- **Token visibility / context budget:** отсутствуют. Есть лишь рекомендация "context hygiene" — чистить контекст перед implementation

### Artifact / memory model
- **Файлы:** markdown артефакты (`proposal.md`, `specs/**/*.md`, `design.md`, `tasks.md`) + `openspec/config.yaml` + `.openspec.yaml` в change
- **Markdown artifacts:** основной и единственный формат
- **Source of truth:** `openspec/specs/` — текущие спецификации системы
- **Trace:** `openspec/changes/archive/YYYY-MM-DD-<name>/` сохраняет полный контекст изменения
- **Artifact lifecycle:** `propose` → `specs` → `design` → `tasks` → `apply` → `verify` → `archive`
- **Связи между artifacts:** dependency graph через `schema.yaml` (`requires`), материализуется в readiness статусе (`ready` / `blocked`)
- **Что переживает restart/compaction:** все markdown-файлы в `openspec/`. Archive физически перемещает change-папку. Нет SQLite или другой структурированной persistence

### Safety / governance
- **Validation:** структурная валидация артефактов перед архивированием (delta-spec format, requirement blocks, cross-section conflicts)
- **Approval gates:** manual confirmation для `archive` с незавершёнными задачами и для `sync` specs; можно форсировать через `--yes`
- **Read-only constraints / write restrictions / policy checks / allowlists / sandboxing:** отсутствуют
- **Undo/rollback:** нет явного механизма. Archive необратимо перемещает папку. Delta specs позволяют теоретически откатить через обратные изменения, но это не автоматизировано
- Safety model минимален: валидация формата + интерактивные подтверждения

### Strengths
- Отличная delta-spec модель для brownfield разработки (ADDED / MODIFIED / REMOVED / RENAMED requirements) — изменения первоклассны, а не адаптация полных спеков
- Schema-driven artifact workflows с кастомизируемым dependency graph
- Массовая интеграция с 25+ AI инструментами через code generation skills/commands
- Чёткое разделение `specs/` (source of truth) и `changes/` (work in progress) + параллельные изменения без конфликтов
- Archive flow с полным audit trail — не просто git commit, а сохранённый контекст why/how/what
- Развитая CLI с JSON output для agent/script consumption (`--json` на `list`, `show`, `validate`, `status`)
- Workspace support для cross-repo planning (в разработке, но архитектура продумана)

### Limitations
- Нет runtime execution engine — только планирование, markdown артефакты и CLI утилиты. AI напрямую выполняет код по `tasks.md`
- Нет model routing, multi-agent orchestration или subagent dispatch
- Нет context compaction, token budget management или visibility
- Нет safety/sandbox layer — AI имеет прямой доступ к файловой системе при `apply`
- Нет структурированного state между сессиями (только markdown на диске)
- Нет approval gates перед применением изменений (только перед архивированием)
- Нет traces/logs выполнения — невозможно восстановить "что AI делал" кроме git diff
- Markdown-only артефакты ограничивают типы данных (нет structured artifacts, code artifacts, test results)

### What Wolf should reuse / learn
- Delta-spec формат — лучшая практика для brownfield: не переписывать спеки целиком, а описывать дифф (ADDED/MODIFIED/REMOVED)
- Schema-driven artifact workflows с dependency graph и customizable templates
- Генерация skill/command файлов под разные AI-инструменты (adapter pattern для tool integration)
- Разделение specs/ (source of truth) и changes/ (proposed modifications) + archive flow
- Per-artifact rules injection в prompts через `openspec/config.yaml`
- CLI design с `--json` output для agent consumption и `openspec status --json` для structured state

### What Wolf should avoid
- Отсутствие runtime safety layer — Wolf должен иметь policies, approval gates, sandboxing перед выполнением
- Отсутствие context management — Wolf должен отслеживать token budget и уметь compact context
- Только file-based state — Wolf должен иметь SQLite/structured persistence для state machine и traces
- Фиксированная привязка к markdown-only артефактам — Wolf должен поддерживать code artifacts, test artifacts, structured outputs
- Отсутствие model routing — Wolf должен уметь выбирать модель под задачу или specialist
- "Dependencies are enablers, not gates" — слишком мягкие constraints. Wolf должен иметь strict policy engine для обязательных checks

### Wolf gap / opportunity
- Wolf должен добавить **runtime execution + governance layer** поверх OpenSpec-подхода: event bus, state machine, model router, policy engine
- **Context resolver** с token budget, compaction strategy и automatic context assembly
- **Agent registry + subagent dispatch** для parallel changes и multi-repo implementation
- **Artifact plugins** — расширить markdown до code artifacts, test artifacts, DB schemas, API contracts
- **Memory layer** — SQLite persistence с traces, searchable history, case store
- **Safety model** — approval gates, read-only constraints, sandboxing, undo/rollback перед `apply`
- OpenSpec отлично решает планирование и спецификации; Wolf должен стать его **runtime + orchestration + governance** слоем
