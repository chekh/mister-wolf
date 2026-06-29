попробуй найти такие репозитории в github

# Ответ

Да. Нашел несколько репозиториев, которые близки к твоей модели “один внешний агент → внутри оркестрация, workflow, gates, subagents, skills/tools”. Ниже — не все подряд, а самые полезные для заимствования архитектурных идей.

## Наиболее близкие к твоей идее

| Репозиторий                       | Почему важен                                                                                                  | Что взять                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **microsoft/conductor**           | YAML-defined multi-agent workflows, human-in-the-loop gates, DAG visualization, parallel execution            | Workflow-as-code, gates, safety limits, dashboard                 |
| **microsoft/agent-framework**     | Большой enterprise agent runtime: orchestration, workflows, state, HITL, declarative YAML workflows           | Runtime primitives, stateful workflows, declarative orchestration |
| **open-agent-studio/agent**       | Goal-driven autonomous CLI runtime: decomposes goals into tasks, runs tools, keeps memory, has skills/plugins | Goal → task graph → daemon execution                              |
| **shinpr/sub-agents-skills**      | Cross-LLM subagent orchestration as portable Agent Skill                                                      | Portable subagents, model/tool backend abstraction                |
| **obra/superpowers**              | Methodology layer over coding agents: specs, approval, implementation plan, subagent-driven execution         | Skills-as-methodology, automatic workflow activation              |
| **darrenhinde/OpenAgentsControl** | Project-context-first, approval gates, editable agents                                                        | ContextScout, gates, project rules                                |
| **sequenzia/agent-alchemy**       | Markdown-as-code agents/skills/workflows                                                                      | Transparent editable behavior                                     |
| **Cluster444/agentic**            | Simple phase workflow: research → plan → execute → commit → review                                            | Minimal workflow discipline                                       |
| **crewAIInc/crewAI**              | Hierarchical manager-agent orchestration and flows                                                            | Manager/crew pattern, role-based delegation                       |
| **microsoft/autogen**             | Classic multi-agent chat/orchestration framework                                                              | Agent conversations, user proxy, group orchestration              |
| **pydantic/pydantic-ai**          | Strong typed agent framework with HITL tool approval, MCP, A2A                                                | Type-safe agents, tool approval, protocol integration             |

---

# 1. microsoft/conductor

**Ссылка:** `https://github.com/microsoft/conductor`

Это один из самых близких проектов к твоему “playbook + gates + crew” подходу. В README прямо сказано, что Conductor нужен, когда одного prompt недостаточно: нужны multi-agent workflows, evaluator-optimizer loops, parallel execution, failure handling и human-in-the-loop gates. Workflows задаются в YAML и версионируются как код. ([GitHub][1])

Что особенно полезно:

```text
- YAML-based workflows
- parallel execution
- conditional routing
- human-in-the-loop gates
- safety limits
- workflow validation
- web dashboard with DAG visualization
```

Это почти готовый reference для твоего слоя:

```text
Workflow Layer
Gate Layer
Execution Layer
Visualization Layer
```

Сильная идея для OMO:

```text
Playbook = YAML workflow + gates + safety limits + DAG visualization
```

---

# 2. microsoft/agent-framework

**Ссылка:** `https://github.com/microsoft/agent-framework`

Это крупный runtime для build/orchestrate/deploy agents в Python и .NET. В samples есть workflow-раздел с state management, visualization и declarative YAML workflows. Документация samples прямо показывает: state можно сохранить один раз и переиспользовать между агентами; можно передавать global/per-agent context; есть fan-out/fan-in visualization; declarative workflows позволяют описывать multi-agent orchestration без Python-кода. ([GitHub][2])

Что взять:

```text
- workflow state
- per-agent context
- global workflow kwargs/context
- declarative YAML workflows
- conditional workflows
- human-in-loop workflows
- function/tool invocation inside declarative flows
```

Для твоей архитектуры это хороший reference для независимого ядра:

```text
Core Runtime
  → Workflow
  → Agent
  → Tool
  → State
  → HITL
```

Минус: enterprise-heavy, сильно Microsoft/Azure-oriented.

---

# 3. open-agent-studio/agent

**Ссылка:** `https://github.com/open-agent-studio/agent`

Это автономный goal-driven agent runtime. Пользователь задает цель, агент декомпозирует ее на subtasks, выполняет tools, запускает команды, хранит память в SQLite, поддерживает skills/scripts/commands/plugins и умеет parallel independent tasks через daemon. README прямо описывает goal decomposition, task dependencies, re-planning on failure и loading project capabilities. ([GitHub][3])

Что взять:

```text
Goal
  → decompose into tasks
  → task dependencies
  → daemon execution
  → parallel independent tasks
  → re-plan on failure
  → persistent memory
  → project capabilities
```

Очень близко к твоему понятию `Case`:

```text
Case = goal + task graph + state + capabilities + audit trail
```

Минус: больше “autonomous employee”, чем policy-controlled adaptive framework. Нужно усилить управляемость и конфигурируемость.

---

# 4. shinpr/sub-agents-skills

**Ссылка:** `https://github.com/shinpr/sub-agents-skills`

Очень полезный проект для идеи “не быть заложником одного backend”. Он позволяет вызывать Codex, Claude Code, Cursor CLI и Gemini CLI как subagents из одного workflow. Agent definitions пишутся в markdown, а backend задается во frontmatter. README подчеркивает: task-specific agents define once in markdown, execute on any backend; cross-LLM orchestration; no vendor lock-in; team portability. ([GitHub][4])

Что взять:

```text
- subagent как portable skill
- backend abstraction
- markdown agent definition
- per-agent backend/model routing
- no vendor lock-in
```

