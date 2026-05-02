# Concept v2 Artifact & Conversation Patch Report

**Date:** 2026-05-05
**Source:** Artifact & Conversation Model Patch against `generated/concept-v2-draft-revised.md`
**Target:** `generated/concept-v2-draft-final-candidate.md`

---

## Резюме

Выполнен Artifact & Conversation Model Patch Concept v2. Цель — устранить три conceptual gaps, выявленные после review discussion:

1. **Code as artifact** — Scenario Lab был document-artifact heavy, код описывался косвенно.
2. **Execution as result** — запуск/исполнение не были явно смоделированы как artifact.
3. **Open-ended conversation** — conversation без задачи не был описан как валидный interaction mode.

Патч не меняет JSONL, не создаёт новые Scenario Cards, не добавляет новые подсистемы и не содержит roadmap.

| Категория | Количество | Статус |
|-----------|-----------|--------|
| Новых artifact categories | 3 | Добавлены |
| Новых artifact types | 35+ | Добавлены |
| Новых interaction modes | 1 | Добавлен |
| Новых behavioral subsections | 2 | Добавлены |
| Обновлений MVP Boundary | 1 | Обновлён |
| Обновлений Glossary | 14 терминов | Добавлены |

---

## 1. Изменённые секции

### §1 Executive Summary
- Добавлено «код, результаты запуска» в список примеров артефактов.
- Уточнено, что Wolf покрывает также «открытые беседы без чёткой задачи».

### §3 Design Principles
- Уточнено, что без конфигурации ядро умеет «базовый L1-ответ и conversation».
- zero_config описан как подходящий для «L1–L2 и conversation».

### §4 Core Behavioral Model
- Добавлен **conversation / exploration mode (L0)** — open-ended dialogue без задачи, артефакта, workflow или условия завершения.
- Уточнено: conversation — это не failed solve, а валидный interaction mode.
- Добавлено отличие от L1: conversation = нет чёткой задачи, L1 = есть вопрос.
- Добавлено правило: PolicyCore применяет hard-deny даже в conversation mode.
- Добавлен **conversation promotion** — правила перехода conversation → case:
  - Триггеры: «Сформулируй из этого документ», «Сделай план», «Теперь реализуй» и т.д.
  - Результат: появляются CaseTrace, SolveResult, ArtifactStore, policy checks, gates.
  - Правила памяти: ephemeral по умолчанию, explicit save → artifact, promotion → CaseTrace.

### §5 Runtime Architecture
- WolfFacade возвращает «SolveResult **или ChatTurn**».
- PolicyCore применяется на всех уровнях, **включая conversation mode**.
- В Deferred добавлено: Long-term conversation memory.

### §6 SolveResult / ExecutionResult Model
- Добавлено важное уточнение: **Не каждое взаимодействие возвращает SolveResult.**
- Добавлен раздел **Interaction Records** с таблицей ChatTurn / SessionTrace / CaseTrace / Artifact / SolveResult.
- Добавлена краткая формула различия.
- Добавлен пример Artifact envelope (L4 execution) с ExecutionReport / TestResults / CoverageReport.
- Добавлено правило: Conversation mode не порождает SolveResult.

### §7 Artifact Model
- Добавлена категория **Source / Repository Artifacts** (10 типов):
  - SourcePatch, FileChangeSet, GeneratedSourceFile, ModifiedSourceFile, DeletedSourceFile, TestFile, ConfigFileChange, MigrationFile, BuildScriptChange, PullRequestDraft.
  - Объяснён descriptor pattern: код живёт в repo, ArtifactStore хранит descriptor.
  - Добавлено правило: TechnicalSpecification → ImplementationPlan → SourcePatch/FileChangeSet → PullRequestDraft.
  - Добавлен пример descriptor (FileChangeSet YAML).
- Добавлена категория **Execution / Verification Artifacts** (10 типов):
  - ExecutionReport, ExecutionConfirmation, TestResults, CoverageReport, CIReport, BenchmarkReport, MigrationDryRunReport, HealthCheckReport, RuntimeLog, FailureReport.
  - Добавлено distinction: Trace event vs Execution artifact.
  - Добавлен пример ExecutionReport (YAML).
- Добавлена категория **Operational / Receipt Artifacts** (8 типов + domain examples):
  - OperationReceipt, ActionReceipt, ExternalActionReceipt, StateChangeRecord, SubmissionReceipt, NotificationReceipt, ApprovalReceipt, CompletionRecord.
  - Добавлены примеры по доменам: Legal, HR, Finance, Office, Security.
  - Добавлен пример OperationReceipt (YAML).
- Добавлена категория **Conversation Artifacts** (7 lightweight optional types):
  - ConversationSummary, DecisionNote, ProblemStatementDraft, ConceptClarification, OpenQuestionsList, AssumptionList, WorkingHypothesis.
  - Уточнено: не создаются по умолчанию, только по explicit request или promotion.
