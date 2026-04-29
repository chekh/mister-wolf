# Mr. Wolf Framework Architecture Design

**Date:** 2026-04-28
**Status:** Concept / Draft
**Slogan:** I solve problems.

---

## 1. Overview & Philosophy

Mr. Wolf — универсальный модульный фреймворк для построения адаптивных агентных систем. Пользователь взаимодействует с одним агентом (Mr. Wolf), а внутренняя логика исполнения динамически собирается из конфигурации проекта.

**Ключевые принципы:**

- Runtime универсален. Проектная логика внешняя и заменяема.
- Agents, workflows, rules, routing, models, artifacts — это данные.
- Runtime только исполняет.
- Core не содержит доменных понятий.
- Domain packs подключаются и заменяются.
- Policies сильнее prompt-инструкций (техническая гарантия, не инструкция).
- Каждый компонент можно использовать отдельно.

**Архитектурная формула:**

```text
User talks to Wolf.
Wolf assembles the system.
Policies control the action.
Artifacts prove the result.
```

---

## 2. Component Architecture

Фреймворк разделен на **9 самостоятельных компонентов**. Каждый компонент имеет собственную ценность, четкие границы, входы/выходы и может разрабатываться независимо.

---

### 2.1 Runtime Kernel

**Назначение:** Минимальное ядро исполнения. Управляет жизненным циклом плагинов, событиями, execution context и базовым state.

**Собственная ценность:** Можно использовать как foundation для любого runtime. Предоставляет plugin lifecycle, event bus и execution context без привязки к workflow.

**Основные примитивы:**

- `Plugin` — подключаемый модуль с lifecycle (load, init, start, stop)
- `Event` — событие жизненного цикла
- `ExecutionContext` — контекст текущего исполнения
- `State` — базовое наблюдаемое состояние

**Event Envelope (единый формат):**

```yaml
event:
  id: evt_123
  type: workflow.step.started
  case_id: case_456
  workflow_id: my_workflow
  step_id: step_2
  timestamp: "2026-04-28T10:00:00Z"
  actor:
    type: system | agent | user | tool
    id: workflow_engine
  payload: {}
  correlation_id: corr_789
  parent_event_id: evt_122
```

**Event Bus Interface:**

```ts
interface EventBus {
  publish(event: RuntimeEvent): Promise<void>;
  subscribe(type: string, handler: EventHandler): Unsubscribe;
}
```

**Входы:**

- Plugin definitions
- Runtime configuration

**Выходы:**

- Events (event bus)
- Execution context
- Plugin state

**Зависимости:**

- Нет (самый базовый компонент)

**Потребители:**

- Workflow Engine
- Context & Memory System
- Governance Layer
- Agent & Model Runtime

---

### 2.2 Workflow Engine

**Назначение:** Исполняет декларативные workflow графы. НЕ исполняет tools, agents или gates сам — делегирует Step Runners.

**Собственная ценность:** Standalone workflow orchestrator. Может исполнять любые декларативные процессы: CI/CD pipelines, data processing, business workflows.

**Step Taxonomy:**

```yaml
step_types:
  - builtin # echo, shell, manual_gate (MVP1A)
  - task # вызвать агента или executor
  - tool # вызвать tool
  - gate # остановиться и ждать подтверждения
  - artifact # создать/валидировать artifact
  - condition # ветвление
  - parallel # fan-out
  - subworkflow # вложенный workflow
```

**Step Contract:**

```yaml
step:
  id: string
  type: builtin | task | tool | gate | artifact | condition | parallel | subworkflow
  input?: object # входные данные
  output?: object # ожидаемый выход
  depends_on?: string[] # зависимости
  when?: expression # условие выполнения
  policy?: string[] # применяемые политики
  retry?: RetryPolicy # стратегия повторов
  timeout?: string # таймаут
  artifacts?: string[] # ожидаемые артефакты
```

**Step Runner Registry:**
Step types расширяются через плагины. Каждый runner реализует интерфейс:

```ts
interface StepRunner {
  type: string;
  run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult>;
}
```

**Входы:**

- Декларативный workflow (YAML/graph)
- CaseRuntime (описание собранного runtime)
- Начальные параметры (user request, context)

**Выходы:**

- Состояние исполнения (state)
- События (events)
- Артефакты (artifacts)
- Результат (result)

**Зависимости:**

- Runtime Kernel (events, execution context)
- Configuration & Registry System (загрузка workflow)
- Governance Layer (проверка перед шагом)
- Step Runners (агенты, tools, gates — из других компонентов)

**Потребители:**

- Wolf Facade (через orchestration)

**Граница ответственности:**

```text
Workflow Engine НЕ исполняет tools сам.
Workflow Engine вызывает Step Runners.
Step Runners обращаются к Agent Runtime, Capability System, Gate Manager.
```

---

### 2.3 Configuration & Registry System

**Назначение:** Загружает, мержит и валидирует конфигурации. Управляет registry компонентов, domain packs, dependencies и manifest'ами.

