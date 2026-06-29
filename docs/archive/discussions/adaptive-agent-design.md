с точки зрения конечного пользователя я хочу получить такой вариант взаимодействия - я не переключаю агентов а обращаюсь всегда к одному и тому же агенту. Дальше он уже в зависимости от контекста, политики, инструментов решает и динамически меняет свой портрет (привлекает субагентов, выбирает модели, скилы и прочее) и выполняет процесс соблюдая определенный воркфлоу. При необходимости согласует со мной что угодно. При этом в заисимости от сценария это может быть полностью автоматическая работа или с прохождениями гейтов и моим подтверждением. С точки зрения универсальности я хочу адаптивное решение и полностью конфигурируемое управляемое. С точки зрения архитектуры и реализации фреймоврка я вижу и хочу чтобы все было четко разделено на слои, каждый из которых мог бы быть использован отдельно как плагин/инструмент/хук или иначе, чтобы можно было разрабатывать малыми частями каждая из которых была бы самодостаточна и полезна в составе комплекса. то есть это должен быть конструктор из кубиков которые можно собрать в любую схему для решения разных задач и разных проектов. К примеру использование specs полезно и может быть реализовано уже готовым плагином, а в другом проекте подход может быть иной и основным артефактом может быть ADR + ADL.

# Ответ

Да. Это правильная целевая модель: **одна точка взаимодействия для пользователя, но внутри — динамический конфигурируемый runtime из независимых блоков**.

Я бы формулировал продукт так:

```text
Единый адаптивный агент, который не является одним агентом.
Это фасад над runtime, который сам собирает нужную схему исполнения под задачу.
```

Пользователь всегда общается с одним агентом:

```text
User → Main Agent
```

Но внутри происходит:

```text
Main Agent
  → определяет сценарий
  → выбирает workflow
  → выбирает портрет / режим поведения
  → выбирает модели
  → подключает skills
  → подключает tools
  → поднимает subagents
  → применяет rules/policies
  → проходит gates
  → исполняет task graph
  → возвращает единый результат пользователю
```

---

# 1. Ключевая сущность: Adaptive Agent Facade

Тебе не нужен пользовательский UX вида:

```text
/architect
/reviewer
/coder
/tester
```

Это плохо для конечного пользователя.

Нужен один агент:

```text
/agent
```

Или вообще просто обычный чат.

Но этот агент должен быть не “личностью”, а **адаптивным фасадом**.

```text
AdaptiveAgent = Facade + Router + PolicyResolver + WorkflowExecutor
```

Он сам решает:

```text
эта задача — quick answer
эта задача — research
эта задача — implementation
эта задача — architectural decision
эта задача — spec-first development
эта задача — ADR/ADL workflow
эта задача — autonomous batch execution
эта задача — gated execution
```

То есть внешний интерфейс стабилен, а внутренняя сборка динамическая.

---

# 2. Главное разделение: UX agent ≠ runtime agents

Нужно жестко разделить:

```text
User-facing Agent
  отвечает пользователю
  объясняет процесс
  запрашивает approval
  агрегирует результаты

Runtime Agents
  исследуют
  планируют
  пишут код
  ревьюят
  тестируют
  анализируют архитектуру
```

Пользователь не должен знать, что внутри были вызваны:

```text
ContextScout
Planner
Architect
Coder
Reviewer
TestEngineer
SpecWriter
ADRWriter
```

Он видит только:

```text
Я понял задачу.
Я выбрал workflow.
Мне нужно подтверждение плана.
Выполняю шаги.
Вот результат.
```

---

# 3. Внутренняя модель: Dynamic Persona

То, что ты называешь “динамически меняет свой портрет”, я бы сделал отдельной сущностью:

```text
Persona = временная runtime-конфигурация главного агента
```

Не отдельный агент, а режим работы.

Примеры:

```yaml
personas:
  product_analyst:
    tone: analytical
    priorities:
      - clarify_requirements
      - produce_spec
    default_workflow: spec_discovery

  software_architect:
    priorities:
      - architecture_integrity
      - tradeoff_analysis
      - ADR_output
    default_workflow: architecture_decision

  implementation_lead:
    priorities:
      - code_changes
      - test_validation
      - minimal_diff
    default_workflow: feature_implementation

  reviewer:
    priorities:
      - correctness
      - risk_detection
      - maintainability
    default_workflow: review_only
```

Пользователь не переключает persona вручную. Runtime выбирает ее из контекста.

```text
Task + Project Policy + Current State → Persona
```

---

