# Concept v2 Issues — Categorized Findings

**Date:** 2026-05-05
**Source:** Concept v2 Expert Review Pass (8 roles)
**Scope:** `generated/concept-v2-draft.md`

---

## must fix before publishing

### MF-1: Hard-deny `file_write` / `external_send` противоречит L4/L5 governed_action
- **Section:** 8. Policy and Gate Model / Hard-deny rules
- **Problem:** `file_write` и `external_send` в hard-deny list означают «всегда запрещено, без исключений». Но L4 governed_action включает file write с `file_write_approval` gate, а L5 — external send с `external_action_approval`. Это внутреннее противоречие.
- **Evidence:** `policy-and-gate-findings.md` различает `file_write` и `file_write_without_approval` в hard-deny list. Только `file_write_without_approval` = always deny. С approval gate = governed action.
- **Fix:** Уточнить hard-deny: `file_write` → `file_write_without_approval`, `external_send` → `external_send_without_approval` или `unauthorized_external_send`. Добавить пояснение: hard-deny = действие без mandatory approval gate.

### MF-2: PolicyCore описан как «core for L4/L5», но hard-deny применяется на всех уровнях
- **Section:** 5. Runtime Architecture + 8. Policy and Gate Model
- **Problem:** Если PolicyCore только для L4/L5 (23 сценария), то кто проверяет hard-deny на L1–L3? Без PolicyCore L1–L3 незащищены.
- **Evidence:** Hard-deny policies встречаются во всех доменах и на всех уровнях. `personal_data_exposure` может произойти на L2 (context-aware answer читает резюме).
- **Fix:** Разделить PolicyCore на base (always-core, hard-deny + basic checks) и extended (L4/L5, gates + approvals). Или переименовать: PolicyCore = always-core, GateManager = L4/L5 conditional.

### MF-3: In-core now перегружен — 12+ компонентов для MVP
- **Section:** 14. Scope Boundaries / in-core now
- **Problem:** MVP с 12 компонентами (включая PII subsystem, CircuitBreaker, MemoryBundle) — слишком большой scope. Skeptical implementer прав: это 2–3 года работы.
- **Evidence:** PII subsystem — 10 сценариев из 80. CircuitBreaker — 2 сценария. MemoryBundle artifact links — требуются только для L3+.
- **Fix:** Выделить **MVP Core** (≤7 компонентов): WolfFacade, ContextResolver, AgentRunner, TraceSystem, ScenarioRouter, ArtifactStore (basic), PolicyCore (base). Всё остальное — conditional или deferred.

### MF-4: PII subsystem не должен быть in-core now
- **Section:** 5. Runtime Architecture / conditional + 14. Scope Boundaries
- **Problem:** PII subsystem (detector + redactor + verifier) в in-core now — overkill. PII relevant только для 5 доменов из 12+. Для software-engineering базовых сценариев PII не нужен.
- **Evidence:** `policy-and-gate-findings.md`: `pii_handling_gate` — 7 occurrences, `secrets_handling_gate` — 4. Всего 11 сценариев из 80.
- **Fix:** PII subsystem → **conditional** (активируется при обнаружении PII-паттернов или в доменах legal/HR/finance/security). Для MVP: simplified detector + redactor, verifier deferred.

### MF-5: Конфигурационные уровни суммируются >100%, создавая путаницу
- **Section:** 12. Configuration Model + 15. Evidence Appendix
- **Problem:** Domain pack 68.75% + explicit_config 35% + generated_config 37.5% = >100%. Читатель думает, что это mutually exclusive категории, но они пересекаются.
- **Evidence:** `concept-extraction-pass.md` показывает distribution без указания mutual exclusivity.
- **Fix:** Уточнить, что уровни — это modes, а не disjoint sets. Domain pack может быть loaded в generated_config режиме. Привести Venn-диаграмму или таблицу пересечений.