Для твоей системы это можно превратить в:

```yaml
agents:
  long_context_researcher:
    backend: gemini-cli
    model_policy: large_context

  fast_refactorer:
    backend: codex
    model_policy: coding_fast

  deep_reviewer:
    backend: claude-code
    model_policy: reasoning
```

Это очень хорошо ложится на твой слой:

```text
Agent Layer + Model Layer + Adapter Layer
```

---

# 5. obra/superpowers

**Ссылка:** `https://github.com/obra/superpowers`

Superpowers — это не просто agent framework, а methodology package for coding agents. Он работает через composable skills и начальные инструкции. README описывает flow: агент не сразу пишет код, а уточняет цель, вытаскивает spec, показывает его пользователю, после sign-off строит implementation plan, затем запускает subagent-driven-development process. ([GitHub][5])

Что взять:

```text
- automatic skill activation
- spec extraction from conversation
- chunked review / user sign-off
- implementation plan before coding
- subagent-driven development
- TDD/YAGNI/DRY as methodology skills
```

Это хороший reference для plugin типа:

```text
plugin: specs
plugin: tdd
plugin: implementation-plan
```

Важная идея: methodology должна быть skill/plugin, а не core.

---

# 6. microsoft/skills

**Ссылка:** `https://github.com/microsoft/skills`

Это не оркестратор, но очень полезный reference для skills-as-context. Репозиторий содержит skills, plugin packages, custom agents, AGENTS.md templates и MCP configs. README также предупреждает про context rot: нельзя загружать все skills сразу, нужно выбирать только нужные для проекта. ([GitHub][6])

Что взять:

```text
- selective skill loading
- skill packages
- custom agents
- AGENTS.md templates
- MCP configs
- context-driven development
```

Для OMO это важно:

```text
Skill activation должен быть policy/context-based.
Нельзя просто грузить все skills.
```

---

# 7. pydantic/pydantic-ai

**Ссылка:** `https://github.com/pydantic/pydantic-ai`

PydanticAI полезен не как “готовая OMO-архитектура”, а как пример typed agent runtime. В описании указаны human-in-the-loop tool approval, MCP, A2A и UI event stream integrations. Tool approval можно задавать для отдельных tool calls в зависимости от аргументов, истории разговора или user preferences. ([GitHub][7])

Что взять:

```text
- typed input/output
- structured tool calls
- tool approval policy
- MCP integration
- A2A integration
- streaming event model
```

Для твоего фреймворка это reference для:

```text
Tool Layer
Gate Layer
Protocol Layer
Type-safe Agent Contracts
```

---

# 8. crewAIInc/crewAI

**Ссылка:** `https://github.com/crewAIInc/crewAI`

CrewAI полезен для паттерна manager-agent / hierarchical process. В документации hierarchical process описывается как подход, где manager agent координирует workflow, делегирует tasks и validates outcomes. ([docs.crewai.com][8])

Что взять:

```text
- manager agent
- role-playing agents
- delegation
- validation by manager
- sequential vs hierarchical process
- crews + flows
```

Для OMO это можно трактовать так:

```text
Wolf = user-facing manager
Crew = runtime subagents
Playbook = flow/workflow
```

Но CrewAI сам по себе менее подходит под твою цель “полностью конфигурируемый проектный runtime”; он скорее framework для сборки crews.

---

# 9. microsoft/autogen

**Ссылка:** `https://github.com/microsoft/autogen`

AutoGen — классика multi-agent conversations. Он уже в maintenance mode, Microsoft рекомендует для новых проектов Agent Framework, но AutoGen важен как источник паттернов: multi-agent cooperation, tool/code use, human feedback, group chats, user proxy. ([GitHub][9])

Что взять:

```text
- multi-agent conversation patterns
- user proxy agent
- group chat manager
- human feedback loop
- tool-using agents
```

Но для твоего проекта я бы не брал AutoGen как основу. Брать стоит паттерны, а не runtime.

---

# 10. GitHub Agentic Workflows / copilot-sdk direction

**Ссылки:**
`https://githubnext.com/projects/agentic-workflows/`
`https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/`

Это не столько отдельный обычный репозиторий, сколько направление GitHub: agentic workflows внутри репозитория, где задачи описываются plain Markdown, запускаются через GitHub Actions и имеют guardrails, permissions, control и review. GitHub описывает это как автоматизацию repository tasks с AI agents в GitHub Actions; workflow пишется в Markdown вместо сложного YAML. ([The GitHub Blog][10])

Что взять:

```text
- repo-native workflows
- Markdown-authored automation
- guardrails
- permissions
- review
- GitHub Actions as execution substrate
```

Это важно для будущего OMO:

```text
Workflow может быть не только CLI/chat-based,
но и repo automation artifact.
```

---

# Мой shortlist для глубокого изучения

Если выбирать не больше 6:

```text
1. microsoft/conductor
2. microsoft/agent-framework
3. open-agent-studio/agent
4. shinpr/sub-agents-skills
5. obra/superpowers
6. darrenhinde/OpenAgentsControl
```

Почему именно они:

```text
conductor              → playbooks, gates, DAG, YAML
agent-framework        → serious runtime primitives
open-agent-studio      → goal/task daemon, memory, skills
sub-agents-skills      → portable subagents across backends
superpowers            → methodology as composable skills
OpenAgentsControl      → project context, approval discipline
```

---

# Что из найденного ближе всего к “Мистеру Вульфу”

Самое близкое по духу:

```text
microsoft/conductor
+ open-agent-studio/agent
+ OpenAgentsControl
```

То есть:

```text
Conductor:
  "Вот playbook, gates, DAG, execution."

Agent Runtime:
  "Вот case/goal, task decomposition, daemon, memory."

OAC:
  "Вот project context, approvals, discipline."
```

А твоя система должна собрать это так:

```text
Wolf / Adaptive Agent
  → opens Case
  → resolves Context
  → selects Playbook
  → assembles Crew
  → applies Policies
  → runs Task Graph
  → pauses at Gates
  → returns Artifacts
```

---

# Итог

Да, такие репозитории есть, но почти никто не делает ровно твою модель полностью.

Обычно проекты закрывают один слой:

```text
Conductor             → workflow/gates
Agent Framework       → runtime/workflows/state
Agent Runtime         → autonomous goal execution
Sub-Agents Skills     → cross-backend subagents
Superpowers           → skill-based methodology
OAC                   → context and approvals
Agent Alchemy         → markdown-as-code
Agentic               → simple phase discipline
```

Твоя ниша может быть такой:

```text
не очередной agent framework,
а configurable adaptive orchestration runtime:

one user-facing agent,
project-defined policies,
plugin-defined artifacts,
workflow-as-code,
portable subagents,
policy-controlled autonomy.
```

[1]: https://github.com/microsoft/conductor 'GitHub - microsoft/conductor: A CLI tool for defining and running multi-agent workflows with the GitHub Copilot SDK and Anthropic Agents SDK. · GitHub'
[2]: https://github.com/microsoft/agent-framework/tree/main/python/samples/03-workflows 'agent-framework/python/samples/03-workflows at main · microsoft/agent-framework · GitHub'
[3]: https://github.com/praveencs87/agent 'GitHub - open-agent-studio/agent: An autonomous, goal-oriented AI agent runtime with persistent memory, skill execution, and self-improvement capabilities. The agent acts as your digital employee, capable of breaking down high-level objectives into actionable tasks, executing them using a variety of skills, and learning from its experiences. · GitHub'
[4]: https://github.com/shinpr/sub-agents-skills 'GitHub - shinpr/sub-agents-skills: Cross-LLM sub-agent orchestration as an Agent Skills. Route tasks to Codex, Claude Code, Cursor, or Gemini from any compatible tool. · GitHub'
[5]: https://github.com/obra/superpowers 'GitHub - obra/superpowers: An agentic skills framework & software development methodology that works. · GitHub'
[6]: https://github.com/microsoft/skills 'GitHub - microsoft/skills: Skills, MCP servers, Custom Agents, Agents.md for SDKs to ground Coding Agents · GitHub'
[7]: https://github.com/pydantic/pydantic-ai?utm_source=chatgpt.com 'GitHub - pydantic/pydantic-ai: AI Agent Framework, the Pydantic way'
[8]: https://docs.crewai.com/en/learn/hierarchical-process?utm_source=chatgpt.com 'Hierarchical Process - CrewAI'
[9]: https://github.com/microsoft/autogen?utm_source=chatgpt.com 'GitHub - microsoft/autogen: A programming framework for agentic AI'
[10]: https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/?utm_source=chatgpt.com 'GitHub Agentic Workflows are now in technical preview'

# Вопрос

что из перечиленных компонентов и слоев чисто декларативные компоненты (конфиги, промпты, схемы) что - кодовая база? Раздели на группы, может быть ты предложишь более сложную группировку и разделение

# ОТвет

Ниже — более полезное разделение, чем просто “декларативное / код”. Для такого фреймворка лучше мыслить **пятью группами**:

```text
1. Declarative Project Layer      — что проект хочет
2. Declarative Package Layer      — переиспользуемые пакеты поведения
3. Runtime Core                   — как это исполняется
4. Extension Code                 — расширения, адаптеры, инструменты
5. Generated / State Layer        — что создается в ходе работы
```

---

# 1. Declarative Project Layer

Это то, что должен менять пользователь проекта без программирования.

Форматы: `yaml`, `json`, `md`, `toml`, `jsonschema`, `adl`, `mdx`.

## Сюда относятся

```text
.omo/
  omo.yaml
  routing.yaml
  policies.yaml
  permissions.yaml
  models.yaml
  agents/*.md
  workflows/*.yaml
  skills/*/skill.md
  artifacts/*.yaml
  gates.yaml
  context/**/*.md
  prompts/**/*.md
```

## Смысл

Это “пульт управления” фреймворком.

Пользователь описывает:

```text
какие сценарии существуют
какие workflows использовать
какие агенты доступны
какие модели разрешены
какие tools можно применять
какие approval gates нужны
какие артефакты обязательны
какие правила проекта действуют
```

## Примеры

### `routing.yaml`

```yaml
routes:
  - when:
      scenario: architecture_decision
    use:
      workflow: adr_first
      persona: architect
      mode: gated

  - when:
      files.match:
        - '**/auth/**'
    use:
      workflow: spec_first_feature
      skills:
        - security
      mode: supervised
```

### `models.yaml`

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
```

### `agents/coder.md`

```markdown
---
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
---

You implement bounded coding tasks using the provided task context.
```

### `workflows/adr-first.yaml`

```yaml
id: adr_first
steps:
  - id: gather_context
    agent: context_scout
    output: context_bundle

  - id: create_adr
    agent: architect
    output: ADR

  - id: approve_adr
    type: gate
    gate: user_approval

  - id: create_plan
    agent: planner
    input: ADR
    output: implementation_plan
