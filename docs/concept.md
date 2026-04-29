<p align="center">
  <img src="./Mr.%20Wolf.png" alt="Mr. Wolf" width="400" />
</p>

# Мистер Вульф: концепция универсального адаптивного агентного фреймворка

## 1. Назначение

**Мистер Вульф** — это универсальный модульный фреймворк для построения адаптивных агентных систем, в которых пользователь всегда взаимодействует с одним основным агентом, а вся внутренняя логика исполнения динамически собирается из конфигурации проекта, политик, workflow, инструментов, скиллов, доменных пакетов и подключаемых агентов.

Цель фреймворка — не создать еще один фиксированный набор агентов, а дать **конструктор агентных систем**, из которого можно собирать разные типы интеллектуальных помощников:

- помощник для разработки;
- офисный ассистент;
- консьерж;
- юридический помощник;
- исследовательский агент;
- помощник по продажам;
- HR-ассистент;
- финансовый или операционный помощник;
- любые другие доменные конфигурации.

Ключевая идея:

```text
Один внешний агент для пользователя.
Внутри — динамически собранный runtime под конкретную задачу.
```

Фреймворк должен быть полностью конфигурируемым и управляемым: логика поведения, маршрутизация, выбор workflow, набор артефактов, правила, скиллы, модели, инструменты и уровень автономности не должны быть зашиты в код ядра. Они должны описываться декларативно и заменяться под конкретный проект или домен.

---

## 2. Пользовательская модель

Пользователь не должен выбирать агентов, модели, скиллы или workflow вручную.

Пользователь обращается к единому агенту:

```text
User → Wolf Agent
```

Этот агент работает как фасад над внутренним runtime:

```text
Wolf Agent
  → анализирует запрос
  → определяет сценарий
  → собирает контекст
  → выбирает доменный пакет
  → выбирает workflow
  → выбирает режим автономности
  → выбирает модели
  → подключает tools и skills
  → привлекает subagents
  → применяет rules и policies
  → проходит gates
  → создает артефакты
  → возвращает единый результат пользователю
```

Пользовательская метафора: **“Мистер Вульф”**. Пользователь не управляет командой напрямую, а обращается к одному координатору. Координатор сам открывает дело, оценивает ситуацию, собирает команду, выбирает порядок действий, спрашивает подтверждения там, где требуется, и доводит процесс до результата.

Внутренний словарь:

```text
Wolf Agent          — единый пользовательский агент-фасад
Case                — задача, дело, рабочая сессия
Scenario            — тип ситуации или намерения
Playbook / Workflow — сценарий исполнения
Crew                — набор runtime-агентов под задачу
Rules / Policies    — ограничения и правила исполнения
Gates               — точки подтверждения или проверки
Evidence / Context  — собранный контекст
Artifacts           — создаваемые результаты: spec, ADR, memo, itinerary, report и т.д.
Tools               — действия и источники данных
Skills              — подключаемые способности или методологии
```

---

## 3. Основной принцип архитектуры

Главный принцип фреймворка:

```text
Runtime должен быть универсальным и надежным.
Проектная логика должна быть внешней, прозрачной и заменяемой.
```

Иными словами:

```text
Agents are data.
Workflows are data.
Rules are data.
Routing is data.
Models are data.
Artifacts are data.
Runtime only executes.
```

Ядро фреймворка не должно знать, что такое Spec, ADR, ADL, React, Git, договор, встреча, календарь, поездка или юридический меморандум.

Ядро должно знать только универсальные примитивы:

```text
Case
Scenario
Workflow
Step
Task
Agent
Tool
Skill
Policy
Gate
Artifact
Context
Event
Hook
ModelRoute
State
```

Все доменные понятия должны поставляться через подключаемые пакеты.

---

## 4. Высокоуровневый runtime flow

```text
User Request
  ↓
Wolf Agent
  ↓
Intake Layer
  ↓
Context Resolver
  ↓
Scenario Router
  ↓
Domain Pack Resolver
  ↓
Policy Engine
  ↓
Workflow Resolver
  ↓
Runtime Assembler
  ↓
Execution Engine
  ↓
Gate Manager
  ↓
Result Aggregator
  ↓
User Response
```