**Собственная ценность:** Typed configuration layer поверх YAML. Можно использовать как standalone config validator и dependency resolver.

**Подкомпоненты:**

- **Config Loader** — загрузка YAML/JSON/TOML, мерж, валидация схем (JSON Schema / Pydantic)
- **Schema Validator** — строгая типизация конфигураций
- **Definition Registry** — registry декларативных сущностей (workflows, agents, artifacts)
- **Runtime Registry** — registry исполняемых реализаций (step runners, tools, model providers)
- **Pack Registry** — registry domain packs
- **Dependency Resolver** — разрешение зависимостей между packs и компонентами

**Manifest Model (Domain Pack):**

```yaml
id: legal-ops
version: 0.1.0
provides:
  scenarios:
    - contract_review
  agents:
    - legal_assistant
  workflows:
    - contract_review_gated
  artifacts:
    - risk_register
    - clause_matrix
  skills:
    - clause_extraction
requires:
  packs:
    - base >= 0.1.0
  tools:
    - document.parse
  gates:
    - human_expert_review
```

**Входы:**

- Файлы конфигурации (`.wolf/*.yaml`)
- Pack manifests
- JSON Schema / Pydantic models

**Выходы:**

- Валидированная конфигурация (typed config objects)
- Resolved dependency graph
- Registry index (definitions + runtimes)

**Зависимости:**

- Runtime Kernel (plugin lifecycle)

**Потребители:**

- Все остальные компоненты

---

### 2.4 Context & Memory System

**Назначение:** Собирает релевантный контекст. Управляет памятью: Case Memory, Project Memory, User Memory, Artifact Memory, Operational Memory.

**Собственная ценность:** Можно использовать как отдельный инструмент для анализа проекта, подготовки контекста, поиска по памяти.

**Подкомпоненты:**

- **Context Resolver** — сбор контекста из файлов, документов, истории, внешних источников
- **Scenario Router** — определение типа задачи (двухэтапный: быстрый интент → уточнение)
- **Domain Pack Selector** — выбор доменных пакетов (двухэтапный: предварительный → финальный)
- **Memory Store** — хранилище памяти
- **Memory Policy Engine** — правила доступа к памяти (can_recall, can_write, can_share, ttl)
- **Memory Bundle Builder** — сборка memory bundle для передачи в runtime
- **Artifact Index** — индекс артефактов для быстрого поиска

**Memory Decision Loop:**

```text
Recall (чтение):
  case.created → scenario.resolved → workflow.selected → step.before → tool.before

Write (сохранение):
  artifact.created → gate.approved → step.completed → case.completed → user_explicit_remember
```

**Memory Policy (примеры):**

```yaml
memory_policy:
  can_recall: true
  can_write: true
  can_share_with_agent: true
  can_export: false
  ttl: "30d"
  requires_user_consent: false
  sensitivity: low | medium | high
```

**Типы памяти:**

```text
Case Memory      — контекст текущей задачи
Project Memory   — проектные знания, история, решения
User Memory      — предпочтения пользователя
Artifact Memory  — индекс созданных артефактов
Operational      — технические данные: events, logs, metrics
Semantic/Graph   — векторный/графовый поиск (опционально)
```

**Входы:**

- Пользовательский запрос
- Источники контекста (файлы, документы, история, внешние данные)
- Memory queries (recall requests)
- Events (для обновления памяти)

**Выходы:**

- Context bundle (релевантные файлы, документы, ограничения)
- Memory bundle (собранная память для runtime)
- Определенный сценарий (scenario ID)
- Выбранные domain packs

**Зависимости:**

- Runtime Kernel (events)
- Configuration & Registry System (scenario routing rules, pack manifests)

**Потребители:**

- Workflow Engine (контекст для исполнения)
- Wolf Facade (сборка CaseRuntime)
- Governance Layer (контекст для policy evaluation)

**Двухэтапный Domain Pack Selection:**

```text
User Request
  → preliminary scenario/domain guess (keywords, signals)
  → initial domain pack candidates
  → context resolution using candidate packs (что искать зависит от домена)
  → refined scenario/domain
  → workflow selection
```

---

### 2.5 Governance Layer

**Назначение:** Определяет что разрешено/запрещено. Управляет точками подтверждения, уровнями автономности и trust boundaries.

**Собственная ценность:** Guard plugin для любого AI runtime. Проверяет действия до исполнения.

**Подкомпоненты:**

- **Policy Engine** — evaluate политик (allow/ask/deny)
- **Gate Manager** — управление точками подтверждения
- **Autonomy Controller** — уровни автономности (observe/draft/supervised/trusted/autonomous)
- **Trust & Security Model** — trust boundaries, risk levels, secret handling

**Tool Risk Model:**

