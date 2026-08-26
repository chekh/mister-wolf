# Mr. Wolf — Roadmap v2

> Date: 2026-07-02  
> Status: active (rev. 2026-08-26) — реализованы фазы 6–10; Phase 9 semantic-часть deferred (см. Phase 9); superpowers-интеграция: Phases 15–17, 19 сделаны, 18 deferred (см. блок Superpowers Integration)  
> Supersedes: `docs/superpowers/plans/roadmap.md`

## 1. Концептуальные изменения

### 1.1. Плоский CLI namespace

Команда `wolf memory ...` избыточна: Mr. Wolf теперь полностью про память. Все команды переезжают в корневой namespace:

```bash
wolf init
wolf add
wolf search
wolf list
wolf get
wolf supersede
wolf transition
wolf scan
wolf brief
wolf recap
wolf thread create
wolf info-request create
wolf article add
wolf decision add
wolf blocker add
wolf session checkpoint
wolf session wrap-up
wolf think start
wolf insights
wolf ingest
```

MCP tools переименовываются аналогично:

- `memory_search` → `search`
- `memory_add` → `add`
- `memory_get` → `get`
- `memory_list` → `list`
- `memory_recap` → `recap`
- `memory_brief` → `brief`
- `memory_scan` → `scan`
- `memory_create_thread` → `create_thread`
- `memory_create_info_request` → `create_info_request`
- `memory_create_article` → `create_article`
- `memory_create_decision` → `create_decision`
- `memory_create_blocker` → `create_blocker`
- `memory_resolve_blocker` → `resolve_blocker`
- `memory_create_rule` → `create_rule`
- `memory_get_rules` → `get_rules`
- `memory_start_thinking` → `start_thinking`
- `memory_add_thought` → `add_thought`
- `memory_conclude_thinking` → `conclude_thinking`
- `memory_insights` → `insights`
- `memory_ingest` → `ingest`
- `memory_type_list` → `list_types`
- `memory_type_get` → `get_type`
- `memory_type_add` → `add_type`
- `memory_type_remove` → `remove_type`

### 1.2. Конфигурируемая таксономия

Memory types больше не hardcoded. Ядро поставляет **immutable core pack**, проекты могут добавлять собственные типы через `.wolf/config.yaml` и команды `wolf type`.

Пример `.wolf/config.yaml`:

```yaml
memory_types:
  project:
    - api-contract
    - incident
```

Каждый тип конфигурируется:

```yaml
memory_type_config:
  rule:
    fields:
      scope:
        type: enum
        values: [project, global]
      applies_to:
        type: string_list
      trigger:
        type: string
    governance:
      memory_class: canonical
      truth_role: source_of_truth
      lifetime: long_term
  debug:
    fields:
      root_cause: { type: string }
      fix: { type: string }
      changed_files: { type: string_list }
  info-request:
    fields:
      thread: { type: reference, target_type: work-thread, required: true }
      question: { type: string, required: true }
      detour_reason: { type: string, required: true }
      expected_answer: { type: string_list, required: true }
      preliminary_answer: { type: string }
```

Команды управления таксономией:

```bash
wolf type list
wolf type get <name>
wolf type add <name> --fields "owner:string,status:enum(open,closed),contract_path:string"
wolf type remove <name>
```

Правила:

- Core pack immutable. Ни агент, ни пользователь не могут его изменить.
- Project types могут только добавлять поля; не могут переопределять core types.
- Агент может добавлять project types (с explicit permission), но не core types.
- Удаление project type возможно только при отсутствии объектов этого типа.
- CLI/MCP schemas генерируются из merged конфига.

Schema-driven подход:

- `MemoryObjectSchema` становится динамическим: base fields + type-specific fields из config.
- Domain types (`MEMORY_TYPES`) загружаются из config, не hardcoded.
- CLI/MCP schemas генерируются из type config.
- Storage paths (`objects/<type-dir>/`) определяются конфигом.

Это решает проблему раздувания таксономии: проект добавляет только нужные типы, агент может помогать, но core pack защищён.

### 1.3. Files remain canonical

Все изменения сохраняют принцип: markdown + YAML frontmatter — source of truth. SQLite, vector indexes, briefs — derived.

## 2. Phases

### Phase 6 — Governance (current)

**Goal:** Ввести governance attributes и подготовить почву для schema-driven типов.

**Scope:**

- Add `memory_class`, `truth_role`, `lifetime` to `MemoryObjectSchema`.
- Apply `governanceDefaults(createdBy)` во всех create use-cases.
- Integrate `validateGovernance` into write protocol.
- Enforce `ALLOWED_TRANSITIONS` in `transitionMemoryObject`.
- Add `rule` type с полем `scope: project | global`.
- Add unit/integration tests.

**Out of scope:**