Каждый слой должен быть независимым и заменяемым. Его можно использовать отдельно как plugin, tool, hook или самостоятельный компонент.

---

## 5. Основные слои

### 5.1 Interface Layer

Отвечает за взаимодействие с пользователем.

Возможные адаптеры:

```text
CLI
Chat UI
OpenCode adapter
Claude Code adapter
VS Code adapter
Web UI
API server
Telegram / Slack / Discord
GitHub Actions
```

Этот слой не должен знать внутреннюю архитектуру агентов. Он передает пользовательский запрос в runtime и получает структурированный ответ.

---

### 5.2 Intake Layer

Нормализует входной запрос.

Задачи слоя:

```text
принять сообщение пользователя
связать его с текущей сессией
определить вложения и контекст
создать или продолжить Case
зафиксировать исходный запрос
```

---

### 5.3 Scenario Layer

Определяет тип задачи.

Примеры сценариев:

```text
quick_answer
deep_research
feature_implementation
bugfix
refactor
architecture_decision
specification
adr_creation
adl_modeling
meeting_preparation
inbox_triage
travel_planning
contract_review
legal_memo
sales_followup
weekly_report
```

Scenario не должен быть зашит в код. Он должен определяться через конфигурацию, правила, классификатор или их комбинацию.

Пример декларативной маршрутизации:

```yaml
scenarios:
  architecture_decision:
    match:
      keywords:
        - architecture
        - tradeoff
        - ADR
    default_workflow: adr_first
    default_persona: software_architect
    execution_mode: gated

  meeting_preparation:
    match:
      signals:
        - calendar_event
        - recent_emails
    default_workflow: meeting_brief
    default_persona: office_assistant
    execution_mode: supervised
```

---

### 5.4 Context Layer

Собирает релевантный контекст для задачи.

Источники контекста могут быть разными:

```text
файлы проекта
документация
история решений
письма
календарь
CRM
договоры
внешние документы
web search
knowledge base
предыдущие Case
артефакты прошлых задач
```

Результатом работы слоя должен быть структурированный context bundle:

```text
релевантные файлы
релевантные документы
важные правила
история решений
ограничения
нехватка данных
рекомендации по дальнейшему workflow
```

Контекстный слой должен быть полезен сам по себе. Например, его можно вызывать отдельно для анализа проекта, подготовки встречи или сбора материалов по юридическому делу.

---

### 5.5 Policy Layer

Policy Layer — главный слой управляемости.

Он решает:

```text
что разрешено
что запрещено
где нужен approval
какие модели можно использовать
какие tools доступны
какой workflow допустим
какие артефакты обязательны
какой уровень автономности возможен
какие действия требуют human gate
```

Пример:

```yaml
policies:
  autonomy:
    default: supervised

    rules:
      - when:
          scenario: quick_answer
        mode: autonomous

      - when:
          files.match: '**/migrations/**'
        require_approval: true

      - when:
          action.type: external_send
        require_approval: true

      - when:
          domain: legal
        require_expert_review_for:
          - final_legal_recommendation
```

Политики должны быть сильнее prompt-инструкций. Если политика запрещает действие, агент не должен обходить это через рассуждения.

---

### 5.6 Workflow Layer

Workflow — это декларативный граф исполнения.

Он описывает:

```text
шаги
зависимости
условия
исполнителей
артефакты
gates
валидации
fallback
parallel execution
```

Пример workflow для разработки через spec:

```yaml
id: spec_first_feature
steps:
  - id: create_spec
    agent: spec_writer
    output: spec

  - id: approve_spec
    type: gate
    gate: user_approval

  - id: create_tasks
    agent: task_planner
    input: spec
    output: task_graph

  - id: implement
    agent: coder
    input: task_graph

  - id: validate
    agent: test_engineer

  - id: review
    agent: reviewer
```

Пример workflow для архитектурного решения:

```yaml
id: adr_adl_first
steps:
  - id: gather_context
    agent: context_scout
    output: context_bundle

  - id: create_adr
    agent: architect
    output: ADR

  - id: create_adl
    agent: adl_modeler
    output: ADL

  - id: approve_architecture
    type: gate
    gate: user_approval

  - id: create_implementation_plan
    agent: planner
    output: implementation_plan
```