```

---

# 2. Declarative Package Layer

Это тоже декларативный слой, но не проектный, а **пакетный**.

Он поставляется как preset/plugin/skill pack и может подключаться к разным проектам.

## Сюда относятся

```text
packages/
  specs/
    package.yaml
    workflows/spec-first.yaml
    agents/spec-writer.md
    artifacts/spec.yaml
    schemas/spec.schema.json
    prompts/*.md

  adr-adl/
    package.yaml
    workflows/architecture-first.yaml
    agents/architect.md
    artifacts/adr.yaml
    artifacts/adl.yaml
    schemas/adr.schema.json

  tdd/
    package.yaml
    skills/tdd/skill.md
    workflows/test-first.yaml
    rules/tdd.yaml
```

## Отличие от Project Layer

Project Layer — локальная настройка конкретного проекта.

Package Layer — переиспользуемая методология.

Например:

```text
specs plugin
ADR/ADL plugin
TDD plugin
security-review plugin
design-system plugin
database-migration plugin
```

Они должны быть подключаемыми:

```yaml
extends:
  - package: omo/base
  - package: omo/specs
  - package: omo/adr-adl
  - package: company/backend-standards
```

## Что в них должно быть

```text
agents
workflows
skills
prompts
schemas
artifact definitions
routing suggestions
default policies
validators declarations
```

Но не обязательно код.

---

# 3. Runtime Core

Это уже **кодовая база фреймворка**.

Она не знает бизнес-логики проекта. Она только умеет исполнять декларативные описания.

## Сюда относятся

```text
core/
  kernel/
    RuntimeKernel
    RuntimeContext

  config/
    ConfigLoader
    ConfigMerger
    SchemaValidator

  routing/
    ScenarioRouter
    RouteResolver

  policy/
    PolicyEngine
    PermissionEvaluator

  workflow/
    WorkflowEngine
    TaskGraphExecutor
    StepRunner

  agents/
    AgentRuntime
    AgentRegistry

  models/
    ModelRouter
    ProviderRegistry
    FallbackResolver

  tools/
    ToolRegistry
    ToolExecutor
    ToolPermissionGuard

  skills/
    SkillRegistry
    SkillActivator

  context/
    ContextResolver
    ContextRanker
    ContextCompressor

  gates/
    GateManager
    ApprovalManager

  artifacts/
    ArtifactRegistry
    ArtifactStore
    ArtifactValidator

  events/
    EventBus
    HookBus

  state/
    StateStore
    SessionStore
    TaskStore
```

## Главный принцип

Core должен быть максимально “тупым”:

```text
загрузить
валидировать
разрешить зависимости
собрать runtime
исполнить
логировать события
проверить политики
остановиться на gate
```

Core не должен знать:

```text
что такое Spec
что такое ADR
что такое React
что такое OAuth
что такое migration
что такое Prometheus/Oracle/Wolf
```

Он должен знать только универсальные примитивы:

```text
Agent
Workflow
Step
Task
Tool
Skill
Policy
Gate
Artifact
Event
Hook
ModelRoute
```

---

# 4. Extension Code

Это код, но не core. Это подключаемые расширения.

Именно здесь должны жить вещи, которые нельзя выразить чистой декларацией.

## Типы extension code

```text
adapters/
  opencode/
  claude-code/
  github-actions/
  cli/
  vscode/
  api-server/

providers/
  openai/
  anthropic/
  google/
  local-ollama/
  lmstudio/

tools/
  file-system/
  shell/
  git/
  ast-grep/
  lsp/
  browser/
  jira/
  github/
  figma/

validators/
  adl-lint/
  adr-consistency/
  spec-completeness/
  security-policy-check/

context-resolvers/
  repo-map/
  symbol-graph/
  dependency-graph/
  external-docs-fetcher/

artifact-generators/
  diagram-generator/
  changelog-generator/
```

## Когда нужен код, а не декларация

Код нужен, если компонент:

```text
выполняет I/O
вызывает API
работает с файловой системой
строит AST / graph
запускает shell
валидирует нестандартный формат
обрабатывает streaming events
реализует сложный алгоритм
интегрируется с внешним рантаймом
```

## Пример

`ADR plugin` может быть почти декларативным:

```text
artifact schema
template
workflow
agent prompt
```

Но если нужен анализ консистентности ADR между собой, уже нужен код:

```text
validators/adr-consistency-checker.ts
```

---

# 5. Generated / State Layer

Это не исходная конфигурация и не core-код. Это runtime-артефакты, которые система создает в процессе.

## Сюда относятся

```text
.omo/state/
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

## Смысл

Это нужно для:

```text
resume
debugging
audit trail
team visibility
reproducibility
postmortem
review
```

Это особенно важно, если агент работает не полностью интерактивно.

---

# Более точная группировка по “степени декларативности”

Я бы разделил компоненты на 7 классов.

---

## A. Pure Declarative

Только данные. Не исполняются напрямую.

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

Примеры:

```text
omo.yaml
models.yaml
routing.yaml
agents/*.md
workflows/*.yaml
artifacts/*.yaml
schemas/*.json
context/**/*.md
```

---

## B. Declarative + Expression

Декларативно, но с условиями.

```yaml
when:
  and:
    - scenario: feature_implementation
    - files.match: '**/auth/**'
    - risk.gte: medium
```

Тут нужна expression language.

Примеры:

```text
routing conditions
policy conditions
gate conditions
workflow step conditions
skill activation rules
tool permission rules
```

Это всё ещё не полноценный код, но уже нужна безопасная DSL.

---

## C. Declarative + Templates

Промпты, артефакты, отчеты.

```text
prompt templates
artifact templates
report templates
task templates
approval message templates
```

Например:

```markdown
# ADR: {{title}}

## Context

{{context.summary}}

## Decision

{{decision}}

## Consequences