- Добавлен подраздел **Когда trace event становится artifact** — 7 критериев + краткая формула.
- Обновлены **MVP Artifacts**: добавлены SourcePatch, FileChangeSet, TestFile, ConfigFileChange, ExecutionReport, ExecutionConfirmation, TestResults, OperationReceipt (generic).
- Обновлены **Artifact chains**: spec → tasks → implementation → **source changes → execution/verification** → tests.

### §8 Policy and Gate Model
- Добавлен **execution action classification**:
  - execution.read_only → silent/notify
  - execution.mutating → block
  - execution.external → block/expert_gate
  - execution.deploy → expert_gate/hard-deny
- Уточнено: Policy должна различать read-only verification и mutating/external/deploy execution.
- Добавлено: hard-deny применяется **даже в conversation mode**.

### §10 Domain Pack Model
- В пример config.yaml добавлена секция `execution` с read_only/mutating/external/deploy.

### §14 Scope Boundaries
- MVP Artifacts расширены: +8 новых artifact types (SourcePatch, FileChangeSet, TestFile, ConfigFileChange, ExecutionReport, ExecutionConfirmation, TestResults, OperationReceipt).
- NOT in MVP расширены: full domain-specific receipt taxonomy, full execution environment capture, long-term conversation memory without explicit save.

### §15 End-to-End Examples
- Добавлен **L0 conversation example**: «Давай обсудим архитектуру» → promotion → ADR.
- Обновлён **L4 governed action example**: добавлено создание FileChangeSet artifact.
- Добавлен **L4 execution example**: «Запусти тесты» с ExecutionReport, TestResults, CoverageReport.

### §16 Glossary
- Добавлено 14 новых терминов:
  - Case, ChatTurn, Conversation Mode, ConversationSummary, Execution Artifact, ExecutionConfirmation, FileChangeSet, Operational Artifact, OperationReceipt, Repository Artifact, SessionTrace, Source Artifact, SourcePatch, Trace.

### §17 Evidence Appendix
- Добавлено примечание об Artifact & Conversation Patch — объяснение, почему эти уточнения добавлены (conceptual correction) и что они не меняют (JSONL, counts, vocabularies).

---

## 2. Новые artifact categories

| Category | Types | MVP subset |
|----------|-------|------------|
| Source / Repository Artifacts | 10 | SourcePatch, FileChangeSet, TestFile, ConfigFileChange |
| Execution / Verification Artifacts | 10 | ExecutionReport, ExecutionConfirmation, TestResults, CoverageReport, CIReport |
| Operational / Receipt Artifacts | 8+ | OperationReceipt (generic) |
| Conversation Artifacts | 7 | None (conditional) |

---

## 3. Новые artifact types (полный список)

### Source / Repository Artifacts
1. `SourcePatch`
2. `FileChangeSet`
3. `GeneratedSourceFile`
4. `ModifiedSourceFile`
5. `DeletedSourceFile`
6. `TestFile`
7. `ConfigFileChange`
8. `MigrationFile`
9. `BuildScriptChange`
10. `PullRequestDraft`

### Execution / Verification Artifacts
11. `ExecutionReport`
12. `ExecutionConfirmation`
13. `TestResults`
14. `CoverageReport`
15. `CIReport`
16. `BenchmarkReport`
17. `MigrationDryRunReport`
18. `HealthCheckReport`
19. `RuntimeLog`
20. `FailureReport`

### Operational / Receipt Artifacts
21. `OperationReceipt`
22. `ActionReceipt`
23. `ExternalActionReceipt`
24. `StateChangeRecord`
25. `SubmissionReceipt`
26. `NotificationReceipt`
27. `ApprovalReceipt`
28. `CompletionRecord`

### Conversation Artifacts (optional)
29. `ConversationSummary`
30. `DecisionNote`
31. `ProblemStatementDraft`
32. `ConceptClarification`
33. `OpenQuestionsList`
34. `AssumptionList`
35. `WorkingHypothesis`

---

## 4. Trace Event vs Execution Artifact vs Operational Artifact

| Концепт | Назначение | Жизненный цикл | Пример |
|---------|-----------|----------------|--------|
| **Trace Event** | Аудит: что произошло. | Лог в TraceSystem. | «Запущена команда npm test» |
| **Execution Artifact** | Результат запуска как задача. | Сохраняется в ArtifactStore. | ExecutionReport с exit_code, duration, outputs. |
| **Operational Artifact** | Подтверждение операции. | Сохраняется в ArtifactStore. | OperationReceipt для calendar invite. |

**Ключевое правило:** Trace фиксирует событие для аудита. Execution Artifact фиксирует выполненную операцию как результат задачи. Operational Artifact фиксирует изменение состояния внешней системы.

---

## 5. ChatTurn vs SolveResult vs Artifact vs Trace vs Case