# 4. Центральный pipeline принятия решений

Внутри единого агента нужен стабильный decision loop:

```text
1. Intake
2. Context Resolution
3. Scenario Classification
4. Policy Resolution
5. Workflow Selection
6. Execution Plan
7. Gate Decision
8. Runtime Assembly
9. Execution
10. Review / Validation
11. User Response
```

В виде схемы:

```text
User Request
  ↓
Intake Layer
  ↓
Context Resolver
  ↓
Scenario Router
  ↓
Policy Engine
  ↓
Workflow Resolver
  ↓
Runtime Assembler
  ↓
Task Executor
  ↓
Gate Manager
  ↓
Result Aggregator
  ↓
Main Agent Response
```

Важно: **каждый слой можно использовать отдельно**.

---

# 5. Архитектура как конструктор из кубиков

Твоя целевая архитектура должна быть не монолитом, а системой composable modules.

```text
Core Runtime
  минимальное ядро исполнения

Modules
  подключаемые независимые блоки

Plugins
  поставляют agents, tools, workflows, skills, rules, artifacts

Adapters
  подключают внешние среды: CLI, OpenCode, Claude Code, API, VS Code, MCP
```

Каждый блок должен иметь одинаковую форму:

```ts
type Module = {
  id: string;
  type: ModuleType;
  provides: Capability[];
  requires?: Capability[];
  hooks?: Hook[];
  tools?: Tool[];
  workflows?: Workflow[];
  rules?: Rule[];
  agents?: AgentDefinition[];
  skills?: SkillDefinition[];
  artifacts?: ArtifactDefinition[];
};
```

То есть `specs` — это не “часть ядра”, а plugin.

`ADR/ADL` — тоже plugin.

`TDD` — plugin.

`MCP integration` — plugin.

`approval gates` — plugin.

`multi-agent council` — plugin.

---

# 6. Слои фреймворка

Я бы разделил систему так:

```text
1. Interface Layer
2. Intent / Scenario Layer
3. Context Layer
4. Policy Layer
5. Workflow Layer
6. Agent Layer
7. Model Layer
8. Skill Layer
9. Tool Layer
10. Artifact Layer
11. Execution Layer
12. Gate Layer
13. Memory / State Layer
14. Hook / Event Layer
15. Adapter Layer
```

Теперь по сути.

---

## 6.1 Interface Layer

Отвечает за общение с пользователем.

```text
CLI
Chat
OpenCode
Claude Code
VS Code
API
Telegram
Web UI
```

Этот слой не должен знать, как устроены агенты.

Он только передает:

```ts
type UserInput = {
  message: string;
  files?: FileRef[];
  project?: ProjectRef;
  session?: SessionRef;
};
```

И получает:

```ts
type AgentResponse = {
  message: string;
  artifacts?: ArtifactRef[];
  approvals?: ApprovalRequest[];
  events?: RuntimeEvent[];
};
```

---

## 6.2 Intent / Scenario Layer

Определяет сценарий.

Не просто intent типа `code` или `docs`, а полноценный сценарий:

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
security_review
migration
documentation_update
test_generation
```

Пример:

```yaml
scenarios:
  architecture_decision:
    match:
      keywords:
        - architecture
        - tradeoff
        - decision
        - ADR
    default_workflow: adr_decision
    default_persona: software_architect
    approval_mode: gated

  feature_implementation:
    match:
      signals:
        - code_change_required
    default_workflow: feature_dev
    default_persona: implementation_lead
    approval_mode: supervised
```

---

## 6.3 Context Layer

Собирает релевантный контекст.

Источники:

```text
project files
repo structure
docs
previous decisions
specs
ADRs
ADLs
issues
tickets
memory
external docs
current task state
```

Этот слой должен быть независимым и полезным отдельно.

Например, можно вызвать только:

```text
omo context resolve "implement auth flow"
```

И получить:

```text
relevant files
relevant docs
relevant rules
prior decisions
missing context
```

---

## 6.4 Policy Layer

Это главный слой управляемости.

Он решает:

```text
что разрешено
что запрещено
где нужен approval
какие модели можно использовать
какие workflows доступны
какие артефакты обязательны
какие проверки нужны
какой уровень автономности допустим
```

Пример:

```yaml
policies:
  autonomy:
    default: supervised

    rules:
      - when:
          files.match: '**/migrations/**'
        require_approval: true

      - when:
          task.risk: high
        workflow_must_include:
          - architecture_review
          - user_approval

      - when:
          scenario: quick_answer
        mode: autonomous

      - when:
          scenario: production_change
        mode: gated