{{consequences}}
```

Нужен template engine, но не произвольный код.

---

## D. Declarative + Schema Validation

Схемы, контракты, typed outputs.

```text
JSON Schema
Zod schema
OpenAPI schema
artifact schemas
tool input schemas
agent output schemas
workflow schemas
```

Это декларативная спецификация формы данных.

---

## E. Configured Code

Кодовый компонент, но поведение управляется конфигом.

Примеры:

```text
ModelRouter
ContextResolver
PolicyEngine
WorkflowEngine
ToolExecutor
GateManager
TaskGraphExecutor
```

Например `ModelRouter` — код, но routes/fallback берутся из YAML.

---

## F. Plugin Code

Подключаемые исполняемые модули.

```text
custom tools
custom validators
custom context resolvers
custom model providers
custom adapters
custom artifact generators
custom workflow step runners
```

Это уже код, но он должен жить за интерфейсами.

---

## G. Runtime State / Generated Artifacts

Создается системой.

```text
context.md
plan.md
task-graph.yaml
events.jsonl
approvals.jsonl
diff summary
review report
generated ADR
generated Spec
generated ADL
```

---

# Матрица по слоям

| Слой       | Декларативная часть                 | Кодовая часть                 | Generated/state   |
| ---------- | ----------------------------------- | ----------------------------- | ----------------- |
| Interface  | UI config, command manifests        | CLI/Web/IDE adapters          | user session logs |
| Scenario   | scenario rules, route config        | classifier/resolver           | selected scenario |
| Context    | context docs, include/exclude rules | retrievers, rankers, scanners | context bundle    |
| Policy     | policies, permissions, modes        | evaluator/enforcer            | policy decisions  |
| Workflow   | YAML DAG, step config               | workflow engine               | run state         |
| Agent      | markdown agents, prompts            | agent runtime                 | agent transcripts |
| Model      | model policies, fallback config     | provider adapters/router      | model call logs   |
| Skill      | skill manifests/prompts             | skill runtime/custom tools    | activated skills  |
| Tool       | tool manifests/schemas/permissions  | tool handlers                 | tool results      |
| Artifact   | artifact schemas/templates          | validators/generators         | actual artifacts  |
| Gate       | gate declarations                   | gate manager                  | approvals         |
| Memory     | memory policy                       | memory store/search           | summaries/indexes |
| Hook/Event | hook declarations                   | event bus/hook runner         | events.jsonl      |
| Adapter    | adapter config                      | adapter implementation        | adapter logs      |

---

# Как это разложить в репозитории

Я бы сделал так:

```text
omo/
  core/                       # чистый runtime-код
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

  sdk/                        # интерфейсы для плагинов
    types/
    plugin-api/
    testing/

  adapters/                   # код интеграций
    cli/
    opencode/
    claude-code/
    vscode/
    github-actions/
    api-server/

  providers/                  # model providers
    openai/
    anthropic/
    google/
    ollama/

  packages/                   # декларативные пакеты + optional code
    base/
      package.yaml
      agents/
      workflows/
      policies/
      prompts/

    specs/
      package.yaml
      artifacts/
      schemas/
      workflows/
      agents/
      prompts/
      validators/             # optional plugin code

    adr-adl/
      package.yaml
      artifacts/
      schemas/
      workflows/
      agents/
      validators/

    tdd/
      package.yaml
      skills/
      workflows/
      policies/

  plugins/                    # external plugin examples
    jira/
    figma/
    github/
    browser/

  templates/                  # starter project templates
    minimal/
    spec-first/
    adr-first/
    autonomous/
    gated-enterprise/
```

А в конкретном проекте:

```text
my-project/
  .omo/
    omo.yaml

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

# Что должно быть в core, а что нет

## Core должен содержать

```text
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

## Core не должен содержать

```text
Spec workflow
ADR workflow
ADL syntax
React rules
database migration rules
security review methodology
TDD methodology
specific agent personalities
specific vendor logic except provider interface
project-specific policies
```

---

# Как разделить “specs”, “ADR”, “ADL”

## Specs plugin

В основном декларативный:

```text
packages/specs/
  package.yaml
  artifacts/spec.yaml
  schemas/spec.schema.json
  workflows/spec-first.yaml
  agents/spec-writer.md
  agents/task-decomposer.md
  prompts/spec-template.md
```

Опционально код:

```text
validators/spec-completeness.ts
generators/task-graph-from-spec.ts
```

## ADR plugin

В основном декларативный:

```text
packages/adr/
  package.yaml
  artifacts/adr.yaml
  schemas/adr.schema.json
  workflows/adr-first.yaml
  agents/architect.md
  prompts/adr-template.md
```

Опционально код:

```text
validators/adr-consistency.ts
indexers/adr-indexer.ts
```

## ADL plugin

Скорее гибридный, потому что может иметь язык/парсер:

```text
packages/adl/
  package.yaml
  artifacts/adl.yaml
  schemas/adl.schema.json
  workflows/adl-modeling.yaml
  agents/adl-modeler.md
```

Кодовая часть почти наверняка нужна:

```text
parser/adl-parser.ts
validators/adl-lint.ts
analyzers/architecture-diff.ts
renderers/adl-diagram.ts
```

---

# Рекомендуемая архитектурная граница

Очень важное правило:

```text
Declarative layer describes intent and constraints.
Runtime core executes universal primitives.
Plugin code implements non-universal capabilities.
State layer records what happened.
```

Или короче:

```text
YAML/MD decides.
Core executes.
Plugins extend.
State remembers.
```

---

# Практическое правило: что делать декларативным

Делай декларативным всё, что пользователь проекта должен уметь менять без TypeScript/Python:

```text
какие workflow доступны
какой workflow выбрать
какие агенты участвуют
какие модели использовать
какие tools разрешены
где нужен approval
какие артефакты обязательны
какие правила соблюдать
какой контекст считать важным
какие проверки запускать
```

Делай кодом всё, что требует:

```text
I/O
API calls
сложных алгоритмов
парсинга
индексации
ретривала
параллельного исполнения
интеграции с runtime
обработки ошибок
streaming
безопасного sandbox execution
```

---

# Итоговое разделение

```text
1. Project Declarative Layer
   локальные настройки проекта: agents, workflows, policies, routing, context.

