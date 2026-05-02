# Mr. Wolf — Concept v2 Draft

**Date:** 2026-05-05
**Source:** Scenario Lab Concept Extraction Pass (80 scenarios, 80 playthroughs, 80 extraction reports)
**Status:** Draft for review

---

## 1. Executive Summary

Mr. Wolf — это **agentic control plane** с единым пользовательским фасадом. Пользователь обращается к одному агенту, а runtime динамически собирает нужные capabilities из конфигурации: агентов, навыков, инструментов, workflow и политик. Wolf не просит пользователя выбирать «какой агент запустить» — он сам решает, какой сценарий применить, какие инструменты задействовать и какие артефакты произвести.

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
Политика — это declarative rule, а не пожелание в system prompt. Если политика `file_write` требует `file_write_approval` gate, то ни prompt, ни model hallucination не могут обойти gate. PolicyCore проверяет политики до исполнения.

### Artifacts are first-class
Результат работы Wolf — это не только текст ответа. Это структурированные артефакты: `TechnicalSpecification`, `TestPlan`, `ADR`, `ThreatModel`. Они создаются, валидируются, сохраняются и связываются друг с другом. SolveResult содержит ссылки на артефакты, а не их копии.

### Tools, skills, agents, workflows — different primitives
Не всё является «агентом». Tool — низкоуровневое действие. Skill — доменная логика, использующая tools. Agent — persona со skill set и policy scope. Workflow — многошаговая декларативная оркестрация. Смешивание этих примитивов ведёт к путанице.

### External capabilities are untrusted by default
MCP server, imported skill, direct API — всё внешнее считается untrusted до тех пор, пока wrapper не применил policy overlay: trust scoring, policy check, gate application, fallback activation, audit logging.

### Progressive configuration over configuration hell
Конфигурация должна наращиваться постепенно: `zero_config` → `generated_config` → `explicit_config` → `domain_pack`. Первый полезный продукт работает на `zero_config` или `generated_config`. L4/L5 требуют `explicit_config` или `domain_pack`. `custom_plugin` — редкость.

> **Design decision.** Почему не «всё сразу через domain pack»? Потому что 12 из 80 сценариев работают на `zero_config`, а 30 — на `generated_config`. Если потребовать domain pack для базовых задач, пользователь откажется от инструмента.

### Memory must be cited, bounded, and policy-aware
Memory в Wolf — это не бесконтрольный RAG. Каждое чтение требует citation (source ID) и freshness check. Memory read проходит через те же gates, что и внешние действия: PII detector и secrets gate применяются и к историческим данным.

---

## 4. Core Behavioral Model

Wolf работает в одном из поведенческих режимов. Режим выбирается Router на основе запроса, контекста и конфигурации.

### simple_answer / fast path (L1)
Прямой ответ без инструментов, без чтения контекста, без side effects. Пример: «Объясни, что такое spec-first». Модель выбирается ModelRouter для минимальной латентности. Результат — `AnswerArtifact` для аудита, рендерится как plain text.

### context_aware_answer (L2)
Ответ с чтением контекста (файлы проекта, документация, meeting notes), но без side effects. Пример: «Проанализируй текущий API на соответствие OpenAPI spec». Включает ContextResolver и AgentRunner. Нет gates, нет записи файлов.

### clarification (L1–L5)
Wolf может запросить уточнение, если запрос неоднозначен или недостаточно контекста. Clarification — это не ошибка, а behavioral mode. Оно происходит на любом уровне, если Router не может однозначно выбрать сценарий.

### plan / dry_run (L3)
Wolf строит план, спецификацию или чеклист, но не выполняет действий. Пример: «Создай TechnicalSpecification для фичи X». Результат — артефакты (`TechnicalSpecification`, `TaskList`, `TestPlan`), но нет file write, нет external calls. Gates — notification-only.

### governed_action (L4)
Wolf выполняет действия с применением gates: file write с `file_write_approval`, external send с `external_action_approval`, shell mutation — hard-deny. Пример: «Сгенерируй ImplementationPlan и примени изменения к репозиторию». Артефакты + логи + policy decisions.

### artifact_producing_workflow (L3–L5)
Многошаговый workflow, где выход одного шага — вход следующего. Пример: spec → tasks → implementation → tests → release. Артефакты связываются через ArtifactStore. Workflow определён декларативно (YAML), не кодом.

### refusal / why-not explanation (L1–L5)
Wolf отказывает в выполнении, если запрос нарушает hard-deny policy. Отказ сопровождается объяснением: какая политика сработала и почему. Refusal — это валидный SolveResult типа `Refusal`.

