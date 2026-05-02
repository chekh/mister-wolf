# Concept v2 Review — Expert Review Pass

**Date:** 2026-05-05
**Scope:** `generated/concept-v2-draft.md`
**Method:** Expert review by 8 simulated roles against Scenario Lab evidence
**Basis:** 80 scenarios, 80 playthroughs, 80 extraction reports + generated catalogs

---

## Резюме ревью

| Роль | Вердикт | Критичных | Средних | Мелких |
|------|---------|-----------|---------|--------|
| System Architect | Принять с правками | 2 | 3 | 2 |
| Developer / DX | Принять с правками | 1 | 4 | 3 |
| SRE / Operations | Принять с правками | 1 | 2 | 2 |
| Security / Governance | Принять с правками | 2 | 2 | 1 |
| Product / UX | Принять с правками | 1 | 3 | 3 |
| Integration / MCP | Принять с правками | 1 | 2 | 2 |
| Domain Pack / Extensibility | Принять с правками | 1 | 3 | 2 |
| Skeptical Implementer | Принять с сокращением scope | 2 | 4 | 3 |

**Итого must-fix:** 8 уникальных проблем.

---

## 1. System Architect

### Что хорошо
- `SolveResult` envelope — сильная центральная абстракция. Унифицирует L1–L5.
- Разделение core / config / domain pack — правильное архитектурное решение.
- Router abstraction с двумя реализациями (Light/Full) — реалистичный компромисс.
- Artifact chains с explicit linking — необходимо для anchor domain.
- Policy hierarchy (global → domain → scenario → user) — стандартная и понятная модель.

### Что непонятно
- **Порядок вызова Router и ModelRouter.** ModelRouter выбирает модель (lightweight vs reasoning), Router выбирает сценарий. Кто первый? Если Router выбирает L5, ModelRouter должен выбрать reasoning model. Но ModelRouter упомянут только для L1–L2 fast path.
- **Граница ContextResolver.** Он собирает контекст из repo/docs/meeting notes/artifact store. Но как он знает, что собирать? Есть ли у него schema, или он RAG-подобный? Документ говорит «не RAG», но не объясняет механизм.

### Что выглядит overengineered
- **PII subsystem в in-core now.** PII relevant только для 5 доменов (legal, HR, finance, security, compliance). Это conditional, не in-core. 10 сценариев с PII из 80.
- **CircuitBreaker в in-core now.** 2 сценария с `runaway_workflow` / `cost_exceeded`. Для MVP достаточно soft limits в TraceSystem.
- **MemoryBundle в in-core now.** 5 типов памяти сразу. Для MVP достаточно Case Trace Memory. Artifact links, Decision Memory, Preference Memory — это L3+.

### Что недостаточно practically implementable
- **12 компонентов в in-core now** — слишком много для MVP. Нужно явно выделить MVP core (≤7 компонентов) и extended core.

### Термины, требующие уточнения
- **AgentRunner** — это runner конкретного агента или оркестратор, который управляет несколькими агентами? Название suggest single-agent execution.

### Что оставить
- SolveResult envelope, artifact chains, policy hierarchy, Router abstraction.

### Что ослабить / перенести
- **PII subsystem** → conditional (active when PII detected).
- **CircuitBreaker** → conditional (active for L4+ with external calls).
- **MemoryBundle** → split: Case Trace = in-core, остальное = conditional for L3+.

### Что требует evidence или примера
- Нужна диаграмма взаимодействия компонентов для L1, L3, L5.

---

## 2. Developer / DX Reviewer

### Что хорошо
- Progressive configuration path — правильный подход.
- First-class artifacts с lifecycle — хорошая абстракция для extensibility.
- Declarative workflows (YAML) — снижает порог входа.
- Rejected components list — показывает дисциплину.

### Что непонятно
- **Как писать domain pack?** Документ показывает структуру директорий, но не содержит примера `config.yaml`, не объясняет schema для skills/tools/policies.
- **Как добавить новый artifact type?** Нужен template? Schema? Просто YAML?
- **Где граница между Skill и Workflow?** Skill «использует tools + prompts + validation», Workflow «многошаговая оркестрация». Но skill может быть многошаговым. Граница размыта.

### Что выглядит overengineered
- **Artifact lifecycle (created → validated → persisted)** для всех artifacts. Для MVP достаточно created → persisted. Validation — это conditional enhancement.
- **20 first-class artifact types.** Для MVP достаточно 8–10 (Answer, TechnicalSpecification, TaskList, TestPlan, ADR, ReleaseChecklist, ThreatModel, PolicyDecision). Остальные — conditional.

