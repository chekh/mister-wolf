# Concept v2 — Open Questions

**Date:** 2026-05-05
**Source:** Artifact & Conversation Model Patch Report
**Scope:** Implementation details deferred from Concept v2

---

## 1. ArtifactStore for Source Artifacts

**Question:**
Код физически живёт в repository workspace; ArtifactStore хранит descriptor (path, diff, hash, trace, policy decisions, links). Нужно ли отдельное RepositoryArtifactStore или достаточно foreign key в основной ArtifactStore?

**Current recommended MVP assumption:**
Достаточно основного ArtifactStore с foreign key links. Source Artifact хранится как descriptor-запись с полем `repository_path`, а физические файлы — в repo workspace. Отдельный RepositoryArtifactStore не требуется для MVP.

**Why it does not block Concept v2:**
Это implementation detail хранилища. Концептуальная модель (descriptor pattern, linking, lifecycle) работает независимо от того, одна таблица или две. MVP может начать с одного ArtifactStore и разделить позже при необходимости.

**When to revisit:**
При реализации MVP ArtifactStore или при появлении требования к distributed storage (например, remote repo + local cache).

---

## 2. ExecutionArtifact vs TraceEvent Threshold

**Question:**
7 критериев «когда trace становится artifact» описаны качественно. Какое точное правило применяет runtime для преобразования trace event в artifact?

**Current recommended MVP assumption:**
Heuristic-based approach:
- `execution.read_only` (typecheck, lint без записи) → всегда Trace Event, unless пользователь явно просит сохранить результат.
- `execution.mutating` (codegen, formatter with write, migration) → всегда Execution Artifact (FileChangeSet + ExecutionReport).
- `execution.external` (calendar invite, email, ticket) → всегда Operational Artifact (OperationReceipt).
- `execution.deploy` → expert_gate + Execution Artifact.

**Why it does not block Concept v2:**
Концептуальная модель чётко различает Trace, Execution Artifact и Operational Artifact. Точный threshold — это runtime implementation detail, который может эволюционировать без изменения концепции.

**When to revisit:**
При реализации GateManager для execution actions или при добавлении пользовательских настроек «всегда сохранять результаты тестов».

---

## 3. Conversation Promotion Detection

**Question:**
Как Router определяет, что conversation стала case? Keyword-based trigger, intent classification или explicit user signal?

**Current recommended MVP assumption:**
Explicit user signal как primary trigger. Если пользователь говорит «сделай план», «создай спецификацию», «запусти проверку» — promotion происходит немедленно. Keyword-based triggers как fallback. Intent classification deferred до post-MVP.

**Why it does not block Concept v2:**
Концепция promotion описывает *что* происходит (conversation → case), а не *как* детектируется. Explicit signal — самый надёжный и предсказуемый способ для MVP.

**When to revisit:**
При реализации RouterFull или при появлении UX-фидбека, что implicit promotion необходима для плавности работы.

---

## 4. SessionTrace Retention

**Question:**
Conversation memory ephemeral по умолчанию, но что означает «эфемерный»? Session-scoped (при закрытии теряется) или time-based TTL (24 часа)?

**Current recommended MVP assumption:**
Session-scoped retention: ChatTurns и SessionTrace хранятся в памяти текущей сессии и не persist между перезапусками. Если пользователь просит сохранить — создаётся artifact (ConversationSummary), который persist в ArtifactStore. Long-term conversation memory deferred.

**Why it does not block Concept v2:**
Концепция определяет, что conversation memory ephemeral по умолчанию. Конкретный механизм retention — implementation detail, который не влияет на архитектурные решения.

**When to revisit:**
При реализации TraceSystem persistence layer или при появлении требования к cross-session conversation recovery.

---

## 5. Domain-Specific Receipt Taxonomy

**Question:**
Legal/HR/Finance/Office/Security примеры receipt artifacts добавлены как иллюстрации. Нужна ли controlled vocabulary для domain-specific receipts или они остаются на уровне domain pack?

**Current recommended MVP assumption:**
Domain-specific receipts остаются на уровне domain pack. MVP поддерживает generic `OperationReceipt` как universal type. Domain packs могут расширять его полями (`operation_type`, `target_system`, `side_effects`) без отдельной controlled vocabulary. Formal taxonomy может быть добавлена позже при накоплении domain pack evidence.

**Why it does not block Concept v2:**
Концепция определяет generic Operational Artifact и даёт примеры по доменам. Формализация каждого domain-specific receipt — это content work, а не architectural decision.

**When to revisit:**
При создании 3+ domain packs, которые используют receipts, или при появлении требования к cross-domain receipt interoperability.

---

*Open questions extracted from Artifact & Conversation Model Patch. These are implementation details and do not block Concept v2 publication.*
