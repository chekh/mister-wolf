# Agentic Tools: Cross-project Findings

**Generated:** 2026-05-03
**Scope:** Comparative research for Mr. Wolf framework
**Sources:** 10 analyzed repositories (see `agentic-tools-project-cards.md`)

---

## 1. Repeated Patterns

### 1.1 Skills as Reusable Behavior

Все 10 проектов так или иначе используют skills:

- **Superpowers** — primary primitive. YAML frontmatter + markdown body. Auto-discovery по description. Cross-platform (Claude, Codex, Cursor, OpenCode, Gemini, Copilot).
- **opencode-agent-skills** — единственная задача: discovery и доставка skills в контекст. Multi-source discovery, semantic matching, compaction resilience.
- **Oh My OpenAgent** — domain-specific skills + embedded MCP servers (lazy loading).
- **oh-my-opencode-slim** — skills как prompt-based конфигурации, lightweight capability system.
- **OpenAgents Control** — skills как markdown-файлы с frontmatter, но без явного registry.
- **Awesome Claude Code Subagents** — не skills, а subagent definitions, но формат тот же (YAML frontmatter + markdown).

**Pattern:** `SKILL.md` с YAML frontmatter (`name`, `description`, `tools`, `model`) + markdown body — de facto стандарт экосистемы.

**Wolf implication:** Wolf должен поддерживать этот формат natively, но добавить: registry, discovery, lifecycle, enforcement (`allowed-tools`), и интеграцию с workflow engine (skill как шаг, не только как prompt injection).

---

### 1.2 Subagents as Specialists

Все проекты, кроме opentmux и Context Analysis Plugin, используют subagents:

- **Superpowers** — fresh subagent per task, parallel dispatch, two-stage review.
- **opencode-background-agents** — read-only background subagents с persistence результатов.
- **Oh My OpenAgent** — 11+ specialists (Sisyphus, Oracle, Librarian, Atlas и др.), category-based delegation.
- **oh-my-opencode-slim** — Pantheon специалистов (Explorer, Oracle, Fixer, Designer, Librarian, Council).
- **Agentic** — codebase-locator → codebase-analyzer pipeline, параллельное выполнение внутри фазы.
- **Awesome Claude Code Subagents** — 131+ специализированных агентов по категориям.
- **OpenAgents Control** — 15+ subagents (ContextScout, CoderAgent, TestEngineer и др.).

**Pattern:** Subagent = роль + модель + permissions + prompt. Делегирование происходит либо через `task()` tool, либо через `@agent` упоминания.

**Wolf implication:** Wolf должен иметь formal subagent registry с role definitions, но управлять ими через workflow engine (когда делегировать, кому, с какой моделью, с какими правами, какой artifact должен вернуться).

---

### 1.3 Model-per-Agent Configuration

В 8 из 10 проектов модель задаётся per agent/subagent:

- **Superpowers** — guideline для выбора модели под задачу (mechanical → cheap, architecture → capable).
- **Oh My OpenAgent** — category-based routing (`visual-engineering` → модель X, `deep` → модель Y).
- **oh-my-opencode-slim** — per-agent model в presets + fallback chains + variant (`low`/`medium`/`high`).
- **Agentic** — per agent в YAML frontmatter (`opus-4-1` для анализа, `haiku` для поиска).
- **Awesome Claude Code Subagents** — per agent в frontmatter (`model: opus`, `model: sonnet`).
- **OpenAgents Control** — per agent в frontmatter, можно override глобально.
- **opencode-background-agents** — implicit (передача текущей модели в фоновую сессию).

**Pattern:** Агент = роль + оптимальная модель. Нет dynamic routing на основе содержимого задачи — только предопределённые категории.

**Wolf implication:** Wolf должен добавить step-level model routing: на основе task complexity, token budget, artifact type, и policy constraints — не только per-agent preset.

---

### 1.4 Command Packs

6 проектов предоставляют slash-команды:

- **Oh My OpenAgent** — `/init-deep`, `/ralph-loop`, `/refactor`, `/start-work`, `/handoff`, `/ulw-loop`.
- **oh-my-opencode-slim** — `/auto-continue`, `/preset`.
- **Agentic** — `/research`, `/plan`, `/execute`, `/commit`, `/review`.
- **OpenAgents Control** — `/add-context`, `/commit`, `/test`, `/optimize`, `/context`, `/worktrees`.
- **Context Analysis Plugin** — `/context`.
- **Superpowers** — commands депрекированы в пользу skills.