```yaml
risk_levels:
  read:
    default: allow
    examples: [read_file, search_docs]
  sensitive_read:
    default: ask
    examples: [read_hr_file, read_legal_contract, read_private_email]
  draft:
    default: allow
    examples: [draft_email, create_artifact]
  local_modify:
    default: ask
    examples: [edit_file, run_tests]
  external_modify:
    default: ask
    examples: [calendar.create_event, modify_crm]
  external_send:
    default: ask
    examples: [send_email, post_message]
  financial_action:
    default: deny
    examples: [approve_payment, transfer_funds]
  legal_commitment:
    default: require_expert_review
    examples: [sign_contract, legal_recommendation]
  irreversible:
    default: deny
    examples: [delete_database, delete_production_resource]
```

**Trust Boundaries:**

```text
Local Agent        — полный доступ в рамках policies
Remote A2A Agent   — получает только policy-filtered task bundle
MCP Server         — доступ только к объявленным capabilities
Human Gate         — окончательное подтверждение
```

**Принцип:** Remote A2A agents never receive full context by default. They receive only policy-filtered task bundles.

**Gate Request Model:**

```yaml
gate_request:
  id: gate_123
  case_id: case_456
  step_id: step_2
  title: "Approve sending email?"
  message: "The assistant wants to send an email to client@example.com"
  options:
    - approve
    - reject
    - modify
  expires_at: "2026-04-28T11:00:00Z"
  consequences:
    - "Email will be sent immediately"
    - "Cannot be undone"
  diff_or_artifact_preview: "Preview of email content..."
```

**Входы:**

- Действие (tool call, agent invocation, workflow step)
- Контекст (scenario, files, risk level)
- Политики (declarative rules)
- Memory visibility boundaries

**Выходы:**

- Решение: `allow` / `ask` / `deny`
- Запрос на подтверждение (gate request)
- Уровень автономности для действия
- Filtered context (для external agents)

**Зависимости:**

- Runtime Kernel (events)
- Configuration & Registry System (загрузка политик)

**Потребители:**

- Workflow Engine (проверка перед каждым шагом)
- Agent & Model Runtime (проверка model/tool selection)
- Wolf Facade (проверка runtime assembly)

**Реализация "Policies сильнее prompt":**
Policy Engine работает как middleware между планированием и исполнением. Даже если агент в своем reasoning решил выполнить действие, Policy Engine блокирует его на уровне runtime, если политика запрещает.

```text
Agent may propose.
Policy decides.
Runtime enforces.
```

---

### 2.6 Agent & Model Runtime

**Назначение:** Регистрирует агентов. Маршрутизирует запросы к LLM с учетом политик, fallback chains, rate limits, privacy constraints.

**Собственная ценность:** Unified LLM interface с policies. Можно использовать как model gateway в любом проекте.

**Подкомпоненты:**

- **Agent Registry** — загрузка агентов из markdown/yaml, инстанцирование runtime-ролей
- **Model Router** — выбор модели по policy, fallback chains, capability matching
- **Local Agent Runtime** — исполнение локальных subagents
- **Remote Agent Endpoints** — адаптеры для A2A/MCP агентов

**Agent Types:**

```text
Local Agent     — работает внутри runtime, общий state
Remote A2A      — внешний агент, общается по протоколу
MCP Agent       — агент через Model Context Protocol
Agent-as-Tool   — агент, вызываемый как tool из workflow
```

**Входы:**

- Запрос на исполнение (от Workflow Engine)
- Model policy (primary/fallback/constraints)
- Agent definition (role, tools, rules)
- Context bundle
- Memory bundle

**Выходы:**

- Ответ модели / результаты агента
- Метрики (latency, cost, tokens)
- Fallback chain (если primary недоступен)

**Зависимости:**

- Runtime Kernel (events, execution context)
- Governance Layer (проверка политик перед вызовом)
- Configuration & Registry System (загрузка определений)
- Capability System (tools для агентов)

**Потребители:**

- Workflow Engine (через Step Runners)

**A2A Scope:**

```text
MVP: local subagents + agent-as-tool
Later: remote agent adapter
Later: full A2A protocol
```

---

### 2.7 Capability System

**Назначение:** Управляет инструментами, артефактами, скиллами, валидаторами и шаблонами.

**Собственная ценность:** Unified tool registry + structured output management. Можно использовать отдельно.

**Подкомпоненты:**

- **Tool Registry** — регистрация и исполнение инструментов (MCP, bash, API, SDK, human gate)
- **Artifact Registry** — шаблоны, схемы, lifecycle артефактов
- **Skill Registry** — активация и применение skills
- **Validator Registry** — валидация артефактов по схемам
- **Template Registry** — шаблоны для prompts, artifacts, reports

**Capability Permissions (metadata на уровне definition):**

```yaml
tool:
  id: calendar.create_event
  source: mcp
  risk: external_modify
  requires:
    - calendar.write
  input_schema: calendar.create_event.input.schema.json
  output_schema: calendar.create_event.output.schema.json
  policy_tags:
    - external_action
    - user_visible
    - irreversible: false
```

