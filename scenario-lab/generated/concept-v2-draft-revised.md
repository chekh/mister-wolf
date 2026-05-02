# Mr. Wolf — Concept v2 Draft (Revised)

**Date:** 2026-05-05
**Source:** Scenario Lab Concept Extraction Pass (80 scenarios, 80 playthroughs, 80 extraction reports)
**Status:** Revised draft after expert review pass (8 roles)

---

## 1. Executive Summary

Mr. Wolf — это **agentic control plane** с единым пользовательским фасадом. Пользователь обращается к одному агенту, а runtime динамически собирает нужные capabilities из конфигурации: агентов, навыков, инструментов, workflow и политик. Wolf не просит пользователя выбирать «какой агент запустить» — он сам решает, какой сценарий применить, какие инструменты задействовать и какие артефакты произвести.

> **Важное уточнение.** Wolf — это не замена IDE, Copilot или Claude Code. Wolf — это control plane, который оркестрирует существующие инструменты с соблюдением политик и артефактной прослеживаемостью.

Ключевые свойства:

- **Single user-facing facade.** Пользователь видит только Wolf. Внутренние агенты, skills и routing скрыты.
- **Predictable configurable solver.** Поведение определяется конфигурацией и политиками, а не случайными prompt-инжекциями.
- **Policy stronger than prompts.** Если политика запрещает действие, prompt не может её обойти.
- **Artifact-first execution.** Результат работы Wolf — это не только ответ пользователю, но и структурированные артефакты (спецификации, планы, отчёты, решения), которые живут в ArtifactStore и могут связываться в цепочки.

Wolf покрывает задачи от простого ответа (L1) до многошаговых оркестраций с внешними системами (L5). При этом первый полезный продукт должен работать без ручной конфигурации.

---

## 2. Problem Statement

Существующие агентные инструменты страдают от четырёх связанных проблем:

**1. Пользователю приходится выбирать агентов, skills и tools вручную.** Разработчик должен помнить, какой skill умеет рефакторинг, какой — security review, а какой — генерацию тестов. Это трение, которое отвлекает от задачи.

**2. Непредсказуемость агентных решений.** Один и тот же запрос к LLM-агенту может привести к разным действиям: то он напишет файл, то предложит обсудить, то вызовет инструмент без спроса. Пользователь не понимает, что произойдёт.

**3. Разрыв между coding tools, MCP tools, skills, workflows и policies.** VS Code extension, MCP server, OpenCode skill и custom workflow живут в разных мирах. Нет единого runtime, который мог бы оркестрировать их всех с соблюдением политик.

**4. Отсутствие единого управляемого runtime.** Нет централизованного места, где можно задать: «этот агент может читать файлы, но не может писать без одобрения», «этот skill не имеет доступа к secrets», «все внешние вызовы логируются». Конфигурация размазана по prompt-инструкциям и надежде на «хорошее поведение» модели.

Mr. Wolf решает эти проблемы через единый runtime с явной политикой, декларативной конфигурацией и first-class артефактами.

---

## 3. Design Principles

### One facade, many capabilities
Пользователь взаимодействует только с WolfFacade. Внутри runtime может собирать десятки компонентов, но пользователь не должен знать их названий. Router выбирает подходящий набор, AgentRunner выполняет, а пользователь получает результат.

### Core executes, configuration decides
Универсальное ядро (WolfFacade, ContextResolver, AgentRunner, TraceSystem) не меняется от домена к домену. Что именно Wolf делает в ответ на запрос, определяет конфигурация: domain pack, workflow, policies. Без конфигурации ядро умеет только базовый L1-ответ. С domain pack — полноценный software engineering workflow.

### Policies stronger than prompts
Политика — это declarative rule, а не пожелание в system prompt. Если политика `file_write_without_approval` требует hard-deny, то ни prompt, ни model hallucination не могут обойти запрет. PolicyCore проверяет политики до исполнения.

### Artifacts are first-class
Результат работы Wolf — это не только текст ответа. Это структурированные артефакты: `TechnicalSpecification`, `TestPlan`, `ADR`, `ThreatModel`. Они создаются, сохраняются и связываются друг с другом. SolveResult содержит ссылки на артефакты, а не их копии.

### Tools, skills, agents, workflows — different primitives
Не всё является «агентом». Tool — низкоуровневое действие. Skill — доменная логика, использующая tools. Agent — persona со skill set и policy scope. Workflow — многошаговая декларативная оркестрация. Смешивание этих примитивов ведёт к путанице.

> **Skill vs Workflow boundary.**
> - **Skill** = reusable logic unit, function-like, no gates, no artifact chain ownership. Вызывается агентом или workflow.
> - **Workflow** = orchestration DAG с artifact passing, conditional logic, gates. Может вызывать skills, но skill не вызывает workflow.
> - **Пример:** `software.project_review` = skill (анализирует код, возвращает отчёт). `spec_first_flow` = workflow (создаёт spec → tasks → impl → tests с gates между шагами).

### External capabilities are untrusted by default
MCP server, imported skill, direct API — всё внешнее считается untrusted до тех пор, пока wrapper не применил policy overlay: trust scoring, policy check, gate application, fallback activation, audit logging.

### Progressive configuration over configuration hell
Конфигурация должна наращиваться постепенно. Configuration modes **не являются взаимоисключающими**: domain pack может быть загружен в `generated_config` режиме (auto-detected) или в `explicit_config` режиме (user-specified).

```
zero_config → generated_config → explicit_config → domain_pack → custom_plugin
```

- **zero_config** — Wolf работает из коробки. Подходит для L1–L2. 12 сценариев.
- **generated_config** — runtime сам генерирует конфигурацию на основе контекста. Подходит для L2–L3. 30 сценариев.
- **explicit_config** — пользователь явно указывает domain, workflow, policies. Может включать custom workflow. Подходит для L3–L4. 28 сценариев.
- **domain_pack** — загружается полный domain pack. Подходит для L4–L5. 55 сценариев (включая lower levels, поэтому coverage > 100% при суммировании).
- **custom_plugin** — пользовательский код. Должно оставаться редкостью. 3/80 сценариев (3.75%).