2. Package Declarative Layer
   переиспользуемые методологии: specs, ADR, ADL, TDD, security review.

3. Runtime Core Code
   универсальный движок: config, policy, workflow, agents, tools, gates, state.

4. Extension / Plugin Code
   tools, validators, adapters, model providers, context resolvers, artifact processors.

5. Generated State Layer
   context bundles, selected routes, task graphs, approvals, events, artifacts, reports.
```

И это лучше, чем простое “конфиги против кода”, потому что главный риск не в наличии кода, а в том, **где живет проектная логика**.

Проектная логика должна жить здесь:

```text
.omo/**/*.yaml
.omo/**/*.md
packages/**/*.yaml
packages/**/*.md
```

А код должен быть только исполняющим механизмом и расширениями.

# Вопрос

оцени как это будет работать для задач не связанных с разработкой. С моей точки зрения интересно именно универсальное решения, чтобы небольшая смена конфигов, комбинации инструментов давала абсолютно новые качества. Например сделать консьержа, помощника по офисным работам, юриста, и прочее

# Ответ

Да, такая архитектура как раз **лучше всего раскрывается вне разработки**, если правильно отделить универсальное ядро от доменных пакетов.

Для разработки мы обсуждали `Spec`, `ADR`, `ADL`, code review, tests. Но это всего лишь один набор доменных артефактов и tools. Если ядро действительно универсальное, то смена пакета должна менять не сам runtime, а **сценарную сборку**:

```text
один Adaptive Agent
+ другие policies
+ другие workflows
+ другие artifacts
+ другие tools
+ другие skills
+ другие gates
= новый тип помощника
```

То есть это не “фреймворк для кодинга”, а **конструктор операционных ассистентов**.

---

# 1. Что остается универсальным

Почти все базовые слои остаются теми же:

```text
Adaptive Agent Facade
Scenario Router
Context Resolver
Policy Engine
Workflow Engine
Tool Registry
Skill Registry
Artifact Registry
Gate Manager
State / Memory
Event / Hook Bus
Model Router
Plugin System
```

Меняются только доменные пакеты.

Для разработки:

```text
Spec, ADR, ADL, task graph, diff, tests
```

Для офиса:

```text
email draft, calendar plan, meeting brief, memo, report, invoice, checklist
```

Для юриста:

```text
case intake, legal memo, contract review, risk register, clause table, evidence bundle
```

Для консьержа:

```text
trip plan, booking shortlist, itinerary, preference profile, vendor comparison
```

Архитектурно это один и тот же runtime.

---

# 2. Главное обобщение: artifact-first system

Чтобы решение было универсальным, нельзя мыслить “задача → ответ”.

Лучше:

```text
задача → сценарий → workflow → артефакты → действия → подтверждения → результат
```

У каждого домена свои артефакты.

## Разработка

```text
Spec
Implementation Plan
Task Graph
ADR
ADL
Review Report
```

## Офисный помощник

```text
Meeting Agenda
Meeting Minutes
Action Items
Email Draft
Calendar Proposal
Weekly Report
Expense Summary
Decision Log
```

## Консьерж

```text
Preference Profile
Options Shortlist
Comparison Matrix
Booking Plan
Itinerary
Confirmation Checklist
```

## Юридический помощник

```text
Matter Intake
Legal Issue Map
Document Summary
Clause Matrix
Risk Register
Legal Memo
Questions for Counsel
```

## Финансовый помощник

```text
Budget
Cashflow Snapshot
Scenario Analysis
Expense Report
Investment Policy Checklist
Risk Notes
```

То есть **Spec/ADR/ADL — не особые сущности**, а частные случаи `ArtifactProvider`.

---

# 3. Пример: офисный помощник

Пользователь пишет:

```text
Подготовься к встрече с клиентом завтра, найди последние письма, собери повестку и черновик follow-up.
```

Внутри:

```text
Scenario: meeting_preparation
Persona: office_assistant
Workflow: meeting_brief
Tools:
  - gmail
  - calendar
  - docs
  - contacts
Artifacts:
  - meeting_brief
  - agenda
  - follow_up_draft
Gates:
  - approval before sending email
  - approval before changing calendar
```

Конфиг:

```yaml
domain: office

workflows:
  meeting_preparation:
    steps:
      - id: collect_context
        tools:
          - calendar.search
          - gmail.search
          - contacts.search
        output: meeting_context

      - id: summarize_history
        agent: summarizer
        input: meeting_context
        output: meeting_brief

      - id: create_agenda
        agent: office_planner
        output: agenda

      - id: draft_followup
        agent: email_assistant
        output: email_draft

      - id: request_send_approval
        type: gate
        when: 'email_draft.ready'

policies:
  email.send:
    default: ask

  calendar.create_event:
    default: ask
```

Тот же runtime, но другой домен.

---

# 4. Пример: консьерж

Пользователь пишет:

```text
Организуй поездку в Стамбул на 4 дня, бюджет средний, хочу еду, архитектуру и без перегруза.
```

Внутри:

```text
Scenario: travel_planning
Persona: concierge
Workflow: travel_concierge
Tools:
  - web search
  - maps
  - weather
  - calendar
  - booking integrations if available
