Я изучил твой проект Mr. Wolf — это серьёзная работа, и у меня есть подробная оценка. Вот мой разбор.

---

## Общая оценка

**Mr. Wolf — это концептуально сильный, архитектурно грамотный, но функционально неполный проект.** Он правильно идентифицирует ключевую проблему (память вне сессии), предлагает элегантную модель данных, но не решает критические задачи интеграции и retrieval, которые делают память полезной для агентов.

**Оценка: B+ за концепцию, C+ за исполнение, A- за потенциал.**

---

## Что сделано отлично

### 1. Правильная постановка проблемы
«AI coding sessions are temporary. A project continues across sessions, models, agents, and documents.» — это точное формулирование проблемы, которую решает harness engineering. Ты не строишь «ещё один агент», а **memory substrate** — и это правильное позиционирование.

### 2. Typed Artifact Model
9 типов артефактов (work-thread, info-request, article, decision, blocker, open-question, session-checkpoint, document, external-artifact) со статусами жизненного цикла и review_state — это более зрелая модель, чем у большинства коммерческих решений. Особенно сильны:
- **info-request → article pipeline** — формализация различия между «думать сейчас» и «исследовать потом»
- **decision с rationale и based_on** — явная трассировка обоснования
- **session-checkpoint + thread diff** — кросс-сессионная непрерывность

### 3. Explicit Relations System
Bidirectional predicates (answers/answered_by, supports/supported_by, based_on/basis_for, supersedes/superseded_by) с provenance tracking — это архитектурно правильное решение. Большинство систем трактуют relations как имплицитные или второстепенные; у тебя они first-class.

### 4. Hexagonal Architecture
Domain imports nothing. App imports domain + ports. Adapters implement ports. CLI contains no business logic. Это правильно для долгосрочной поддерживаемости.

### 5. File-First Philosophy
«Markdown/YAML objects are canonical. SQLite, indexes, and briefs are derived.» + «No centralization trap» (не переписывать исходники). Это предотвращает vendor lock-in, даёт git versioning, делает память inspectable человеком.

### 6. Document Registration by Reference
Вместо копирования файлов — регистрация с content hash. Правильно для больших кодовых баз.

---

## Критические пробелы

### 1. ❌ Нет семантического поиска (векторного retrieval)
Phase 5 завершена — «ranking, filters, tag search». Но в base concept прямо написано: «No vector database» в MVP. Это **фатальный пробел** для memory harness.

FTS5 хорош для exact match, но агенты должны находить **связанные** знания, не только **совпадающие**. Без embeddings ты не можешь:
- Найти статью о «error handling», когда агент спрашивает про «exception management»
- Связать решение из прошлого проекта с текущей задачей
- Сделать cross-thread knowledge discovery

**Рекомендация:** Phase 6 или 7 **обязательно** должна включить векторные embeddings. Даже простой подход (OpenAI text-embedding-3-small с локальным кешем) даст порядковый прирост полезности. Хранить embeddings рядом с markdown-объектами, индексировать в SQLite через sqlite-vss или мигрировать на pgvector.

### 2. ❌ Нет MCP Server (отложен на Phase 7)
В 2026 году MCP — стандартный интерфейс между агентами и инструментами. Без MCP Mr. Wolf невидим для Claude Desktop, OpenCode, Cursor, Codex. Агенты не используют CLI — они используют MCP или прямую API-интеграцию.

Твой README показывает CLI-использование (`wolf memory search`), но агенты не вызывают CLI-команды. Они вызывают MCP tools.

**Рекомендация:** MCP server должен быть **Phase 6, не Phase 7**. Это primary integration path для агентов 2026 года. MCP server должен экспонировать:
- `memory/search` — семантический + exact поиск
- `memory/get` — получение артефакта по ID
- `memory/add` — создание артефакта
- `memory/thread_brief` — текущее состояние треда
- `memory/checkpoint` — создание сессионного чекпоинта

### 3. ❌ Memory classification отложена на Phase 6
memory_class, truth_role, lifetime определены в концепции, но не реализованы. Это не «nice-to-have» — это **фундамент governance**. Без них:
- Нет различия между canonical spec и generated summary
- Нет стратегии garbage collection (что архивировать, что хранить)
- Нет уровней доверия (accepted vs proposed knowledge)

**Рекомендация:** Phase 6 — это не «governance», это **critical infrastructure**. Без классификации память деградирует со временем.

### 4. ❌ SQLite как primary index — проблемы масштабирования
Для single-user, single-project — нормально. Но если vision включает:
- Multi-project memory
- Team-shared memory
- Large codebases (10k+ файлов)

SQLite станет bottleneck. Проверенный паттерн — unified PostgreSQL (episodic + semantic + procedural в одной базе).

**Рекомендация:** Plan PostgreSQL/pgvector backend option для Phase 7+.

### 5. ❌ Нет consolidation / garbage collection
В концепции написано «no automatic LLM extraction from every file» (хорошо — избегает шума), но нет background consolidation. Память накапливается бесконечно:
- Старые info-requests становятся stale
- Superseded decisions остаются searchable
- Session checkpoints копятся