**Artifact Lifecycle:**

```yaml
artifacts:
  ADR:
    path: docs/adr/{date}-{slug}.md
    schema: adr.schema.json
    validators:
      - schema_check
      - required_sections
    lifecycle:
      - draft
      - proposed
      - accepted
      - superseded
```

**Входы:**

- Определения tools/artifacts/skills (declarative)
- Данные для генерации (context, parameters)
- Запрос на исполнение tool
- Артефакт для валидации

**Выходы:**

- Результат исполнения tool
- Сгенерированный артефакт (по шаблону и схеме)
- Активированный skill (prompt fragments, rules, validators)
- Валидационный отчет

**Зависимости:**

- Runtime Kernel (events)
- Configuration & Registry System (загрузка определений)
- Governance Layer (проверка tool permissions)

**Потребители:**

- Agent & Model Runtime (агенты используют tools)
- Workflow Engine (workflow создает артефакты)
- Wolf Facade (domain packs предоставляют capabilities)

---

### 2.8 Interface & Integration Layer

**Назначение:** Адаптирует ядро под разные интерфейсы и внешние системы.

**Собственная ценность:** Можно подключить к любому существующему приложению или создать новый UI.

**Адаптеры:**

```text
CLI
Chat UI (Web)
OpenCode adapter
Claude Code / VS Code adapters
API server
Telegram / Slack / Discord
GitHub Actions
```

**Протоколы:**

```text
A2A (Agent-to-Agent)
MCP (Model Context Protocol)
HTTP API
WebSocket (streaming)
```

**Входы:**

- Пользовательский запрос (в формате конкретного адаптера)
- Внешние события (webhook, message)

**Выходы:**

- Структурированный ответ
- Запросы на approval
- События для внешних систем

**Зависимости:**

- Wolf Facade (как единая точка входа)

**Потребители:**

- Пользователь / внешние системы

---

### 2.9 Wolf Facade & Domain Framework

**Назначение:** Единый пользовательский агент Mr.Wolf. Определяет что нужно, выбирает сценарий, собирает систему. Domain Packs — готовые конфигурации для конкретных областей.

**Собственная ценность:** Это то, с чем взаимодействует пользователь. "I solve problems" реализуется здесь.

**Подкомпоненты:**

- **Wolf Agent** — фасад, анализирует запрос, определяет сценарий, собирает runtime
- **Domain Pack Loader** — загрузка и активация доменных пакетов
- **Runtime Assembler** — сборка CaseRuntime из компонентов
- **Execution Orchestrator** — управление полным циклом от запроса до результата
- **Result Aggregator** — сбор и форматирование финального ответа

**CaseRuntime (ключевой runtime artifact):**

```yaml
case_runtime:
  case_id: case_123
  status: planned | approved | running | paused | completed | failed
  scenario: contract_review
  domains:
    - legal-ops
  workflow: contract_review_gated
  execution_mode: supervised
  agents:
    - legal_assistant
    - document_summarizer
  tools:
    - document.parse
    - clause.extract
  skills:
    - clause_extraction
  artifacts:
    - clause_matrix
    - risk_register
  gates:
    - user_approval
    - expert_review
  policies:
    - legal_no_final_advice
    - external_send_requires_approval
  model_routes:
    legal_assistant: deep
    document_summarizer: fast
  memory_bundle: ...
  created_at: "2026-04-28T10:00:00Z"
  updated_at: "2026-04-28T10:05:00Z"
  policy_decisions: []
  approvals: []
  execution_trace: []
```

**CaseRuntime Persisted Path:**

```text
.wolf/state/cases/{case_id}/case-runtime.yaml
```

**Пользовательский flow:**

```text
User Request
  → Intake (нормализация)
  → Preliminary Scenario/Domain (быстрый интент)
  → Domain Pack Selection (кандидаты)
  → Context Resolution (сбор контекста с учетом домена)
  → Refined Scenario/Domain (уточнение)
  → Policy Check (проверка ограничений)
  → Workflow Selection (выбор сценария исполнения)
  → Runtime Assembly (сборка CaseRuntime)
  → Execution (исполнение workflow)
  → Gate Management (подтверждения)
  → Result Aggregation (единый результат)
  → User Response
```

**Входы:**

- Пользовательский запрос (естественный язык)
- Текущая сессия / история
- Доступные Domain Packs

**Выходы:**

- CaseRuntime (собранный runtime)
- Единый результат (ответ, артефакты, действия)
- Execution summary
- Запросы на approval
- Обновленное состояние сессии
- Audit trail

**Зависимости:**

- Все компоненты 1-8 (оркестрирует их)

**Потребители:**

- Interface & Integration Layer

---

## 3. Inter-Component Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                 Interface & Integration Layer               │
│     (CLI, Chat, OpenCode, API, Slack, A2A, MCP)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Wolf Facade & Domain Framework             │
│         (Mr.Wolf — Runtime Assembly & Orchestration)        │
└──────┬───────────────┬───────────────┬───────────────┬──────┘
       │               │               │               │
       ▼               ▼               ▼               ▼
┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐
│  Context   │ │  Governance  │ │   Agent    │ │ Capability   │
│   & Memory │ │    Layer     │ │  & Model   │ │   System     │
│   System   │ │              │ │  Runtime   │ │              │
└─────┬──────┘ └──────┬───────┘ └─────┬──────┘ └──────┬───────┘
      │               │               │               │
      └───────────────┴───────┬───────┴───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Workflow Engine                           │
│              (Step Runner Orchestration)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Runtime Kernel + Configuration                 │
│         (Events, State, Execution Context, Config)          │
└─────────────────────────────────────────────────────────────┘
```

**Принципы связей:**

- **Runtime Kernel** — фундамент. Все компоненты строятся поверх него.
- **Configuration & Registry** — инфраструктура. Поставляет типизированные конфигурации.
- **Workflow Engine** — центр исполнения. Делегирует шаги Step Runners.
- **Context & Memory** — поставщик контекста. Все компоненты используют context bundle.
- **Governance Layer** — middleware. Проверяет каждое действие перед исполнением.
- **Agent Runtime** и **Capability System** — плагины исполнения. Расширяют Workflow Engine.
- **Wolf Facade** — оркестратор. Собирает CaseRuntime и управляет полным циклом.
- **Interface Layer** — обертка. Адаптирует систему под пользователя.

---

## 4. MVP Roadmap

Каждый MVP реализует часть компонентов и добавляет функциональность.

### MVP 1: Config + Workflow Engine (разбит на под-этапы)

#### MVP 1A — Sequential Workflow Runner

**Компоненты:** Configuration & Registry System (Config Loader, Schema Validator), Runtime Kernel (Events), Workflow Engine
**Функциональность:**

- Загрузка workflow YAML
- Валидация схемы
- Последовательное исполнение шагов
- Встроенные типы шагов: `builtin.echo`, `builtin.shell`, `builtin.manual_gate`
- Step Runner Registry (расширяемый)
- Запись `events.jsonl`
- Запись `state.json`
- CLI: `wolf run`, `wolf resume`, `wolf cases list`, `wolf cases inspect`

#### MVP 1B — Enhanced Workflow

**Компоненты:** Workflow Engine, Runtime Kernel
**Функциональность:**

- Условные шаги (`when`)
- Retry policy
- Артефакты (простые, без валидации)
- Resume / восстановление state
- Step types: `tool`, `gate`

#### MVP 1C — Advanced Orchestration

**Компоненты:** Workflow Engine
**Функциональность:**

- Параллельные ветви (`parallel`)
- Dependency graph (`depends_on`)
- Fallback paths
- Subworkflow
- Step types: `condition`, `parallel`, `subworkflow`

### MVP 2: Context Resolver

**Компоненты:** Context & Memory System (Context Resolver, Memory Store)
**Функциональность:**

- Сбор релевантных файлов и документов
- Формирование context bundle
- Scenario routing (простой, по ключевым словам)
- Case Memory (сохранение/восстановление сессии)

### MVP 3: Policy Engine

**Компоненты:** Governance Layer
**Функциональность:**

- Декларативные политики (allow/ask/deny)
- Проверка по сценарию, файлам, tools, риску
- Integration с Workflow Engine (проверка перед шагом)
- Tool Risk Model (read/sensitive_read/draft/local_modify/external_modify)

### MVP 4: Agent Registry

**Компоненты:** Agent & Model Runtime (Agent Registry)
**Функциональность:**

- Загрузка агентов из markdown/yaml
- Инстанцирование runtime-агентов
- Local subagents
- Agent-as-tool

### MVP 5: Model Router

**Компоненты:** Agent & Model Runtime (Model Router)
**Функциональность:**

- Model policies (primary/fallback)
- Fallback chains
- Capability constraints (cost, speed, context window)
- Provider failure handling

### MVP 6: Artifact System + Skills

**Компоненты:** Capability System (Artifact Registry, Skill Registry, Validator Registry)
**Функциональность:**

- Шаблоны и схемы артефактов
- Lifecycle (draft → proposed → accepted)
- Валидация по схеме
- Skill activation (prompt fragments, rules)

### MVP 7: Wolf Agent Facade

**Компоненты:** Wolf Facade & Domain Framework, Interface & Integration Layer
**Функциональность:**

- Единый пользовательский агент
- Двухэтапный scenario/domain routing
- CaseRuntime assembly
- Execution summary
- Approval UX
- Domain Pack loading

### MVP 8: A2A + External Integrations

**Компоненты:** Agent & Model Runtime (Remote Agent Endpoints), Interface & Integration Layer
**Функциональность:**

- Remote agent adapter
- MCP server integration
- A2A protocol
- Trust boundaries для external agents

---

## 5. Success Criteria

Фреймворк считается правильно спроектированным, если:

1. Пользователь взаимодействует с одним агентом (Mr.Wolf).
2. Каждый компонент можно использовать отдельно от остальных.
3. Workflow, policies, agents, models, skills, artifacts — декларативны.
4. Core не содержит доменных понятий.
5. Domain Packs можно подключать и заменять без изменения core.
6. Tools могут быть MCP, bash, API, SDK, agent-as-tool или human gate.
7. Subagents и A2A agents имеют единый интерфейс (для workflow).
8. Gates и policies сильнее prompt-инструкций (техническая гарантия).
9. State и audit trail сохраняются и воспроизводятся.
10. Политики управляют уровнем автономности на уровне runtime.
11. Memory — явный компонент с четкими типами и lifecycle.
12. CaseRuntime — явный артефакт, объясняющий решение системы.
13. Trust boundaries заданы для всех типов исполнителей.
14. Step taxonomy определена и расширяема через Step Runner Registry.
15. Tool risk declared в manifest, не угадывается runtime.

---

## 6. Known Issues & Design Decisions

### 6.1 Scenario ↔ Context Cycle (Решено)

**Проблема:** Scenario Router нуждается в контексте, Context Resolver — в сценарии.
**Решение:** Двухэтапный процесс:

1. Быстрый интент-анализ (ключевые слова, сигналы) → грубый сценарий + domain candidates
2. Сбор контекста с учетом домена → уточнение сценария

### 6.2 Domain Pack Selection (Решено)

**Проблема:** Domain pack нужен до полноценного context resolution.
**Решение:** Двухэтапный выбор:

1. Предварительный выбор по ключевым словам
2. Финальный выбор после сбора контекста

### 6.3 Agent vs Tool Boundary (Определено)

**Правило:**

- Одно действие = Tool
- Исполнитель с рассуждением и workflow = Agent
- Внешний независимый исполнитель = A2A Agent
  **Интерфейс:** A2A agents имеют тот же интерфейс для workflow, но получают filtered context.

### 6.4 YAML vs Code for Configuration

**Решение:** Декларативный YAML для пользователей, но с **строгой схемой** (JSON Schema / Pydantic). Config Loader валидирует структуру до runtime.
**Альтернатива:** Python/Pydantic напрямую — отклонена, так как требует программирования от пользователя фреймворка.

### 6.5 Policy Override of Prompt

**Решение:** Policy Engine как middleware. Действия проверяются **после** планирования агента, но **перед** исполнением. Если policy = deny, действие блокируется на уровне runtime.

### 6.6 State vs Memory (Разделено)

**State** — что происходит сейчас (volatile, execution-specific).
**Memory** — что система должна помнить и использовать в будущем (persistent, searchable).
**Решение:** Runtime Kernel управляет State. Context & Memory System управляет Memory.

### 6.7 Workflow Engine Boundaries (Определены)

**Workflow Engine** не исполняет tools, agents или gates сам.
**Workflow Engine** вызывает Step Runners.
**Step Runners** делегируют в Agent Runtime, Capability System, Gate Manager.

### 6.8 Plugin vs Domain Pack (Разделено)

**Plugin** — поставляет кодовые расширения: step runners, tools, validators, model providers, adapters.
**Domain Pack** — поставляет декларативную доменную логику: workflows, agents, artifacts, policies, skills, prompts.
**Package** — может содержать и plugin code, и domain pack definitions.

### 6.9 State Storage (Решено для MVP)

**Решение:** Гибридный подход для MVP:

- **Files** — state.json, events.jsonl, artifacts/ (прозрачность, отладка)
- **SQLite** — indexes, queryable metadata, case list, event index

**Почему не только файлы:** поиск и список кейсов быстро станут неудобными.
**Почему не только DB:** потеряешь прозрачность и удобство отладки.

### 6.10 Event Bus (Решено для MVP)

**Решение:**

- **MVP:** synchronous in-process event bus + append-only events.jsonl
- **Later:** async queue adapter

Интерфейс EventBus сразу делается расширяемым, но реализация остается простой.

### 6.11 Runtime Language for MVP (Решено)

**Решение:** TypeScript

**Обоснование:**

- Хорош для CLI/runtime tooling
- Удобен для YAML/JSON schema validation
- Естественен для MCP/IDE/web adapters
- Легче типизировать plugin SDK

**Стек MVP:**

```text
Runtime:     TypeScript (Node.js)
Schema:      TypeBox или Zod + JSON Schema export
Storage:     files + SQLite
CLI:         Commander.js или аналог
```

**Примечание:** Python можно поддержать позже как plugin/runtime adapter.

---

## 7. Open Questions

1. **A2A Protocol:** Использовать существующий протокол (Google A2A?) или свой?
2. **Domain Pack Distribution:** Git submodules, package manager (npm/pip), или встроенный registry?
3. **Human-in-the-loop UX:** CLI prompts, web UI, или оба сразу?
4. **Memory Backend:** File-based, vector DB, graph DB, или комбинация?
5. **Secret Handling:** Environment variables, secret manager, или encrypted config?
6. **Expression Language:** Что использовать для `when`/policy conditions? CEL, JSONLogic, jq-like DSL, custom minimal DSL?
7. **Plugin Sandbox:** Как безопасно исполнять plugin code?
8. **Schema Language:** JSON Schema, Zod, Pydantic, TypeBox?
9. **Runtime Language:** TypeScript, Python или polyglot core?
10. **Observability:** Как смотреть execution trace, events, costs, model calls?
11. **Versioning:** Как версионировать workflows, packs, artifacts и CaseRuntime?

---

## 8. Appendices

### Appendix A: Core Data Types (MVP1A)

#### Case

```yaml
case:
  id: case_abc123
  title: "Run hello_world workflow"
  status: created | planned | running | paused | completed | failed | cancelled
  request:
    raw: string
    normalized?: object
  workflow_id: hello_world
  created_at: "2026-04-28T10:00:00Z"
  updated_at: "2026-04-28T10:00:05Z"