> **Design decision.** Почему не «всё сразу через domain pack»? Потому что 12 из 80 сценариев работают на `zero_config`, а 30 — на `generated_config`. Если потребовать domain pack для базовых задач, пользователь откажется от инструмента. Domain pack coverage 68.75% означает, что большинство сценариев выигрывают от domain-specific конфигурации, но first useful product должен работать и без неё.

### Memory must be cited, bounded, and policy-aware
Memory в Wolf — это не бесконтрольный RAG. Каждое чтение требует citation (source ID) и freshness check. Memory read проходит через те же gates, что и внешние действия: PII detector и secrets gate применяются и к историческим данным.

---

## 4. Core Behavioral Model

Wolf работает в одном из поведенческих режимов. Режим выбирается Router на основе запроса, контекста и конфигурации.

### simple_answer / fast path (L1)
Прямой ответ без инструментов, без чтения контекста, без side effects. Пример: «Объясни, что такое spec-first». Модель выбирается ModelRouter для минимальной латентности. Результат — `AnswerArtifact` для аудита (внутренний), пользователь видит plain text.

### context_aware_answer (L2)
Ответ с чтением контекста (файлы проекта, документация, meeting notes), но без side effects. Пример: «Проанализируй текущий API на соответствие OpenAPI spec». Включает ContextResolver и AgentRunner. Нет gates, нет записи файлов.

### clarification (L1–L5)
Wolf может запросить уточнение, если запрос неоднозначен или недостаточно контекста. Clarification — это не ошибка, а behavioral mode. Оно происходит на любом уровне, если Router не может однозначно выбрать сценарий.

### plan / dry_run (L3)
Wolf строит план, спецификацию или чеклист, но не выполняет действий. Пример: «Создай TechnicalSpecification для фичи X». Результат — артефакты (`TechnicalSpecification`, `TaskList`, `TestPlan`), но нет file write, нет external calls. Gates — notification-only.

### governed_action (L4)
Wolf выполняет действия с применением gates: file write с `file_write_approval`, external send с `external_action_approval`, shell mutation — hard-deny. Пример: «Сгенерируй ImplementationPlan и примени изменения к репозиторию». Артефакты + логи + policy decisions.

> **Governed action — что это значит для пользователя?** Wolf выполняет действия (запись файлов, внешние вызовы), но может приостановиться и запросить одобрение перед продолжением.

### artifact_producing_workflow (L3–L5)
Многошаговый workflow, где выход одного шага — вход следующего. Пример: spec → tasks → implementation → tests → release. Артефакты связываются через ArtifactStore. Workflow определён декларативно (YAML), не кодом.

> **Governed action vs Artifact-producing workflow.** Governed action — единичное действие с gate. Artifact-producing workflow — многошаговый DAG, где артефакты передаются между шагами. Workflow может содержать governed actions.

### refusal / why-not explanation (L1–L5)
Wolf отказывает в выполнении, если запрос нарушает hard-deny policy. Отказ сопровождается объяснением: какая политика сработала и почему. Refusal — это валидный SolveResult типа `Refusal`.

### external_capability_use (L5)
Использование MCP server, imported skill, direct API с полным overlay: discovery → trust scoring → policy check → gate → fallback → audit. Пример: синхронизация с Jira, вызов vulnerability scanner, запрос к внешней базе знаний.

### cross_domain_orchestration (L4–L5)
Оркестрация, затрагивающая несколько domain packs. Пример: architecture review + security review (arch + sec). Сейчас cross-domain сценариев 6.25% (5 из 80), поэтому для 2-domain случаев достаточно composition rules. Полноценный DomainPackCoordinator отложен.

---

## 5. Runtime Architecture

### Компоненты и их классификация

#### MVP Core (минимальный набор для первого useful product)

- **WolfFacade** — единая точка входа. Принимает user input, возвращает SolveResult. Скрывает всё внутреннее устройство. (80/80 сценариев)
- **ContextResolver** — сбор контекста из репозитория, документов, meeting notes, artifact store. Поддерживает bounded context и progressive disclosure. (72/80)
  - **Mechanism:** ContextResolver не использует semantic RAG по умолчанию. Выполняет структурированные запросы: file tree scan, doc index lookup, artifact store query. Progressive disclosure: если context window превышен, суммирует lower-priority sources.
- **AgentRunner** — исполнение агентной логики: выбранного агента с его skill set и policy scope. AgentRunner выполняет single-agent invocation; multi-agent orchestration — задача Workflow Engine. (69/80)
- **TraceSystem** — аудит и observability. Каждое действие логируется с trace_reference. Необходим для всех уровней, включая L1. Для L1 fast path — async/offline logging для избежания latency. (63/80)
- **ScenarioRouter / RouterLight** — абстракция RouterInterface с двумя реализациями: `RouterLight` (L1–L2) и `RouterFull` (L3–L5). Router определяет scenario level. (50 сценариев)
- **ModelRouter** — always-core. Выбирает модель (lightweight vs reasoning) на основе scenario level и latency requirements. Лёгкая модель для L1, reasoning для L5. Зависит от Router. (все уровни)
- **PolicyCore (base)** — always-core. Hard-deny checks и базовая policy evaluation. Применяется на всех уровнях L1–L5.
- **ArtifactStore (basic)** — базовое хранилище артефактов. Lifecycle: created → persisted. Foreign key links между артефактами.

#### Always Core post-MVP

Компоненты, которые становятся core сразу после MVP:

- **FileWriteGateWithRollback** — gate для file mutation с rollback capability. Core для любых сценариев с записью файлов. (8 сценариев)
- **Artifact validation** — schema check и required fields. MVP: basic format check only.
- **Artifact Link Memory** — связи между артефактами через foreign keys.

#### Conditional (активируются только при определённых условиях)