```

---

## 6.5 Workflow Layer

Workflow — это не код. Это декларативный graph.

Пример со specs:

```yaml
workflows:
  spec_first_feature:
    artifacts:
      required:
        - spec
        - task_graph
        - implementation_report

    steps:
      - id: create_spec
        plugin: specs
        agent: spec_writer
        output: spec

      - id: approve_spec
        type: gate
        gate: user_approval

      - id: create_tasks
        plugin: specs
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

А в другом проекте вместо specs:

```yaml
workflows:
  architecture_first:
    artifacts:
      required:
        - ADR
        - ADL
        - implementation_plan

    steps:
      - id: create_adr
        plugin: adr
        output: ADR

      - id: create_adl
        plugin: adl
        output: ADL

      - id: approve_architecture
        type: gate

      - id: implement
        agent: coder

      - id: verify_against_adl
        plugin: adl
        agent: architecture_validator
```

Это и есть нужная универсальность.

---

## 6.6 Agent Layer

Агенты должны быть заменяемыми модулями.

```yaml
agents:
  context_scout:
    role: context_discovery
    model_policy: fast_reasoning
    tools:
      - file_search
      - grep
      - ast_search
    outputs:
      - context_bundle

  planner:
    role: task_planning
    model_policy: deep_reasoning
    inputs:
      - context_bundle
    outputs:
      - task_graph

  coder:
    role: implementation
    model_policy: coding
    tools:
      - read_file
      - edit_file
      - bash
    rules:
      - minimal_diff
      - follow_project_style

  reviewer:
    role: review
    model_policy: deep_reasoning
    tools:
      - diff_read
      - test_results_read
```

Главный агент просто собирает их как runtime-композицию.

---

## 6.7 Model Layer

Модели должны быть абстрагированы от агентов.

```yaml
model_policies:
  fast:
    primary: openai/gpt-4.1-mini
    fallback:
      - anthropic/claude-haiku
      - local/qwen-coder

  deep:
    primary: anthropic/claude-opus
    fallback:
      - openai/gpt-5.5
      - google/gemini-pro

  coding:
    primary: anthropic/claude-sonnet
    fallback:
      - openai/codex
      - local/deepseek-coder

  private_local:
    primary: ollama/qwen-coder
    constraints:
      network: false
```

Agent не должен содержать конкретную модель. Он должен ссылаться на policy:

```yaml
agents:
  coder:
    model_policy: coding
```

---

## 6.8 Skill Layer

Skill — это capability package.

```text
skill может дать:
  prompt fragments
  tools
  rules
  workflows
  validators
  context resolvers
  MCP servers
  artifact templates
```

Пример:

```yaml
skills:
  react_feature:
    provides:
      - react_patterns
      - component_rules
      - testing_rules
    tools:
      - component_scanner
    rules:
      - use_project_design_system
    artifacts:
      - component_plan
```

---

## 6.9 Tool Layer

Tools должны быть отдельно от agents и workflows.

```yaml
tools:
  edit_file:
    risk: medium
    permissions:
      default: allow
      protected_files: ask

  bash:
    risk: high
    permissions:
      dangerous: deny
      package_install: ask
      tests: allow

  git_commit:
    risk: medium
    permissions:
      default: ask
```

---

## 6.10 Artifact Layer

Это очень важный слой для твоей идеи.

Нельзя зашивать в ядро, что основной артефакт — spec.

У разных проектов разные артефакты:

```text
Spec
ADR
ADL
RFC
Issue
Task Graph
Implementation Plan
Test Plan
Migration Plan
Security Review
Design Doc
Runbook
```

Поэтому artifact должен быть plugin-defined.

```yaml
artifacts:
  ADR:
    plugin: adr
    path: docs/adr/{date}-{slug}.md
    schema: adr.schema.json
    lifecycle:
      - draft
      - proposed
      - accepted
      - superseded

  ADL:
    plugin: adl
    path: docs/adl/{domain}/{name}.adl
    validators:
      - adl_lint
      - architecture_consistency_check

  Spec:
    plugin: specs
    path: specs/{feature}/spec.md
    lifecycle:
      - draft
      - approved
      - implemented
```

---

## 6.11 Execution Layer

Исполняет workflow/task graph.

Должен уметь:

```text
linear steps
parallel steps
dependency graph
retry
fallback
pause/resume
approval wait
rollback hook
validation hook
```

Пример task graph:

```yaml
tasks:
  - id: update_schema
    agent: coder
    depends_on: []
    risk: high

  - id: update_api
    agent: coder
    depends_on:
      - update_schema

  - id: update_ui
    agent: coder
    depends_on:
      - update_api

  - id: add_tests
    agent: test_engineer
    depends_on:
      - update_api
      - update_ui

  - id: review
    agent: reviewer
    depends_on:
      - add_tests
```

---

## 6.12 Gate Layer

Gate — это отдельный primitive.

```text
Gate может быть:
  user approval
  test pass
  policy check
  budget check
  security review
  architecture review
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

  architecture_approved:
    type: agent_review
    agent: architect
    required_result: approved

  budget_limit:
    type: budget
    max_cost_usd: 5
```

Режимы исполнения:

```yaml
execution_modes:
  autonomous:
    gates:
      user_approval: skip_if_policy_allows
      validation: enforce
      security: enforce

  supervised:
    gates:
      user_approval: only_for_high_risk
      validation: enforce
      security: enforce

  gated:
    gates:
      user_approval: always_for_write_actions
      validation: enforce
      security: enforce
```

---

## 6.13 Memory / State Layer

Должен быть файловый и наблюдаемый.

```text
.omo/state/
  sessions/
  tasks/
  artifacts/
  decisions/
  memory/
```

Пример:

```text
.omo/state/sessions/2026-04-27-auth-refactor/
  context.md
  plan.md
  task-graph.yaml
  events.jsonl
  approvals.jsonl
  results.md
```

Это дает:

```text
прозрачность
resume
debugging
audit trail
team collaboration
versioning
```

---

## 6.14 Hook / Event Layer

Все должно быть событием.

```text
task.created
context.resolved
workflow.selected
model.resolved
agent.started
tool.before
tool.after
artifact.created
gate.requested
gate.approved
gate.denied
task.completed
validation.failed
```

Любой plugin может подписаться:

```yaml
hooks:
  - on: artifact.created
    when:
      artifact.type: ADR
    run: adr_index_update

  - on: tool.before
    when:
      tool.name: edit_file
      files.match: '**/migrations/**'
    run: require_migration_approval

  - on: task.completed
    run: update_session_summary
```

---

# 7. Как выглядит взаимодействие для пользователя

Пользователь пишет:

```text
Нужно добавить OAuth login через GitHub.
```

Агент внутри делает:

```text
1. Определяет scenario: feature_implementation
2. Видит policy проекта: spec-first для auth changes
3. Выбирает workflow: spec_first_feature
4. Собирает context: auth files, security rules, existing login flow
5. Выбирает persona: implementation_lead
6. Подключает skills: auth, security, backend, tests
7. Выбирает models: deep для planning, coding для implementation
8. Создает spec
9. Просит approve spec
10. Строит task graph
11. Исполняет
12. Запускает тесты
13. Запускает review
14. Возвращает отчет
```

Пользователь видит:

```text
Я определил это как изменение auth-flow.
В проектной политике для auth требуется spec и security review.

Предлагаемый workflow:
1. Создать spec
2. Подтвердить spec
3. Реализовать backend changes
4. Добавить тесты
5. Выполнить security review

Подтвердить план?
```

В другом проекте та же задача может пройти иначе:

```text
policy says: no specs, use ADR + implementation plan
```

Тогда агент делает:

```text
ADR → approval → implementation plan → execution → review
```

Один UX. Разные внутренние схемы.

---

# 8. Универсальная формула

```text
User talks to one Adaptive Agent.

Adaptive Agent does not contain fixed logic.

Adaptive Agent asks Project Runtime:
  - Who should I be now?
  - What workflow applies?
  - What policies constrain me?
  - What artifacts are required?
  - What gates are mandatory?
  - What tools/skills/models are allowed?
  - What agents should be assembled?

Runtime answers by composing modules.
```

---

# 9. Минимальный MVP

Не надо сразу строить весь монстр. Можно сделать маленькими самодостаточными частями.

## MVP 1: Config + Workflow Engine

```text
load .omo/workflows/*.yaml
execute linear workflow
support gates
support artifacts
```

Уже полезно отдельно.

## MVP 2: Context Resolver

```text
resolve relevant files/docs/rules
produce context.md
```

Полезно как standalone tool.

## MVP 3: Policy Engine

```text
allow / ask / deny
based on scenario, files, tools, risk
```

Полезно как guard plugin.

## MVP 4: Agent Registry

```text
load agents from markdown/yaml
instantiate runtime agent
```