### Что недостаточно practically implementable
- **MemoryBundle с 5 типами памяти** — сложно реализовать и тестировать. Case Trace Memory достаточно для MVP.

### Термины, требующие уточнения
- **Skill** vs **Workflow** — нужно чёткое различие с примерами.
- **Domain pack** — это loaded at runtime или compiled in?

### Что оставить
- Zero config path, declarative workflows, first-class artifacts (subset).

### Что ослабить / перенести
- **Artifact validation** → defer (created → persisted достаточно для MVP).
- **Artifact types** → 8–10 first-class for MVP, остальные conditional.
- **MemoryBundle** → Case Trace only for MVP.

### Что требует evidence или примера
- Пример domain pack `config.yaml`.
- Пример skill definition (YAML).
- Пример workflow definition (YAML).

---

## 3. SRE / Operations Reviewer

### Что хорошо
- TraceSystem как always-core — правильно. Audit необходим даже для L1.
- Failure mode clusters — полезная классификация.
- Circuit breaker — правильная защита от runaway.

### Что непонятно
- **TraceSystem — что это на практике?** Structured events в SQLite? Лог-файлы? Какой retention? Доступен ли пользователю? Документ не объясняет.
- **CaseTrace ID** — это UUID, increment, или composite key (session + timestamp)?

### Что выглядит overengineered
- **CircuitBreaker в in-core now.** Только 2 сценария с runaway workflow (2.5%). Для MVP достаточно hard limits (max steps) в AgentRunner. CircuitBreaker — отдельная подсистема.
- **Observability subsystem deferred, но TraceSystem должен покрыть metrics.** Непротиворечие, но требует уточнения: TraceSystem = structured events, metrics — deferred.

### Что недостаточно practically implementable
- **TraceSystem для L1 fast path.** Если L1 должен быть <500ms, добавление structured logging может увеличить latency. Нужен async/offline logging для L1.

### Термины, требующие уточнения
- **CaseTrace** — ID, запись в БД, или лог-файл?
- **Trace reference** — обязателен в SolveResult, но где хранится?

### Что оставить
- TraceSystem always-core, failure mode clusters.

### Что ослабить / перенести
- **CircuitBreaker** → conditional (L4+ with external calls).
- **TraceSystem L1 path** → async logging to avoid latency.

### Что требует evidence или примера
- Пример trace record / structured event.

---

## 4. Security / Governance Reviewer

### Что хорошо
- Policy hierarchy — стандартная модель, легко аудировать.
- PII subsystem (detector + redactor + verifier) — defense in depth.
- Secrets handling отдельно от PII — правильно.
- Emergency mode = fast-track + logging, не bypass — правильно.

### Что непонятно
- **Hard-deny list содержит `file_write` и `external_send`.** Это значит, что Wolf никогда не пишет файлы и не отправляет данные? Но L4 governed_action включает file write с `file_write_approval`, а L5 — external send с `external_action_approval`. Противоречие.
  - Evidence из `policy-and-gate-findings.md`: hard-deny включает `file_write` и `file_write_without_approval`. То есть `file_write` БЕЗ approval = hard-deny, а С approval = governed action. В draft это потеряно.
  - Аналогично: `external_send` hard-deny, но `external_action_approval` gate существует.
- **PolicyCore назван «core for L4/L5» (23 сценария), но hard-deny работает на всех уровнях.** Если PolicyCore только для L4/L5, то кто проверяет hard-deny на L1–L3?

### Что выглядит overengineered
- **PII subsystem как in-core.** Detector + redactor + verifier — это тяжёлая подсистема, эквивалентная DLP. Для MVP достаточно regex-based detection + redaction для input/output. Verifier — P1.
- **Expert gate для architecture** (только 2 сценария). Можно заменить на block gate + human reviewer designation.

### Что недостаточно practically implementable
- **Policy conflict resolution.** «Более restrictive побеждает» — простое правило, но что при равном restrictiveness? Нужен deterministic tie-breaker (global > domain > scenario > user).

### Термины, требующие уточнения
- **PolicyCore** — это runtime engine, который парсит и исполняет policies? Или библиотека правил?
- **Hard-deny** — «no override» означает, что даже emergency mode не bypass? Да, но нужно явно сказать.