### MF-6: Skill vs Workflow — граница нечёткая
- **Section:** 9. Capability Model
- **Problem:** «Skill = domain logic + tools», «Workflow = multi-step orchestration». Но skill может быть многошаговым (например, `software.project_review` может включать чтение файлов, анализ, генерацию отчёта). Где граница?
- **Evidence:** `skill-tool-adapter-distinction.md`: skill — «combines tools + prompts + validation», workflow — «multi-step orchestration with conditional logic, gates, artifact passing». Различие в conditional logic и gates, но в draft это не подчёркнуто.
- **Fix:** Добавить чёткое различие: **Skill** = reusable logic unit (function-like). **Workflow** = orchestration graph (DAG) с artifact passing и gates. Skill может вызываться из workflow, но не наоборот.

### MF-7: Отсутствует определение MVP boundary
- **Section:** Весь документ
- **Problem:** Документ описывает полную систему, но не определяет, что является MVP, а что — deferred. Skeptical implementer не может оценить scope.
- **Evidence:** Concept v2 change list различает P0/P1/P2, но draft не использует эту классификацию.
- **Fix:** Добавить в Scope Boundaries явный **MVP Boundary** — список компонентов, artifact types, configuration modes, которые необходимы для первого useful product. Без roadmap, просто boundary.

### MF-8: AnswerArtifact для L1 — внутренний или пользовательский?
- **Section:** 7. Artifact Model / Universal + 4. Core Behavioral Model / simple_answer
- **Problem:** Документ говорит, что L1 производит `AnswerArtifact`, но рендерит как plain text. Непонятно, видит ли пользователь структуру или только текст. Если только текст, зачем «first-class artifact»?
- **Evidence:** `artifact-taxonomy-findings.md`: `Answer` — 10 occurrences (SE: 2). Но это просто ответ, не структурированный документ.
- **Fix:** Уточнить: `AnswerArtifact` = internal representation for audit/trace/linking. User-visible rendering = plain text. AnswerArtifact не «первый класс» в том же смысле, что `TechnicalSpecification`.

---

## should fix

### SF-1: Нет end-to-end примера
- **Section:** Весь документ
- **Problem:** Документ требует примеров, но содержит только абстракции. Новичок не поймёт, как Wolf работает на практике.
- **Fix:** Добавить 2–3 коротких примера: L1 («Объясни spec-first»), L3 («Создай TechnicalSpecification»), L4 («Примени implementation plan»).

### SF-2: Нет примера SolveResult
- **Section:** 6. SolveResult / ExecutionResult Model
- **Problem:** YAML schema хороша, но без примера неясно, как выглядит PartialResult или Refusal.
- **Fix:** Добавить 2–3 примера SolveResult (Answer, Refusal, PartialResult).

### SF-3: Нет примера domain pack
- **Section:** 10. Domain Pack Model
- **Problem:** Структура директорий показана, но без примера `config.yaml` неясно, что писать.
- **Fix:** Добавить минимальный пример `software-engineering/config.yaml`.

### SF-4: Нет таблицы терминов
- **Section:** Весь документ
- **Problem:** 20+ терминов: envelope, facade, control plane, artifact chain, gate severity, policy overlay, etc. Читатель запутается.
- **Fix:** Добавить Glossary в конце или в начале.

### SF-5: ModelRouter и Router — порядок вызова неяснен
- **Section:** 5. Runtime Architecture
- **Problem:** ModelRouter выбирает модель, Router выбирает сценарий. Кто первый? Если Router определяет L5, ModelRouter должен выбрать reasoning model. Но ModelRouter описан только для L1–L2.
- **Fix:** Уточнить: ModelRouter = always-core, выбирает модель на основе scenario level. Router выбирает сценарий. ModelRouter зависит от Router.

### SF-6: ContextResolver — механизм не описан
- **Section:** 5. Runtime Architecture
- **Problem:** «Собирает контекст из репозитория, документов, meeting notes, artifact store». Как? RAG? Structured query? Иерархический crawl?
- **Fix:** Добавить high-level description: bounded context window + progressive disclosure + structured queries (не semantic search by default).

### SF-7: CircuitBreaker должен быть conditional, не in-core
- **Section:** 5. Runtime Architecture + 13. Failure Modes
- **Problem:** CircuitBreaker в in-core now, но нужен только для L5 (2 сценария). Для MVP достаточно hard limits в AgentRunner.
- **Fix:** CircuitBreaker → conditional (active when external calls > threshold).