Пример workflow для офиса:

```yaml
id: meeting_preparation
steps:
  - id: collect_context
    tools:
      - calendar.search
      - gmail.search
      - contacts.search
    output: meeting_context

  - id: summarize_history
    agent: office_summarizer
    input: meeting_context
    output: meeting_brief

  - id: create_agenda
    agent: office_planner
    output: agenda

  - id: draft_followup
    agent: email_assistant
    output: email_draft

  - id: send_approval
    type: gate
    gate: user_approval
```

---

### 5.7 Agent Layer

Агенты внутри системы — это runtime-роли, а не пользовательские команды.

Пользователь не выбирает их напрямую. Их выбирает Wolf Agent через workflow и policy.

Примеры runtime-агентов:

```text
context_scout
external_scout
planner
coder
reviewer
test_engineer
architect
legal_assistant
office_assistant
travel_researcher
concierge
finance_analyst
researcher
summarizer
```

Agent definition должен быть декларативным:

```yaml
id: coder
role: implementation
model_policy: coding
tools:
  - read_file
  - edit_file
  - bash
rules:
  - minimal_diff
  - follow_project_style
outputs:
  - implementation_result
```

Prompt агента может быть markdown-файлом:

```markdown
---
id: coder
role: implementation
model_policy: coding
---

You implement bounded tasks using the provided context, task graph, rules and artifacts.
```

---

### 5.8 Model Layer

Модели должны быть отделены от агентов.

Agent не должен жестко содержать конкретную модель. Он должен ссылаться на `model_policy`.

Пример:

```yaml
model_policies:
  fast:
    primary: openai:gpt-4.1-mini
    fallback:
      - anthropic:claude-haiku
      - local:qwen-coder

  deep:
    primary: anthropic:claude-opus
    fallback:
      - openai:gpt-5
      - google:gemini-pro

  coding:
    primary: anthropic:claude-sonnet
    fallback:
      - openai:codex
      - local:deepseek-coder

  private_local:
    primary: ollama:qwen-coder
    constraints:
      network: false
```

Model Router должен учитывать:

```text
стоимость
скорость
контекстное окно
tool support
vision support
privacy constraints
fallback chains
provider failures
rate limits
```

---

### 5.9 Tool Layer

Tool — это любая внешняя capability, которой агент может пользоваться через контролируемый интерфейс.

Tool не обязательно должен быть написан внутри фреймворка.

Источники tools:

```text
builtin tools
MCP servers
bash scripts
HTTP APIs
SDK functions
browser automation
database queries
human approval
local agents
remote A2A agents
```

Примеры:

```yaml
tools:
  run_tests:
    source: script
    command: 'npm test'
    risk: low

  gmail.search:
    source: mcp
    server: gmail
    risk: read

  calendar.create_event:
    source: mcp
    server: calendar
    risk: external_modify
    approval: required

  contract.extract_clauses:
    source: function
    handler: legal.extractClauses
    risk: read

  legal.review_contract:
    source: agent
    agent: legal_assistant
    risk: analysis
```

Разница между Tool и Agent:

```text
Tool  — выполняет конкретное действие.
Agent — решает подзадачу, может планировать, использовать tools и создавать artifacts.
```

Простое правило:

```text
Если это одно действие — tool.
Если это исполнитель с рассуждением и workflow — agent.
Если это внешний независимый исполнитель — A2A agent.
```

---

### 5.10 Skill Layer

Skill — это подключаемый capability package.

Skill может давать:

```text
prompt fragments
rules
tools
MCP servers
workflows
validators
artifact templates
context resolvers
methodology
```

Примеры skills:

```text
TDD
security_review
contract_review
travel_planning
meeting_preparation
react_patterns
database_migration
ADR_creation
ADL_modeling
```

Skill не должен быть просто текстовой инструкцией. Он может быть полноценным пакетом возможностей.

---

### 5.11 Artifact Layer

Artifact — структурированный результат работы.

Фреймворк не должен считать `spec` главным или встроенным артефактом. В разных доменах артефакты разные.

Примеры:

```text
Software:
  Spec
  ADR
  ADL
  Implementation Plan
  Task Graph
  Review Report

Office:
  Meeting Brief
  Agenda
  Email Draft
  Action Items
  Weekly Report

Concierge:
  Preference Profile
  Options Shortlist
  Itinerary
  Booking Checklist

Legal:
  Matter Intake
  Clause Matrix
  Risk Register
  Legal Memo Draft
  Questions for Counsel
```

Artifact должен определяться через schema/template/lifecycle:

```yaml
artifacts:
  ADR:
    path: docs/adr/{date}-{slug}.md
    schema: adr.schema.json
    lifecycle:
      - draft
      - proposed
      - accepted
      - superseded

  Itinerary:
    path: cases/{case_id}/itinerary.md
    schema: itinerary.schema.json
    lifecycle:
      - draft
      - approved
      - booked
```

---

### 5.12 Gate Layer

Gate — точка проверки, подтверждения или остановки.

Типы gates:

```text
user approval
test pass
policy check
budget check
security review
architecture review
legal expert review
artifact validation
human signoff
```

Пример:

```yaml
gates:
  approve_plan:
    type: user_approval
    message: 'Подтвердить план реализации?'

  tests_pass:
    type: command_success
    command: npm test

  legal_expert_review:
    type: human_expert_review
    required_for:
      - final_legal_recommendation
```

Уровни автономности:

```yaml
autonomy_modes:
  observe:
    can_read: true
    can_draft: false
    can_act: false

  draft_only:
    can_read: true
    can_draft: true
    can_act: false

  supervised:
    can_read: true
    can_draft: true
    can_act_with_approval: true

  trusted:
    can_act_low_risk: true
    ask_high_risk: true

  autonomous:
    can_act_within_policy: true
    deny_high_risk: true
```

---

### 5.13 State / Memory Layer

Состояние должно быть наблюдаемым, воспроизводимым и пригодным для аудита.

Пример структуры:

```text
.wolf/state/
  sessions/
    2026-04-27-auth-flow/
      context.md
      selected-route.json
      selected-workflow.yaml
      task-graph.yaml
      events.jsonl
      approvals.jsonl
      result.md

  tasks/
    task-001.json
    task-002.json

  artifacts/
    specs/
    adr/
    adl/
    reports/

  memory/
    project-summary.md
    decisions-index.json
```

State layer нужен для:

```text
resume
debugging
audit trail
team visibility
reproducibility
postmortem
review
```

---

### 5.14 Event / Hook Layer

Все важные действия должны порождать события.

Примеры событий:

```text
case.created
scenario.resolved
context.resolved
workflow.selected
model.resolved
agent.started
agent.completed
tool.before
tool.after
artifact.created
gate.requested
gate.approved
gate.denied
task.completed
validation.failed
```

Hooks позволяют расширять систему без изменения ядра:

```yaml
hooks:
  - on: artifact.created
    when:
      artifact.type: ADR
    run: update_adr_index

  - on: tool.before
    when:
      tool.name: edit_file
      files.match: '**/migrations/**'
    run: require_migration_approval

  - on: task.completed
    run: update_session_summary
```

---

## 6. Декларативные компоненты и кодовая база

Фреймворк должен разделять компоненты по степени декларативности.

### 6.1 Pure Declarative

Только данные:

```text
project metadata
model aliases
agent definitions
artifact schemas
routing rules
permissions
workflow graph
gate declarations
context docs
prompt templates
skill descriptions
registry manifests
```

Форматы:

```text
yaml
json
markdown
toml
jsonschema
```

---

### 6.2 Declarative + Expressions

Декларативные условия:

```yaml
when:
  and:
    - scenario: feature_implementation
    - files.match: '**/auth/**'
    - risk.gte: medium
```

Используется для:

```text
routing conditions
policy conditions
gate conditions
workflow step conditions
skill activation rules
tool permission rules
```

---

### 6.3 Declarative + Templates

Шаблоны prompt, artifacts, reports, approvals:

```markdown
# ADR: {{title}}

## Context

{{context.summary}}

## Decision

{{decision}}

## Consequences

{{consequences}}
```

---

