# Mr. Wolf Framework — концепция и суть фреймворка

## 1. Краткое определение

**Mr. Wolf** — это настраиваемый управляющий слой для агентной работы: единый предсказуемый фасад, через который пользователь решает задачи, а внутри система динамически собирает нужный процесс из workflows, агентов, моделей, skills, tools, политик, памяти, артефактов и внешних интеграций.

Короткая формула:

> **Один решатель. Декларативная логика. Управляемое исполнение. Любая агентная среда через адаптеры.**

Mr. Wolf не является просто агентом, CLI-утилитой, набором prompts или workflow runner. Это **agentic control plane**: слой управления, маршрутизации, исполнения, контроля и интеграции для разных агентных сред и capability-экосистем.

---

## 2. Какую проблему решает Mr. Wolf

Современные агентные среды дают пользователю много возможностей: модели, агенты, skills, prompts, commands, tools, MCP tools, workflow templates, hooks, IDE-интеграции. Но на практике это создаёт новую сложность.

Пользователь вынужден сам решать:

- какого агента выбрать;
- какую модель использовать;
- какой skill или prompt-команду применить;
- нужно ли сначала собрать context;
- надо ли индексировать документы;
- какой workflow подходит;
- можно ли выполнять shell/file/git действия;
- нужен ли approval;
- как сохранить результат;
- как не потерять предыдущие решения;
- как не забыть проектные правила;
- как сделать процесс воспроизводимым.

Это приводит к хаосу выбора. Часто нужный skill забывается, нужный агент не выбирается, процесс исполняется непредсказуемо, а правила проекта остаются в prompts или документах, но не становятся настоящим runtime-контролем.

Mr. Wolf должен убрать ручное переключение между агентами, моделями, skills, tools и процессами. Пользователь обращается к одному решателю, а Wolf сам выбирает и собирает нужную конфигурацию исполнения.

Пример желаемого взаимодействия:

```text
Пользователь:
  Mr. Wolf, стабилизируй текущую ветку перед merge.

Mr. Wolf:
  - определяет сценарий: repo stabilization;
  - строит context проекта;
  - выбирает workflow стабилизации;
  - выбирает нужных агентов;
  - выбирает модели по стоимости/качеству;
  - разрешает только допустимые tools;
  - применяет policy и approval gates;
  - запускает проверки;
  - фиксирует результат как case/artifact;
  - обновляет память проекта.
```

---

## 3. Основная идея

Mr. Wolf должен стать не очередным агентом, а **универсальным управляемым фасадом решения задач**.

Пользователь видит один интерфейс:

```text
Mr. Wolf, solve this.
```

Внутри Wolf выполняет:

```text
task intake
  → scenario detection
  → context assembly
  → capability selection
  → workflow / skill / agent selection
  → model routing
  → tool routing
  → policy enforcement
  → execution
  → events / artifacts / memory
  → result
```

Иными словами, Mr. Wolf отвечает не только за выполнение, но и за **выбор процесса**.

Он должен знать:

- когда нужен workflow;
- когда нужен агент;
- когда нужен внешний skill;
- когда нужен MCP tool;
- когда нужна дорогая reasoning model;
- когда достаточно дешёвой быстрой модели;
- когда нужно спросить пользователя;
- когда действие запрещено;
- когда результат нужно сохранить как artifact;
- когда опыт нужно записать в memory.

---

## 4. Что Mr. Wolf не должен быть

Mr. Wolf не должен быть:

- просто ещё одним coding agent;
- просто prompt collection;
- просто CLI wrapper;
- просто MCP tool;
- просто OpenCode plugin;
- просто workflow runner;
- просто LangChain/CrewAI-подобной библиотекой;
- закрытой системой собственных skills/tools;
- монолитным агентом с hardcoded логикой.

Если Wolf становится всего лишь tool внутри OpenCode или другой агентной среды, главная проблема остаётся: внешний агент всё ещё решает, когда вызвать Wolf и что делать дальше.

Правильная модель:

```text
Пользователь говорит с Mr. Wolf.
Mr. Wolf управляет процессом.
OpenCode / VSCode / OpenClaw / CLI / MCP / IDE являются интерфейсами или capability providers.
```

---

## 5. Mr. Wolf как control plane

Mr. Wolf — это **control plane** для агентных процессов.

Он управляет:

- task intake;
- scenario routing;
- workflow selection;
- agent selection;
- model routing;
- skill selection;
- tool access;
- policy enforcement;
- approval gates;
- execution tracing;
- artifacts;
- memory;
- external adapters.