Artifacts:
  - preference_profile
  - option_shortlist
  - itinerary
  - booking_checklist
Gates:
  - approval before booking
  - approval before payments
```

Конфиг:

```yaml
domain: concierge

workflows:
  travel_plan:
    steps:
      - id: capture_preferences
        agent: concierge
        output: preference_profile

      - id: research_options
        agent: travel_researcher
        tools:
          - web.search
          - maps.search
          - weather.lookup
        output: options_shortlist

      - id: build_itinerary
        agent: itinerary_planner
        input:
          - preference_profile
          - options_shortlist
        output: itinerary

      - id: approval
        type: gate
        gate: user_approval

      - id: booking_plan
        agent: booking_assistant
        output: booking_checklist
```

Здесь важный момент: консьерж может быть почти полностью автономным в research, но gated в действиях:

```yaml
policies:
  web.search:
    default: allow

  booking.reserve:
    default: ask

  payment.execute:
    default: deny
```

---

# 5. Пример: юридический помощник

Здесь нужен осторожный режим. Такой ассистент не должен притворяться лицензированным юристом, если это не специализированная юридическая система с проверкой человеком. Но как **legal operations / document assistant** он очень полезен.

Пользователь пишет:

```text
Проверь договор аренды и выдели риски.
```

Внутри:

```text
Scenario: contract_review
Persona: legal_assistant
Workflow: contract_risk_review
Tools:
  - document parser
  - clause extractor
  - jurisdiction checklist
  - precedent / policy search if available
Artifacts:
  - document_summary
  - clause_matrix
  - risk_register
  - questions_for_lawyer
Gates:
  - require human legal review before final decision
```

Конфиг:

```yaml
domain: legal_ops

workflows:
  contract_review:
    steps:
      - id: parse_document
        tool: document.parse
        output: document_structure

      - id: extract_clauses
        agent: clause_extractor
        output: clause_matrix

      - id: identify_risks
        agent: legal_risk_analyst
        output: risk_register

      - id: create_questions
        agent: legal_assistant
        output: questions_for_counsel

      - id: human_review_gate
        type: gate
        gate: human_expert_review

policies:
  legal_advice:
    default: restrict

  final_recommendation:
    default: require_expert_review

  document_summary:
    default: allow
```

То есть юридический пакет можно сделать, но он должен быть policy-heavy:

```text
можно:
  - суммаризация
  - извлечение пунктов
  - сравнение версий
  - checklist рисков
  - вопросы юристу
  - подготовка memo

нельзя без gate:
  - окончательный юридический совет
  - утверждение “это точно законно”
  - действия с правовыми последствиями
```

---

# 6. Почему это действительно универсально

Потому что домены отличаются не ядром, а набором:

```text
1. Scenarios
2. Artifacts
3. Workflows
4. Tools
5. Policies
6. Skills
7. Gates
8. Context sources
```

Сравнение:

| Слой     | Разработка         | Офис              | Консьерж        | Юридический помощник  |
| -------- | ------------------ | ----------------- | --------------- | --------------------- |
| Scenario | feature dev        | meeting prep      | travel plan     | contract review       |
| Artifact | spec, ADR          | agenda, memo      | itinerary       | risk register         |
| Tool     | git, shell, editor | gmail, calendar   | web, maps       | doc parser            |
| Gate     | approve plan       | approve send      | approve booking | expert review         |
| Policy   | no prod change     | no send email     | no payments     | no final legal advice |
| Context  | repo files         | emails/docs       | preferences     | contracts/laws/docs   |
| Skill    | TDD                | executive writing | travel planning | clause analysis       |

Это и есть желаемое свойство: **малой сменой конфигов и инструментов получить новое качество**.

---

# 7. Более сильная группировка: domain pack

Для универсальности я бы ввел понятие `Domain Pack`.

```text
Domain Pack = готовый набор сценариев, артефактов, workflows, agents, skills, policies и tools для конкретной области.
```

Примеры:

```text
packs/
  software-engineering/
  office-assistant/
  concierge/
  legal-ops/
  finance-ops/
  research-assistant/
  sales-assistant/
  hr-assistant/
  education-tutor/
  medical-admin/
```

Каждый pack содержит:

```text
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

# 8. Main Agent не меняется, меняется Case Runtime

Для пользователя всегда один агент:

```text
User → Adaptive Agent
```

Но внутри открывается `Case` определенного типа:

```text
Case(type = software_feature)
Case(type = meeting_preparation)
Case(type = travel_planning)
Case(type = contract_review)
Case(type = hiring_pipeline)
```

Каждый case получает свою сборку:

```text
Case Runtime =
  selected domain pack
  selected workflow
  selected persona
  selected tools
  selected policies
  selected gates
  selected artifacts
```

---

# 9. Что должно быть в универсальном ядре

Ядро должно быть доменно-нейтральным.

```text
Core primitives:
  Case
  Scenario
  Workflow
  Step
  Agent
  Tool
  Skill
  Policy
  Gate
  Artifact
  Context
  Event
  State
  Memory
```

Никаких:

```text
Spec
ADR
Email
Contract
Itinerary
Invoice
```

Все это — artifacts из domain packs.

---

# 10. Что особенно важно для не-dev задач

В разработке можно многое проверять автоматически: тесты, линтеры, diff, typecheck.

В не-dev задачах больше риска в действиях:

```text
отправить email
создать встречу
забронировать отель
отправить документ
дать юридическую рекомендацию
изменить CRM
запустить платеж
```

Поэтому для универсального ассистента особенно важны:

```text
1. Permission model
2. Approval gates
3. Audit trail
4. Tool scopes
5. Identity / account boundaries
6. Data privacy policies
7. Human expert gates
8. Reversible vs irreversible action classification
```

Я бы ввел классификацию действий:

```yaml
action_risk:
  read:
    default: allow

  draft:
    default: allow

  modify_private_state:
    default: ask

  external_send:
    default: ask

  financial_action:
    default: deny_or_ask

  legal_commitment:
    default: require_expert_review

  irreversible_action:
    default: deny
```

Это важнее, чем в coding-agent фреймворках.

---

# 11. Уровни автономности

Для универсальной системы нужны режимы, не один глобальный режим.

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

Пример:

```text
Офисный помощник:
  inbox triage → trusted
  sending email → supervised

Консьерж:
  research → autonomous
  booking → supervised
  payment → deny/approval

Юрист:
  summarize → autonomous
  risk checklist → supervised
  final legal conclusion → expert gate
```

---

# 12. Какие компоненты особенно хорошо переиспользуются между доменами

## 1. Context Resolver

Везде нужен:

```text
какие данные относятся к текущей задаче?
```

Для dev — файлы и docs.
Для офиса — письма, встречи, документы.
Для юриста — договоры, переписка, приложения.
Для консьержа — предпочтения, календарь, ограничения.

---

## 2. Artifact Engine

Везде нужно создавать структурированные результаты.

```text
Spec
Memo
Agenda
Itinerary
Risk Register
Report
Checklist
```

---

## 3. Policy Engine

Везде нужны правила.

```text
не отправлять без подтверждения
не использовать дорогие модели
не читать личные папки
не давать финальные юридические выводы
не бронировать без approval
```

---

## 4. Workflow Engine

Везде есть процессы.

```text
research → plan → approve → act → report
```

---

## 5. Gate Manager

Везде есть точки согласования.

```text
подтвердить план
подтвердить письмо
подтвердить бронь
подтвердить юридическую позицию
```

---

## 6. Tool Registry

Везде нужны действия.

```text
read email
write doc
search web
create calendar event
parse PDF
create task
update CRM
```

---

# 13. Пример “один runtime — разные качества”

## Конфиг 1: офисный ассистент

```yaml
extends:
  - pack: office-assistant

default_mode: supervised

enabled_tools:
  - gmail
  - calendar
  - docs
  - contacts

policies:
  external_send: ask
  calendar_modify: ask
  read_email: allow
```

Получается ассистент, который:

```text
готовит встречи
разбирает inbox
пишет письма
делает отчеты
собирает action items
```

---

## Конфиг 2: юридический помощник

```yaml
extends:
  - pack: legal-ops

default_mode: gated

enabled_tools:
  - document_parser
  - clause_extractor
  - knowledge_base
  - redline_compare

policies:
  legal_advice: restrict
  final_position: require_expert_review
  document_summary: allow
```

Получается:

```text
анализ договоров
risk register
clause matrix
legal memo draft
questions for counsel
```

---

## Конфиг 3: консьерж

```yaml
extends:
  - pack: concierge

default_mode: supervised

enabled_tools:
  - web_search
  - maps
  - calendar
  - booking

policies:
  research: allow
  booking_hold: ask
  payment: deny
```

Получается:

```text
планирует поездки
сравнивает варианты
делает itineraries
предлагает бронирования
```

---

# 14. Где могут быть ограничения

Такая универсальность работает, если:

```text
1. Все доменные сущности вынесены в packs/plugins.
2. Core не содержит dev-specific assumptions.
3. Tools имеют строгие permissions.
4. Artifacts имеют schemas.
5. Workflows можно менять декларативно.
6. Policies сильнее, чем agent prompt.
7. Система хранит audit trail.
```

Если же core начнет знать про `Spec`, `Git`, `CodeReview`, то он быстро станет coding-only.

---

# 15. Самая важная архитектурная поправка

Я бы добавил в архитектуру слой **Domain Runtime Assembly**.

```text
User Request
  ↓
Adaptive Agent
  ↓
Scenario Router
  ↓
Domain Pack Resolver
  ↓
Policy Resolver
  ↓
Workflow Resolver
  ↓
Runtime Assembler
  ↓
Execution
```

То есть сначала определяется не только workflow, но и **доменная сборка**.

```ts
type CaseRuntime = {
  domain: DomainPack;
  scenario: Scenario;
  workflow: Workflow;
  persona: Persona;
  artifacts: ArtifactDefinition[];
  tools: ToolDefinition[];
  policies: Policy[];
  gates: GateDefinition[];
  skills: SkillDefinition[];
};
```

---

# Итоговая оценка

Да, предложенная архитектура хорошо подходит для задач вне разработки. Более того, именно вне разработки она может стать сильнее, потому что там особенно ценны:

```text
единая точка входа
контекстное понимание
workflow discipline
approval gates
структурированные артефакты
интеграция с инструментами
аудит действий
переключение автономности
```

Главное — не строить “coding-agent framework with extra packs”, а сразу проектировать как:

```text
Universal Adaptive Work Orchestration Runtime
```

Где:

```text
software engineering
office assistant
concierge
legal ops
finance ops
research
sales
HR
education
```

— это просто разные `Domain Packs`.

Тогда небольшая смена конфигов и комбинации tools действительно дает новое качество, потому что меняется не оболочка, а вся внутренняя сборка:

```text
scenario model
workflow
artifacts
permissions
tools
skills
gates
persona
memory
```

Самая короткая формула:

```text
Core is universal.
Domains are plugins.
Behavior is configuration.
Actions are policy-controlled.
User talks to one agent.
```