### external_capability_use (L5)
Использование MCP server, imported skill, direct API с полным overlay: discovery → trust scoring → policy check → gate → fallback → audit. Пример: синхронизация с Jira, вызов vulnerability scanner, запрос к внешней базе знаний.

### cross_domain_orchestration (L4–L5)
Оркестрация, затрагивающая несколько domain packs. Пример: architecture review + security review (arch + sec). Сейчас cross-domain сценариев 6.25% (5 из 80), поэтому для 2-domain случаев достаточно composition rules. Полноценный DomainPackCoordinator отложен.

---

## 5. Runtime Architecture

### Компоненты и их классификация

#### always-core (присутствуют в ≥60 сценариев, все уровни)

- **WolfFacade** — единая точка входа. Принимает user input, возвращает SolveResult. Скрывает всё внутреннее устройство. (80/80 сценариев)
- **ContextResolver** — сбор контекста из репозитория, документов, meeting notes, artifact store. Поддерживает bounded context и progressive disclosure. (72/80)
- **AgentRunner** — исполнение агентной логики: выбранного агента с его skill set и policy scope. (69/80)
- **TraceSystem** — аудит и observability. Каждое действие логируется с trace_reference. Необходим для всех уровней, включая L1. (63/80)

#### core for L2+ (≥30 сценариев)

- **ScenarioRouter** — выбор сценария на основе user input, context и configuration. Full implementation для L3–L5. (50 сценариев)
- **ScenarioRouterLight** — облегчённая версия Router для L1–L2, без полного scenario matching. (30 сценариев)

> **Design decision.** Router и RouterLight — это одна абстракция с двумя реализациями. Для L1–L2 достаточно lightweight routing; для L3–L5 нужен полный scenario matching с artifact chains и gate prediction.

#### core for L1/L2 fast path

- **ModelRouter** — выбор модели (lightweight vs reasoning) для минимизации latency на L1–L2. (8 сценариев)

#### core for L4/L5 (≥5 сценариев)

- **PolicyCore** — проверка политик, применение gates, hard-deny, conflict resolution. Ядро безопасности и governance. (23 сценария)
- **MCPWrapper** — lifecycle manager для MCP capabilities: connect → discover → health check → invoke → disconnect. (8 сценариев)
- **FileWriteGateWithRollback** — gate для file mutation с rollback capability. Core для любых сценариев с записью файлов. (8 сценариев)

#### conditional / external

- **AdapterLayer** — translation layer для внешних систем (auth, schema mapping, error translation). Активен только при использовании external capabilities. (4 сценария)
- **PII subsystem** — detector + redactor + verifier. Активен при обнаружении PII или secrets. Требуется в legal, HR, finance, security domains.
- **CircuitBreaker** — защита от runaway workflow. Активен на L5 сценариях с внешними вызовами. Ограничения: max steps, max tokens, max external calls.

#### deferred

- **DomainPackCoordinator** — **Deferred.** Не нужен сейчас, потому что cross-domain сценариев 6.25%. Станет необходим при >15%.
- **EmergencyPolicy** — специфичный сценарий, не требует отдельного подсистемного компонента. (1 сценарий)
- **Observability subsystem** (MetricsCollector, ExecutionSpan) — **Deferred.** P1, но не блокирует MVP. Можно начать с TraceSystem.
- **Audit trail for emergency overrides** — **Deferred.** P1, но может быть частью TraceSystem в MVP.

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

- **Answer** — готовый ответ пользователю. Для L1–L2. Внутри SolveResult хранится как `AnswerArtifact` ID.
- **Plan** — план, спецификация, чеклист без исполнения. Для L3. Содержит references на плановые артефакты.
- **Artifact** — результат artifact-producing workflow. Для L3–L5. References на созданные/изменённые артефакты.
- **Refusal** — отказ по политике. Содержит `rationale` и `policy_reference`.
- **PartialResult** — частичный результат из-за gate block, external failure или circuit breaker. Содержит `completed_artifacts` и `blocked_steps`.

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
- `AnswerArtifact` — структурированный ответ даже для L1. Для аудита и возможности последующего linking.
- `RiskRegister` — реестр рисков
- `RollbackPlan` — план отката
- `CompatibilityMatrix` — матрица совместимости

### Artifact lifecycle

```
created → validated → persisted → archived (deferred)
```

- **created** — артефакт сгенерирован агентом, но ещё не прошёл валидацию.
- **validated** — проверена структура, обязательные поля, связи. Артефакт готов к использованию.
- **persisted** — сохранён в ArtifactStore. Доступен для referencing из других сценариев.
- **archived** — **Deferred.** Архивация старых версий. Пока не нужна для MVP.

### Artifact chains