- **GateManager** — conditional (L4+). Approval gates, expert gates, rollback gates. Интерактивная approval-система.
- **AdapterLayer** — translation layer для внешних систем (auth, schema mapping, error translation). Активен только при использовании external capabilities. В MVP может быть объединён с MCPWrapper или Tool Registry. (4 сценария)
- **PII subsystem** — detector + redactor + verifier. Активен при обнаружении PII-паттернов или в доменах legal, HR, finance, security, compliance. **MVP: detector + redactor. Verifier deferred.**
- **CircuitBreaker** — защита от runaway workflow. Conditional: активен на L4+ сценариях с внешними вызовами или при превышении step count. **MVP: AgentRunner использует hard limits (max_steps, max_tokens) без полного circuit breaker pattern.**
- **Domain packs** — только при L3+ или explicit config
- **Expert gates** — только в security, legal, architecture scenarios
- **Emergency policy** — только при active incident flag
- **Decision Memory** — propagation ADR/ADL решений. Conditional L3+.
- **Preference Memory** — `previous_*` паттерны. Conditional L2+.
- **Stale Memory Detection** — проверка свежести. Conditional.

#### Deferred

- **DomainPackCoordinator** — **Deferred.** Не нужен сейчас, потому что cross-domain сценариев 6.25%. Станет необходим при >15%.
- **EmergencyPolicy** — специфичный сценарий, не требует отдельного подсистемного компонента. (1 сценарий)
- **Observability subsystem** (MetricsCollector, ExecutionSpan) — **Deferred.** P1, но не блокирует MVP. TraceSystem покрывает базовый аудит.
- **Audit trail for emergency overrides** — **Deferred.** P1, но может быть частью TraceSystem в MVP.
- **Multi-language support** — **Deferred**, ни один из 80 сценариев не требует.
- **A2A protocol support** — **Deferred**, ни один сценарий не использует agent-to-agent.
- **Custom plugin framework** — **Deferred**, 0 сценариев требуют custom code.
- **PII verifier** — **Deferred.** Третий компонент PII subsystem. MVP: detector + redactor достаточно.
- **Artifact versioning** — **Deferred.** Time-based freshness для MVP. Version-based — post-MVP.

#### Rejected / keep out

Компоненты, которые были предложены, но отклонены на основе evidence:

- **LightweightSolvePlanner** — L2 решается routing, не planning. (decision log R1)
- **FullWorkflowEngine for L2–L3** — overkill; workflow engine условный, для L4+. (decision log R2)
- **AnswerCache** — L1 должен быть быстрым через model selection, не кэш. (decision log R4)
- **Auto-merge gate** — ни один сценарий не запрашивает auto-merge. Остаётся hard-deny. (decision log R3)
- **Automated bias correction** — bias detection = flag; correction = human review. Автоматическая коррекция отклонена. (decision log R5)

> **Design decision.** LightweightSolvePlanner, FullWorkflowEngine для L2–L3 и AnswerCache отклонены. L2 решается routing без planner; L3 использует conditional workflow engine только когда нужно; L1 fast path достигается model selection, не кэшем.

---

## 6. SolveResult / ExecutionResult Model

SolveResult — это **canonical envelope** для всех режимов исполнения. Вне зависимости от того, ответил Wolf простым текстом (L1), построил план (L3) или выполнил многошаговый workflow (L5), результат упаковывается в один и тот же envelope.

```yaml
SolveResult:
  envelope_type: Answer | Plan | Artifact | Refusal | PartialResult
  summary: string
  confidence: high | medium | low
  artifacts: []  # references to ArtifactStore IDs, not embedded copies
  trace_reference: CaseTrace ID
  policy_decisions: []  # which policies were checked
  gates_triggered: []   # which gates were applied
```

### Типы envelope

- **Answer** — готовый ответ пользователю. Для L1–L2. Внутри SolveResult хранится как `AnswerArtifact` ID (internal-only).
- **Plan** — план, спецификация, чеклист без исполнения. Для L3. Содержит references на плановые артефакты.
- **Artifact** — результат artifact-producing workflow. Для L3–L5. References на созданные/изменённые артефакты.
- **Refusal** — отказ по политике. Содержит `rationale` и `policy_reference`.
- **PartialResult** — частичный результат из-за gate block, external failure или circuit breaker. Содержит `completed_artifacts` и `blocked_steps`.

### Примеры SolveResult

**Answer envelope (L1):**
```yaml
envelope_type: Answer
summary: "Explanation of spec-first methodology"
confidence: high
artifacts: ["answer-artifact-001"]  # internal AnswerArtifact
trace_reference: "case-2026-0505-001"
policy_decisions: ["personal_data_exposure:clean"]
gates_triggered: []
```

**Refusal envelope (hard-deny):**
```yaml
envelope_type: Refusal
summary: "Cannot perform file write without approval"
confidence: high
artifacts: []
trace_reference: "case-2026-0505-002"
policy_decisions: ["file_write_without_approval:hard_deny"]
gates_triggered: []
refusal_reason: "Policy file_write_without_approval prohibits this action. Use explicit_config to enable file_write_approval gate."
```

**PartialResult envelope (gate block):**
```yaml
envelope_type: PartialResult
summary: "Implementation plan partially applied. 3 of 5 files written."
confidence: medium
artifacts: ["impl-plan-001", "file-changes-001"]
trace_reference: "case-2026-0505-003"
policy_decisions: ["file_write:approved", "external_send:blocked"]
gates_triggered: ["file_write_approval", "external_action_approval:blocked"]
completed_steps: ["read_spec", "generate_plan", "write_files_1_3"]
blocked_steps: ["sync_jira", "send_notification"]
```

### Ключевые правила

1. **SolveResult содержит references, не embedded copies.** Артефакты живут в ArtifactStore. Это предотвращает дублирование и держит envelope лёгким.
2. **trace_reference обязателен.** Каждый SolveResult ссылается на CaseTrace для полного аудита.
3. **policy_decisions и gates_triggered входят в envelope.** Пользователь и auditor видят, какие политики проверялись и какие gates сработали.
4. **Artifact lifecycle отделён от envelope.** Envelope — это «ответ на запрос». Артефакт — это «созданный документ». Они живут в разных системах, но связаны через references.

> **Design decision.** Почему не встроенные артефакты? Потому что один артефакт (например, `TechnicalSpecification`) может быть создан в одном сценарии, а referenced в десятках последующих. References через ArtifactStore ID предотвращают рассинхронизацию.

---

## 7. Artifact Model

Артефакты в Wolf — first-class сущности. Они не являются побочным продуктом ответа, а центральным результатом работы runtime.

### First-class artifact types