### SF-8: Artifact lifecycle validation — defer
- **Section:** 7. Artifact Model
- **Problem:** `created → validated → persisted` — validation требует schema definitions для каждого artifact type. Для MVP достаточно `created → persisted`.
- **Fix:** Validation → conditional/deferred. MVP: basic format check only.

### SF-9: MemoryBundle — разделить на MVP и extended
- **Section:** 11. Memory Model + 14. Scope Boundaries
- **Problem:** 5 типов памяти сразу. Case Trace — universal, остальное — L3+.
- **Fix:** Case Trace Memory = in-core. Artifact Link Memory, Decision Memory, Preference Memory = conditional (L3+). Stale Detection = conditional.

### SF-10: Custom_workflow — merge into explicit_config
- **Section:** 12. Configuration Model
- **Problem:** 6 уровней конфигурации — много. Custom_workflow (5 сценариев) — это часть explicit_config.
- **Fix:** Collapse custom_workflow into explicit_config. Оставить 5 уровней: zero → generated → explicit → domain_pack → custom_plugin.

---

## optional polish

### OP-1: Добавить диаграмму архитектуры
- **Section:** 5. Runtime Architecture
- **Problem:** Текстовое описание 15+ компонентов сложно держать в голове.
- **Fix:** ASCII diagram или Mermaid diagram компонентов и потоков данных.

### OP-2: Добавить пример gate approval flow
- **Section:** 8. Policy and Gate Model
- **Problem:** Непонятно, что видит пользователь при block gate.
- **Fix:** Краткий UX flow: запрос → gate triggered → rationale shown → user approves/rejects → Wolf proceeds.

### OP-3: Уточнить emergency policy subset
- **Section:** 8. Policy and Gate Model / Emergency mode
- **Problem:** «Emergency_policy relaxes routing latency» — что именно relaxes? Timeout? Model selection? Parallel processing?
- **Fix:** Добавить 2–3 конкретных relaxation (например, skip clarification, use faster model, parallel context resolution).

### OP-4: Добавить пример policy conflict resolution
- **Section:** 8. Policy and Gate Model / Policy conflicts
- **Problem:** «Более restrictive побеждает» — простое правило, но не хватает примера.
- **Fix:** Пример: global `external_send` = block, domain `external_send` = notify → result = block.

### OP-5: Улучшить Problem Statement — подчеркнуть, что Wolf не coding agent
- **Section:** 2. Problem Statement
- **Problem:** Читатель может подумать, что Wolf — очередной Copilot/Claude Code.
- **Fix:** Добавить explicit distinction: «Wolf не заменяет IDE или LLM. Wolf — это control plane, который оркестрирует существующие инструменты с соблюдением политик.»

---

## defer (не блокирует публикацию)

### DF-1: Artifact archival
- **Section:** 7. Artifact Model
- **Problem:** Уже deferred в документе. Нет проблемы.

### DF-2: DomainPackCoordinator
- **Section:** 10. Domain Pack Model
- **Problem:** Уже deferred. Нет проблемы.

### DF-3: A2A protocol support
- **Section:** 14. Scope Boundaries
- **Problem:** Уже deferred. Нет проблемы.

### DF-4: Multi-language support
- **Section:** 14. Scope Boundaries
- **Problem:** Уже deferred. Нет проблемы.

### DF-5: Custom plugin framework
- **Section:** 12. Configuration Model
- **Problem:** Уже deferred. Но может быть полностью удалён из концепции (0 сценариев).

### DF-6: PII verifier
- **Section:** 8. Policy and Gate Model / PII subsystem
- **Problem:** Verifier — третий компонент PII subsystem. Для MVP достаточно detector + redactor.
- **Fix:** Verifier → deferred. Документ уже говорит simplified MVP version.

### DF-7: Expert gate auto-escalation
- **Section:** 8. Policy and Gate Model / Gate severity
- **Problem:** «Repeated notify escalates to block» — хорошая идея, но сложная в реализации. Требует session state и action type classification.
- **Fix:** Оставить в концепции, но отметить как deferred implementation detail.

### DF-8: Artifact versioning
- **Section:** 11. Memory Model
- **Problem:** Version-based freshness для artifacts. Требует versioning system.
- **Fix:** Time-based freshness для MVP. Version-based → deferred.

---

*Issues extracted from 8-role expert review. No new ideas introduced.*