**Pattern:** Slash-команды = триггер для workflow. Но workflows описаны в markdown, не исполняются как state machine.

**Wolf implication:** Wolf должен поддерживать commands как entry points, но maps их на declarative workflows (YAML DAG), а не на prompt-driven sequences.

---

### 1.5 Markdown Artifacts

Все проекты, кроме opentmux и Context Analysis Plugin, создают markdown-файлы:

- **Superpowers** — design specs, implementation plans.
- **opencode-background-agents** — markdown-результаты делегаций.
- **Oh My OpenAgent** — AGENTS.md (иерархические), task JSON.
- **oh-my-opencode-slim** — codemap.md, interview output.
- **Agentic** — thoughts/ (architecture, tickets, research, plans, reviews, archive) с YAML frontmatter.
- **Awesome Claude Code Subagents** — markdown-файлы агентов.
- **OpenAgents Control** — context bundles, task JSON, context markdown.

**Pattern:** Markdown + YAML frontmatter = универсальный формат для artifacts, agents, skills, commands, context. Frontmatter содержит метаданные (date, status, model, permissions).

**Wolf implication:** Wolf должен иметь typed artifact system с lifecycle, relationships, versioning — markdown как один из форматов, но не единственный. Artifact store (SQLite + файловая система) с индексацией и query.

---

### 1.6 Thought/Planning Folders

4 проекта используют структурированные директории для планирования и знаний:

- **Agentic** — `thoughts/` (architecture, tickets, research, plans, reviews, archive).
- **Oh My OpenAgent** — `.sisyphus/tasks/` (JSON tasks), AGENTS.md hierarchy.
- **OpenAgents Control** — `.opencode/context/` (core → workflows → development → project-intelligence).
- **Superpowers** — `docs/superpowers/specs/` (design docs).

**Pattern:** Иерархическая файловая структура = project knowledge base. Local files override global. Git как source of truth.

**Wolf implication:** Wolf должен иметь Artifact Memory Graph — не просто файлы на диске, а связанные artifacts с типами, зависимостями, статусами и query interface.

---

### 1.7 Context Compression / Compaction

5 проектов имеют явные стратегии compaction:

- **opencode-agent-skills** — re-injection при `session.compacted`.
- **Oh My OpenAgent** — preemptive compaction, aggressive truncation, dynamic context pruning.
- **oh-my-opencode-slim** — `collapseSystemInPlace`, image stripping.
- **opencode-background-agents** — synthetic message injection для compaction resilience.
- **OpenAgents Control** — MVI (Minimal Viable Information), файлы <200 строк, `/context compact`.

**Pattern:** Compaction = reactive (при событии compaction) или proactive (truncation, stripping). Нет predictive compaction на основе usage patterns.

**Wolf implication:** Wolf должен иметь Context Resolver (MVP2) с explicit budget, relevance scoring, predictive compaction, и token visibility — не только reactive hooks.

---

### 1.8 Token Observability

Только 1 проект занимается token visibility:

- **Context Analysis Plugin** — мультитокенизаторный движок (tiktoken + HuggingFace + fallback), ASCII bar charts, агрегация по инструментам.

**Pattern:** Token observability — редкость. Большинство проектов полагаются на нативное поведение host tool.

**Wolf implication:** Token budget и visibility должны быть first-class primitive в Wolf, не optional plugin.

---

### 1.9 Approval Gates

4 проекта имеют approval gates:

- **OpenAgents Control** — обязательны перед ЛЮБЫМ bash/write/edit/task.
- **Agentic** — интерактивное подтверждение на этапах планирования и execute.
- **Oh My OpenAgent** — permission matrix (`ask`/`allow`/`deny`) per agent.
- **oh-my-opencode-slim** — полагается на OpenCode permissions, но нет встроенных gates.

**Pattern:** Approval = либо hard gate (остановка до подтверждения), либо permission matrix (ask/allow/deny). Нет structured approval workflows (многоуровневых, conditional, time-bounded).

**Wolf implication:** Wolf должен иметь Policy Engine с approval workflows: conditional gates, escalation, timeout, delegation, audit trail.

---

### 1.10 Read-Only Background Work

3 проекта выделяют read-only background work:

- **opencode-background-agents** — только read-only sub-agents (`edit="deny"`, `write="deny"`, `bash={"*":"deny"}`). Write-capable агенты должны использовать native `task`.
- **Oh My OpenAgent** — Oracle, Librarian, Explore — read-only.
- **oh-my-opencode-slim** — Observer, Explorer, Librarian — read-only.