- CLI flags для override governance.
- Конфигурируемая таксономия (Phase 8).

**Success criteria:**

- `npm run check` passes.
- Governance tests pass.
- `rule` создаётся только пользователем (не агентом proactively).

### Phase 7 — MCP Server + Agent Guidance

**Goal:** Сделать Mr. Wolf доступным для IDE-агентов через MCP и дать агентам ритуалы работы.

**Scope:**

- Реализовать MCP server по approved spec (`2026-07-01-mcp-server-integration-design.md`).
- Переименовать MCP tools в плоский namespace.
- Создать `.wolf/SKILL.md`:
  - session startup ritual (`recap`, `search`);
  - trigger → type table;
  - правила создания `rule`;
  - info-request / article flow.
- Добавить `wolf recap` / `memory_recap`:
  - активные rules;
  - активные work-threads;
  - открытые blockers, open-questions, info-requests;
  - последние decisions.
- Добавить `wolf mcp` CLI alias для запуска сервера.

**Out of scope:**

- HTTP/SSE transport.
- MCP resources и prompts.

**Success criteria:**

- `node dist/bootstrap/mcp.js` responds to `initialize` over stdio.
- All tools callable in-memory.
- `.wolf/SKILL.md` exists and is documented.
- `npm run check` passes.

### Phase 8 — Schema-Driven Taxonomy

> **Superseded:** реализация Phase 8 выполнена по `docs/superpowers/specs/2026-08-23-phase-8-schema-taxonomy.md` (concept v2 §6); этот раздел устарел и оставлен для истории.

**Goal:** Сделать типы памяти конфигурируемыми через `.wolf/config.yaml` с immutable core pack и project-specific extensions.

**Scope:**

- Config loader for `.wolf/config.yaml`.
- `MemoryTypeRegistry`:
  - Load core pack from `core-memory-types.yaml` (bundled with Mr. Wolf, immutable).
  - Load project types from `.wolf/config.yaml` under `memory_types.project`.
  - Merge: core types + project types. Project types cannot override core types.
- Dynamic `MemoryObjectSchema` = base schema + type-specific fields from config.
- Type-specific CLI/MCP schemas generated/registered from config.
- Storage path mapping from config.
- Default core pack includes:
  - existing: `decision`, `blocker`, `lesson`, `observation`, `session-summary`, `open-question`, `document`, `context`, `work-thread`, `info-request`, `article`, `session-checkpoint`;
  - new: `rule`, `debug`, `code-snippet`, `design`.
- Commands for taxonomy management:
  - `wolf type list` — list core + project types;
  - `wolf type get <name>` — show type schema;
  - `wolf type add <name> --fields "..."` — add project type;
  - `wolf type remove <name>` — remove project type if no objects exist.
- MCP equivalents: `list_types`, `get_type`, `add_type`, `remove_type`.
- Rules:
  - Core pack immutable for agents and users.
  - Project types mutable only by users or agents with explicit permission.
  - Project types cannot redefine core type fields or governance.
  - Removal blocked if objects of this type exist.

**Out of scope:**

- Marketplace of type packs.
- Runtime type addition without config reload.

**Success criteria:**

- `npm run check` passes.
- `wolf type list` shows core + project types.
- Agent/user can add a project type via CLI/MCP.
- Core type cannot be modified or removed.
- Default pack covers all existing + proposed core types.

### Phase 9 — Enhanced Search

**Status (2026-08-26): частично реализована, semantic-часть deferred.** Решение: semantic/hybrid search откладывается до роста базы объектов; сейчас взяты `file_path`-фильтр и FTS5-улучшения (префиксный поиск `"токен"*`, взвешенное ранжирование bm25) — без эмбеддингов и новых зависимостей. Ниже — исходный замысел semantic-части.

**Goal:** Добавить semantic/hybrid search как optional adapter, сохранив FTS5 default.

**Scope:**

- Add `SearchMode: keyword | semantic | hybrid`.
- Add ports:
  - `EmbeddingProvider`;
  - `VectorSearchIndex`.
- Adapters:
  - Local embeddings (ONNX / `nomic-embed-text` / `sentence-transformers` lightweight);
  - Optional pgvector adapter;
  - Optional OpenAI adapter.
- `file_path` filter to search — **сделано (2026-08-26)**: CLI `--file-path`, MCP `file_path`; матчинг по `related.files` и `source.path`.
- Vector index — derived, rebuildable from markdown files.

**Out of scope:**

- Обязательная зависимость от LLM/эмбеддингов.
- Re-ranking моделей.

**Success criteria:**

- `wolf search "..." --mode hybrid` works when vector adapter configured.
- Without adapter, `keyword` mode works unchanged.
- `npm run check` passes.

### Phase 10 — Insights

**Goal:** Pattern analysis над активной памятью.

**Scope:**

