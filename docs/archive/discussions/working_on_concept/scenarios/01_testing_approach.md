# Mr. Wolf Scenario Lab — формализованный подход к тестированию концепции

## 1. Назначение

Этот документ описывает методику проверки и развития концепции Mr. Wolf через банк сценариев и игровые прогоны. Цель — не тестировать уже написанный код, а проверять концепцию до реализации: выявлять поведение системы, необходимые артефакты, границы подсистем, риски, зависимости, сложность настройки и практическую ценность.

Методика основана на двух базовых вещах:

1. **Моделирование поведения человека и системы** — как пользователь взаимодействует с Mr. Wolf, что видит, где уточняет, где подтверждает, где получает отказ.
2. **Моделирование артефактов** — какие входные, промежуточные и выходные объекты создаёт система или её части.

Итоговая формула:

```text
Сценарий → игра поведения → артефакты → подсистемы → риски → уточнения концепции
```

## 2. Что проверяется

Scenario Lab проверяет следующие вопросы:

- Может ли пользователь работать с одним фасадом Mr. Wolf без ручного выбора агентов, моделей, skills и tools?
- Какие режимы поведения нужны: простой ответ, план, уточнение, отказ, gate, workflow, external capability?
- Какие артефакты действительно возникают в разных доменах?
- Где нужна явная конфигурация, а где достаточно dynamic persona, памяти или LLM-assisted selection?
- Какие подсистемы появляются только в сложных сценариях и не нужны в простых?
- Какие risks, gates, policies и trust boundaries обязательны?
- Где появляется overengineering?
- Как выглядит first useful product?

## 3. Общая модель тестирования

Каждый сценарий проходит два больших этапа:

### Этап A. Scenario Authoring

Экспертная группа создаёт компактную Scenario Card:

```text
домен
режим домена
методология
artifact profile
user input
ожидаемое поведение Wolf
конфигурация Wolf
артефакты
capabilities
политики/gates
failure modes
analysis tags
```

### Этап B. Scenario Playthrough

Сценарий проигрывается как ролевая симуляция:

```text
User Simulator → Wolf Simulator → Observer/Critic
```

После игры создаётся structured Extraction Report:

```text
что показал сценарий
какие подсистемы нужны
какие артефакты появились
где UX ломается
где policy/safety слабые
что нужно уточнить в концепции
```

## 4. Принцип прогрессивного усложнения

Сценарии должны быть разной сложности. Банк сценариев строится как лестница.

### Level 1 — Simple answer

Wolf отвечает без workflow/tools.

Примеры:

- объяснить проект;
- кратко ответить по известному контексту;
- дать high-level рекомендацию.

### Level 2 — Context-aware answer

Wolf читает context, но не делает side effects.

Примеры:

- обзор репозитория;
- анализ документа;
- summary meeting notes.

### Level 3 — Plan / dry-run

Wolf строит план и артефакты, но не действует.

Примеры:

- план стабилизации ветки;
- план legal review;
- план подготовки релиза.

### Level 4 — Governed action

Wolf использует tools и gates.

Примеры:

- запустить проверки;
- изменить файлы после approval;
- создать draft email;
- подготовить PR.

### Level 5 — Multi-capability / external

Wolf использует MCP, imported skill, wrapper, memory, A2A, domain pack conflict.

Примеры:

- GitHub MCP + policy + PR creation;
- imported OpenClaw skill;
- external legal A2A expert;
- memory conflict with old ADR.

## 5. Многомерность сценариев

Один домен может иметь разные режимы исполнения. Поэтому Scenario Card должна фиксировать не только domain, но и дополнительные измерения.

### Основные оси

```text
Domain
  software_engineering, legal_ops, office, finance, research, etc.

Domain Mode
  prototype, production, enterprise, regulated, personal, emergency, legacy_maintenance.

Methodology
  rapid_prototyping, spec_driven, adr_first, tdd, checklist_based, expert_review.

Artifact Profile
  minimal, spec_based, adr_adl, audit_heavy, compliance_heavy, visual_diagram_heavy.

Execution Complexity
  Level 1–5.

Governance Level
  autonomous, supervised, gated, expert_reviewed.

Configuration Mode
  zero_config, generated_config, explicit_config, domain_pack, dynamic_persona, memory_adapted, llm_assisted_selection.
```

## 6. Роли в Scenario Lab

### Product/UX Expert

Проверяет:

- реалистичность пользовательского запроса;
- понятность поведения Wolf;
- Time to First Useful Output;
- отсутствие лишней сложности.

