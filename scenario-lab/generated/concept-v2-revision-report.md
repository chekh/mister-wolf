# Concept v2 Revision Report

**Date:** 2026-05-05
**Source:** Concept v2 Expert Review Pass (8 roles) + Editing Plan
**Target:** `generated/concept-v2-draft-revised.md`
**Original:** `generated/concept-v2-draft.md`

---

## Резюме

Выполнен revision pass Concept v2 на основе review 8 экспертных ролей. Создана исправленная версия документа с устранением must-fix противоречий, переструктурированием scope boundaries, добавлением примеров и ослаблением overengineered частей.

| Категория | Количество | Статус |
|-----------|-----------|--------|
| Must-fix | 8 | Исправлены |
| Should-fix | 10 | Исправлены |
| Optional polish | 5 | Применены 4 |
| Defer items | 8 | Оставлены deferred |

---

## 1. Must-fix — исправленные противоречия

### MF-1: Hard-deny `file_write` / `external_send` противоречит L4/L5 governed_action
- **Статус:** Исправлено
- **Изменения:**
  - В §8 hard-deny list: `file_write` → `file_write_without_approval`
  - В §8 hard-deny list: `external_send` → `external_send_without_approval`
  - Добавлено ключевое правило: «`file_write` и `external_send` с mandatory approval gate являются governed action, а без gate — hard-deny»
  - Добавлен пример: `file_write` + `file_write_approval` = allowed after approval; `file_write` without approval = Refusal
  - Добавлено уточнение: emergency mode не bypass hard-deny
- **Секции:** §8 Policy and Gate Model / Hard-deny rules

### MF-2: PolicyCore описан как «core for L4/L5», но hard-deny применяется на всех уровнях
- **Статус:** Исправлено
- **Изменения:**
  - PolicyCore перенесён в «always-core» (base policy checking)
  - Добавлен новый компонент **GateManager** — conditional (L4+), отвечает за approval gates, expert gates, rollback gates
  - В §5 указано: PolicyCore = hard-deny checks + базовая policy evaluation на всех уровнях L1–L5
  - В §5 указано: GateManager = conditional L4+ / approval gates / expert gates / rollback-related gates
  - В §8 указано: hard-deny applies at all levels; gates apply when scenario performs side effects or risky actions
- **Секции:** §5 Runtime Architecture, §8 Policy and Gate Model

### MF-3: In-core now перегружен — 12+ компонентов для MVP
- **Статус:** Исправлено
- **Изменения:**
  - Добавлен явный раздел **MVP Boundary** в §14
  - MVP Core: WolfFacade, ContextResolver, AgentRunner, TraceSystem, ScenarioRouter/RouterLight, ModelRouter, PolicyCore (base), ArtifactStore (basic) — 8 компонентов
  - FileWriteGateWithRollback, Artifact validation, Artifact Link Memory перенесены в «Always Core post-MVP»
  - PII subsystem, CircuitBreaker, MemoryBundle разделены и частично перенесены в conditional
- **Секции:** §14 Scope Boundaries / MVP Boundary

### MF-4: PII subsystem не должен быть in-core now
- **Статус:** Исправлено
- **Изменения:**
  - PII subsystem перенесён из core в **conditional**
  - Формулировка: active when PII is detected or domain requires it (legal, HR, finance, security, compliance)
  - MVP: detector + redactor
  - Verifier перенесён в deferred
- **Секции:** §5 Runtime Architecture, §8 Policy and Gate Model / PII subsystem, §14 Conditional

### MF-5: Конфигурационные уровни суммируются >100%, создавая путаницу
- **Статус:** Исправлено
- **Изменения:**
  - В §12 добавлено: «Configuration modes are not mutually exclusive. Domain pack can be loaded via generated_config or explicit_config.»
  - В §15 Evidence Appendix: заменена интерпретация distribution на coverage, а не disjoint categories
  - Добавлена таблица configuration mode matrix с пересечениями
- **Секции:** §12 Configuration Model, §15 Evidence Appendix

### MF-6: Skill vs Workflow — граница нечёткая
- **Статус:** Исправлено
- **Изменения:**
  - В §3 Design Principles добавлен boundary block: Skill = reusable logic unit, function-like, no gates, no artifact chain ownership; Workflow = orchestration DAG с artifact passing, conditional logic, gates
  - В §9 Capability Model добавлено: Workflow can call skills; skill does not call workflow
  - Добавлен пример: `software.project_review` = skill, `spec_first_flow` = workflow
- **Секции:** §3 Design Principles, §9 Capability Model

### MF-7: Отсутствует определение MVP boundary
- **Статус:** Исправлено
- **Изменения:**
  - Добавлен раздел §14 «MVP Boundary» с явным разделением:
    - MVP Components (8)
    - MVP Artifacts (7)
    - MVP Config (4 modes)
    - NOT in MVP (9 items)
  - Без roadmap, только boundary