На основе 80 сценариев и anchor domain deep dive следующие артефакты должны иметь полноценный lifecycle и linking:

**Development core:**
- `TechnicalSpecification` — anchor для spec-first flow
- `TaskList` — разбиение спецификации на задачи
- `AcceptanceCriteria` — критерии приёмки
- `ImplementationPlan` — план реализации
- `TestPlan` / `TestCaseList` — тестирование и TDD
- `CoverageReport` — метрики покрытия

**Architecture decisions:**
- `ADR` (Architecture Decision Record) — запись архитектурного решения. Immutable после публикации.
- `ADL` (Architecture Decision Language) — уточнение/развитие ADR. Может быть superseded новой версией.
- `ArchitectureDiagram` / `SystemDiagram` — визуальные представления

**Release and operations:**
- `ReleaseChecklist` — readiness checklist
- `CIReport` — результат CI pipeline
- `ChangeLog` — список изменений

**Security and governance:**
- `ThreatModel` — модель угроз
- `SecurityReviewReport` — отчёт security review
- `PolicyDecision` — решение по политике
- `DecisionLog` — log архитектурных/политических решений

**Universal:**
- `AnswerArtifact` — **internal representation** даже для L1. Используется для audit/trace/linking. Пользователь видит plain text rendering. Не является user-facing first-class artifact в том же смысле, что `TechnicalSpecification`.
- `RiskRegister` — реестр рисков
- `RollbackPlan` — план отката
- `CompatibilityMatrix` — матрица совместимости

### MVP Artifacts

Для первого useful product достаточно:
- `AnswerArtifact` (internal)
- `TechnicalSpecification`
- `TaskList`
- `TestPlan`
- `ADR`
- `ReleaseChecklist`
- `PolicyDecision`

Остальные artifact types — conditional/post-MVP.

### Artifact lifecycle

```
created → persisted
```

- **created** — артефакт сгенерирован агентом.
- **persisted** — сохранён в ArtifactStore. Доступен для referencing из других сценариев.
- **validated** — **Conditional/Deferred.** Проверена структура, обязательные поля, связи. MVP: basic format check only.
- **archived** — **Deferred.** Архивация старых версий. Пока не нужна для MVP.

### Artifact chains

Артефакты связываются в цепочки через Artifact Link Memory (conditional L3+):

- **spec → tasks → implementation → tests:**
  `TechnicalSpecification` → `TaskList` (`decomposes_to`) → `ImplementationPlan` (`implements_via`)
  `TechnicalSpecification` → `TestPlan` (`tested_by`) → `CoverageReport` (`produces`)

- **ADR/ADL → decision evolution:**
  `ADR` → `ADL` (`refines_to`) → `ImplementationPlan` (`constrains`)
  `ADR` → `DecisionLog` → `ArchitectureDiagram`

- **release → changelog:**
  `ImplementationPlan` → `ReleaseChecklist` (`requires`) → `ChangeLog` (`generates`) + `CIReport`

- **migration → rollback:**
  `MigrationPlan` → `CompatibilityMatrix` + `RollbackPlan` + `RiskRegister`

- **security review → approval:**
  `ThreatModel` → `SecurityReviewReport` → `PolicyDecision`

> **Design decision.** Почему ADR immutable, а ADL — нет? Потому что ADR фиксирует решение в точке времени; его изменение исказило бы историю. ADL эволюционирует, и новая версия ссылается на predecessor, сохраняя audit trail.

---

## 8. Policy and Gate Model

### Policy hierarchy

Политики применяются в иерархии от общего к частному:

```
global → domain → scenario → user_override
```

- **global** — универсальные политики (например, `dangerous_shell` = hard-deny).
- **domain** — политики domain pack (например, `legal_advice_without_gate` = hard-deny в legal-ops).
- **scenario** — политики конкретного сценария (например, `security_sensitive_change` требует `security_review_gate`).
- **user_override** — пользовательские настройки в рамках допустимого (например, relax `notify` to `silent` для low-risk file read).

Конфликт разрешается в пользу более restrictive политики. Если global говорит «block», а domain говорит «notify», применяется «block».

> **Пример:**
> ```
> Global: external_send = block
> Domain (legal-ops): external_send = notify
> Scenario (contract_review): external_send = notify
> User override: external_send = silent
> 
> Result: block (global wins as most restrictive)
> ```

### Hard-deny rules

Следующие действия запрещены без исключений (no override):

- `auto_assign_without_review`, `auto_hire_without_review`, `auto_merge_without_review`, `auto_publish_without_review`, `auto_delete_without_confirmation`, `auto_transfer_without_approval`
- `dangerous_shell`, `shell_mutation`, `deploy_action`
- `external_send_without_approval`, `unauthorized_external_send`
- `file_write_without_approval`
- `financial_action_without_approval`
- `legal_advice_without_gate`
- `personal_data_exposure`, `secrets_exposure`

**Ключевое правило:** `file_write` и `external_send` с mandatory approval gate являются governed action (L4+), а без gate — hard-deny.

**Пример:**
- `file_write` + `file_write_approval` gate = allowed after approval (governed action)
- `file_write` without approval = `Refusal`

Hard-deny не может быть переопределён user override. Wolf возвращает `Refusal` с объяснением. Emergency mode **не bypass** hard-deny.

### Gate severity

```
silent   → log only, no UX friction (auto-approve low-risk)
notify   → inform user, continue unless blocked by another gate
block    → require explicit user approval before proceeding
expert_gate → require domain expert approval (legal, security, architecture)
```

Gate с severity `block` или `expert_gate` обязан включать `rationale` — объяснение, видимое пользователю. Это уменьшает gate misunderstanding.

> **Design decision.** Должен ли `notify` auto-escalate в `block`? Да: повторный `notify` на тот же тип действия в рамках сессии эскалирует до `block`. Это предотвращает «fatigue approval».

### Gate approval UX flow

1. Wolf генерирует ImplementationPlan.
2. PolicyCore обнаруживает `file_write` действие.
3. Gate `file_write_approval` triggered (severity: block).
4. Wolf показывает пользователю: «This action will modify 3 files. [Show diff preview] [Rationale: file_write policy requires approval for repository mutations.]»
5. Опции пользователя: [Approve] [Reject] [Modify plan]
6. Если одобрено: Wolf пишет файлы, возвращает SolveResult с `gates_triggered: [file_write_approval]`
7. Если отклонено: Wolf возвращает `PartialResult` с `blocked_steps: ["write_files"]`