Без MemPalace-style «dream consolidation» или TencentDB-Agent-Memory 4-tier pipeline, memory store будет деградировать.

**Рекомендация:** Background consolidation job (Phase 7):
- Дедупликация похожих артефактов
- Архивация stale info-requests
- Компрессия старых session checkpoints в summaries
- Обновление truth roles по возрасту

### 6. ❌ Нет multi-agent memory sharing
Текущий дизайн — single-user/single-agent. Но реальная сила project memory — когда несколько агентов (или инстансов одного агента) делят один substrate:
- OpenCode agent + Codex agent + human developer читают/пишут в один `.wolf/`
- CI pipeline пишет session checkpoints
- Code review agent читает decisions и blockers

Нет role-based access, conflict resolution, concurrent write handling.

**Рекомендация:** Design for multi-agent с Phase 6. Добавить agent_id в артефакты, optimistic locking для concurrent writes, merge strategies для конфликтов.

### 7. ❌ Нет observability / telemetry
Нет:
- Memory hit rates (насколько retrieved memories были полезны)
- Context utilization metrics
- Retrieval latency tracking
- Agent behavior logging

Без observability ты не можешь оптимизировать memory system. Не знаешь, используют ли агенты правильные артефакты или тонут в шуме.

**Рекомендация:** Telemetry layer (Phase 7) с OpenTelemetry-style spans для memory operations.

### 8. ⚠️ TypeScript/Node.js — риск экосистемы
Зависимость от better-sqlite3 (native bindings) создаёт portability issues. Для performance-critical indexing layer Rust core с TypeScript bindings (napi-rs) был бы надёжнее.

**Рекомендация:** Phase 8+ — извлечь indexing engine в Rust core, domain logic оставить в TypeScript.

---

## Сравнение с аналогами

| Аспект | Mr. Wolf | MemPalace | Stash | pgmnemo | MemoriesDB |
|--------|----------|-----------|-------|---------|------------|
| **Storage** | File-first, markdown | File-first | Postgres + pgvector | PostgreSQL extension | PostgreSQL + pgvector |
| **Relations** | ✅ Explicit, bidirectional | ❌ Implicit | ⚠️ Basic | ✅ Graph + provenance | ✅ 4D query |
| **Retrieval** | ❌ FTS5 only | ✅ 96.6% R@5 | ✅ Semantic + consolidation | ✅ Multi-modal fusion | ✅ Temporal+semantic+relational+graph |
| **Integration** | ❌ CLI only | ❌ Standalone | ❌ Standalone | ✅ MCP wrapper | ❌ Standalone |
| **Multi-agent** | ❌ Single-user | ❌ Single-user | ❌ Single-user | ✅ Role-scoped | ❌ Single-user |
| **Consolidation** | ❌ None | ✅ Background | ✅ 8-stage pipeline | ❌ None | ❌ None |
| **Observability** | ❌ events.jsonl | ❌ Minimal | ❌ Minimal | ✅ Token-economy | ❌ Minimal |

**Mr. Wolf — более структурированный, чем MemPalace; менее retrievable. Более inspectable, чем Stash; менее automated. Более conceptual, чем pgmnemo; менее production-ready.**

---

## Что такое moat Mr. Wolf?

**Потенциальные moat:**
1. **Info-request → article pipeline** — genuinely novel. Большинство tools capture everything; Mr. Wolf capture selectively with intent.
2. **Explicit relations with provenance** — most tools have implicit or flat relationships.
3. **File-first + git-native** — many tools use proprietary databases.

**Но эти moat тонкие без:**
- Semantic retrieval (иначе relations не помогают найти relevant artifacts)
- MCP integration (иначе агенты не могут использовать)
- Multi-agent support (иначе это personal tool, не team infrastructure)

---

## Рекомендуемый порядок приоритетов

### Немедленно (Phase 6 — Governance)
1. **MCP server** — Phase 6, не 7. Primary integration path.
2. **Memory classification** (memory_class, truth_role, lifetime) — critical infrastructure, не optional.
3. **Vector embeddings** — даже простой подход даст порядковый прирост.

### Краткосрочно (Phase 7 — Integrations)
4. **PostgreSQL backend option** — для team use, large projects, CI.
5. **Background consolidation** — dedup, archive, compress, update truth roles.
6. **Observability** — telemetry, retrieval quality metrics.

### Среднесрочно (Phase 8+ — Scale)
7. **Multi-agent support** — agent_id, concurrent writes, conflict resolution.
8. **Rust core для indexing** — extract FTS5 + vector indexing, domain logic оставить в TS.

---

## Итог

Mr. Wolf — **conceptually strong, architecturally sound, but functionally incomplete**. Решены hard problems (data model, relations, lifecycle), но не решены critical problems (retrieval, integration, governance, scale).

Проект в 1-2 major phases от того, чтобы быть genuinely competitive с коммерческими решениями. Риск: без semantic retrieval и MCP integration останется niche tool для дисциплинированных individual developers, а не станет universal memory substrate, к которому стремится.

**Фундамент solid. Следующие 6 месяцев определят, станет ли Mr. Wolf category-defining tool или interesting experiment.**