### Domain Expert

Проверяет:

- доменную правдоподобность;
- корректность артефактов;
- нужные gates и ограничения.

### Architect

Проверяет:

- какие подсистемы реально нужны;
- границы между Facade, Router, Assembler, Capability Registry, Policy, Memory;
- отсутствие смешения responsibilities.

### Security/Governance Expert

Проверяет:

- hard-deny;
- policy bypass;
- trust imported capabilities;
- external action approvals;
- PII/secrets.

### SRE/Operations Expert

Проверяет:

- latency;
- failure modes;
- observability;
- recoverability;
- runaway workflows.

### Integration Expert

Проверяет:

- OpenCode/VSCode/OpenClaw/MCP integration;
- adapter boundaries;
- wrappers;
- external skill/tool import.

### Artifact Expert

Проверяет:

- что является first-class artifact;
- какие artifacts сохранять;
- какие artifacts показывать пользователю;
- какие artifacts использовать как memory/source.

## 7. Что извлекается из сценариев

После сценариев и игр строятся каталоги:

### Artifact Catalog

Повторяющиеся артефакты по доменам:

```text
ExecutionPlan
ReviewReport
ADR
ADL
RiskRegister
MeetingBrief
EmailDraft
PRDescription
MemoryBundle
PolicyDecision
```

### Component Demand Map

Какие подсистемы действительно требуются часто:

```text
Wolf Facade
Scenario Router
Runtime Assembler
Policy Core
Capability Registry
Tool Registry
MemoryBundle
Artifact Store
Adapter Layer
```

### Policy Pattern Catalog

Типовые правила:

```text
read-only allowed
draft allowed
external send asks
file write asks
dangerous shell denied
legal advice requires expert gate
financial action requires approval
```

### Configuration Effort Map

Какие сценарии требуют:

```text
zero_config
generated_config
light_project_config
domain_pack
custom_workflow
custom_plugin
```

### Failure Mode Catalog

Типовые отказы:

```text
wrong scenario
missing context
missing tool permission
policy conflict
memory conflict
external tool unavailable
ambiguous user intent
stale domain pack
```

### First Useful Product Candidates

Сценарии, которые дают максимум ценности при минимальной реализации.

## 8. Anti-overengineering checks

Для каждого сценария и каждой новой подсистемы задаются вопросы:

```text
Можно ли решить сценарий без этой подсистемы?
Можно ли заменить это одним workflow?
Можно ли отложить это до plugin/domain pack?
Нужна ли эта возможность для first useful product?
Создаёт ли это новый DSL?
Увеличивает ли это configuration burden?
Можно ли объяснить это пользователю за 2 предложения?
```

Если ответ указывает на лишнюю сложность — подсистема помечается как deferred или optional.

## 9. Failure-mode checks

Для каждого сценария фиксируется:

```text
Что если Router ошибся?
Что если Assembler выбрал слишком тяжёлый план?
Что если policy conflict?
Что если tool unavailable?
Что если external skill malicious/untrusted?
Что если memory устарела?
Что если user не понял gate?
Что если LLM предложил небезопасное действие?
```

Для каждого failure mode нужно указать:

```text
detection
mitigation
visible explanation
trace entry
concept implication
```

## 10. Критерии качества банка сценариев

Банк считается полезным, если:

- содержит не менее 100 Scenario Cards;
- покрывает минимум 10 доменов;
- в каждом домене есть сценарии Levels 1–4;
- не менее 20% сценариев используют external capabilities;
- не менее 20% сценариев имеют explicit policy/gate;
- не менее 20% сценариев создают domain-specific artifacts;
- не менее 10% сценариев включают memory-related behavior;
- каждый сценарий имеет controlled tags;
- каждый сценарий имеет configuration mode;
- каждый сценарий имеет artifact list;
- каждый сценарий имеет failure modes;
- каждый игровой прогон имеет Extraction Report.

## 11. Выходы Scenario Lab

Итоговые документы/файлы:

```text
scenario-bank/scenarios.jsonl
scenario-bank/scenario-schema.json
scenario-bank/tags.yaml
scenario-bank/domain-taxonomy.yaml
scenario-bank/playthroughs.jsonl
scenario-bank/extraction-reports.jsonl
scenario-bank/coverage-matrix.md
scenario-bank/artifact-catalog.md
scenario-bank/component-demand-map.md
scenario-bank/risk-summary.md
scenario-bank/concept-implications.md
```

Эти материалы используются для следующего этапа: обновления концепции Mr. Wolf на основе сценарного анализа.