В такой архитектуре внешняя агентная среда не должна владеть выбором процесса. Она предоставляет интерфейс, инструменты или runtime-возможности, но Wolf решает, как именно решать задачу.

---

## 6. Единый фасад пользователя

Центральная UX-идея:

> Пользователь не переключает агентов. Пользователь всегда обращается к Mr. Wolf.

Wolf должен стать единым фасадом:

```text
User
  ↓
Mr. Wolf Facade
  ↓
Scenario Router
  ↓
Runtime Assembler
  ↓
Governed Execution Runtime
  ↓
Artifacts / Memory / Results
```

Фасад должен уметь принимать задачи в естественной форме, но исполнять их через предсказуемые конфигурации.

Будущий основной entrypoint может выглядеть так:

```bash
wolf solve "review this repository and propose the next milestone"
```

Или как внешний adapter/MCP/plugin call:

```json
{
  "tool": "wolf_solve",
  "arguments": {
    "task": "review this repository and propose the next milestone"
  }
}
```

Ключевое: `wolf_solve` должен быть фасадным вызовом, а не набором низкоуровневых команд, которые внешний агент должен сам комбинировать.

---

## 7. Декларативность как основа

Главный архитектурный принцип:

> Runtime универсален. Логика проекта и домена вынесена в конфигурацию.

Всё, что возможно, должно быть описываемо декларативно:

- workflows;
- agents;
- model routes;
- skills;
- tools;
- policies;
- gates;
- context rules;
- artifact templates;
- scenario routing;
- domain packs;
- adapters;
- wrappers;
- memory rules.

Код runtime должен не содержать жёстко зашитую доменную логику. Он должен читать определения, валидировать их, собирать runtime и исполнять.

Принцип:

```text
Agents = config
Models = config
Skills = config
Tools = config
Workflows = config
Policies = config
Artifacts = config
Scenarios = config
```

---

## 8. Управляемость и предсказуемость

Mr. Wolf должен быть не просто мощным, а **предсказуемым и контролируемым**.

Пользователь должен иметь возможность понять:

- какой scenario выбран;
- какой workflow выбран;
- какие agents задействованы;
- какие models использованы;
- какие tools разрешены;
- какие skills применены;
- какие policy decisions приняты;
- где были approval gates;
- какие artifacts созданы;
- какие события записаны;
- как можно воспроизвести case.

Каждый case должен иметь trace:

```text
case id
workflow snapshot
context snapshot
policy decisions
tool calls
model routes
agent invocations
outputs
artifacts
events
```

Это превращает агентную работу из “магического чата” в управляемый процесс.

---

## 9. Policies stronger than prompts

Prompts могут ошибаться, быть проигнорированы или забыты. Policy должна быть сильнее prompt.

Если policy говорит `deny`, действие запрещено.

Если policy говорит `ask`, нужен approval gate.

Если policy говорит `allow`, действие может выполняться.

Policy должна применяться к:

- workflow execution;
- step execution;
- tool calls;
- external tools;
- imported capabilities;
- shell/file/git actions;
- model/provider usage;
- adapters;
- future memory writes;
- future artifact publishing.

Особенно важно: imported skills/tools/MCP capabilities не должны считаться trusted by default. Они должны попадать под policy overlay.

---

## 10. Capability System

Для Mr. Wolf важно иметь широкое понятие capability.

**Capability** — это любая способность, которую Wolf может зарегистрировать, нормализовать, ограничить политиками, маршрутизировать и использовать в процессе решения задачи.

Типы capabilities:

- skill;
- tool;
- command;
- prompt;
- workflow;
- agent;
- model route;
- artifact template;
- policy profile;
- adapter;
- wrapper;
- MCP tool;
- IDE tool;
- external API action.

Mr. Wolf не должен ограничиваться только собственными native capabilities. Он должен поддерживать native и imported capabilities.

```text
Native capability
  = создана внутри Wolf/project/domain pack.

Imported capability
  = пришла из внешней системы: OpenClaw, OpenCode, MCP server, IDE, command pack, prompt library.
```

Цель Wolf — не заменить внешние ecosystem skills/tools, а сделать их управляемыми, маршрутизируемыми и безопасно используемыми.

---

## 11. Уточнённое понятие skill

Ранее skill можно было понимать слишком узко как внутренний объект Mr. Wolf. Это неверно.

В новой концепции:

> **Skill** — это любая native или imported переиспользуемая способность, инструкция, процедура, prompt-команда, workflow recipe или process package, которую Wolf может зарегистрировать, нормализовать, ограничить policy и использовать внутри solve-процесса.

Skill может быть:

- native Wolf skill;
- imported OpenClaw skill;
- OpenCode command;
- prompt-command;
- workflow recipe;
- spec-driven procedure;
- ADR/ADL process;
- domain-specific process;
- external agent instruction pack.

Skill не равен tool.

Tool делает действие:

```text
read file
write file
run command
call API
query MCP server
create issue
read context
```

Skill описывает способ решения задачи:

```text
review code
stabilize branch
write ADR
prepare release
investigate bug
refactor module
update docs
produce spec
```

Skill может включать:

- instructions;
- prompts;
- workflow;
- required tools;
- preferred agents;
- model preferences;
- policy requirements;
- context rules;
- artifact expectations;
- acceptance checks;
- memory rules.

Пример native skill:

```yaml
skills:
  - id: repo.stabilize
    source: native
    description: Stabilize current branch before merge
    workflow: workflows/repo-stabilize.yaml
    agents:
      - reviewer
      - implementer
    tools:
      - context.read
    policy_profile: supervised
    acceptance:
      commands:
        - npm run check
```

Пример imported skill:

```yaml
skills:
  - id: openclaw.refactor-module
    source: openclaw
    type: prompt_command
    adapter: openclaw
    external_name: refactor-module
    description: Refactor a module using OpenClaw prompt conventions
    risk: medium
    tools_required:
      - file.read
      - file.write
    policy_profile: code_changes
```

---

## 12. Tools и MCP tools

Tool — это исполняемая capability.

Tool может быть:

- native Wolf tool;
- built-in tool;
- MCP tool;
- CLI tool;
- API tool;
- IDE tool;
- OpenCode/OpenClaw-provided tool;
- GitHub tool;
- file/shell/git tool;
- adapter-provided action.

Важный принцип:

> External tools are first-class citizens, but never trusted by default.

MCP tools должны подключаться не напрямую, а через Wolf governance:

```text
MCP tool
  → import adapter
  → ToolDefinition
  → wrapper
  → risk metadata
  → policy overlay
  → execution adapter
  → events/case trace
```

Например:

```yaml
mcp:
  servers:
    github:
      command: npx
      args: ['@modelcontextprotocol/server-github']

tools:
  imports:
    - source: mcp
      server: github
      include:
        - create_issue
        - create_pull_request
      defaults:
        risk: high
        decision: ask
```

Wolf должен добавлять:

- risk;
- policy;
- approval gates;
- input normalization;
- output normalization;
- logging/events;
- case trace;
- artifact/memory integration.

---

## 13. Adapters

Adapter — это слой, который подключает внешнюю среду, формат или capability ecosystem к Wolf.

Adapters нужны для:

- OpenCode;
- VSCode;
- OpenClaw;
- MCP;
- CLI;
- GitHub Actions;
- IDE plugins;
- prompt libraries;
- skill packs;
- external agent frameworks.

Adapter может:

- импортировать skills;
- импортировать tools;
- регистрировать commands;
- предоставлять hooks;
- подключать MCP servers;
- транслировать input/output;
- создавать wrappers;
- связывать внешнюю session с Wolf case;
- передавать events;
- подключать policy enforcement.

OpenCode adapter, например, должен уметь:

- запускать Mr. Wolf как primary agent profile;
- регистрировать `wolf_solve`;
- подключать Wolf MCP server;
- использовать OpenCode hooks;
- связывать OpenCode session с Wolf case;
- прокидывать tool calls через policy;
- использовать OpenCode как interface/capability provider.

---

## 14. Wrappers

Wrapper — это нормализационный и защитный слой вокруг внешней capability.

Wrappers нужны потому, что внешние tools/skills имеют разные:

- форматы input;
- форматы output;
- error models;
- permissions;
- naming conventions;
- prompt conventions;
- assumptions about trust;
- side effects.

Wrapper может:

- нормализовать input;
- нормализовать output;
- ограничить параметры;
- назначить risk;
- добавить policy checks;
- добавить approval requirements;
- добавить events/logging;
- связать результат с artifact;
- скрыть provider-specific детали.

Пример:

```yaml
wrappers:
  - id: github-pr-wrapper
    wraps: github.create_pull_request
    input_map:
      title: '$.title'
      body: '$.description'
      branch: '$.branch'
    policy:
      require_approval: true
    output_map:
      url: '$.html_url'
      number: '$.number'
```

Wrappers — один из ключей к универсальности Wolf.

---

## 15. Интеграция с OpenCode

OpenCode важен как первая практическая среда использования, но не как единственная цель.

Цель не в том, чтобы сделать Wolf “tool для OpenCode”. Цель в том, чтобы в OpenCode-сессии пользователь фактически общался с Mr. Wolf.

Идеальная модель:

```text
OpenCode session
  → Mr. Wolf profile/facade
  → wolf_solve
  → Wolf runtime
  → workflows/agents/models/tools/policies/memory/artifacts
```

OpenCode предоставляет:

- интерфейс общения;
- project workspace;
- plugins;
- hooks;
- commands;
- tools;
- возможно, собственные skills/prompts.

Wolf предоставляет:

- process selection;
- governance;
- routing;
- workflow execution;
- capability selection;
- memory/artifacts;
- project-specific rules.

Слабая интеграция:

```text
OpenCode agent иногда вызывает Mr. Wolf как tool.
```

Сильная интеграция:

```text
Mr. Wolf является основным фасадом в OpenCode-сессии.
OpenCode является интерфейсом и provider'ом возможностей.
```

---

## 16. Универсальность через адаптеры

OpenCode — только один adapter.

Mr. Wolf должен быть универсальным и подключаться к разным решениям:

- OpenCode;
- VSCode;
- OpenClaw;
- Cursor-like environments;
- Claude Code-like environments;
- CLI;
- MCP-compatible clients;
- IDE plugins;
- GitHub Actions;
- Slack/Telegram;
- future custom runtimes.

Общий принцип:

```text
Один Wolf runtime.
Много adapters.
Много внешних environments.
```

Adapters не должны дублировать бизнес-логику. Они должны быть thin layers, которые подключают внешние среды к Wolf runtime.

---

## 17. Scenario Router

Scenario Router отвечает за определение типа задачи.

Пользователь говорит естественно:

```text
проверь архитектуру
стабилизируй ветку
подготовь ADR
обнови docs
разбери ошибку
подготовь release
```

Scenario Router определяет:

```text
roadmap planning
code review
repo stabilization
docs update
architecture decision
bug investigation
release preparation
```

На ранних этапах routing должен быть deterministic:

- keyword rules;
- config rules;
- explicit scenario;
- project metadata;
- memory tags later.

LLM-based routing может появиться позже, но не должен быть единственным источником истины.

---

## 18. Runtime Assembler

Runtime Assembler — слой, который собирает конкретную конфигурацию исполнения под задачу.

Он выбирает:

- scenario;
- workflow;
- skill;
- agents;
- model routes;
- tools;
- imported capabilities;
- context strategy;
- policy profile;
- gates;
- artifact templates;
- memory inputs.

Пример:

```text
Task: "prepare release notes and PR"

Runtime Assembler:
  scenario: release_prepare
  skill: release.prepare
  workflow: workflows/release-prepare.yaml
  agents: docs_writer, reviewer
  models: cheap_summary, default_reasoning
  tools: context.read, github.create_pr
  policy: ask for GitHub publish
  artifacts: changelog.md, pr-description.md
```

Runtime Assembler — один из ключевых слоёв, потому что именно он превращает “одного решателя” в реальную систему динамической сборки процесса.

---

## 19. Workflows

Workflow — это явный процесс исполнения.

Workflow должен описывать:

- steps;
- dependencies;
- runners;
- retries;
- timeouts;
- gates;
- artifacts;
- conditions;
- graph execution;
- policy enforcement points.

Workflow нужен, когда процесс должен быть воспроизводимым.

Пример:

```text
repo stabilization workflow:
  - build context
  - inspect git status
  - run tests
  - review failures
  - apply fixes
  - run checks again
  - create stabilization report
```

Wolf должен выбирать workflow сам, если scenario/skill так настроены.

---

## 20. Agents

Agent в Mr. Wolf — это не обязательно самостоятельный пользовательский собеседник. Это внутренняя роль/исполнитель, которую Wolf может использовать в процессе.

Agent definition может включать:

- id;
- name;
- description;
- capabilities;
- model route;
- tools allow-list;
- system prompt;
- policy profile;
- memory scope;
- artifact expectations.

Пользователь не должен вручную переключаться между агентами. Wolf выбирает их сам.