### 6.4 Runtime Core Code

Универсальный код ядра:

```text
RuntimeKernel
ConfigLoader
ConfigMerger
SchemaValidator
Registry
DependencyResolver
ScenarioRouter
PolicyEngine
WorkflowEngine
TaskGraphExecutor
AgentRuntime
ModelRouter
ToolExecutor
GateManager
ArtifactStore
EventBus
HookBus
StateStore
PluginLoader
```

Core не должен содержать проектную или доменную логику.

---

### 6.5 Extension / Plugin Code

Подключаемый код:

```text
custom tools
custom validators
custom context resolvers
custom model providers
custom adapters
custom artifact generators
custom workflow step runners
```

Код нужен, если компонент выполняет:

```text
I/O
API calls
парсинг
индексацию
сложную валидацию
работу с AST / graph
shell execution
browser automation
streaming
интеграцию с внешним runtime
```

---

### 6.6 Generated / State Layer

Создается системой во время работы:

```text
context bundles
selected routes
task graphs
approvals
events
artifacts
reports
summaries
memory indexes
```

---

## 7. Domain Packs

Для универсальности вводится понятие **Domain Pack**.

Domain Pack — это готовый набор сценариев, workflow, агентов, скиллов, артефактов, политик и tools для конкретной области.

Примеры:

```text
software-engineering
office-assistant
concierge
legal-ops
finance-ops
research-assistant
sales-assistant
hr-assistant
education-tutor
```

Структура пакета:

```text
packs/
  office-assistant/
    pack.yaml
    scenarios.yaml
    workflows/
    agents/
    skills/
    artifacts/
    policies/
    gates/
    tools.yaml
    prompts/
    schemas/
```

Пример:

```yaml
id: office-assistant
provides:
  scenarios:
    - meeting_preparation
    - inbox_triage
    - weekly_report
    - document_drafting
  artifacts:
    - meeting_brief
    - email_draft
    - action_items
    - report
  tools:
    - gmail
    - calendar
    - docs
    - contacts
  policies:
    - email_send_requires_approval
    - calendar_changes_require_approval
```

---

## 8. A2A и subagents

Фреймворк должен поддерживать два уровня агентного взаимодействия.

### 8.1 Local subagents

Агенты работают внутри одного runtime и используют общий:

```text
state
policy engine
workflow engine
tool registry
memory
gate manager
event bus
```

Пример:

```text
Wolf Agent
  → ContextScout
  → Planner
  → Coder
  → Reviewer
  → TestEngineer
```

---

### 8.2 Remote A2A agents

A2A нужен, когда исполнитель — отдельная агентная система или внешний сервис.

Пример:

```text
Wolf Agent
  ↔ external legal agent
  ↔ accounting agent
  ↔ corporate helpdesk agent
  ↔ vendor agent
```

Для этого нужен универсальный `AgentEndpoint`:

```yaml
agents:
  local_legal:
    type: local
    runtime_agent: legal_assistant

  external_legal:
    type: a2a
    endpoint: https://legal-agent.company.com/a2a
    capabilities:
      - contract_review
      - clause_extraction

  mcp_research_agent:
    type: mcp
    server: research-agent
```

Workflow не должен зависеть от того, локальный это агент или внешний:

```yaml
steps:
  - id: legal_review
    agent: external_legal
    input:
      - contract
      - jurisdiction
    output:
      - risk_register
```

---

## 9. Пример универсальной работы

Пользователь:

```text
Подготовь NDA для нового подрядчика и согласуй встречу на подписание.
```

Внутри runtime:

```text
Scenario: prepare_nda_signing
Domain Packs: office-assistant + legal-ops
Workflow: legal_document_preparation
Execution Mode: supervised
Tools: contacts, gmail, calendar, document parser
Agents: office_assistant, legal_assistant, external_legal
Artifacts: nda_draft, risk_notes, email_draft, calendar_proposal
Gates: legal review, user approval before sending, user approval before calendar change
```

Workflow:

```yaml
workflow: prepare_nda_signing

steps:
  - id: collect_contractor_info
    agent: office_assistant
    tools:
      - contacts.search
      - gmail.search

  - id: draft_nda
    agent: legal_assistant
    output: nda_draft

  - id: legal_review
    agent: external_legal
    output: risk_notes

  - id: user_approval
    type: gate

  - id: schedule_signing
    agent: office_assistant
    tools:
      - calendar.create_event
    approval: required

  - id: draft_email
    agent: office_assistant
    output: email_draft

  - id: send_email_approval
    type: gate
```

Пользователь видит только единого координатора, а не внутреннюю механику.

---

## 10. Предлагаемая структура репозитория

```text
wolf-framework/
  core/
    kernel/
    config/
    workflow/
    policy/
    context/
    agents/
    models/
    tools/
    gates/
    artifacts/
    events/
    state/

  sdk/
    types/
    plugin-api/
    testing/

  adapters/
    cli/
    opencode/
    claude-code/
    vscode/
    github-actions/
    api-server/

  providers/
    openai/
    anthropic/
    google/
    ollama/

  packs/
    base/
    software-engineering/
    office-assistant/
    concierge/
    legal-ops/
    adr-adl/
    specs/
    tdd/

  plugins/
    jira/
    figma/
    github/
    browser/
    gmail/
    calendar/

  templates/
    minimal/
    spec-first/
    adr-first/
    autonomous/
    gated-enterprise/
```

Структура в конкретном проекте:

```text
my-project/
  .wolf/
    wolf.yaml

    models.yaml
    routing.yaml
    policies.yaml
    permissions.yaml
    gates.yaml

    agents/
    workflows/
    skills/
    artifacts/
    prompts/

    context/
      core/
      project/
      history/
      archive/

    state/
      sessions/
      tasks/
      artifacts/
```

---

## 11. MVP roadmap

Фреймворк нужно строить малыми самодостаточными частями.

### MVP 1: Config + Workflow Engine

```text
load .wolf/workflows/*.yaml
execute linear workflow
support gates
support artifacts
```

Уже полезно как standalone workflow runner.

---

### MVP 2: Context Resolver

```text
resolve relevant files/docs/rules
produce context.md
```

Полезно как отдельный инструмент.

---

### MVP 3: Policy Engine

```text
allow / ask / deny
based on scenario, files, tools, risk
```

Полезно как guard plugin.

---

### MVP 4: Agent Registry

```text
load agents from markdown/yaml
instantiate runtime agent
```

Полезно как agent pack system.

---

### MVP 5: Model Router

```text
model policies
fallback chains
capability constraints
```

Полезно для любого AI runtime.

---

### MVP 6: Artifact Plugins

```text
spec plugin
ADR plugin
ADL plugin
task graph plugin
meeting brief plugin
contract review plugin
```

Каждый plugin можно использовать независимо.

---

### MVP 7: Wolf Agent Facade

```text
single user-facing agent
scenario routing
workflow selection
execution summary
approval UX
```

Этот слой объединяет все предыдущие.

---

## 12. Критерии правильной архитектуры

Фреймворк считается правильно спроектированным, если:

```text
1. Пользователь взаимодействует с одним агентом.
2. Внутренняя логика не зашита в код.
3. Workflow, policies, agents, models, skills и artifacts декларативны.
4. Core не содержит доменных понятий.
5. Domain Packs можно подключать и заменять.
6. Tools могут быть MCP, bash, API, SDK, agent-as-tool или human gate.
7. Subagents и A2A agents имеют общий интерфейс.
8. Gates и policies сильнее prompt-инструкций.
9. State и audit trail сохраняются.
10. Каждый слой можно использовать отдельно как plugin/tool/hook.
```

---

## 13. Короткая формула

```text
Мистер Вульф — это не набор агентов.

Это универсальный адаптивный runtime, где пользователь обращается к одному координатору, а вся внутренняя система — агенты, модели, инструменты, workflow, скиллы, политики, gates и артефакты — собирается динамически под конкретный Case.
```

Самая короткая архитектурная формула:

```text
One user-facing agent.
Composable runtime.
Project-defined orchestration.
Domain packs.
Policy-controlled autonomy.
```

Или еще короче:

```text
User talks to Wolf.
Wolf assembles the system.
Policies control the action.
Artifacts prove the result.
```