### Emergency mode

Emergency mode — это fast-track routing + enhanced logging, **но не bypass gates.** Даже в инциденте (`security.incident.response_runbook.018`) external notification требует `external_notification_approval`.

Emergency mode имеет свой policy subset (`emergency_policy`), который может relax routing latency (skip clarification, use faster model, parallel context resolution), но сохраняет все safety gates.

### PII subsystem

PII — это conditional подсистема из трёх компонентов:

1. **Detector** — обнаруживает PII в input, context, output.
2. **Redactor** — маскирует PII перед передачей в модель или внешнюю систему.
3. **Verifier** — **Deferred.** Проверяет, что redacted output не содержит утечек.

PII subsystem активен когда:
- Обнаружены PII-паттерны в input/output, или
- Домен требует PII обработки: legal, HR, finance, security, compliance.

**MVP: detector + redactor. Verifier deferred.**

PII subsystem применяется ко всему: user input, context reads, memory reads, model output, external sends.

### Secrets handling

Secrets (API keys, tokens, passwords) обрабатываются отдельно от PII:

- Secrets detector сканирует context и output.
- Secrets не передаются в model prompt без explicit gate.
- Secrets не логируются в TraceSystem в plaintext.
- `secrets_handling_gate` (severity: block) требует explicit approval для любой операции с secrets.

### Policy conflicts

Конфликт политик — это не исключение, а ожидаемая ситуация. PolicyCore разрешает конфликты по иерархии (более restrictive побеждает). Если конфликт невозможно разрешить автоматически, Wolf возвращает `PartialResult` с `policy_conflict` reason.

---

## 9. Capability Model

### Различие примитивов

| Primitive | Level | Scope | Trust | Example |
|-----------|-------|-------|-------|---------|
| **Tool** | Low | Stateless action | native → wrapped → mcp → direct_api | `context.read`, `file.write`, `mcp.invoke` |
| **Skill** | Mid | Reusable logic unit | native / imported | `software.project_review`, `legal.contract_analysis` |
| **Workflow** | High | Multi-step orchestration | Declarative (YAML) | spec-first flow, TDD workflow |
| **Agent** | Persona | Skill set + policy scope | Selected by router | `software_architect`, `security_reviewer` |
| **Adapter** | Integration | External system bridge | Wrapped | `salesforce_adapter`, `vuln_scanner_adapter` |
| **Wrapper** | Policy layer | Capability decorator | Untrusted by default | `github_mcp_wrapper` |
| **Domain Pack** | Bundle | All above for domain | Scoped | `software-engineering`, `legal-ops` |

> **Adapter vs Wrapper.** Adapter handles schema/auth translation. Wrapper adds policy overlay. В MVP Adapter functions могут быть объединены с MCPWrapper или Tool Registry. Концептуально они разделены, но implementation может объединить их.

### Skills

Skills могут быть:
- **Native** — встроены в runtime, доверенные.
- **Imported** — загружены извне (OpenClaw, OpenCode, custom). Считаются untrusted до применения policy overlay.

### Tools

Tools могут быть:
- **Native** — базовые инструменты runtime (file read, context search).
- **Wrapped** — native tool с добавленным policy overlay.
- **MCP** — инструмент из MCP server.
- **Direct API** — прямой HTTP/API вызов.

Trust scoring: `native > wrapped > MCP > imported_skill > direct_api`.

### Wrappers

Wrapper — это policy-enforcing decorator вокруг external capability. Wrapper добавляет:
- Trust check
- Policy overlay
- Logging
- Fallback activation

Каждый external capability должен иметь `fallback_action`. Если MCP server недоступен, wrapper активирует fallback.

### External capabilities untrusted by default

Все внешние capabilities проходят 6-step overlay:

1. Discovery — что умеет capability?
2. Trust scoring — какой уровень доверия?
3. Policy check — разрешает ли текущая политика?
4. Gate application — какой severity применить?
5. Fallback activation — если capability недоступна или заблокирована?
6. Audit logging — log в TraceSystem.

> **Design decision.** Почему mandatory fallback? Потому что 13 сценариев содержат `external_tool_unavailable`, `mcp_unavailable`, `jira_unavailable`. Без fallback workflow падает. Fallback — это не optional improvement, а requirement для надёжности.

---

## 10. Domain Pack Model

Domain pack — это scoped configuration bundle, расширяющий универсальный runtime домен-специфичными:
- skills
- tools
- artifact types и templates
- policies и gates
- personas
- workflows

### Структура domain pack

```
domain_packs/<domain>/
  config.yaml          # domain-specific settings
  skills/              # imported or native skills
  tools/               # tool definitions + adapters
  artifacts/           # templates + lifecycle rules
  policies/            # domain policy overlays
  gates/               # domain-specific gates
  personas/            # domain personas
  workflows/           # reusable workflow definitions
```

### Пример domain pack config

```yaml
# domain_packs/software-engineering/config.yaml
name: software-engineering
version: "1.0.0"
description: "Software engineering domain pack for Mr. Wolf"

default_persona: senior_engineer

skills:
  - software.project_review
  - software.spec_first
  - software.tdd

tools:
  - native:context.read
  - native:file.read
  - wrapped:file.write
  - mcp:github.pr

artifacts:
  templates:
    - TechnicalSpecification
    - TaskList
    - TestPlan
  lifecycle:
    default: created → persisted
    validation: deferred

policies:
  overlay:
    file_write: require_approval
    external_send: require_approval
  hard_deny:
    - dangerous_shell
    - auto_merge_without_review

gates:
  - file_write_approval
  - test_coverage_gate

workflows:
  - spec_first_flow
  - tdd_workflow
```

### Использование в банке сценариев

- `software-engineering` — 18 сценариев
- `architecture` — 8 сценариев
- `legal-ops`, `research`, `finance-ops`, `security-compliance`, `hr-recruiting`, `data-analysis` — по 4–5 сценариев
- `office-assistant`, `product-management` — по 4 сценария
- `concierge`, `sales-crm` — по 2 сценария