**Pattern:** Background/delegated work по умолчанию read-only. Write требует explicit escalation.

**Wolf implication:** Wolf должен иметь policy primitive "read-only by default" для background delegation, с explicit approval для write operations.

---

### 1.11 Terminal / Live Visibility

2 проекта занимаются runtime visibility:

- **opentmux** — tmux pane per subagent, live output, layout management.
- **Oh My OpenAgent** — tmux интеграция для background agents.

**Pattern:** Live visibility = host-specific (tmux). Нет backend-agnostic view layer.

**Wolf implication:** Wolf должен иметь Projection Model — trace и process state должны иметь projections: CLI, tmux, web dashboard, IDE, MCP, logs. Tmux — один из backend'ов, не единственный.

---

### 1.12 Host-Specific Plugins

Все 11 проектов привязаны к конкретным host tools:

- **Claude Code ecosystem:** Superpowers (multi-platform, но plugin per platform), Awesome Claude Code Subagents.
- **OpenCode ecosystem:** opencode-agent-skills, opencode-background-agents, Context Analysis Plugin, Oh My OpenAgent, oh-my-opencode-slim, opentmux, Agentic, OpenAgents Control.
- **Claude Code ecosystem:** Awesome Claude Code Subagents.
- **Multi-tool CLI:** OpenSpec (генерирует skills/commands для 25+ AI инструментов, но сам — Node.js CLI, не plugin).

**Pattern:** Каждый проект = plugin/command pack/skill library для конкретного host tool (кроме OpenSpec, который генерирует адаптеры). Нет проектов, которые работают как standalone runtime поверх нескольких host tools.

**Wolf implication:** Wolf должен быть host-agnostic runtime с adapter layer для OpenCode, Claude Code, Cursor, Codex, Gemini, Copilot. Не plugin — standalone kernel. OpenSpec показывает, что adapter pattern через генерацию skills/commands работает для 25+ инструментов — Wolf может использовать похожий подход, но на уровне runtime integration, не только code generation.

---

## 2. Missing Layer

### 2.1 Unified Front-Agent

Ни один проект не предоставляет единую точку входа, которая:
- Принимает пользовательский запрос.
- Определяет тип задачи.
- Выбирает сценарий.
- Оркестрирует agents/skills/models/tools.
- Возвращает результат.
- Сохраняет trace.

Вместо этого пользователь напрямую взаимодействует с host tool (Claude Code, OpenCode), который затем загружает plugins/commands/skills.

**Wolf gap:** Wolf Agent как единый facade — front-agent, который скрывает от пользователя переключение между agents/skills/models/tools.

---

### 2.2 Process-Level Routing

Существующие проекты имеют routing на уровне:
- Per agent (статический frontmatter).
- Per category (предопределённые категории).
- Per command (slash-команда триггерит workflow).

Но нет routing на уровне process:
- Scenario → Steps → Skill → Model Route → Policy → Artifact Contract → Adapter.

**Wolf gap:** Process-level routing engine, который на каждом шаге решает: какой runner, какой skill, какая модель, какие policy checks, какой artifact должен появиться.

---

### 2.3 Step-Level Model Routing

Все проекты с model routing делают это на уровне агента/категории, не на уровне шага:
- Нет dynamic routing на основе содержимого задачи.
- Нет routing на основе token budget.
- Нет routing на основе artifact complexity.
- Нет fallback chains на уровне шага.

**Wolf gap:** Step-level model router, который выбирает модель на основе: task complexity estimate, token budget remaining, required artifact type, policy constraints, model availability.

---

### 2.4 Artifact-Aware Skill/Model Selection

Ни один проект не связывает artifacts с skill selection или model routing:
- Нет "для создания architecture doc нужен skill X и модель Y".
- Нет artifact contracts (какой artifact должен вернуться после шага).
- Нет artifact-based routing.

**Wolf gap:** Artifact Memory Graph + Artifact Contracts — каждый шаг workflow декларирует входные и выходные artifacts, и routing зависит от типа/сложности artifact.

---

### 2.5 Host-Agnostic Policy Overlay

Approval gates, permissions, tool restrictions существуют, но:
- Hardcoded в markdown агентов (OpenAgents Control, Agentic).
- Зависят от host tool permissions (oh-my-opencode-slim).
- Нет centralized policy engine.
- Нет policy versioning.
- Нет policy inheritance (project → team → org).
- Нет audit trail.

**Wolf gap:** Host-agnostic Policy Overlay — декларативные policies (YAML), enforcement на уровне Wolf runtime, audit trail в Case Store, inheritance и versioning.