| Концепт | Когда создаётся | Содержит | Scope |
|---------|----------------|----------|-------|
| **ChatTurn** | Conversation mode (L0). | Текст ответа, timestamp. | Session-scoped, ephemeral. |
| **SolveResult** | Task/case execution (L1–L5). | Envelope: refs на артефакты, trace, policies. | Case-scoped, persisted. |
| **Artifact** | Когда результат нужно сохранить/связать. | Структурированные данные. | ArtifactStore, persisted. |
| **Trace** | Каждое действие Wolf. | Событие для аудита. | TraceSystem, persisted. |
| **Case** | Оформленная задача. | CaseTrace + SolveResults + Artifacts. | Case-scoped, persisted. |

**Ключевое правило:** Не каждое взаимодействие возвращает SolveResult. Conversation mode возвращает ChatTurn, пока не произойдёт promotion.

---

## 6. Conversation → Case promotion

**Триггеры promotion:**
- «Сформулируй из этого документ»
- «Сохрани это как решение»
- «Сделай план» / «Запусти проверку» / «Теперь реализуй»
- «Создай спецификацию» / «Зафиксируй это как ADR»
- «Сделай из обсуждения task list»

**Что появляется после promotion:**
- `CaseTrace` — audit trail задачи
- `SolveResult` — canonical envelope
- `ArtifactStore` — хранение артефактов
- Policy checks — полноценная проверка
- Gates — если есть side effects

**Правила памяти:**
- Conversation memory ephemeral по умолчанию.
- Explicit save → `ConversationSummary` или другой artifact.
- Promotion → selected summary переносится в `CaseTrace`.
- Stable preference/decision → только через explicit confirmation.

---

## 7. Обновления MVP Boundary

### Добавлено в MVP Artifacts
- `SourcePatch`
- `FileChangeSet`
- `TestFile`
- `ConfigFileChange`
- `ExecutionReport`
- `ExecutionConfirmation`
- `TestResults`
- `OperationReceipt` (generic)

### Добавлено в NOT in MVP
- Full domain-specific receipt taxonomy (generic OperationReceipt достаточно)
- Full execution environment capture
- Long-term conversation memory without explicit save

### Ограничение
MVP не обязан поддерживать все доменные receipt artifacts. Для MVP достаточно generic `OperationReceipt`, а domain-specific receipts могут быть conditional/domain pack artifacts.

---

## 8. Final consistency check

| Проверка | Статус |
|----------|--------|
| Код теперь явно описан как Source / Repository Artifact | ✅ Да |
| Запуск/исполнение может быть Trace Event или Artifact | ✅ Да |
| SolveResult больше не применяется к любой беседе | ✅ Да |
| Conversation mode не создаёт Case/SolveResult по умолчанию | ✅ Да |
| PolicyCore всё ещё применяется к hard-deny в conversation | ✅ Да |
| Artifact-first model больше не документно-центрична | ✅ Да |
| MVP Boundary не раздут чрезмерно (generic receipts, basic source/execution) | ✅ Да |
| Roadmap отсутствует | ✅ Да |
| Новые сценарии не созданы | ✅ Да |
| JSONL не изменён | ✅ Да |
| Controlled vocabularies не изменены | ✅ Да |
| References/templates/vocabularies не изменены | ✅ Да |

---

## 9. Оставшиеся открытые вопросы

1. **ArtifactStore для Source Artifacts.** Код физически живёт в repository workspace; ArtifactStore хранит descriptor. Нужно ли отдельное RepositoryArtifactStore или достаточно foreign key в основной ArtifactStore?

2. **ExecutionArtifact vs TraceEvent threshold.** 7 критериев «когда trace становится artifact» описаны качественно. Для MVP достаточно heuristic (execution.mutating всегда → artifact; execution.read_only → trace unless user asks), но formal decision tree может потребоваться позже.

3. **Conversation promotion detection.** Как Router определяет, что conversation стала case? Keyword-based trigger или intent classification? Для MVP достаточно explicit user signal («сделай план»), но implicit promotion возможна.

4. **SessionTrace retention.** Conversation memory ephemeral по умолчанию, но что означает «эфемерный»? Session-scoped (при закрытии теряется) или time-based TTL (24 часа)? Решение отложено до implementation planning.

5. **Domain-specific receipt taxonomy.** Legal/HR/Finance/Office/Security примеры добавлены как иллюстрации, но не formalized в виде controlled vocabulary. Оставлено на domain pack level.

Эти вопросы относятся к implementation details и не блокируют Concept v2.

---

## 10. Line count impact

| Метрика | Значение |
|---------|----------|
| Revised draft | 985 lines |
| Final candidate | ~1280 lines |
| Net change | ~+295 lines |
| Artifact model additions | ~+180 lines |
| Conversation model additions | ~+70 lines |
| Policy/execution additions | ~+25 lines |
| Glossary/scope/examples updates | ~+20 lines |

Увеличение обусловлено добавлением 4 новых artifact categories, conversation mode и новых примеров. Основной документ остаётся stable; добавления — строго структурированные вставки.

---

*Report generated after Artifact & Conversation Model Patch. No new scenarios or playthroughs were created. JSONL unchanged.*