Артефакты связываются в цепочки через Artifact Link Memory:

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
- **user_override** — пользовательские настройки в рамках допустимого (например, relax `notify` to `silent` для低风险 file read).

Конфликт разрешается в пользу более restrictive политики. Если global говорит «block», а domain говорит «notify», применяется «block».

### Hard-deny rules

Следующие действия запрещены без исключений (no override):

- `auto_assign_without_review`, `auto_hire_without_review`, `auto_merge_without_review`, `auto_publish_without_review`, `auto_delete_without_confirmation`, `auto_transfer_without_approval`
- `dangerous_shell`, `shell_mutation`, `deploy_action`
- `external_send`, `unauthorized_external_send`
- `file_write`, `file_write_without_approval`
- `financial_action_without_approval`
- `legal_advice_without_gate`
- `personal_data_exposure`, `secrets_exposure`

Hard-deny не может быть переопределён user override. Wolf возвращает `Refusal` с объяснением.

### Gate severity

```
silent   → log only, no UX friction (auto-approve low-risk)
notify   → inform user, continue unless blocked by another gate
block    → require explicit user approval before proceeding
expert_gate → require domain expert approval (legal, security, architecture)
```

Gate с severity `block` или `expert_gate` обязан включать `rationale` — объяснение, видимое пользователю. Это уменьшает gate misunderstanding.

> **Design decision.** Должен ли `notify` auto-escalate в `block`? Да: повторный `notify` на тот же тип действия в рамках сессии эскалирует до `block`. Это предотвращает «fatigue approval».

### Emergency mode

Emergency mode — это fast-track routing + enhanced logging, **но не bypass gates.** Даже в инциденте (`security.incident.response_runbook.018`) external notification требует `external_notification_approval`.

Emergency mode имеет свой policy subset (`emergency_policy`), который может relax routing latency, но сохраняет все safety gates.

### PII subsystem

PII — это не просто gate, а подсистема из трёх компонентов:

1. **Detector** — обнаруживает PII в input, context, output.
2. **Redactor** — маскирует PII перед передачей в модель или внешнюю систему.
3. **Verifier** — проверяет, что redacted output не содержит утечек.

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
| **Skill** | Mid | Domain logic + tools | native / imported | `software.project_review`, `legal.contract_analysis` |
| **Workflow** | High | Multi-step orchestration | Declarative (YAML) | spec-first flow, TDD workflow |
| **Agent** | Persona | Skill set + policy scope | Selected by router | `software_architect`, `security_reviewer` |
| **Adapter** | Integration | External system bridge | Wrapped | `salesforce_adapter`, `vuln_scanner_adapter` |
| **Wrapper** | Policy layer | Capability decorator | Untrusted by default | `github_mcp_wrapper` |
| **Domain Pack** | Bundle | All above for domain | Scoped | `software-engineering`, `legal-ops` |

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

1. **Case Trace Memory** — универсальная (80/80 сценариев). Audit trail каждого сценария. Каждый SolveResult ссылается на CaseTrace.
2. **Artifact Link Memory** — связи между артефактами. Spec → tasks → tests → impl → release. Требуется для anchor domain и любых L3+ workflow.
3. **Decision Memory** — propagation ADR/ADL решений в будущие сценарии. 8 architecture сценариев требуют это.
4. **User/Project Preference Memory** — `previous_*` паттерны: previous specs, previous releases, previous budgets. 30+ сценариев используют preference memory.
5. **Stale Memory Detection** — проверка свежести. 15+ сценариев содержат `stale_*` failure modes.

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

```
zero_config → generated_config → explicit_config → domain_pack → custom_workflow → custom_plugin
```

- **zero_config** — Wolf работает из коробки. Подходит для L1–L2. 12 сценариев.
- **generated_config** — runtime сам генерирует конфигурацию на основе контекста. Подходит для L2–L3. 30 сценариев.
- **explicit_config** — пользователь явно указывает domain, workflow, policies. Подходит для L3–L4. 28 сценариев.
- **domain_pack** — загружается полный domain pack. Подходит для L4–L5. 55 сценариев (включая lower levels).
- **custom_workflow** — пользователь определяет свой workflow. Редко нужно. 5 сценариев.
- **custom_plugin** — пользовательский код. Должно оставаться редкостью. 3/80 сценариев (3.75%).

### Configuration hell — известный риск

6 разных режимов конфигурации — это сигнал риска. Митигация:
- First Useful Product должен работать на `zero_config` или `generated_config`.
- `explicit_config` и `domain_pack` — опциональное углубление.
- `custom_plugin` < 5% сценариев.

