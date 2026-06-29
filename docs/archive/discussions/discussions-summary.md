# Обобщение дискуссий «Мистера Вульфа»

**Дата:** 2026-04-28  
**Статус:** Концептуальные дискуссии, не спецификация  
**Источники:**

- [adaptive-agent-design.md](adaptive-agent-design.md) — архитектура адаптивного агента
- [memory-subsystem-architecture.md](memory-subsystem-architecture.md) — подсистема памяти
- [research-and-declarative-architecture.md](research-and-declarative-architecture.md) — референсы и декларативные слои
- [tool-system-and-a2a.md](tool-system-and-a2a.md) — система инструментов и межагентное взаимодействие

---

## Суть в одном предложении

**Один адаптивный агент-фасад для пользователя, внутри — динамически собираемый runtime из независимых модулей, управляемый политиками и конфигурацией проекта.**

---

## Часть 1. Архитектура адаптивного агента

### Целевая модель

```text
User → One Adaptive Agent Facade
         ↓
    Runtime dynamically assembles:
      - Scenario Router
      - Domain Pack Resolver
      - Policy Engine
      - Workflow Engine
      - Agent Registry
      - Model Router
      - Skill Activator
      - Tool Registry
      - Artifact Engine
      - Gate Manager
      - Memory Manager
      - Event/Hook Bus
```

### Ключевые принципы

1. **User-facing agent ≠ runtime agents** — пользователь видит одного агента, внутри работают subagents
2. **Dynamic Persona** — режим работы агента выбирается runtime из контекста, не переключается вручную
3. **Artifact-first system** — задача → сценарий → workflow → артефакты → действия → подтверждения → результат
4. **Core is universal, domains are plugins** — Spec, ADR, Email, Contract — всё это артефакты из domain packs
5. **Behavior is configuration, actions are policy-controlled**

### Слои фреймворка

```text
1.  Interface Layer      — CLI, Chat, API, IDE adapters
2.  Intent/Scenario Layer — классификация задачи
3.  Context Layer        — сбор релевантного контекста
4.  Policy Layer         — правила, разрешения, автономность
5.  Workflow Layer       — декларативный graph исполнения
6.  Agent Layer          — заменяемые runtime-агенты
7.  Model Layer          — абстракция моделей, fallback chains
8.  Skill Layer          — capability packages
9.  Tool Layer           — инструменты с permission model
10. Artifact Layer       — типизированные артефакты с lifecycle
11. Execution Layer      — linear/parallel/graph, retry, pause/resume
12. Gate Layer           — approval, validation, budget, review
13. Memory/State Layer   — файловое + SQLite состояние
14. Hook/Event Layer     — pub/sub для плагинов
15. Adapter Layer        — интеграции с внешними средами
```

### Режимы автономности

| Режим      | Что можно                           |
| ---------- | ----------------------------------- |
| observe    | только чтение                       |
| draft_only | чтение + черновики                  |
| supervised | действия с approval                 |
| trusted    | low-risk автономно, high-risk — ask |
| autonomous | всё в рамках policy                 |

---

## Часть 2. Архитектура памяти

### Главный тезис

> **Memory is not storage. Memory is governed context.**

Память — это не одна база данных, а **Memory Control Plane** с политиками, типами, lifecycle и адаптерами.

### Типы памяти

| Тип         | Что хранит                                              | Бэкенд                            |
| ----------- | ------------------------------------------------------- | --------------------------------- |
| Session     | Текущий диалог, состояние графа                         | SQLite / in-memory / checkpointer |
| Case        | Конкретное дело: запрос, workflow, артефакты, approvals | Файлы + SQLite                    |
| Project     | Устойчивые знания: решения, conventions, ограничения    | Файлы + SQLite + vector           |
| User        | Предпочтения, стиль, разрешения                         | Mem0 / файлы                      |
| Domain      | Знания доменного пакета                                 | Файлы в `packs/{domain}/memory/`  |
| Artifact    | Созданные документы: ADR, specs, reports                | Файлы + индекс                    |
| Operational | События, tool calls, costs, errors                      | events.jsonl + SQLite             |
| Semantic    | Извлечённые факты                                       | Vector DB / Mem0 / Zep            |
| Policy      | Правила и ограничения runtime                           | Policy engine (control memory)    |

### Жизненный цикл

```
capture → extract → validate → classify → store → retrieve → use → decay/archive/delete
```

Запись в долгосрочную память — **намеренная**, не автоматическая.

### Staged Retrieval

1. Scope filter (пользователь, проект, домен, кейс)
2. Policy filter (права, чувствительность)
3. Structural retrieval (ADR, constraints, preferences)
4. Semantic retrieval (embeddings)
5. Graph retrieval (связи сущностей)
6. Ranking + conflict detection + compression

Агент получает не всю память, а **MemoryBundle** — предсобранный, отфильтрованный пакет.

---

## Часть 3. Декларативная архитектура и разделение слоёв

### Пять групп компонентов

```text
1. Declarative Project Layer   — локальная конфигурация проекта
2. Declarative Package Layer   — переиспользуемые методологии (plugins/packs)
3. Runtime Core Code           — универсальный движок исполнения
4. Extension / Plugin Code     — адаптеры, валидаторы, кастомные tools
5. Generated / State Layer     — runtime-артефакты: context.md, task-graph.yaml, events.jsonl
```

### Правило

```text
YAML/MD decides.
Core executes.
Plugins extend.
State remembers.
```