### Что оставить
- Hard-deny для auto_*, secrets, dangerous_shell.
- Policy hierarchy.
- Emergency mode = no bypass.

### Что ослабить / перенести
- **`file_write` / `external_send` hard-deny** → уточнить: hard-deny = без approval gate. С approval = governed action.
- **PII subsystem** → simplified MVP version (detector + redactor), verifier deferred.
- **PolicyCore** → clarify that base policy checking applies to all levels, extended checking for L4+.

### Что требует evidence или примера
- Таблица policy → gate mapping.
- Пример emergency mode flow.

---

## 5. Product / UX Reviewer

### Что хорошо
- Single facade — пользователь не выбирает агентов.
- Refusal with explanation — снижает непредсказуемость.
- Clarification как behavioral mode, а не ошибка.
- Progressive configuration — снижает порог входа.

### Что непонятно
- **Что видит пользователь при L3 plan/dry_run?** Просто текст плана? Или интерактивный UI с approve/reject? Или structured artifact, который можно редактировать? Документ не описывает visible behavior.
- **Что видит пользователь при gate block?** Modal dialog? Inline notification? CLI prompt? Это зависит от interaction surface, но документ молчит.
- **AnswerArtifact для L1.** Пользователю нужен plain text. Structured artifact для аудита — это internal concern. Неясно, зачем пользователь должен знать об `AnswerArtifact`.

### Что выглядит overengineered
- **AnswerArtifact для L1.** 10 сценариев с `Answer` artifact, но для пользователя это просто текст. Для MVP: L1 = plain text rendering, AnswerArtifact = internal only.
- **6 уровней конфигурации** (`zero_config` → `generated_config` → `explicit_config` → `domain_pack` → `custom_workflow` → `custom_plugin`). Пользователь запутается. Достаточно 4: `zero_config` → `generated_config` → `explicit_config` → `domain_pack`. `custom_workflow` — часть `explicit_config`, `custom_plugin` — defer.

### Что недостаточно practically implementable
- **Gate explanation requirement.** «Каждый block gate включает rationale» — хорошо, но кто пишет rationale? LLM? Шаблон? Пользователь? Это влияет на latency и predictability.

### Термины, требующие уточнения
- **Governed action** — что это значит для пользователя? «Wolf попросит одобрения перед записью файлов» — так и нужно писать.
- **Artifact-producing workflow** — пользователь видит прогресс-бар? Или просто ждёт?

### Что оставить
- Single facade, clarification mode, refusal explanation.

### Что ослабить / перенести
- **AnswerArtifact L1** → internal only, user sees plain text.
- **Configuration levels** → collapse custom_workflow into explicit_config, defer custom_plugin.

### Что требует evidence или примера
- UX flow для L1–L4 (CLI или OpenCode).
- Пример gate approval UI.

---

## 6. Integration / MCP Reviewer

### Что хорошо
- MCPWrapper lifecycle — правильная абстракция.
- 6-step overlay — полный и понятный.
- AdapterLayer — правильное разделение concerns.
- Trust scoring native > wrapped > MCP > imported_skill > direct_api.

### Что непонятно
- **MCPWrapper — это что?** MCP client (как в Claude Desktop) или обёртка вокруг стороннего client? Если Wolf сам реализует MCP client, это большой scope. Если обёртка, то кто owns connection?
- **AdapterLayer vs Wrapper.** Adapter «handles auth, schema mapping, error translation». Wrapper «adds trust check, logging, fallback». Adapter — это про schema, Wrapper — про policy. Но на практике они часто merged. Где граница?
- **Fallback action — кто определяет?** Skill author? User? Wolf runtime? Если author, то imported skills нужно валидировать на наличие fallback. Если Wolf — то как Wolf знает fallback для произвольного MCP tool?

### Что выглядит overengineered
- **AdapterLayer как отдельный компонент.** Может быть частью MCPWrapper или Tool registry. 4 сценария — недостаточно для отдельного компонента.
- **6-step overlay для ALL external capabilities.** На практике native tools (file read, context search) не нуждаются в trust scoring. Overlay нужен только для MCP/imported/direct_api.

### Что недостаточно practically implementable
- **«Every external capability must have fallback_action»** — мандат без механизма. Нужен fallback registry? Или fallback — это «вернуть PartialResult»?

### Термины, требующие уточнения
- **Wrapper** vs **Adapter** — merge или keep separate?
- **External capability** — включает ли это wrapped native tools?