```

**Примечание:** `Case`, `CaseRuntime` и `ExecutionState` — три разные сущности:

- **Case** — дело / пользовательская задача.
- **CaseRuntime** — собранный план исполнения этого дела.
- **ExecutionState** — текущее техническое состояние выполнения.

#### WorkflowDefinition

```yaml
workflow_definition:
  id: string
  version: string
  description?: string
  steps: StepDefinition[]
  inputs?: InputSchema
  outputs?: OutputSchema
```

#### StepDefinition

```yaml
step_definition:
  id: string
  type: builtin | task | tool | gate | artifact | condition | parallel | subworkflow
  name?: string
  description?: string
  input?: object | string (template)
  output?: string (artifact name)
  depends_on?: string[]
  when?: string (expression)
  retry?:
    max_attempts: number
    backoff: linear | exponential
  timeout?: string (e.g. "30s", "5m")
  artifacts?: string[]
```

#### ExecutionState

```yaml
execution_state:
  case_id: string
  workflow_id: string
  status: pending | running | paused | completed | failed
  current_step_id?: string
  completed_steps: string[]
  failed_steps: string[]
  step_results: Record<string, StepResult>
  variables: Record<string, any>
  started_at: timestamp
  updated_at: timestamp
```

#### Variable Store

```yaml
variable_store:
  # Шаг может записать output в переменную
  # Следующие шаги могут использовать через template
  current_directory: "/home/user/project"
  greet_output: "Starting Mr. Wolf workflow"