### Cross-domain composition

Cross-domain сценариев — 5 из 80 (6.25%). Для 2-domain случаев достаточно composition rules:
- Policy union (объединение политик с conservative resolution)
- Artifact merge (артефакты из обоих доменов доступны в workflow)
- Persona selection (router выбирает lead persona)

> **Deferred.** DomainPackCoordinator — координатор для 3+ domain orchestration или dynamic domain switching. Не нужен сейчас, потому что cross-domain < 15%.

---

## 11. Memory Model

Memory в Wolf — это не «большой RAG», а структурированная система с явными типами, границами и citation.

### Типы памяти

1. **Case Trace Memory** — MVP Core (80/80 сценариев). Audit trail каждого сценария. Каждый SolveResult ссылается на CaseTrace.
2. **Artifact Link Memory** — conditional L3+. Связи между артефактами. Spec → tasks → tests → impl → release. Требуется для anchor domain и любых L3+ workflow.
3. **Decision Memory** — conditional L3+. Propagation ADR/ADL решений в будущие сценарии. 8 architecture сценариев требуют это.
4. **User/Project Preference Memory** — conditional L2+. `previous_*` паттерны: previous specs, previous releases, previous budgets. 30+ сценариев используют preference memory.
5. **Stale Memory Detection** — conditional. Проверка свежести. 15+ сценариев содержат `stale_*` failure modes.

### Artifact Link Memory (required schema)

```yaml
memory_links:
  - source: TechnicalSpecification
    target: TaskList
    link_type: decomposes_to
  - source: TaskList
    target: ImplementationPlan
    link_type: implements_via
  - source: TechnicalSpecification
    target: TestPlan
    link_type: tested_by
  - source: TestPlan
    target: CoverageReport
    link_type: produces
  - source: ADR
    target: ADL
    link_type: refines_to
  - source: ADL
    target: ImplementationPlan
    link_type: constrains
  - source: ImplementationPlan
    target: ReleaseChecklist
    link_type: requires
  - source: ReleaseChecklist
    target: ChangeLog
    link_type: generates
```

### Memory safety

- Memory is **not** uncontrolled RAG. Нельзя «просто засунуть всё в векторную БД».
- Каждое чтение требует `citation` (source scenario ID) и `freshness`.
- Policy boundaries: `pii_handling_gate` и `secrets_handling_gate` применяются и к memory reads.
- Memory freshness: version-based для артефактов (artifact_id + version), time-based для preferences.

> **Design decision.** Почему version-based для артефактов? Потому что `TechnicalSpecification` может измениться, и ссылка на старую версию должна оставаться валидной. Time-based достаточно для preferences («пользователь предпочитает Python»).

---

## 12. Configuration Model

### Progressive configuration

Configuration modes **не являются mutually exclusive**. Domain pack может быть loaded через `generated_config` или `explicit_config`.

```
zero_config → generated_config → explicit_config → domain_pack → custom_plugin
```

| Mode | Auto-detect domain | Load domain pack | User config required | Example scenario |
|------|-------------------|------------------|---------------------|------------------|
| zero_config | No | No | No | «Объясни spec-first» |
| generated_config | Yes | Optional | No | «Проанализируй этот репозиторий» |
| explicit_config | Yes | Optional | Yes | «Используй software-engineering pack» |
| domain_pack | Yes | Yes | Optional | «Создай spec с TDD workflow» |

- **zero_config** — Wolf работает из коробки. Подходит для L1–L2. 12 сценариев.
- **generated_config** — runtime сам генерирует конфигурацию на основе контекста. Подходит для L2–L3. 30 сценариев.
- **explicit_config** — пользователь явно указывает domain, workflow, policies. Может включать custom workflow. Подходит для L3–L4. 28 сценариев.
- **domain_pack** — загружается полный domain pack. Подходит для L4–L5. 55 сценариев.
- **custom_plugin** — пользовательский код. Должно оставаться редкостью. 3/80 сценариев (3.75%).

### Configuration hell — известный риск

5 разных режимов конфигурации — это сигнал риска. Митигация:
- First Useful Product должен работать на `zero_config` или `generated_config`.
- `explicit_config` и `domain_pack` — опциональное углубление.
- `custom_plugin` < 5% сценариев.

> **Design decision.** Почему domain_pack coverage 68.75%, а zero_config только 15%? Потому что domain pack может использоваться и на L1–L2 (например, software-engineering pack для базовых ответов). Distribution показывает coverage, а не disjoint categories.

---

## 13. Failure Modes and Safeguards

### Model hallucination / misunderstanding

- **Examples:** `model_hallucination`, `overly_generic_answer`, `overly_technical_answer`
- **Occurrences:** 24
- **Safeguard:** ModelRouter + prompt constraints + confidence scoring в SolveResult
- **Owner:** WolfFacade, ModelRouter
- **User-visible:** «Я не уверен, могу уточнить?» или `Refusal` с объяснением

### Stale data / memory

- **Examples:** `stale_data`, `stale_memory_suggests_wrong_next_step`, `stale_compliance_framework`
- **Occurrences:** 20
- **Safeguard:** Freshness checks + bounded context + stale memory detection (conditional)
- **Owner:** ContextResolver, Stale Memory Detection (conditional)
- **User-visible:** Предупреждение «данные могут быть устаревши» или запрос подтверждения

### Missing context / context too large

- **Examples:** `missing_context`, `context_too_large`, `repository_context_too_large`
- **Occurrences:** 18
- **Safeguard:** Bounded context + progressive disclosure + context summarization
- **Owner:** ContextResolver
- **User-visible:** «Уточните, какую часть проекта анализировать» или partial analysis с пояснением

### MCP/API unavailable

- **Examples:** `external_tool_unavailable`, `mcp_unavailable`, `jira_unavailable`
- **Occurrences:** 13
- **Safeguard:** Fallback actions + retry policy + circuit breaker (conditional)
- **Owner:** MCPWrapper, AdapterLayer
- **User-visible:** «Внешняя система недоступна, использую fallback» или `PartialResult`

### Policy conflict