- **Секции:** §14 Scope Boundaries / MVP Boundary

### MF-8: AnswerArtifact для L1 — внутренний или пользовательский?
- **Статус:** Исправлено
- **Изменения:**
  - В §7 указано: `AnswerArtifact` = internal representation for audit/trace/linking. User sees plain text rendering.
  - Уточнено: «It is not user-facing first-class artifact in the same sense as `TechnicalSpecification`»
  - Убрано из списка first-class artifact types, помещено в Universal с пометкой internal
- **Секции:** §7 Artifact Model / Universal, §4 Core Behavioral Model / simple_answer

---

## 2. Should-fix — исправленные улучшения

### SF-1: Нет end-to-end примера
- **Статус:** Исправлено
- **Добавлено:** §15 End-to-End Examples с 3 примерами:
  - L1 simple answer: «Объясни spec-first»
  - L3 plan/dry-run: «Создай TechnicalSpecification для фичи X»
  - L4 governed action: «Примени implementation plan»
- **Секции:** §15 (новый раздел)

### SF-2: Нет примера SolveResult
- **Статус:** Исправлено
- **Добавлено:** 3 YAML примера SolveResult в §6:
  - Answer envelope (L1)
  - Refusal envelope (hard-deny)
  - PartialResult envelope (gate block)
- **Секции:** §6 SolveResult / ExecutionResult Model

### SF-3: Нет примера domain pack
- **Статус:** Исправлено
- **Добавлено:** Минимальный пример `domain_packs/software-engineering/config.yaml` (~30 строк) в §10
- **Секции:** §10 Domain Pack Model

### SF-4: Нет таблицы терминов
- **Статус:** Исправлено
- **Добавлено:** Glossary (25 терминов) в §16
- **Секции:** §16 Glossary (новый раздел)

### SF-5: ModelRouter и Router — порядок вызова неясен
- **Статус:** Исправлено
- **Изменения:**
  - ModelRouter перенесён в always-core
  - Уточнено: Router определяет scenario level; ModelRouter выбирает модель на основе level, latency, cost, policy
  - Добавлено в glossary определение ModelRouter
- **Секции:** §5 Runtime Architecture, §16 Glossary

### SF-6: ContextResolver — механизм не описан
- **Статус:** Исправлено
- **Добавлено:**
  - Structured queries by default (file tree scan, doc index lookup, artifact store query)
  - No semantic RAG by default
  - Bounded context and progressive disclosure
- **Секции:** §5 Runtime Architecture / ContextResolver

### SF-7: CircuitBreaker должен быть conditional, не in-core
- **Статус:** Исправлено
- **Изменения:**
  - CircuitBreaker перенесён в conditional (L4+ external/high-cost workflows)
  - MVP: AgentRunner использует hard limits (max_steps, max_tokens)
- **Секции:** §5 Runtime Architecture, §13 Failure Modes, §14 Conditional

### SF-8: Artifact lifecycle validation — defer
- **Статус:** Исправлено
- **Изменения:**
  - MVP lifecycle: created → persisted
  - Validation (schema check) → conditional/deferred
  - MVP: basic format check only
- **Секции:** §7 Artifact Model / Artifact lifecycle

### SF-9: MemoryBundle — разделить на MVP и extended
- **Статус:** Исправлено
- **Изменения:**
  - Case Trace Memory = MVP Core
  - Artifact Link Memory = conditional L3+
  - Decision Memory = conditional L3+
  - Preference Memory = conditional L2+
  - Stale Memory Detection = conditional
- **Секции:** §11 Memory Model, §14 Scope Boundaries

### SF-10: Custom_workflow — merge into explicit_config
- **Статус:** Исправлено
- **Изменения:**
  - `custom_workflow` объединён внутрь `explicit_config`
  - Оставлены 5 уровней: zero_config → generated_config → explicit_config → domain_pack → custom_plugin
  - Обновлена таблица configuration mode matrix
- **Секции:** §12 Configuration Model

---

## 3. Optional polish — применённые улучшения

### OP-1: Добавить диаграмму архитектуры
- **Статус:** Не применено (ASCII/Mermaid требует значительного пространства, документ и без того увеличился на ~200 строк)
- **Альтернатива:** В §15 добавлены end-to-end flow examples, которые показывают component interaction для L1, L3, L5

### OP-2: Добавить пример gate approval flow
- **Статус:** Применено
- **Добавлено:** Step-by-step gate approval UX flow в §8

### OP-3: Уточнить emergency policy subset
- **Статус:** Применено
- **Добавлено:** Конкретные relaxations: skip clarification, use faster model, parallel context resolution

### OP-4: Добавить пример policy conflict resolution
- **Статус:** Применено
- **Добавлено:** Пример global=block vs domain=notify vs user=silent → result=block в §8