### Что оставить
- 6-step overlay, trust scoring, MCPWrapper lifecycle.

### Что ослабить / перенести
- **AdapterLayer** → merge into MCPWrapper or Tool registry.
- **6-step overlay** → apply only to non-native capabilities.

### Что требует evidence или примера
- Пример MCP capability registration с fallback.
- Пример adapter/wrapper interaction.

---

## 7. Domain Pack / Extensibility Reviewer

### Что хорошо
- Domain pack как bundle — правильная абстракция.
- Composition rules для 2-domain cases.
- Explicit defer of DomainPackCoordinator.
- Structure (config/skills/tools/artifacts/policies/gates/personas/workflows) — полный и понятный.

### Что непонятно
- **Как domain pack загружается?** Auto-discovery по директории? Explicit load командами? Wolf сам определяет нужный pack по запросу? Для `zero_config` Wolf должен работать без pack, но `domain_pack` используется в 55 сценариях. Как происходит переключение?
- **Personas — что это?** Набор prompts? System messages? Agent definitions? Не определено в документе.

### Что выглядит overengineered
- **12 domain packs.** Для MVP достаточно 2–3 (software-engineering, architecture, legal-ops или security-compliance). Остальные — community или post-MVP.
- **Custom workflow как отдельный уровень конфигурации.** Это часть `explicit_config` или `domain_pack`, не отдельный уровень.

### Что недостаточно practically implementable
- **Policy union для cross-domain.** «Conservative resolution» — простое правило, но как объединяются gate definitions? Что если domain A требует `block`, а domain B — `notify`? Нужен deterministic rule.

### Термины, требующие уточнения
- **Domain pack** vs **Configuration** — когда пользователь пишет config, а когда загружает pack?
- **Persona** — определение отсутствует.

### Что оставить
- Domain pack bundle structure, composition rules.

### Что ослабить / перенести
- **Number of packs for MVP** → 2–3 core packs.
- **Custom_workflow** → merge into explicit_config/domain_pack.

### Что требует evidence или примера
- Пример policy union для cross-domain.
- Пример persona definition.

---

## 8. Skeptical Implementer

### Что хорошо
- Evidence-based decisions — каждое major решение подкреплено count из Scenario Lab.
- Rejected components list — показывает, что авторы не пытаются впихнуть всё.
- Progressive configuration — реалистичный путь.

### Что непонятно
- **Где граница между Wolf и OpenCode/Claude Code/VS Code?** Wolf — это plugin? Standalone runtime? Wrapper вокруг существующего? Если Wolf заменяет существующие инструменты, это +2 года работы. Если использует их как substrate, scope меньше, но архитектура другая. Документ не объясняет.
- **«Agentic control plane» — маркетинг или архитектура?** Что конкретно означает «control plane»? Kubernetes-style control plane (desired state + reconciliation)? Или просто «оркестратор»?

### Что выглядит overengineered
- **Весь MVP scope.** 12 компонентов в in-core now, 20 artifact types, PII subsystem, 5 типов памяти, policy hierarchy, gate severity model, circuit breaker — это система на 2–3 года командой из 5–10 человек. Для MVP нужен proof-of-concept с 3–4 компонентами.
- **MemoryBundle с citation и freshness для каждого read.** Это +50% latency на каждый запрос. Пользователь не будет ждать 3 секунды ради citation check.

### Что недостаточно practically implementable
- **Artifact linking через Artifact Link Memory.** Требует graph database или complex SQL. Для MVP достаточно foreign keys в ArtifactStore.
- **Version-based freshness для artifacts.** Требует versioning system. Для MVP time-based достаточно.

### Термины, требующие уточнения
- **Agentic control plane** — конкретное определение или метафора?
- **Runtime assembler** — что собирается? Когда? Как часто?

### Что оставить
- Core idea: facade + policy + artifact.
- SolveResult envelope.

### Что ослабить / перенести
- **MVP scope** → явно определить MVP boundary (4 компонента, 5 artifact types, zero_config + generated_config).
- **PII subsystem** → defer or simplified.
- **MemoryBundle** → Case Trace only for MVP.
- **Artifact links** → foreign keys, не graph memory.

### Что требует evidence или примера
- MVP scope definition (boundary, not roadmap).
- Пример: «Wolf запущен внутри OpenCode. Пользователь пишет запрос. Что происходит?»