### Что в Core, что нет

**Core содержит:** ConfigLoader, Registry, DependencyResolver, ScenarioRouter, PolicyEngine, WorkflowEngine, TaskGraphExecutor, AgentRuntime, ModelRouter, ToolExecutor, GateManager, ArtifactStore, EventBus, StateStore, PluginLoader.

**Core НЕ содержит:** Spec workflow, ADR workflow, React rules, TDD methodology, project-specific policies, specific vendor logic.

### Структура репозитория (целевая)

```text
wolf/
  core/           # runtime-код
  sdk/            # интерфейсы для плагинов
  adapters/       # CLI, OpenCode, VS Code, GitHub Actions
  providers/      # model providers
  packages/       # декларативные пакеты + optional code
    base/
    specs/
    adr-adl/
    tdd/
  plugins/        # external integrations
  templates/      # starter project templates
```

---

## Часть 4. Референсные проекты

### Shortlist для изучения

| Проект                        | Что взять                                                         |
| ----------------------------- | ----------------------------------------------------------------- |
| **microsoft/conductor**       | YAML workflows, gates, DAG, safety limits                         |
| **microsoft/agent-framework** | Runtime primitives, stateful workflows, declarative orchestration |
| **open-agent-studio/agent**   | Goal → task graph → daemon execution, persistent memory           |
| **shinpr/sub-agents-skills**  | Portable subagents across backends, no vendor lock-in             |
| **obra/superpowers**          | Methodology as composable skills, spec-first flow                 |
| **pydantic/pydantic-ai**      | Typed agents, tool approval, MCP/A2A integration                  |
| **Mem0**                      | User preferences, cross-session semantic memory                   |
| **Zep / Graphiti**            | Temporal knowledge graph, business entity relationships           |
| **LangGraph**                 | Checkpoint model, workflow state, pause/resume                    |
| **Cognee / LlamaIndex**       | Document knowledge, RAG, artifact retrieval                       |

Никто не делает ровно эту модель полностью. Обычно проекты закрывают один слой.

---

## Часть 5. Универсальность для не-dev доменов

Архитектура лучше всего раскрывается **вне разработки**, потому что там особенно ценны:

- единая точка входа
- workflow discipline
- approval gates
- структурированные артефакты
- policy-controlled autonomy

### Доменные пакеты

| Домен                | Артефакты                                  | Tools                        | Политики                    |
| -------------------- | ------------------------------------------ | ---------------------------- | --------------------------- |
| Software engineering | Spec, ADR, Task Graph, Review Report       | git, shell, editor           | no prod without tests       |
| Office assistant     | Meeting Brief, Agenda, Email Draft, Report | gmail, calendar, docs        | send email — ask            |
| Concierge            | Itinerary, Options Shortlist, Booking Plan | web, maps, weather           | payment — deny              |
| Legal ops            | Clause Matrix, Risk Register, Legal Memo   | doc parser, clause extractor | final advice — expert gate  |
| Finance ops          | Budget, Cashflow, Scenario Analysis        | spreadsheet, ERP             | financial action — deny/ask |

---

## Часть 6. MVP-роадмап

```text
MVP 1: Config + Workflow Engine   ✓ (реализовано)
MVP 2: Context Resolver
MVP 3: Policy Engine
MVP 4: Agent Registry
MVP 5: Model Router
MVP 6: Artifact Plugins
MVP 7: Adaptive Facade
```

Для памяти в MVP:

- Filesystem + SQLite — baseline
- LangGraph-style checkpoints — workflow state
- LangMem-inspired extraction — memory candidates
- Optional Mem0 adapter — user preferences

---

## Часть 7. Система инструментов и границы агента

### Tool = унифицированная capability

Источник может быть любой:

| Тип           | Пример                                            |
| ------------- | ------------------------------------------------- |
| Built-in      | read_file, edit_file, run_command                 |
| MCP           | gmail.search, jira.create_issue, github.create_pr |
| Bash/script   | npm test, ./scripts/deploy.sh                     |
| HTTP/API      | CRM lookup, billing API                           |
| SDK/function  | extractClausesTool, AST parser                    |
| Human         | ask_user, request_approval, request_legal_review  |
| Agent-as-tool | local agent вызывается как tool                   |

### Простое правило разделения

```text
Одно действие → Tool
Исполнитель с рассуждением и workflow → Agent
Внешний независимый исполнитель → A2A agent
```

### A2A: roadmap

```text
1. Agent-as-tool          ← начать здесь
2. Remote agent as tool   ← затем
3. Full A2A protocol      ← потом (discovery, negotiation, auth, handoff)
```

### AgentEndpoint абстракция

```yaml
agents:
  local_legal:
    type: local
    runtime_agent: legal_assistant

  external_legal:
    type: a2a
    endpoint: https://legal-agent.company.com/a2a

  mcp_research_agent:
    type: mcp
    server: research-agent
```

Для workflow неважно, кто исполнитель — локальный subagent, remote A2A, MCP-exposed agent или human expert.

---

## Потенциальные следующие дискуссии

На основе пустых плейсхолдеров и пробелов:

1. **Analogues** — систематическое сравнение с Conductor, CrewAI, AutoGen, LangGraph и др.
2. **Model Router** — выбор модели под задачу, fallback chains, cost control, streaming
3. **Policy Engine** — DSL для политик, runtime enforcement, conflict resolution
4. **Security & Compliance** — data privacy, audit, reversible/irreversible action classification