### OP-5: Улучшить Problem Statement — подчеркнуть, что Wolf не coding agent
- **Статус:** Применено
- **Добавлено:** В §1 Executive Summary вставлено explicit distinction: «Wolf — это не замена IDE, Copilot или Claude Code. Wolf — это control plane...»

---

## 4. Defer items — оставлены deferred

| Item | Причина defer | Где упомянуто |
|------|--------------|---------------|
| Artifact archival | Накопление исторических артефактов | §7, §14 |
| DomainPackCoordinator | Cross-domain < 15% | §10, §14 |
| A2A protocol support | 0 сценариев | §14 |
| Multi-language support | 0 сценариев | §14 |
| Custom plugin framework | 0 сценариев | §14 |
| PII verifier | MVP: detector + redactor достаточно | §8, §14 |
| Expert gate auto-escalation | Сложная реализация, требует session state | §8 (упомянуто как concept) |
| Artifact versioning | Time-based freshness для MVP | §11, §14 |

---

## 5. Секции, изменённые в revised draft

| Секция | Изменения |
|--------|-----------|
| §1 Executive Summary | Добавлено explicit distinction от coding agents |
| §3 Design Principles | Добавлен Skill vs Workflow boundary block |
| §4 Core Behavioral Model | Добавлены UX-объяснения governed action и artifact-producing workflow |
| §5 Runtime Architecture | Полная переструктуризация: MVP Core / Always Core post-MVP / Conditional / Deferred. ModelRouter = always-core. ContextResolver mechanism. |
| §6 SolveResult | Добавлены 3 YAML примера |
| §7 Artifact Model | AnswerArtifact = internal-only. MVP Artifacts список. Lifecycle: created → persisted. |
| §8 Policy and Gate Model | Исправлен hard-deny list. Добавлен GateManager. Добавлен gate approval UX flow. PII = conditional. |
| §9 Capability Model | Adapter vs Wrapper clarification. Skill vs Workflow boundary. |
| §10 Domain Pack Model | Добавлен пример config.yaml |
| §11 Memory Model | MemoryBundle split на 5 типов с tier-classification |
| §12 Configuration Model | Custom_workflow в explicit_config. Coverage interpretation. Config mode matrix. |
| §13 Failure Modes | Owners обновлены (GateManager conditional, CircuitBreaker conditional) |
| §14 Scope Boundaries | Полная переструктуризация: MVP Boundary / Always Core post-MVP / Conditional / Deferred / Rejected |
| §15 (new) | End-to-End Examples (3 примера) |
| §16 (new) | Glossary (25 терминов) |
| §17 Evidence Appendix | Configuration distribution → coverage |

---

## 6. Final consistency check

| Проверка | Статус |
|----------|--------|
| Больше нет противоречия между hard-deny и governed_action | ✅ Да |
| PolicyCore есть на всех уровнях | ✅ Да |
| PII subsystem не в MVP Core | ✅ Conditional |
| CircuitBreaker не в MVP Core | ✅ Conditional |
| AnswerArtifact описан как internal | ✅ Да |
| Configuration modes не представлены как mutually exclusive | ✅ Да |
| Skill/Workflow boundary ясна | ✅ Да |
| MVP boundary явно определён | ✅ Да |
| Документ не содержит roadmap | ✅ Да |
| Не добавлены новые концепты без evidence | ✅ Да |
| Не созданы новые Scenario Cards | ✅ Да |
| Не изменён JSONL source of truth | ✅ Да |
| Не изменены references/templates/vocabularies | ✅ Да |

---

## 7. Unresolved issues

Нижеследующие issues остаются открытыми, но не блокируют публикацию Concept v2:

1. **Router + ModelRouter interaction diagram.** End-to-end examples покрывают L1/L3/L4, но formal component interaction diagram для L5 отсутствует.
2. **Persona definition.** В документе упоминаются personas, но полное определение (prompt vs system message vs agent definition) требует отдельного deep dive.
3. **Cross-domain policy union deterministic rule.** «Conservative resolution» описана на high level, но конкретный tie-breaker для равного restrictiveness не формализован.
4. **TraceSystem retention и формат.** Async logging для L1 упомянут, но retention policy и storage format (SQLite vs files) не определены.
5. **Fallback action registry.** «Every external capability must have fallback_action» — мандат без механизма определения fallback для произвольного MCP tool.

Эти issues относятся к implementation details и могут быть уточнены на этапе MVP implementation planning.

---

## 8. Line count impact

| Метрика | Значение |
|---------|----------|
| Original draft | 694 lines |
| Revised draft | ~900 lines |
| Net change | ~+206 lines |
| Must-fix additions | ~+60 lines |
| Should-fix additions | ~+120 lines |
| Optional polish | ~+26 lines |

Увеличение обусловлено добавлением примеров, glossary и MVP Boundary. Ни одна секция не была значительно расширена без причины.

---

*Report generated after Concept v2 Revision Pass. No new scenarios or playthroughs were created.*