```

**Template Resolution (MVP1A):**

```yaml
# Простая Mustache-подстановка
input:
  message: "Current dir is {{ variables.current_directory }}"
```

**Примечание:** Полноценный expression engine отложен до MVP1B. В MVP1A — только прямая подстановка переменных.

#### StepResult

```yaml
step_result:
  step_id: string
  status: success | failure | skipped | gated
  output?: any
  error?:
    type: StepFailed | PolicyDenied | GateRejected | ToolError | Timeout | Cancelled
    message: string
    retryable: boolean
  started_at: timestamp
  completed_at: timestamp
```

#### RuntimeEvent

```yaml
runtime_event:
  id: string
  type: string
  case_id: string
  workflow_id?: string
  step_id?: string
  timestamp: string (ISO8601)
  actor:
    type: system | agent | user | tool
    id: string
  payload: object
  correlation_id?: string
  parent_event_id?: string
```

---

### Appendix B: Event Envelope

Все события в системе используют единый envelope:

```yaml
event:
  # Identity
  id: evt_<uuid>
  type: <domain>.<entity>.<action>

  # Routing
  case_id: case_<uuid>
  workflow_id: wf_<id>
  step_id: step_<id>

  # Timing
  timestamp: "2026-04-28T10:00:00Z"

  # Actor
  actor:
    type: system | agent | user | tool | external
    id: <actor_id>

  # Payload
  payload:
    # event-specific data

  # Correlation
  correlation_id: corr_<uuid>
  parent_event_id: evt_<uuid>
```

**Event Types (MVP1A subset):**

```text
case.created
workflow.started
workflow.completed
workflow.failed
step.started
step.completed
step.failed
gate.requested
gate.approved
gate.rejected
```

---

### Appendix C: MVP1A Workflow YAML Example

```yaml
id: hello_world
version: "0.1.0"
description: "Minimal workflow for MVP1A"

steps:
  - id: greet
    type: builtin
    runner: echo
    input:
      message: "Starting Mr. Wolf workflow"

  - id: check_env
    type: builtin
    runner: shell
    input:
      command: "echo $PWD"
    output: current_directory

  - id: confirm_continue
    type: builtin
    runner: manual_gate
    input:
      message: "Continue to next step?"

  - id: finish
    type: builtin
    runner: echo
    input:
      message: "Workflow completed!"
    depends_on:
      - confirm_continue