- **Examples:** `policy_conflict`, `policy_conflict_on_external_action`, `policy_conflict_on_file_write`
- **Occurrences:** 11
- **Safeguard:** Policy hierarchy + conflict resolver + conservative resolution
- **Owner:** PolicyCore
- **User-visible:** «Конфликт политик: [описание]. Применена более строгая политика.»

### PII / secrets exposure

- **Examples:** `pii_in_transcripts`, `pii_in_resumes`, `secrets_in_configs`
- **Occurrences:** 10
- **Safeguard:** PII detector + redactor + verifier (deferred) + secrets handling gate
- **Owner:** PolicyCore, PII subsystem (conditional)
- **User-visible:** «Обнаружены чувствительные данные. Действие требует подтверждения.»

### Test / CI failure

- **Examples:** `ci_failure`, `missing_test_coverage`, `coverage_below_threshold`
- **Occurrences:** 12
- **Safeguard:** Coverage gate + CI monitor + test plan validation
- **Owner:** PolicyCore, TraceSystem
- **User-visible:** «CI не прошёл: [причина]. Требуется исправление перед release.»

### Release / migration rollback

- **Examples:** `rollback_needed`, `rollback_failure`, `incomplete_rollback_plan`
- **Occurrences:** 5
- **Safeguard:** Rollback verification gate + RollbackPlan artifact + compatibility check
- **Owner:** PolicyCore, GateManager (conditional)
- **User-visible:** «Миграция требует одобрения. Rollback plan создан: [link].»

### Jurisdiction / compliance mismatch

- **Examples:** `jurisdiction_mismatch`, `currency_mismatch`
- **Occurrences:** 6
- **Safeguard:** Jurisdiction detector + multi-framework support в domain pack
- **Owner:** Domain Pack
- **User-visible:** «Обнаружено несоответствие юрисдикции. Проверьте compliance settings.»

### Runaway workflow / cost

- **Examples:** `runaway_workflow`, `cost_exceeded`
- **Occurrences:** 2
- **Safeguard:** Circuit breaker (conditional, L4+ external/high-cost) / hard limits в MVP
- **Owner:** TraceSystem, CircuitBreaker (conditional)
- **User-visible:** «Workflow остановлен: превышен лимит [steps/tokens/calls].»

### Gate misunderstanding / timeout

- **Examples:** `gate_misunderstood`, `expert_gate_timeout`
- **Occurrences:** 3
- **Safeguard:** Gate explanation + timeout handling + escalation path
- **Owner:** PolicyCore, GateManager (conditional)
- **User-visible:** «Требуется одобрение: [rationale]. Время ожидания: [timeout].»

---

## 14. Scope Boundaries

### MVP Boundary

MVP Core — минимальный набор для первого useful product:

**MVP Components:**
- WolfFacade
- ContextResolver
- AgentRunner
- TraceSystem
- ScenarioRouter / RouterLight (RouterInterface abstraction)
- ModelRouter
- PolicyCore (base)
- ArtifactStore (basic)

**MVP Artifacts:**
- AnswerArtifact (internal-only)
- TechnicalSpecification
- TaskList
- TestPlan
- ADR
- ReleaseChecklist
- PolicyDecision

**MVP Config:**
- zero_config
- generated_config
- explicit_config (включая custom workflow)
- domain pack loading as optional extension

**NOT in MVP:**
- PII verifier (detector + redactor только)
- Full CircuitBreaker (hard limits вместо этого)
- Full artifact validation (basic format check only)
- Artifact versioning (time-based freshness)
- DomainPackCoordinator
- custom_plugin
- A2A
- Multi-language support

### Always Core post-MVP

Компоненты, которые становятся core сразу после MVP:
- FileWriteGateWithRollback
- Artifact validation (schema check)
- Artifact Link Memory (foreign key links)

### Conditional

Активируются только при определённых условиях:
- GateManager — L4+ side effects / risky actions
- AdapterLayer — только при external capabilities
- Domain packs — только при L3+ или explicit config
- PII subsystem — при обнаружении PII или в sensitive доменах
- CircuitBreaker — L4+ с внешними вызовами
- Expert gates — только в security, legal, architecture scenarios
- Emergency policy — только при active incident flag
- Artifact Link Memory — L3+
- Decision Memory — L3+
- Preference Memory — L2+
- Stale Memory Detection — conditional

### Deferred

- DomainPackCoordinator — до cross-domain > 15%
- Artifact archival — до накопления исторических артефактов
- Observability subsystem (MetricsCollector, ExecutionSpan) — P1, может быть частью TraceSystem в MVP
- Audit trail for emergency overrides — P1, может быть частью TraceSystem
- Multi-language support — ни один из 80 сценариев не требует
- A2A protocol support — ни один сценарий не использует agent-to-agent
- Custom plugin framework — 0 сценариев требуют custom code
- PII verifier — detector + redactor достаточно для MVP
- Artifact versioning — time-based для MVP

### Rejected / keep out

- **LightweightSolvePlanner** — L2 решается routing, не planning. (decision log R1)
- **FullWorkflowEngine for L2–L3** — overkill; workflow engine условный, для L4+. (decision log R2)
- **AnswerCache** — L1 должен быть быстрым через model selection, не кэш. (decision log R4)
- **Auto-merge gate** — ни один сценарий не запрашивает auto-merge. Остаётся hard-deny. (decision log R3)
- **Automated bias correction** — bias detection = flag; correction = human review. Автоматическая коррекция отклонена. (decision log R5)

---

## 15. End-to-End Examples

### L1 simple answer: «Объясни spec-first»

1. Пользователь: «Объясни spec-first».
2. WolfFacade получает запрос.
3. RouterLight определяет: L1, простой ответ.
4. ModelRouter выбирает lightweight модель.
5. AgentRunner генерирует ответ.
6. TraceSystem логирует запрос (async для L1).
7. SolveResult(Answer, trace_ref, artifacts: [answer-artifact-001]).
8. Пользователь видит: 2 абзаца plain text объяснения.

### L3 plan/dry-run: «Создай TechnicalSpecification для фичи X»