---

## 21. Model Router

Model Router нужен, чтобы для разных задач выбирать разные модели и настройки.

Идея:

```text
дорогая reasoning model → для сложного планирования и архитектуры
быстрая дешёвая модель → для summaries и простых transformations
локальная модель → для приватных/простых задач
специализированная модель → для кода, документации, анализа
```

Model route должен быть конфигурируемым:

```yaml
models:
  routes:
    default_reasoning:
      provider: openai
      model: gpt-5.5-thinking
      purpose: reasoning

    cheap_summary:
      provider: local
      model: small-summary
      purpose: summarization
```

Wolf не должен заставлять пользователя выбирать модель каждый раз. Модель выбирается runtime-ом по scenario/agent/skill/policy.

---

## 22. Context

Context layer отвечает за сбор релевантной информации проекта.

Context может включать:

- source files;
- tests;
- docs;
- README;
- AGENTS.md;
- configs;
- previous cases;
- project rules;
- artifacts;
- memory summaries later.

Context должен быть:

- deterministic;
- ограниченным по размеру;
- воспроизводимым;
- сохраняемым как bundle;
- доступным tools/agents/models.

Wolf должен решать, когда context нужно строить, какой scenario context применить, какие файлы включить и какие исключить.

---

## 23. Memory

Memory в Mr. Wolf — это не просто “чат помнит”. Это операционная память проекта.

Она должна хранить:

- завершённые cases;
- решения;
- ошибки;
- успешные workflows;
- использованные agents/tools/models;
- policy decisions;
- artifacts;
- recurring failures;
- reusable lessons.

Memory должна быть управляемой и проверяемой.

На ранних этапах memory должна быть deterministic:

- case summaries;
- project memory;
- no embeddings by default;
- no LLM summaries by default;
- no autonomous memory writes без policy.

В будущем memory может стать adaptive layer, который помогает Wolf самонастраиваться.

---

## 24. Artifacts

Artifacts — это first-class результаты работы.

Artifacts могут быть:

- specs;
- implementation plans;
- ADR;
- ADL;
- reports;
- reviews;
- changelogs;
- patches;
- PR descriptions;
- test reports;
- release notes;
- diagrams;
- decision logs.

Важно: разные проекты могут использовать разные artifact conventions.

В одном проекте основным артефактом может быть spec.

В другом:

```text
ADR + ADL
```

В третьем:

```text
research note + evidence table
```

Поэтому artifact system должен быть конфигурируемым.

---

## 25. Domain Packs

Domain Pack — это набор конфигураций и capabilities под определённый домен.

Domain pack может включать:

- skills;
- workflows;
- agents;
- policies;
- tools;
- wrappers;
- artifact templates;
- scenario rules;
- context rules;
- memory schemas;
- model routes.

Примеры:

```text
software-engineering pack
architecture pack
research pack
security-review pack
product-management pack
legal-documents pack
finance-analysis pack
```

Цель:

```text
один runtime, разные домены.
```

---

## 26. Plugin / Hook модель

Mr. Wolf должен быть легко расширяемым через plugins/hooks/adapters.

Plugins могут добавлять:

- commands;
- tools;
- skills;
- workflows;
- policies;
- hooks;
- adapters;
- artifact templates;
- domain packs.

Hooks могут срабатывать:

- before solve;
- after solve;
- before workflow step;
- after workflow step;
- before tool call;
- after tool call;
- before model invocation;
- after model invocation;
- before file write;
- before shell command;
- before external MCP call;
- on case completed;
- on artifact created.

Hooks нужны для интеграций с OpenCode, IDE, gitflow, CI, memory, audit и policy.

---

## 27. Trust model

Любая capability должна иметь trust metadata.

Минимальные категории:

```text
native
project
external
untrusted
```

Принцип:

```text
External capability is untrusted by default.
```

External skill/tool не должен иметь side effects без explicit policy allow/ask.

Trust model должен учитывать:

- source;
- permissions;
- side effects;
- risk;
- required approvals;
- allowed contexts;
- allowed agents;
- allowed workflows.

---

## 28. State, Events, Auditability

Mr. Wolf должен сохранять ход исполнения.

Каждый case должен иметь:

- state;
- events;
- outputs;
- artifacts;
- policy decisions;
- gates;
- tool calls;
- model invocations;
- errors;
- final result.

Events должны позволять понять, что произошло:

```text
workflow.started
step.completed
policy.denied
tool.executed
model.stream.chunk
artifact.created
case.completed
```