```

---

### Appendix D: MVP1A State Directory Layout

```text
.wolf/
  state/
    cases/
      case_abc123/
        case.yaml          # case metadata
        workflow.yaml      # resolved workflow definition
        state.json         # current execution state
        events.jsonl       # append-only event log
        outputs/           # step outputs
          greet.txt
          check_env.txt
```

**case.yaml:**

```yaml
case_id: case_abc123
workflow_id: hello_world
status: running
created_at: "2026-04-28T10:00:00Z"
updated_at: "2026-04-28T10:00:05Z"
```

---

### Appendix E: Step Runner Interface

```ts
interface StepRunner {
  // Unique type identifier
  type: string;

  // Human-readable name
  name: string;

  // Execute the step
  run(step: StepDefinition, ctx: ExecutionContext): Promise<StepResult>;

  // Validate step definition before execution
  validate?(step: StepDefinition): ValidationResult;
}

interface ExecutionContext {
  case_id: string;
  workflow_id: string;
  variables: Record<string, any>;
  memory: MemoryBundle;
  config: ConfigSnapshot;
}

interface StepResult {
  status: "success" | "failure" | "skipped" | "gated";
  output?: any;
  error?: StepError;
  artifacts?: string[];
}

interface StepError {
  type:
    | "StepFailed"
    | "PolicyDenied"
    | "GateRejected"
    | "ToolError"
    | "Timeout"
    | "Cancelled";
  message: string;
  retryable: boolean;
  details?: Record<string, any>;
}
```

**Builtin Runners (MVP1A):**

**echo:**

```text
- выводит message в output
- output сохраняется в outputs/{step_id}.txt
```

**shell:**

```text
- исполняет shell команду
- stdout сохраняется в outputs/{step_id}.stdout.txt
- stderr сохраняется в outputs/{step_id}.stderr.txt
- exit code сохраняется в state
- ограничения MVP1A:
  - исполняется только в текущей рабочей директории
  - timeout: 30s по умолчанию
  - интерактивные команды запрещены
  - команда пишется в events.jsonl
  - stdout/stderr пишутся в outputs/
  - позже будет проходить через Governance Layer
```

**manual_gate:**

```text
Lifecycle:
  1. Создает gate_request (см. Appendix F)
  2. Пишет gate.requested в events.jsonl
  3. Сохраняет gate в state.json
  4. Ставит ExecutionState.status = paused
  5. Возвращает StepResult.status = gated
  6. Продолжение возможно только через approve/reject/resume

CLI:
  wolf gates list
  wolf approve gate_<id>
  wolf reject gate_<id>
  wolf resume case_<id>
```

---

### Appendix F: Gate Request Model

```yaml
gate_request:
  # Identity
  id: gate_<uuid>
  case_id: case_<uuid>
  step_id: step_<id>
  gate_type: user_approval | test_pass | policy_check | expert_review

  # Content
  title: string
  message: string
  severity: info | warning | critical

  # Options
  options:
    - id: approve
      label: "Approve"
      description: "Proceed with the action"
    - id: reject
      label: "Reject"
      description: "Cancel the action"
    - id: modify
      label: "Modify"
      description: "Edit before proceeding"

  # Metadata
  requested_by:
    type: system | agent | policy
    id: string
  expires_at?: string (ISO8601)

  # Context
  consequences:
    - string
  diff_preview?: string
  artifact_preview?: string
  context_summary?: string

  # Response
  response?:
    option_id: string
    comment?: string
    responded_by: string
    responded_at: string
```

---

### Appendix G: Error Model

```text
StepFailed       — шаг не выполнился (runtime error)
PolicyDenied     — политика запретила действие
GateRejected     — пользователь/эксперт отклонил gate
ToolError        — tool вернул ошибку
AgentError       — агент не смог выполнить задачу
ValidationError  — артефакт не прошел валидацию
Timeout          — шаг превысил timeout
Cancelled        — шаг отменен пользователем или системой
```

**Error Handling Strategy per Type:**

```yaml
error_handling:
  StepFailed:
    default: retry
    max_retries: 3
  PolicyDenied:
    default: fail
    retryable: false
  GateRejected:
    default: fail
    retryable: false
  ToolError:
    default: retry
    max_retries: 2
  Timeout:
    default: retry
    max_retries: 1
  Cancelled:
    default: fail
    retryable: false
```

---

### Appendix H: Plugin vs Domain Pack

**Plugin:**

```text
Поставляет: кодовые расширения
Примеры:    step runners, tools, validators, model providers, adapters
Формат:     package с кодом (npm/pip)
Безопасность: sandbox required
Distribution: package manager
```

**Domain Pack:**

```text
Поставляет: декларативную доменную логику
Примеры:    workflows, agents, artifacts, policies, skills, prompts
Формат:     YAML/markdown конфигурация
Безопасность: declarative, safe by default
Distribution: git / registry
```

**Package (комбинированный):**

```text
Может содержать и plugin code, и domain pack definitions
Пример: legal-ops pack + document-parser plugin
```