1. Пользователь: «Создай TechnicalSpecification для фичи X».
2. WolfFacade получает запрос.
3. RouterFull определяет: L3, plan/dry_run.
4. ContextResolver собирает контекст: файлы проекта, meeting notes.
5. AgentRunner использует skill `software.spec_first`.
6. Wolf генерирует TechnicalSpecification artifact.
7. PolicyCore проверяет: hard-deny не затронуты (нет file write, нет external send).
8. Пользователь видит preview спецификации.
9. Пользователь: «Выглядит хорошо».
10. Wolf persists artifact в ArtifactStore.
11. SolveResult(Artifact, trace_ref, artifacts: [spec-001]).

### L4 governed action: «Примени implementation plan»

1. Пользователь: «Примени implementation plan для фичи X».
2. WolfFacade получает запрос.
3. RouterFull определяет: L4, governed_action.
4. ContextResolver читает spec-001, task-001 из ArtifactStore.
5. AgentRunner генерирует ImplementationPlan artifact.
6. PolicyCore обнаруживает `file_write` действия.
7. GateManager triggering `file_write_approval` (severity: block).
8. Wolf показывает пользователю: plan preview + diff preview + rationale.
9. Пользователь нажимает [Approve].
10. Wolf пишет файлы через wrapped file.write.
11. TraceSystem логирует все действия + gate approval.
12. SolveResult(Artifact, trace_ref, policy_decisions: [file_write:approved], gates_triggered: [file_write_approval], artifacts: [impl-plan-001]).

---

## 16. Glossary

| Term | Definition |
|------|------------|
| **Agent** | Persona со skill set и policy scope. Выбирается router. |
| **AgentRunner** | Исполняет single-agent invocation. Multi-agent orchestration — задача Workflow Engine. |
| **Artifact** | Структурированный результат работы Wolf (spec, plan, report). Живёт в ArtifactStore. |
| **ArtifactStore** | Хранилище артефактов с lifecycle и linking. |
| **AnswerArtifact** | Internal representation ответа L1–L2. Пользователь видит plain text. |
| **CaseTrace** | Audit trail сценария. Каждый SolveResult ссылается на CaseTrace ID. |
| **Conditional** | Компонент, активируемый только при определённых условиях (domain, level, external capability). |
| **ContextResolver** | Сбор контекста из repo/docs/meeting notes/artifact store. Structured queries, не semantic RAG по умолчанию. |
| **Control Plane** | Управляющий слой runtime: routing, policy enforcement, artifact orchestration. |
| **Domain Pack** | Scoped configuration bundle: skills, tools, artifacts, policies, personas, workflows для домена. |
| **Gate** | Точка проверки перед рискованным действием. Severity: silent / notify / block / expert_gate. |
| **GateManager** | Conditional компонент (L4+). Управляет approval gates, expert gates, rollback gates. |
| **Governed Action** | Действие с применением gates. Wolf может запросить одобрение перед продолжением. |
| **Hard-deny** | Политика, запрещающая действие без исключений. Не может быть overridden. |
| **MCPWrapper** | Lifecycle manager для MCP capabilities: connect → discover → health → invoke → disconnect. |
| **ModelRouter** | Always-core. Выбирает модель (lightweight vs reasoning) на основе scenario level. |
| **PartialResult** | Частичный результат из-за gate block или external failure. |
| **Policy** | Declarative rule, stronger than prompts. Иерархия: global → domain → scenario → user. |
| **PolicyCore** | Always-core. Hard-deny checks + базовая policy evaluation. Применяется на всех уровнях. |
| **Refusal** | Валидный SolveResult типа Refusal при нарушении hard-deny. |
| **Router** / **RouterLight** / **RouterFull** | RouterInterface с двумя реализациями: Light (L1–L2) и Full (L3–L5). |
| **Scenario Level** | L1 (simple answer) → L2 (context-aware) → L3 (plan) → L4 (governed action) → L5 (external). |
| **Skill** | Reusable logic unit, function-like. Не содержит gates и artifact chains. Вызывается workflow. |
| **SolveResult** | Canonical envelope для всех режимов исполнения. Содержит references на артефакты. |
| **TraceSystem** | Audit + observability. Логирует каждое действие с trace_reference. |
| **Workflow** | Orchestration DAG с artifact passing, conditional logic, gates. Может вызывать skills. |
| **Wrapper** | Policy-enforcing decorator вокруг external capability. |

---

## 17. Evidence Appendix

### Scenario Lab scope

- **80 Scenario Cards** — покрытие 12+ доменов, уровни L1–L5
- **80 Playthrough Records** — по одному на каждый сценарий
- **80 Extraction Reports** — извлечение artifacts, components, policies, risks

### Ключевые evidence points

**Core component counts:**
- 4 always-core компонента (присутствуют в ≥60 сценариев)
- 3 core для L4/L5 (GateManager, MCPWrapper, FileWriteGateWithRollback)
- 2 router реализации (RouterLight / RouterFull)
- 5 rejected компонентов (не нужны на основе evidence)

**Policy pattern counts:**
- 37 уникальных policy patterns
- Топ-3: `external_send` (77), `generate_report` (71), `file_write` (69)
- 17 hard-deny rules (always deny, no override)
- 63 block gates, 7 notify gates

**Artifact chains:**
- 6 подтверждённых artifact chains (spec→tasks→impl→tests, ADR→ADL, release→changelog, migration→rollback, API contract→impl, security→approval)
- 20 first-class artifact types
- 8 обязательных memory links между артефактами

**Failure clusters:**
- 12 кластеров failure modes
- Топ-3 по частоте: model hallucination (24), stale data (20), missing context (18)
- 2 кластера с нулевым occurrence (missing capability) — предупреждение, не проблема

**Configuration mode coverage:**
- zero_config: 12 сценариев (15%)
- generated_config: 30 сценариев (37.5%)
- explicit_config: 28 сценариев (35%)
- domain_pack: 55 сценариев (68.75%)
- custom_plugin: 3 сценария (3.75%)

> **Примечание:** Coverage суммируется >100%, потому что modes не mutually exclusive. Domain pack может быть loaded в generated_config или explicit_config режиме.

---

*Документ подготовлен на основе Concept Extraction Pass и Anchor Domain Deep Dive. Не содержит новых идей, не подтверждённых Scenario Lab evidence. Не содержит roadmap.*