Auditability нужна не только для debugging, но и для доверия к агентному процессу.

---

## 29. Главная архитектурная схема

```text
External Interfaces / Adapters
  OpenCode / VSCode / OpenClaw / CLI / MCP / API / GitHub / IDE
        ↓
Wolf Facade
  solve / task intake / user-facing single agent
        ↓
Scenario Router
  deterministic + configurable scenario selection
        ↓
Runtime Assembler
  workflows + skills + agents + models + tools + policies + context
        ↓
Governed Execution Runtime
  workflow engine / graph / gates / retries / streaming / tool calling
        ↓
Capability Layer
  native tools / imported skills / MCP tools / model providers / adapters
        ↓
State / Events / Memory / Artifacts
  cases / outputs / summaries / reusable project knowledge
```

---

## 30. Уточнения из старых документов

После сверки с ранними материалами концепцию нужно явно усилить несколькими принципами, которые уже были в старых обсуждениях, но в текущем документе были выражены недостаточно явно.

### 30.1 Dynamic Persona

Главный пользовательский агент не должен быть одной фиксированной “личностью”. Он должен иметь **Dynamic Persona** — временную runtime-конфигурацию поведения, выбранную под задачу, проект, policy и контекст.

Persona — это не отдельный агент, а режим работы фасада:

```text
Task + Context + Project Policy + Memory + Scenario
  → selected persona
```

Примеры persona:

```yaml
personas:
  software_architect:
    priorities:
      - architecture_integrity
      - tradeoff_analysis
      - ADR_output
    default_workflow: architecture_decision

  implementation_lead:
    priorities:
      - minimal_diff
      - tests_green
      - project_style
    default_workflow: feature_implementation

  office_assistant:
    priorities:
      - concise_summary
      - correct_recipients
      - approval_before_external_send
    default_workflow: office_task
```

Пользователь не переключает persona вручную. Он всё равно говорит с Mr. Wolf. Runtime выбирает persona сам.

---

### 30.2 Artifact-first system

Процесс не должен мыслиться как “запрос → ответ”. Более универсальная формула:

```text
задача → сценарий → workflow → артефакты → действия → gates → результат
```

Это особенно важно для универсальности. В software engineering артефактами могут быть Spec, ADR, ADL, Task Graph, Review Report. В офисном домене — Meeting Brief, Agenda, Email Draft, Report. В legal ops — Clause Matrix, Risk Register, Legal Memo. В concierge-сценариях — Itinerary, Options Shortlist, Booking Plan.

Core не должен знать конкретные типы артефактов. Он знает только универсальный primitive `Artifact`. Конкретные artifact types поставляются plugins/domain packs.

---

### 30.3 Режимы автономности

Управляемость Wolf должна выражаться не только через отдельные policy rules, но и через режимы автономности.

Минимальная шкала:

```text
observe      — только чтение
 draft_only   — чтение + черновики
 supervised   — действия через approval
 trusted      — low-risk автономно, high-risk через ask
 autonomous   — всё в рамках policy
```

Эти режимы применяются не глобально ко всей системе, а к scenario, workflow, tool, domain pack, agent или конкретному case.

Пример:

```yaml
autonomy:
  default: supervised

  scenarios:
    quick_answer: autonomous
    code_change: supervised
    production_change: gated
    legal_review: gated
```

---

### 30.4 MemoryBundle вместо прямого доступа к памяти

Агент не должен напрямую ходить во всю память. Он должен получать подготовленный **MemoryBundle**.

MemoryBundle — это policy-aware пакет памяти:

```yaml
memory_bundle:
  case:
    summary: 'Current task summary'
    active_constraints: []
  project:
    relevant_decisions:
      - adr-004
      - adr-009
  user:
    preferences:
      - concise_updates
      - approval_before_external_send
  domain:
    checklist:
      - contract_review_basic
  exclusions:
    - hidden_sensitive_notes
```

Это важно для A2A и external agents: remote agent не получает всю память, а только безопасный bundle, разрешённый policy.

---

### 30.5 Memory as context vs Memory as control

Память используется в двух разных смыслах.

**Memory as context** — то, что может быть вставлено в prompt:

```text
- пользователь предпочитает краткие ответы;
- проект использует ADR-first;
- последний meeting brief;
- похожий прошлый case.
```

**Memory as control** — то, что влияет на runtime:

```text
- для внешних email нужен approval;
- legal domain требует expert review;
- production changes запрещены в autonomous mode;
- external A2A agent не может видеть user memory.
```

Control memory должна быть структурированной и проверяться Policy Engine, а не просто вставляться в prompt.

---

### 30.6 Tool / Agent / A2A boundary

Нужно чётко разделять Tool, Agent и A2A Agent.

```text
Одно действие → Tool
Исполнитель с рассуждением и workflow → Agent
Внешний независимый исполнитель → A2A Agent
```

Tool может быть built-in, MCP, bash/script, HTTP/API, SDK/function, browser automation, database query, human approval или agent-as-tool.

Agent может использовать tools, планировать, создавать artifacts и возвращать structured result.

A2A Agent — это внешний независимый исполнитель, доступный через протокол, endpoint, MCP-like interface или adapter.

---

### 30.7 AgentEndpoint abstraction

Для workflow не должно быть важно, кто именно исполнитель: локальный subagent, remote A2A, MCP-exposed agent или human expert.

Нужна абстракция `AgentEndpoint`:

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

  human_expert:
    type: human
    role: legal_reviewer
```

Workflow обращается к `agent`, а runtime решает, как именно вызвать endpoint.

---

### 30.8 Declarative / Core / Plugin / State rule

Ключевое правило архитектуры:

```text
YAML/MD decides.
Core executes.
Plugins extend.
State remembers.
```

Слои:

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

Проектная логика должна жить в декларативном/project/package слое. Core исполняет универсальные primitives. Plugin code реализует non-universal capabilities. State layer записывает, что произошло.

---

### 30.9 Selective skill loading

Нельзя загружать все skills сразу. Если у внешней системы есть десятки тысяч skills/prompts/commands, Wolf должен индексировать и выбирать только релевантные.

Skill activation должен быть:

```text
context-based
scenario-based
policy-based
memory-aware
cost-aware
trust-aware
```

Это предотвращает context rot и делает большую экосистему skills управляемой.

---

## 31. Критические риски и проектные ограничения

Концепция Mr. Wolf должна явно учитывать не только желаемую архитектуру, но и риски эксплуатации. Иначе control plane может стать источником ошибок, задержек и избыточной сложности.

### 31.1 Router is advisory, not absolute

Scenario Router не должен быть единственной точкой истины. Его решение должно считаться **предложением**, а не безусловной командой.

Для каждого routing decision должны сохраняться:

```text
selected_scenario
confidence
matched_rules
alternatives
reason
required_confirmation
```

Если confidence низкий или есть несколько близких сценариев, Wolf обязан перейти в clarification mode:

```text
Я вижу два возможных сценария:
1. code_review
2. repo_stabilization
Какой выбрать?
```

Правило:

```text
High confidence + low risk → execute
Low confidence → ask
High risk → ask even with high confidence
```

---

### 31.2 Deterministic Safety Core

Policy Engine не должен зависеть от LLM-рассуждений для запретов и опасных действий.

Нужен слой **Deterministic Safety Core**:

```text
hard_deny
hard_allow
risk classifier
path guards
command guards
tool permission guards
external action guards
secret/PII guards
```

LLM может помогать объяснять policy или предлагать classification, но не должен иметь права отменять hard-deny.

Пример:

```yaml
hard_deny:
  shell:
    command_contains:
      - 'rm -rf /'
      - 'sudo rm'
  files:
    deny_paths:
      - '/etc/**'
      - '**/.env'
  external:
    payment.execute: deny
```

Принцип:

```text
Policies stronger than prompts.
Hard-deny stronger than policies.
```

---

### 31.3 Runtime Assembler must be explainable and bounded

Runtime Assembler не должен быть “LLM, который магически собирает процесс”. Он должен работать как bounded planner:

```text
inputs: task, context, scenario, policies, available capabilities
outputs: explicit CaseRuntime plan
constraints: schemas, allowed capabilities, policy limits
```

Assembler должен возвращать план до исполнения:

```json
{
  "scenario": "repo_stabilization",
  "workflow": "repo.stabilize",
  "agents": ["reviewer", "implementer"],
  "tools": ["context.read", "shell.run_tests"],
  "model_routes": ["default_reasoning", "coding_fast"],
  "gates": ["approve_file_changes"],
  "policy_summary": "supervised; shell writes require approval"
}
```

Для high-risk сценариев plan должен быть подтверждён пользователем до исполнения.

---

### 31.4 Fast path before full orchestration

Не каждая задача должна запускать весь control plane. Нужен быстрый путь:

```text
quick_answer
simple_context_read
single_tool_call
single_agent_invoke
full_workflow
```

Wolf должен уметь выбрать минимальный достаточный режим.

Принцип:

```text
Do not assemble a fleet when one deterministic step is enough.
```

Это защищает от latency, token cost и ощущения “слишком тяжёлой машины”.

---

### 31.5 Trace must be layered, not just verbose

Полный event log необходим, но пользователь и разработчик не должны читать мегабайты JSONL.

Нужно три уровня trace:

```text
1. User Summary
   короткое объяснение: что выбрано и почему.