> **Design decision.** Почему не требуем domain pack сразу? Потому что 42 из 80 сценариев (52.5%) работают на `zero_config` или `generated_config`. Если заставить пользователя писать YAML перед первым запросом, он уйдёт.

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
- **Safeguard:** Freshness checks + bounded context + stale memory detection
- **Owner:** MemoryBundle, ContextResolver
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
- **Safeguard:** Fallback actions + retry policy + circuit breaker
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
- **Safeguard:** PII detector + redactor + verifier + secrets handling gate
- **Owner:** PolicyCore, PII subsystem
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
- **Owner:** PolicyCore
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
- **Safeguard:** Circuit breaker (max steps, max tokens, max external calls)
- **Owner:** TraceSystem, CircuitBreaker
- **User-visible:** «Workflow остановлен: превышен лимит [steps/tokens/calls].»

### Gate misunderstanding / timeout

- **Examples:** `gate_misunderstood`, `expert_gate_timeout`
- **Occurrences:** 3
- **Safeguard:** Gate explanation + timeout handling + escalation path
- **Owner:** PolicyCore
- **User-visible:** «Требуется одобрение: [rationale]. Время ожидания: [timeout].»

---

## 14. Scope Boundaries

### in-core now

Компоненты, которые необходимы для MVP и подтверждены ≥5 сценариями:

- WolfFacade, ContextResolver, AgentRunner, TraceSystem
- ScenarioRouter / ScenarioRouterLight (абстракция + 2 реализации)
- ModelRouter
- PolicyCore
- MCPWrapper
- FileWriteGateWithRollback
- ArtifactStore + artifact lifecycle (created → validated → persisted)
- SolveResult envelope
- PII subsystem (detector + redactor + verifier)
- CircuitBreaker
- MemoryBundle (case trace + artifact links + decision + preference)

### conditional

Активируются только при определённых условиях:

- AdapterLayer — только при external capabilities
- Domain packs — только при L3+ или explicit config
- Custom workflow — только при explicit user request
- Expert gates — только в security, legal, architecture scenarios
- Emergency policy — только при active incident flag

### deferred

- DomainPackCoordinator — **Deferred** до cross-domain > 15%
- Artifact archival — **Deferred** до накопления значимого объёма исторических артефактов
- Observability subsystem (MetricsCollector, ExecutionSpan) — **Deferred** P1, может быть частью TraceSystem в MVP
- Audit trail for emergency overrides — **Deferred** P1, может быть частью TraceSystem
- Multi-language support — **Deferred**, ни один из 80 сценариев не требует
- A2A protocol support — **Deferred**, ни один сценарий не использует agent-to-agent
- Custom plugin framework — **Deferred**, 0 сценариев требуют custom code

### rejected / keep out

Компоненты, которые были предложены, но отклонены на основе evidence:

- **LightweightSolvePlanner** — L2 решается routing, не planning. (decision log R1)
- **FullWorkflowEngine for L2–L3** — overkill; workflow engine условный, для L4+. (decision log R2)
- **AnswerCache** — L1 должен быть быстрым через model selection, не кэш. (decision log R4)
- **Auto-merge gate** — ни один сценарий не запрашивает auto-merge. Остаётся hard-deny. (decision log R3)
- **Automated bias correction** — bias detection = flag; correction = human review. Автоматическая коррекция отклонена. (decision log R5)

---

## 15. Evidence Appendix

### Scenario Lab scope

- **80 Scenario Cards** — покрытие 12+ доменов, уровни L1–L5
- **80 Playthrough Records** — по одному на каждый сценарий
- **80 Extraction Reports** — извлечение artifacts, components, policies, risks

### Ключевые evidence points

**Core component counts:**
- 4 always-core компонента (присутствуют в ≥60 сценариев)
- 3 core для L4/L5 (PolicyCore, MCPWrapper, FileWriteGateWithRollback)
- 2 router реализации (ScenarioRouter / ScenarioRouterLight)
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

**Configuration distribution:**
- zero_config: 12 сценариев (15%)
- generated_config: 30 сценариев (37.5%)
- explicit_config: 28 сценариев (35%)
- domain_pack: 55 сценариев (68.75%)
- custom_workflow: 5 сценариев (6.25%)
- custom_plugin: 3 сценария (3.75%)

> **Design decision.** Почему domain_pack 68.75%, а zero_config только 15%? Потому что domain pack может использоваться и на L1–L2 (например, software-engineering pack для базовых ответов). Distribution показывает, что большинство сценариев выигрывают от domain-specific конфигурации, но first useful product должен работать и без неё.

---

*Документ подготовлен на основе Concept Extraction Pass и Anchor Domain Deep Dive. Не содержит новых идей, не подтверждённых Scenario Lab evidence.*