---

## Cross-Cutting Findings

### Понятность концепции
- Можно понять за 5 минут? **Частично.** Executive Summary хорош, но не хватает одного end-to-end примера. «Объясни spec-first» (L1) vs «Создай TechnicalSpecification и разбей на задачи» (L3) — как это выглядит в Wolf?
- Достаточно ли ясно, что это не coding agent? **Нет.** Problem Statement упоминает coding tools, но не подчёркивает, что Wolf — это НЕ replacement для Copilot/Claude Code, а control plane поверх них.
- Ясно ли facade + control plane + runtime assembler? **Да.** Executive Summary и Design Principles объясняют хорошо.

### Реализуемость
- Scope выглядит большим. **Да.** 12 компонентов in-core now — это много.
- Нужно явное разделение MVP / later. **Да.** Без roadmap, но с MVP boundary.
- Компоненты, которые можно оставить концептуально, но не требовать сразу: PII verifier, artifact archival, DomainPackCoordinator, custom plugin, A2A.

### Core Boundaries
- In-core now перегружен. **Да.** Нужно выделить MVP Core (≤7 компонентов).
- Conditional / deferred разделены правильно в целом, но PII subsystem и CircuitBreaker должны быть conditional.

### Artifact Model
- SolveResult / ArtifactStore / Artifact различие ясно. **Да.**
- Execution_result и artifacts.outputs не дублируются. **Нет.** Но нужно уточнить, что `AnswerArtifact` на L1 — internal.
- Artifact chains хорошо объяснены. **Да.**

### Policy Model
- Hard-deny, gate severity, hierarchy — конкретны. **Нет.** Hard-deny для `file_write` и `external_send` противоречит L4/L5.
- Block vs expert_gate отличие ясно. **Да.**
- Emergency mode хорошо объяснён. **Да.**

### Capability Model
- Различие Tool/Skill/Workflow/Agent/Adapter/Wrapper/Domain Pack — ясно. **Да, но** Skill vs Workflow граница размыта.
- External/imported skills — поддержка объяснена. **Да.**
- Policy overlay — объяснён. **Да.**

### Memory Model
- Memory не выглядит слишком сложной? **Нет.** 5 типов памяти сразу — overkill.
- «Не uncontrolled RAG» — достаточно ясно? **Да.**
- Artifact links и freshness/citation — хорошо. **Да.**

### Configuration Model
- Progressive path ясен. **Да.**
- Domain_pack 68.75% vs zero_config 15% — не создаёт ли впечатление слабости zero_config? **Да.** Нужно уточнить, что domain_pack может быть loaded by default.
- Configuration hell защищён? **Частично.** Progressive disclosure есть, но 6 уровней — много.

### Missing Examples
- End-to-end пример: **нужен** в Executive Summary или отдельном разделе.
- Диаграмма: **нужна** (component interaction).
- Таблица терминов: **нужна**.
- Пример SolveResult: **нужен**.
- Пример domain pack: **нужен**.

### Contradictions / Inconsistencies
1. **`file_write` / `external_send` hard-deny vs L4/L5 governed_action.** Hard-deny list должен уточнять: без approval gate. Evidence: `policy-and-gate-findings.md` различает `file_write` и `file_write_without_approval`.
2. **PolicyCore = core for L4/L5, но hard-deny на всех уровнях.** Если PolicyCore только L4/L5, кто проверяет hard-deny на L1–L3? Нужно уточнить: base policy checking = always-core, extended gates = L4/L5.
3. **AnswerArtifact для L1 = internal, но документ говорит «renders as plain text».** Если plain text, зачем internal artifact? Нужно уточнить: internal for audit/trace, user sees plain text.
4. **Zero_config 12 сценариев, но первый useful product должен работать на zero_config.** 15% — достаточно для proof-of-concept, но не для «useful product». Нужно уточнить: zero_config = L1–L2 answers, generated_config = L2–L3 context-aware.
5. **MemoryBundle in-core now, но artifact links нужны только для L3+.** Case Trace = in-core, остальное = conditional.
6. **Configuration distribution суммируется >100%.** Domain pack 68.75% + explicit_config 35% + generated_config 37.5% = >100%. Потому что domain pack и explicit_config могут пересекаться (explicit config может load domain pack). Нужно уточнить, что это не mutually exclusive.

---

*Ревью проведено на основе Scenario Lab evidence. Новые идеи не предложены.*