2. Debug Trace
   выбранный scenario, workflow, agents, policy decisions, gates, errors.

3. Full Audit Log
   все events, tool calls, model calls, chunk events, artifacts.
```

Отдельно нужен механизм “why not”:

```text
Почему действие не выполнено?
- policy deny
- missing tool permission
- low router confidence
- memory conflict
- gate rejected
```

---

### 31.6 Policy conflict resolution

Domain packs и project policies могут конфликтовать. Нужно явное правило precedence.

Базовый порядок:

```text
Hard safety rules
  > current user instruction limits
  > organization policy
  > project policy
  > case policy
  > domain pack policy
  > skill default policy
  > tool default policy
```

Если две политики конфликтуют и обе запрещающие/разрешающие неоднозначны, применяется fail-closed:

```text
conflict + side effect → ask or deny
conflict + read-only → ask if sensitive, otherwise safe default
```

Каждый conflict должен попадать в trace.

---

### 31.7 Cold start must be zero-config first

Wolf не должен требовать десятки YAML-файлов для первого запуска.

Нужны уровни зрелости конфигурации:

```text
Level 0: zero-config
  встроенный safe default, answer/read-only режим.

Level 1: generated config
  wolf init сканирует проект и предлагает wolf.yaml.

Level 2: project config
  пользователь редактирует сценарии, agents, policies.

Level 3: packs/adapters
  подключаются domain packs, external skills, MCP tools.

Level 4: organization control plane
  централизованные policies, memory, adapters, audit.
```

Порог входа должен быть:

```bash
wolf init
wolf solve "review this repo"
```

---

### 31.8 Memory must expire, conflict and cite sources

Memory как control опасна, если она устаревает или не имеет источника.

Каждый memory item должен иметь:

```text
source
scope
created_at
updated_at
valid_until / ttl
confidence
status
supersedes / superseded_by
sensitivity
policy_visibility
```

При retrieval нужно проверять:

```text
is it still valid?
what is the source?
does it conflict with current policy or artifact?
is there a newer decision?
```

Если memory конфликтует с текущим artifact/policy, она не должна молча управлять runtime.

---

### 31.9 Imported capabilities are untrusted by default

External skills, prompts, commands, MCP tools and A2A agents должны считаться untrusted до назначения trust/policy/wrapper.

```text
external capability
  → adapter
  → wrapper
  → schema validation
  → risk metadata
  → policy overlay
  → execution
```

Никакой imported capability не должна получать side effects без explicit allow/ask.

---

### 31.10 First useful scenario must stay small

Жизнеспособность проекта зависит от Time to Hello World.

Первый полезный сценарий должен быть маленьким:

```text
wolf solve "review this repo"
  → build context
  → select default review scenario
  → invoke one reviewer agent
  → return report
  → write case trace
```

Только после этого следует добавлять richer routing, memory, domain packs, adapters and advanced tool use.

---

## 32. Главный итог

Mr. Wolf нужен не для того, чтобы стать ещё одним агентом.

Он нужен для того, чтобы стать:

```text
единым управляемым фасадом,
который скрывает хаос агентов, моделей, tools, skills и внешних систем,
но делает процесс прозрачным, настраиваемым, воспроизводимым и контролируемым.
```

OpenCode, VSCode, OpenClaw, MCP и другие среды — это интерфейсы и источники возможностей.

Mr. Wolf — это слой, который:

- принимает задачу;
- выбирает процесс;
- подключает нужные capabilities;
- применяет правила;
- контролирует исполнение;
- сохраняет результат;
- учится на истории;
- остаётся переносимым между средами.

Финальная формула:

> **Mr. Wolf — configurable agentic control plane and problem-solving facade for native and external AI capabilities.**

По-русски:

> **Mr. Wolf — настраиваемый управляющий слой и фасад решения задач для native и external агентных возможностей.**