- `wolf insights --topic <topic> --type <type>`.
- Level 1 (no LLM):
  - top tags;
  - frequent `related.files`;
  - stale/superseded/conflicting decisions;
  - decision/lesson/debug density.
- Level 2 (optional LLM adapter):
  - synthesize summary from filtered objects.
- Analysis types:
  - `patterns`;
  - `technical_debt`;
  - `decisions`;
  - `lessons`;
  - `activity`.

**Out of scope:**

- Real-time continuous insights.
- Cross-project insights.

**Success criteria:**

- `wolf insights --topic auth --type patterns` returns heuristic analysis without LLM.
- With LLM adapter, returns synthesized summary.
- `npm run check` passes.

### Phase 11 — Structured Thinking

**Goal:** Explicit reasoning sequences that produce decisions.

**Scope:**

- `wolf think start --goal "..." --thread <id>`.
- `wolf think add --sequence <id> --type hypothesis|reasoning|evidence|concern`.
- `wolf think conclude --sequence <id> --title "..." --body "..."`.
- Conclusion creates `decision` with `based_on` links to all thoughts in sequence.
- Thinking sequence stored as `working-notes` or embedded in `decision`.

**Out of scope:**

- Branching reasoning trees.
- Automatic thinking without user initiation.

**Success criteria:**

- Full thinking cycle creates `decision` with linked thoughts.
- `npm run check` passes.

### Phase 12 — Session Wrap-Up Habit

**Goal:** Автоматическая фиксация итогов сессии.

**Scope:**

- Auto-triggers after lifecycle events:
  - `resolveBlocker`;
  - `transitionMemoryObject` to terminal status (фактическая реализация: `TERMINAL_STATUSES` в `transition-memory-object.ts` = archived, completed, accepted, resolved, obsolete, answered);
  - `supersedeMemoryObject`;
  - `createDecision`;
  - `createArticle`.
- Manual `wolf session wrap-up`.
- `session-summary` object aggregating events from event log.
- Deduplication: max one auto-summary per 5 minutes.

**Out of scope:**

- NLP summarization of bodies.
- Time-based periodic checkpoints.

**Success criteria:**

- Resolving a blocker creates `session-summary`.
- Manual wrap-up works.
- No duplicates within 5 minutes.
- `npm run check` passes.

### Phase 13 — Document Ingest

**Goal:** Optional ingestion of external documents (PDFs, specs) without breaking reference-first model.

**Scope:**

- `wolf ingest <path>` for files outside repo.
- Chunking and optional embedding (via vector adapter).
- Store as `document` with:
  - `source.kind: file`;
  - `source.path: <original path>`;
  - `body`: extracted summary, not full content.
- Full content chunks stored in derived vector index, not in markdown body.

**Out of scope:**

- Automatic ingestion of all repo files.
- Rewriting project documents.

**Success criteria:**

- Ingested PDF searchable via `wolf search --mode semantic`.
- Markdown files remain reference-first for repo documents.
- `npm run check` passes.

### Phase 14 — Cross-Project & Enterprise

**Goal:** Когда понадобится: multi-project awareness, shared rules, compliance.

**Scope (tentative):**

- Global rules shared across projects.
- Cross-project insights.
- Export/import formats.
- RBAC/compliance (far future).

**Out of scope until explicit need:**

- Web UI.
- Cloud hosting.
- Enterprise dashboard.

### Phase 15 — Session-Start Hook (superpowers D1) — ВЫСОКИЙ ПРИОРИТЕТ

> **Status: готово** (commit `798a187`, 2026-08-26). Усилие: M.

**Goal:** Гарантированный стартовый ритуал: контекст памяти попадает в сессию хуком платформы, а не дисциплиной агента (перенос механизма session-start/superpowers.js).

**Scope (реализовано):**

- `.opencode/plugins/wolf-session-start.js` — инжект `wolf recap` + `wolf call --for` по первому сообщению в первое user-сообщение сессии; once-guard по маркеру; fail-safe (ошибка CLI не ломает сессию).
- Тест: `tests/unit/wolf-session-start-plugin.test.ts` (реальный spawn CLI).

**Success criteria:** свежая сессия содержит вывод recap без действий агента — покрыто юнит-тестом плагина.

### Phase 16 — trigger_keywords на lesson/rule (superpowers D2) — ВЫСОКИЙ ПРИОРИТЕТ

> **Status: готово** (commit `798a187`, 2026-08-26). Усилие: S.

**Goal:** Доставка знания в нужный момент: «Use when…»-триггеры на обычных объектах памяти, а не только на call-injection.

**Scope (реализовано):**

- Опциональное поле `trigger_keywords` в таксономии `lesson`/`rule`.
- Keyword-matching активных lesson/rule в `get-call-injections` (`wolf call --for <тема>`).