---

### 2.6 Artifact Memory Graph

Artifacts существуют, но:
- Файлы на диске без связей (Superpowers, Agentic).
- Task dependencies в JSON, но не artifact relationships (Oh My OpenAgent).
- Нет query interface.
- Нет lifecycle management.
- Нет source of truth beyond git.

**Wolf gap:** Artifact Memory Graph — typed artifacts с relationships, lifecycle, query interface, source of truth, versioning, garbage collection.

---

### 2.7 Projection / Adaptation Between Host Tools

Каждый проект привязан к одному host tool. Нет слоя адаптации между:
- OpenCode → Claude Code.
- Claude Code → Cursor.
- IDE → CLI.

**Wolf gap:** Host Adapter Layer — универсальные adapters для OpenCode, Claude Code, Cursor, Codex, Gemini, Copilot, IDE, MCP. Wolf runtime не зависит от host tool.

---

### 2.8 Imported Skills / Agents Registry

Skills и агенты существуют, но:
- Нет unified registry (каждый проект — свой каталог).
- Нет import/install из внешних источников (кроме bash installer в Awesome Subagents).
- Нет namespace resolution (кроме opencode-agent-skills).
- Нет versioning.
- Нет dependency management между skills.

**Wolf gap:** Imported Skills/Agents Registry — unified catalog с namespace, versioning, dependencies, search, install from marketplace/git.

---

### 2.9 Trace and Evidence Model Across Tools

Traces существуют фрагментарно:
- Git history (Superpowers, Agentic).
- Session tools (Oh My OpenAgent).
- Eval framework (OpenAgents Control).
- Но нет unified trace model, который охватывает все операции across sessions, agents, tools.

**Wolf gap:** Trace Model — каждая операция (tool use, model call, approval, artifact creation) записывается в Case Store с evidence (screenshot, diff, output). Trace queriable, auditable, exportable.

---

## 3. Taxonomy of Existing Solutions

На основе анализа 10 проектов можно выделить 7 классов решений:

### 3.1 Skill Libraries

**Определение:** Reusable behavior packs в формате SKILL.md. Focus на delivery skills в контекст агента.

**Примеры:**
- Superpowers (cross-platform, 13 skills, auto-discovery)
- opencode-agent-skills (OpenCode-only, semantic matching, compaction resilience)

**Что решают:** Как доставить инструкции в контекст.
**Что НЕ решают:** Как оркестрировать, как выбрать skill, как сохранить результат, как применить policy.

---

### 3.2 Host Plugins

**Определение:** Platform-specific plugins, которые инжектируют behavior в host tool через hooks/API.

**Примеры:**
- opencode-background-agents (OpenCode plugin, background delegation)
- Context Analysis Plugin (OpenCode plugin, token visibility)
- opentmux (OpenCode plugin, tmux visualization)

**Что решают:** Расширение возможностей конкретного host tool.
**Что НЕ решают:** Переносимость между host tools, standalone runtime, persistent state.

---

### 3.3 Agent Orchestration Packs

**Определение:** Multi-agent orchestration через delegation, category-based routing, model-per-agent.

**Примеры:**
- Oh My OpenAgent (11+ agents, category routing, tmux, MCPs)
- oh-my-opencode-slim (Pantheon agents, Council consensus, presets)
- OpenAgents Control (15+ subagents, context hierarchy, approval gates)

**Что решают:** Как разделить работу между специалистами, как выбрать модель.
**Что НЕ решают:** Declarative workflows, persistent state, artifact lifecycle, cross-platform.

---

### 3.4 Context / Memory Tools

**Определение:** Управление контекстом, token visibility, context compression, knowledge accumulation.

**Примеры:**
- Context Analysis Plugin (token analysis, multi-tokenizer)
- Agentic (thoughts/ directory, context engineering, phase-based work)
- OpenAgents Control (ContextScout, MVI, context hierarchy)

**Что решают:** Как увидеть/сжать/организовать контекст.
**Что НЕ решают:** Automated context resolution, predictive compaction, cross-session context recovery.

---

### 3.5 Runtime Visibility Tools

**Определение:** Live monitoring выполнения агентов через UI (tmux, terminal, dashboard).

**Примеры:**
- opentmux (tmux pane per subagent)
- Oh My OpenAgent (tmux integration for background agents)

**Что решают:** Как наблюдать за процессом в реальном времени.
**Что НЕ решают:** Backend-agnostic views, artifact-aware displays, persistent session registry.

---

### 3.6 Approval / Pattern-Control Tools