Полезно как agent pack system.

## MVP 5: Model Router

```text
model policies
fallback chains
capability constraints
```

Полезно отдельно для любого AI runtime.

## MVP 6: Artifact Plugins

```text
spec plugin
ADR plugin
ADL plugin
task graph plugin
```

Каждый plugin можно использовать независимо.

## MVP 7: Adaptive Facade

```text
single user-facing agent
scenario routing
workflow selection
execution summary
approval UX
```

Это объединяет всё.

---

# 10. Пример структуры проекта

```text
.omo/
  omo.yaml

  policies/
    autonomy.yaml
    permissions.yaml
    models.yaml
    routing.yaml

  workflows/
    feature-spec.yaml
    adr-first.yaml
    bugfix.yaml
    review-only.yaml

  agents/
    main.md
    context-scout.md
    planner.md
    coder.md
    reviewer.md
    architect.md

  skills/
    auth/
    react/
    database/
    testing/

  artifacts/
    spec.yaml
    adr.yaml
    adl.yaml
    task-graph.yaml

  context/
    core/
    project/
    history/
    archive/

  state/
    sessions/
    tasks/
    events/
```

---

# 11. Пример главного конфига

```yaml
project:
  name: my-project

runtime:
  default_agent: adaptive
  default_execution_mode: supervised

extends:
  - preset: omo-base
  - plugin: specs
  - plugin: adr
  - plugin: adl
  - plugin: tdd

routing:
  - when:
      scenario: architecture_decision
    use:
      workflow: adr_first
      persona: software_architect
      execution_mode: gated

  - when:
      files.match:
        - '**/auth/**'
        - '**/security/**'
    use:
      workflow: spec_first_feature
      execution_mode: gated
      required_skills:
        - security

  - when:
      scenario: quick_question
    use:
      workflow: answer_only
      execution_mode: autonomous

artifacts:
  default_for_feature: spec
  default_for_architecture: ADR
  architecture_model: ADL

approval:
  mode: supervised
```

---

# 12. Как сделать specs и ADR/ADL равноправными

Нельзя делать `spec` встроенным понятием ядра.

Правильно:

```text
ArtifactProvider
WorkflowProvider
ValidatorProvider
PromptProvider
```

Plugin `specs` предоставляет:

```text
artifact type: Spec
workflow: spec_first_feature
agents: spec_writer, task_decomposer
validators: spec_schema_check
commands: create_spec, update_spec
```

Plugin `adr-adl` предоставляет:

```text
artifact type: ADR
artifact type: ADL
workflow: architecture_first
agents: architect, adl_modeler
validators: adr_consistency_check, adl_lint
commands: create_adr, create_adl
```

Core не знает, что такое Spec или ADR. Он знает только:

```text
artifact
workflow
validator
gate
```

---

# 13. Самая важная архитектурная граница

```text
Core primitives:
  Agent
  Workflow
  Task
  Tool
  Skill
  Rule
  Policy
  Gate
  Artifact
  Context
  Event
  Hook

Domain concepts:
  Spec
  ADR
  ADL
  TDD
  Security Review
  Design Review
  Migration Plan
```

Domain concepts должны жить в plugins.

---

# 14. Главный агент в такой системе

Главный агент — это не “самый умный промпт”.

Это orchestrating facade:

```ts
class AdaptiveAgent {
  async handle(input: UserInput) {
    const context = await contextResolver.resolve(input);
    const scenario = await scenarioRouter.classify(input, context);
    const policy = await policyEngine.resolve(input, context, scenario);
    const workflow = await workflowResolver.select(scenario, policy);
    const runtime = await runtimeAssembler.assemble({
      input,
      context,
      scenario,
      policy,
      workflow,
    });

    return await workflowExecutor.execute(runtime);
  }
}
```

Вся логика подменяема через plugins/config.

---

# 15. Итоговая формулировка продукта

```text
OMO — это не набор агентов.

OMO — это модульный agent runtime, где пользователь всегда работает с одним адаптивным агентом, а вся внутренняя логика — роли, модели, скиллы, правила, артефакты, workflow, gates и уровень автономности — собирается динамически из проектной политики и подключенных плагинов.
```

Или короче:

```text
One agent interface.
Composable agent runtime.
Project-defined orchestration.
Plugin-based workflows.
Policy-controlled autonomy.
```

Это ровно тот подход, который решает твою претензию к существующим реализациям: логика не спрятана внутри фреймворка, а вынесена в прозрачный, заменяемый, проектно-специфичный слой.