**Success criteria:** `wolf add --type lesson --set 'trigger_keywords=[merge]'` → `wolf call --for merge` возвращает урок; юнит-тесты матчинга.

### Phase 17 — wolf relation add + конвенция wolf:<type>:<id> — ВЫСОКИЙ ПРИОРИТЕТ

> **Status: готово** (2026-08-26). Усилие: S.

**Goal:** Граф памяти строится агентами штатной командой, а не временными .mjs-скриптами (закрывает «Known UX gap» из README); ссылки между объектами резолвимы.

**Scope (реализовано):**

- CLI `wolf relation add <subject> <predicate> <object> [--source]`: 16 предикатов, автоинверсия пары, канонический `relations.jsonl`.
- Конвенция текстовых ссылок `wolf:<type>:<id>` + маркеры REQUIRED/BACKGROUND — в `.wolf/SKILL.md` §5.
- E2E переведён с временных .mjs-скриптов на CLI: сценарий 1 (lifecycle) и council; helper `writeRelationScript` удалён; отдельный `relation-add.e2e.ts`.

**Success criteria:** e2e lifecycle/council/relation-add зелёные через CLI; `npm run check` зелёный.

### Phase 18 — Поведенческие тесты памяти — ВЫСОКИЙ ПРИОРИТЕТ, НЕ РЕАЛИЗОВЫВАТЬ СЕЙЧАС

> **Status: deferred** (усилие L; решение 2026-08-26 — не реализовывать сейчас).

**Goal:** Превентивная проверка «меняет ли запись памяти поведение агента» до коммита (по образцу pressure-тестов superpowers `tests/explicit-skill-requests`: стимул-промпт → запуск агента → проверка вызова скилла).

**Scope (будущее):**

- Harness: сценарий «стимул-промпт + wolf call» против детерминированного mock-агента.
- Пример сценария: deprecated-команда не выбирается при наличии call-injection.
- Отдельный npm-script вне `check` (требует запуска агента — дорого для каждого чека).

**Success criteria:** сценарий падает при удалении call-injection и проходит при его наличии.

### Phase 19 — Red Flags-таблица в .wolf/SKILL.md — ВЫСОКИЙ ПРИОРИТЕТ

> **Status: готово** (2026-08-26). Усилие: S.

**Goal:** Дешёвый compliance-механизм против рационализации (по образцу using-superpowers:82–95): задокументированные отговорки с контрдействиями.

**Scope (реализовано):**

- `.wolf/SKILL.md` §6: таблица ≥5 отговорок («найдётся поиском», «запишу потом», «это очевидно», …), у каждой строки — реальность и контрдействие.

**Success criteria:** таблица покрывает ≥5 отговорок, каждая строка имеет контрдействие.

## 3. Рекомендуемый порядок работы

1. **Phase 6** — завершить governance, добавить `rule`.
2. **Phase 7** — MCP server + `.wolf/SKILL.md` + `wolf recap`.
3. **Phase 8** — schema-driven taxonomy. Это фундамент для последующих фаз.
4. **Phase 9** — enhanced search: `file_path` + FTS5-улучшения сделаны (2026-08-26), semantic-часть deferred.
5. **Phase 10** — insights.
6. **Phase 11** — structured thinking.
7. **Phases 15–17, 19 (superpowers-интеграция)** — сделаны 2026-08-26; Phase 18 deferred до потребности.
8. **Phase 12** — session wrap-up.
9. **Phase 13** — document ingest.
10. **Phase 14** — cross-project (when needed).

## 4. Что остаётся без изменений

- Files as source of truth.
- Ports-and-adapters architecture.
- `relations.jsonl` as canonical relation graph.
- `events.jsonl` as audit trail.
- `info-request` → `article` flow.
- `work-thread` model.
- Governance model (`memory_class`, `truth_role`, `lifetime`).

## 5. Что удаляется/упрощается

- `wolf memory` namespace → `wolf`.
- MCP `memory_*` prefix → flat names.
- Hardcoded `MEMORY_TYPES` → loaded from config.
- Manual per-type CLI command files → generated/registered from type config.

## 6. Success criteria for roadmap v2

- All commands use flat namespace.
- Project can configure custom memory types.
- Default type pack includes `rule`, `debug`, `code-snippet`, `design`.
- `wolf recap` loads session context.
- `wolf insights` works without LLM.
- Vector search is optional.
- `npm run check` passes at every phase.

## 7. Будущее: LLM-синтез (опциональный enhancement, не скоуп)

Решение (2026-08-26): если LLM-синтез поверх памяти понадобится — через опциональный адаптер `opencode run` (LLM как внешний процесс), без обязательных зависимостей; эмбеддинги только локальные. Память остаётся local-first: LLM-слой никогда не требуется для записи и поиска.