**Определение:** Safety, governance, approval gates, tool restrictions.

**Примеры:**
- OpenAgents Control (approval gates before any execution, permission matrix)
- Agentic (interactive planning checkpoints, tool restrictions in frontmatter)
- Oh My OpenAgent (ask/allow/deny permissions, Hashline edit tool)

**Что решают:** Как контролировать действия агентов.
**Что НЕ решают:** Centralized policy engine, audit trail, sandboxing, rollback.

---

### 3.7 Subagent Catalogs

**Определение:** Курируемые коллекции subagent definitions для делегирования.

**Примеры:**
- Awesome Claude Code Subagents (131+ agents, 10 categories, marketplace)

**Что решают:** Как найти и установить специализированного агента.
**Что НЕ решают:** Runtime orchestration, state persistence, workflow execution.

---

### 3.8 Methodology / Workflow Packs

**Определение:** Процессные методологии, дисциплины, workflow patterns.

**Примеры:**
- Superpowers (TDD, brainstorming, code review, subagent-driven development)
- Agentic (Research → Plan → Execute → Commit → Review)
- OpenAgents Control (Discover → Propose → Approve → Execute → Validate → Ship)

**Что решают:** Как организовать процесс разработки.
**Что НЕ решают:** Executable workflows, state machine, automated transitions.

---

### 3.9 Spec-Driven Development Frameworks

**Определение:** Фреймворки для structured planning через markdown-артефакты с delta-спецификациями и архивированием.

**Примеры:**
- OpenSpec (SDD framework: proposal → specs → design → tasks, delta-specs, archive flow)

**Что решают:** Как планировать изменения структурированно, как отслеживать specs как source of truth, как работать с brownfield-кодом через delta-спецификации.
**Что НЕ решают:** Runtime execution, policy enforcement, model routing, multi-agent orchestration.

---

## 4. Coverage Matrix

| Layer | Skill Libs | Host Plugins | Agent Orchestration | Context/Memory | Runtime Visibility | Approval/Governance | Subagent Catalogs | Methodology Packs | Spec-Driven Dev |
|-------|-----------|--------------|---------------------|----------------|-------------------|---------------------|-------------------|-------------------|-----------------|
| Skills | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Subagents | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Model Routing | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Context Mgmt | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Token Visibility | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Artifacts | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Approval Gates | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ⚠️ |
| Workflow Engine | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Persistent State | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ |
| Trace/Evidence | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ |
| Cross-Platform | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Runtime UI | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Вывод:** Ни один класс решений не покрывает Workflow Engine. Только Spec-Driven Dev (OpenSpec) покрывает Artifacts хорошо, но без runtime. Persistent State и Trace/Evidence покрыты фрагментарно. Только Superpowers и OpenSpec покрывают Cross-Platform.

---

## 5. Key Insight

Все 11 проектов решают **одну и ту же проблему** разными способами:
> Как сделать так, чтобы AI-агент делал качественную работу в сложных проектах.

Но каждый проект решает **один аспект** этой проблемы:
- Superpowers — дисциплина и методология.
- opencode-agent-skills — доставка skills в контекст.
- opencode-background-agents — фоновое делегирование с persistence.
- Context Analysis Plugin — token visibility.
- Oh My OpenAgent — multi-model orchestration.
- oh-my-opencode-slim — экономически обоснованная делегация.
- opentmux — live visibility.
- Agentic — context engineering и фазовая работа.
- Awesome Claude Code Subagents — специализация через каталоги.
- OpenAgents Control — контроль паттернов и approval gates.
- **OpenSpec — спецификации и планирование через delta-specs и schema-driven workflows.**

**Ни один проект не объединяет все аспекты в единый runtime.**

**Примечание по OpenSpec:** OpenSpec уникален среди проектов, потому что он фокусируется на **планировании и спецификациях**, не на исполнении. У него лучшая artifact model (delta-specs, schema-driven dependency graph, specs/changes separation), но нет runtime execution engine. Это делает OpenSpec и Wolf **комплементарными**: OpenSpec = planning layer, Wolf = runtime + orchestration + governance layer.

**Wolf positioning:** Wolf = единый слой, который объединяет все эти аспекты: front-agent facade, process-level routing, step-level model routing, artifact memory graph, policy overlay, host adapters, trace model, persistent state, workflow engine, runtime UI projections.

Wolf — не replacement для существующих tools. Wolf — **orchestration layer поверх** существующих agentic tools, который делает процесс декларативным, проверяемым, policy-governed, artifact-oriented и переносимым между host-инструментами.
