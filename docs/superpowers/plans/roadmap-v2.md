# Mr. Wolf — Roadmap v2

> Date: 2026-07-02  
> Status: active (rev. 2026-08-29) — реализованы фазы 6–12 (Phase 11 — structured thinking, влита в dev 2026-08-26; Phase 9 semantic-часть deferred, см. Phase 9); superpowers-интеграция: Phases 15–17, 19 сделаны, 18 слита с Phase 23 (см. блок Superpowers Integration); добавлен блок Self-Learning Phases 20–26 (дизайн: `docs/superpowers/specs/2026-08-26-self-learning-design.md`; разработка — после утверждения плана; rev. 2026-08-27 — поправки внешнего эксперта; rev. 2026-08-29 — единая ревизия блока 20–26 по итогам внешнего исследования (expert-013: 43 позиции) и решений владельца (Стюард, пост-аудит, пробег, playbook); детали — в спеке (§21 Changelog), см. блок 2a)  
> Supersedes: `docs/superpowers/plans/roadmap.md` (архив: `docs/archive/roadmap-v1.md`)

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

> Примечание (2026-08-26): `wolf ingest` — будущая команда Phase 13, ещё не реализована; фактический CLI — `wolf --help` (29 команд).

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

Команды управления таксономией (фактическая реализация Phase 8):

```bash
wolf taxonomy show                # эффективная таксономия: core + project
wolf taxonomy sync                # регенерация memory_types.core в .wolf/config.yaml из кода
```

> Примечание: ранние черновики roadmap описывали `wolf type add/remove` — реализация Phase 8 выбрала `wolf taxonomy sync/show` (core pack immutable в коде, project-типы — через `.wolf/config.yaml`).

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

> **Связка с самообучением (2026-08-26):** Phase 9 независима от контура самообучения (Phases 20–26): v1-механизмы не требуют ни эмбеддингов, ни semantic search — LLM-синтез идёт через адаптер `opencode run`, кластеризация сигналов — по формальному ключу. Реализуется по собственной потребности (рост базы объектов), не блокирует и не блокируется блоком 20+.

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

> **Связка с самообучением (2026-08-26):** Level 2 (LLM-синтез) — зависимость Phase 21 (паттерн-детекция контура самообучения): реализуется там, через адаптер `opencode run` (решение `mem_20260826_llm_sintez_wolf_cherez_adapter_opencode_56d96c`). Level 1 реализован и остаётся основой.

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

> **Status: слита с Phase 23 (2026-08-26).** В контуре самообучения эти тесты — STOP-гейт (барьер перед любой автономной адаптацией). Раздел оставлен для истории; состав и критерии живут в Phase 23, усилие L сохраняется.

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

## 2a. Self-Learning Phases (20–26) — контур самообучения

> Дизайн: `docs/superpowers/specs/2026-08-26-self-learning-design.md` (контур:
> сигналы → паттерны → кандидаты → grounding → принятие → доставка).
> Источник решений: `mem_20260826_reshenie_teoriya_samoobucheniya_wolf_opr_8e7089`,
> `mem_20260826_reshenie_sostav_mekhanizmov_samoobucheni_60c8cb` — состав v1:
> сигнальный лог → ExpeL-рефлексия → STOP-гейт → GEPA → AFlow; event-driven
> пороги вместо календарного каденса. Уровень автономии B. **Разработка — только
> после утверждения плана пользователем** (тред
> `mem_20260826_roadmap_samoobucheniya_wolf_plan_do_razr_4820a6`).
> Фазы 12–14 не входят в контур самообучения и остаются в прежнем виде.
> Rev. 2026-08-27 (7 инженерных поправок внешнего эксперта, детали и
> обоснования — в спеке): P20 — эмиссия `session-metrics.json` (OTEL-поля),
> контур обучения читает только JSON; P21 — локальная эмбеддинг-кластеризация
> вместо строкового ключа однотипности; P22 — Sandbox Replay Holdout вместо
> LLM-as-a-judge, `wolf learn digest`/`status`, negative constraints, decay;
> P24 — GEPA только на детерминированных метриках. Цепочка зависимостей
> 20→21→22→23→24→25 не изменилась.
>
> Rev. 2026-08-29 (единая ревизия по итогам внешнего исследования):
> консолидация expert-013 (29 must / 12 should / 2 nice — 43 позиции; детали
> и источники — `.external-research/expert-013-recommendations-brief.md`)
> и 9 решений владельца (решения владельца старше must-позиций при
> конфликте; автоппрув-строки expert-009/010 не вносятся). Ключевые
> изменения против ред. 27.08: **Стюард** (единый агент run/grow) вместо
> «куратора правил»; **пост-аудит** вместо пре-аппрува — Стюард пишет
> решения от своего имени сразу, пользователь отменяет/правит задним
> числом; **детерминированная кластеризация по ключу**
> `tool_name:error_class_id` вместо эмбеддинг-базиса; **TTL и staged
> autonomy в единицах пробега** (сессии, не дни; чекпоинты B→B+→C —
> 30/60/90 сессий [ВА]); тип **playbook** + рамочная доставка
> агентов/скиллов/команд (PoC 2026-08-29); read-only зоны контура;
> чеклисты рисков (24 режима отказа) — спека §17; числа и дефолты
> с калибровкой — спека §16; матрица «кто что меняет» — спека §15.
>
> Таксономия и CLI (rev. 2026-08-29): тип `playbook` (trigger_keywords,
> steps/order, owner_skill, version); новые поля — blast_radius, risk_level,
> predicted_effect, regression_risks, feedback_type, rejection_reason,
> candidate_hash, sessions_since_last_trigger (last_triggered_at и
> review_state — уже в ред. 27.08); CLI контура: `wolf learn digest`,
> `wolf learn status`, `wolf complain`; `wolf scaffold agent|skill|command` —
> направление v1.1+, не v1; `wolf metrics emit` не вводится (транспорт
> emitMetric — файловый, writer-матрица, см. Phase 20).

### Phase 20 — Сигнальный лог (фундамент)

**Goal:** Машиночитаемый журнал измеренного опыта: каждая оркестрационная сессия оставляет метрики, пригодные для `wolf insights`.

**Зависимости:** нет новых — опирается на существующие `events.jsonl`, протокол отчётов (Validation Results, FRICTION) и замеры токенов.

**Состав:**

- Эмиссия per-session `session-metrics.jsonl` (M20-01; не .json — поток строк JSONL, параллельно markdown-отчётам) со схемой OTEL GenAI v1.41 Layer 1+2 (M20-02): `session_id`, timestamps, `gen_ai.*`, `orchestration.*`, `outcome`, `tool_errors.by_class`; markdown — только для людей, контур обучения читает JSONL.
- Таблица `error_class_taxonomy` в `.wolf/config.yaml`: 20–50 классов, покрытие ≥95% ошибок (M20-04).
- 2-ступенчатая нормализация `error_class_id` (M20-03): детерминированный классификатор по таблице в горячем пути (без LLM — инвариант) + холодный `ErrorClassRefiner` для uncategorized.
- 8 orchestration-событий в `events.jsonl` (M20-05): session_started, session_ended, rejected_cycle, friction, delivery, tool_error, llm_call, worker_spawned.
- `delivery_event` — третий тип сигнала наравне с ошибками и трением (M20-06, из expert-005 decay: без записи о доставке TTL по срабатываниям не работает).
- Writer-матрица emitMetric (M20-07): воркеры пишут фрагменты `emit-metrics.jsonl` в `.wolf/orchestration/<session>/`, executor-lead детерминированно мержит их в канонический лог. Транспорт решён владельцем: файловый; команда `wolf metrics emit` не вводится.
- Чтение лога в `wolf insights` (Level 1, без LLM): плотности, топ-повторы — уже в ред. 27.08.
- Layer 1 meta-metrics (M20-08): signal_coverage, uncategorized_errors, orphan_signals — самонаблюдение полноты сбора.
- `delivery-stats.json` — derived-файл статистики доставки (S20-09, принят; canonical-лог не шумим).
- Чеклист рисков фазы: «Computational overhead» — батч-обработка, метрики не тормозят горячий путь (спека §17 B.1).

**Критерий готовности:** метрики любой завершённой сессии читаются программно из `session-metrics.jsonl`; классификатор покрывает ≥95% ошибок тестового лога; `wolf insights` отвечает по логу без LLM; Layer 1 meta-metrics выводятся (signal_coverage, uncategorized_errors, orphan_signals).

### Phase 21 — Паттерн-детекция (N≥3) + insights L2

**Goal:** Кластер однотипных сигналов (порог N≥3) превращается в паттерн с evidence-ссылками.

**Зависимости:** Phase 20 (вход — сигнальный лог). Поглощает **Phase 10 Level 2** (LLM-синтез через адаптер `opencode run`).

**Состав:**

- Базис v1 — детерминированная rule-based кластеризация O(n) по ключу однотипности `tool_name:error_class_id` (M21-01, M21-02; [ЦИТ] PostHog/Datadog Patterns). Замена выбора ред. 27.08 (эмбеддинг-кластеризация как базис) — решение ревизии 2026-08-29; обоснование — спека §2.2/§21.
- Опциональный semantic-слой (UMAP + HDBSCAN) для emergent-паттернов — S21-03, принят с модификацией: событийный триггер (порог накопления кластеров/uncategorized_errors), не календарь; включается после подтверждения потока Ф20.
- Порог N≥3 как параметр процесса (класс «параметры», автономно настраиваемый) — уже в ред. 27.08.
- Insights L2: LLM-синтез через адаптер `opencode run` (поглощение Phase 10 Level 2) — без изменений, ред. 27.08.
- Layer 2 meta-metrics (S21-04): cluster_density, cluster_stability, emerging_patterns.
- Чеклист рисков фазы: «Signal sparsity» — порог N≥3 (спека §17 B.1).

**Критерий готовности:** инжектированный кластер ≥3 однотипных по ключу `tool_name:error_class_id` детектируется; паттерн несёт evidence-ссылки на исходные сигналы.

### Phase 22 — ExpeL + Стюард: Analyzer-Worker → draft-rule → Sandbox Replay

**Goal:** Из паттерна генерируется draft-правило с evidence и манифестом правки, прошедшее Sandbox Replay; цикл генерация→применение закреплён за Стюардом (режим grow, пост-аудит).

**Зависимости:** Phase 21 (вход — паттерны); существующие `lesson`/`rule` + `trigger_keywords` (Phase 16), `wolf relation add` (Phase 17), lifecycle/supersede (Phase 6), измерение доставки (Phase 20 — `delivery_event` для `last_triggered_at`).

**Состав:**

- Роль Стюарда (режим grow) вместо «куратора правил» — решение владельца 2026-08-29, спека §10: Стюард пишет rule/lesson от своего имени сразу (created_by: агент); `wolf learn digest` = пост-аудит (пользователь отменяет/правит задним числом), не пре-аппрув. Компенсаторы: read-only зоны (Phase 23), Sandbox Replay до применения, одно изменение за итерацию, откат одной операцией (supersede + git).
- Правила завершённости вместо токен-бюджетов (решение владельца 2026-08-29, спека §10): цикл = цель → изменение или явное «ничего не меняем» с причиной; гипотеза ≤5 шагов; scope-расширение = отдельная задача.
- Analyzer-Worker — фронтирная модель через адаптер `opencode run` (M22-02; STOP-предупреждение: слабая модель деградирует контур — молчит или шумит); bounded proposal context — 4 элемента Self-Harness (M23-02): editable surfaces, failure patterns, passing behaviors, previous edit summaries.
- Манифест правки в draft-rule (M23-03): predicted_effect, regression_risks, blast_radius, risk_level + сверка «предсказание vs факт» в пост-аудите.
- Evidence ≥3 + holdout-валидация — уже в ред. 27.08 (M22-01, подтверждено ревизией 2026-08-29).
- Sandbox Replay Holdout вместо LLM-as-a-judge — уже в ред. 27.08 (M22-03, подтверждено): реплей исторических промптов на детерминированном mock-агенте, harness общий с Phase 23.
- Negative constraints (M22-04): отклонённый кандидат сохраняется с полями `feedback_type: negative`, `rejection_reason`, `candidate_hash`; similarity-блокировка >0.8 при генерации новых кандидатов из hard negatives (S22-06, порог [ВА] — калибровка, спека §16).
- Тип `playbook` + рамочная доставка (PoC 2026-08-29): тип (trigger_keywords, steps/order, owner_skill, version) регистрируется в таксономии; содержимое скиллов/агентов/команд эволюционирует в памяти без рестарта платформы. PoC: агент apprentice — 3/3, команда/скилл analyze-doc — 3/3 (артефакты — спека §13). Находка PoC: типа не было в таксономии — добавляется.
- Мотивация полного цикла: PoC-находка «рецидив рекомендаций без применения» (анализ не закреплён — рекомендации повторяются, пока их не внесёшь) — аргумент замкнутого цикла анализ→применение (Ф20–22).
- `wolf complain` — канал критики пользователя (SCC-05): hot-signal высшего приоритета → цикл наставничества в режиме расследования по сохранённым данным сессий (метрики, события, трейсы).
- Observability: `wolf learn digest` — батч-дайджест пост-аудита (пороговая накопительная логика ≥K элементов: новые правила Стюарда, holdout-вердикты, decay-очередь); `wolf learn status` — health-check контура (почему собран кластер, почему отклонён draft, decay-очередь) — уже в ред. 27.08.
- Чеклисты рисков фазы: спека §17 B.1 (catastrophic scaffolding collapse, over-optimization to judge, lack of transfer), B.3 (bias toward defaults, implementation drift, over-optimism «numerical duct tape», insufficient domain intelligence, weak scientific taste, diversity collapse, negative results loss, weak evaluators).

**Критерий готовности:** ≥1 rule создан Стюардом от своего имени из реальных сигналов (created_by: агент), виден в пост-аудит-дайджесте `wolf learn digest`, откат — одной операцией; манифест правки со сверкой «предсказание vs факт»; draft→активация проходит Sandbox Replay (путь в обход невозможен — тест); отклонённый кандидат блокирует повторную генерацию похожего (тест); тип playbook регистрируется в таксономии и доставляется рамкой.

### Phase 23 — STOP-гейт: pressure-тесты (слита с Phase 18)

**Goal:** Поведенческие тесты памяти как обязательный барьер перед любой автономной адаптацией.

**Зависимости:** Phase 22 (гейт активации правил). Harness-часть не требует Phase 20–22 и может строиться параллельно (исходный scope Phase 18). Состав критериев унаследован из Phase 18 дословно.

**Состав:**

- Harness: сценарий «стимул-промпт + `wolf call`» против детерминированного mock-агента.
- Пример сценария: deprecated-команда не выбирается при наличии call-injection.
- Отдельный npm-script вне `check` (запуск агента — дорого для каждого чека).
- Детекция premature action (действия до доставки знания) — по образцу superpowers `tests/explicit-skill-requests`.
- Governed Gate с read-only зонами (M23-01): код гейтов, `events.jsonl`, `session-metrics.jsonl`, `relations.jsonl`, core pack, модель, скелет — то, что контур самообучения не может менять (защита от reward hacking, AHE).
- Layer 4 meta-metrics (S23-04): stop_gate_pass_rate, false_positive_rate, regression_detection.
- Чеклисты рисков фазы: спека §17 B.1 (catastrophic scaffolding collapse, over-optimization to judge, lack of transfer), B.2 (все 4 режима Proofs Not Promises).

**Критерий готовности:** сценарий падает при удалении delivery-механизма (call-injection / trigger_keywords / правило) и проходит при его наличии; read-only зоны проверяются тестом (запись из контура в защищённую зону отклоняется).

### Phase 24 — GEPA: эволюция шаблонов брифов по Парето

**Goal:** Шаблоны брифов/промптов эволюционируют по Парето-фронту качество/стоимость/время на основе скоринга из сигнального лога.

**Зависимости:** Phase 20 (скоринг-метрики: качество, весовые токены, время — из сигнального лога), Phase 22 (генерация кандидатов), Phase 23 (гейт: применение кандидата — только через pressure-тесты и человека; автономия B).

**Состав:**

- Скоринг ревизий шаблона по сигнальному логу; Парето-сравнение ревизий — по инстансам задач, не по осям Q/C/T (S24-05; GEPA Algorithm 2).
- Жёсткое ограничение применимости: только задачи с детерминированной метрикой качества (процент упавших тестов, число rejected-циклов); открытые/субъективные задачи исключены — для них гейт человека без GEPA-скоринга (GEPA, arXiv 2507.19457, требует числовую воспроизводимую метрику).
- Фронтир-рефлектор обязателен: слабая модель не меняет промпт (M24-01; Decagon: GPT-4o-mini → 65 символов, ноль содержательных изменений).
- Оптимум 20–100 примеров в выборке рефлексии (M24-02; 500 → −2% качество, +75% раздувание, 10× стоимость); лимит длины шаблона 1500 символов (M24-03; 4× компрессия при −0.8% качества).
- Constraint-блок в обратной связи рефлектору — защита от утечки примеров в шаблон (M24-04).
- Триггер запуска — паттерн Ф21 (N≥3), не календарь (S24-06).
- Кандидаты-шаблоны — класс «шаблоны»: draft автономно, применение через гейт.
- Чеклист рисков фазы: спека §17 B.4 (все 6 режимов GEPA: bloat, переобучение, утечка примеров, metric gaming, локальный оптимум, over-optimization to judge).

**Критерий готовности:** ≥2 ревизии одного шаблона брифа оценены и сравнены по Парето (на задаче с детерминированной метрикой); применение — через гейт человека; лимит длины и размер выборки соблюдаются (числа — дефолты спеки §16).

### Phase 25 — AFlow: роутинг глубины ревью (эвристики, гейт человека)

**Goal:** Глубина ревью (число ревьюеров, строгость) маршрутизируется эвристиками по типу задачи вместо фиксированной схемы.

**Зависимости:** Phase 20 (метрики по типам задач — вход эвристик), Phase 23 (валидация роутинга pressure-тестами). Класс адаптации — «структура»: любые изменения эвристик — через человека.

**Состав:**

- Эвристики глубины ревью по типу задачи (детерминированные правила, без поиска топологии).
- Гейт человека на изменение эвристик.
- M25-01 (эвристики, не MCTS-поиск) и S25-02 (гейт человека) уже отражены в ред. 27.08 — подтверждено ревизией 2026-08-29, состав без изменений.

**Критерий готовности:** эвристика для ≥1 типа задач согласована человеком и даёт нехудшие метрики против базовой линии (сравнение до/после по сигнальному логу).

### Phase 26 — Decay по пробегу + переоценка A-MEM

> A-MEM-часть осталась условной (решение `mem_20260826_reshenie_sostav_mekhanizmov_samoobucheni_60c8cb`: `trigger_keywords` Phase 16 уже закрывают связность доставки). Rev. 2026-08-29: фаза переформатирована — decay (в ред. 27.08 жил в Phase 22) перенесён сюда и переведён на «пробег».

**Goal:** Память остаётся свежей: полезное продлевает себе жизнь срабатыванием, молчащее — гаснет в архив; измерение — «пробег» Wolf (сессии/запросы), не календарь.

**Зависимости:** Phase 20 (`delivery_event` — продление жизни; метрики recall), Phase 16 (готово — база сравнения доставки), Phase 22 (`last_triggered_at` — штамп при срабатывании call-injection).

**Состав:**

- Основа TTL — `last_triggered_at` (M26-01 — уже в ред. 27.08) + счётчик пробега `sessions_since_last_trigger`.
- TTL по типам в СЕССИЯХ без срабатывания, [ВА]-дефолты: session-summary 30 / lesson, rule 90 / decision 180 / core ∞ (M26-03; переведён из дней решением владельца 2026-08-29: у local-first инструмента нет «реального времени», дата-метрики врут; калибровка — спека §16).
- Опережающие drift-индикаторы → досрочный `review_required` (значение `review_state`, объект остаётся активным — в очередь дайджеста): смена стека (git-история), новые error_class в таксономии, падение rule_utilization <0.5 от baseline ([ВА]).
- Консолидация = дедуп, не суммаризация (M26-02; [ЦИТ] Microsoft: мерж-кластеризация роняет accuracy до 48.4%).
- Триггер переоценки A-MEM (S26-04): `recall_delivery < 0.8` при ≥20 events (пороги [ВА], калибровка — спека §16) → дизайн A-MEM выносится на architecture-review.
- Фоновая проверка без демона: прогон в `wolf learn digest`/`status`, может подвешиваться к плагину Phase 15 — уже в ред. 27.08.
- Чеклист рисков фазы: «Memory degradation» — спека §17 B.3.

**Критерий готовности:** правило, молчащее N сессий пробега (дефолт по типу), гаснет в архив через `review_required`-очередь `wolf learn digest`; drift-индикатор переводит объект в `review_required` досрочно; решение «нужен/не нужен A-MEM» фиксируется с данными метрик при срабатывании триггера.

### Направления после блока 20–26 (v1.1+)

- **Bootstrap-адаптация проекта.** Максимальная адаптация при подключении к существующему проекту: документы, код, конфиги (codegraph, AGENTS.md — входы), вопросы пользователю → стартовые правила + стартовый состав агентов. Bootstrap также задаёт permissions-профиль: доверенные каталоги (`/tmp`, worktrees, `.wolf`), инструменты, сетевые доступы, наследование профилей ролями. Пре-аппрув — только bootstrap-отчёта (однократно, массовое первичное изменение), далее пост-аудит (решение владельца 2026-08-29; спека §12).
- **Динамический состав агентов.** Старт с минимума; спавн специализированных агентов — решение Стюарда с 7 предохранителями: карантин/испытательный срок; минимальный скоуп; blast-radius оценка; одно изменение за раз; автогашение; post-audit журнал; запрет критичных (read-only) зон. Ненужные агенты отмирают (спека §11).
- **`wolf scaffold agent|skill|command`** — генерация тонкой рамки под платформу + playbook в памяти одной командой (спека §13).
- **Мультиплатформенная гармонизация.** Рамки per-platform (opencode / Claude Code / Cursor / Codex), содержимое общее в Wolf: Wolf — единый источник методик для всех агентских платформ (спека §13).
- **Отложенные nice (expert-013):** N21-05 synthetic reconstruction test (валидация кластеризатора, цель 80%+ recovery — при росте потока); N24-07 CLI `wolf template evolve/candidates/activate/rollback`.

## 3. Рекомендуемый порядок работы

1. **Phase 6** — завершить governance, добавить `rule`.
2. **Phase 7** — MCP server + `.wolf/SKILL.md` + `wolf recap`.
3. **Phase 8** — schema-driven taxonomy. Это фундамент для последующих фаз.
4. **Phase 9** — enhanced search: `file_path` + FTS5-улучшения сделаны (2026-08-26), semantic-часть deferred.
5. **Phase 10** — insights.
6. **Phase 11** — structured thinking.
7. **Phases 15–17, 19 (superpowers-интеграция)** — сделаны 2026-08-26; Phase 18 слита с Phase 23 (STOP-гейт).
8. **Phases 20–26 (самообучение)** — после утверждения плана пользователем; причинный порядок: 20 (сигнальный лог: `session-metrics.jsonl` + классификатор error_class + delivery_event) → 21 (паттерны: детерминированная кластеризация по ключу `tool_name:error_class_id` + опциональный semantic-слой) → 22 (Стюард: пост-аудит, Analyzer-Worker на фронтирной модели, Sandbox Replay, negative constraints, playbook-тип, `wolf complain`) → 23 (STOP-гейт + read-only зоны) → 24 (GEPA: фронтир-рефлектор, 20–100 примеров, лимит 1500 символов) → 25 (AFlow: эвристики, гейт человека) → 26 (decay в пробеге + drift-индикаторы; A-MEM — условная, по триггеру деградации recall); после блока — bootstrap-адаптация, динамический состав агентов, scaffold, мультиплатформа (v1.1+, см. «Направления после блока 20–26»). Спека: `docs/superpowers/specs/2026-08-26-self-learning-design.md`.
9. **Phase 12** — session wrap-up.
10. **Phase 13** — document ingest.
11. **Phase 14** — cross-project (when needed).

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

> Реализация этого решения вошла в контур самообучения: insights L2 — часть Phase 21, Analyzer-Worker (Phase 22) использует тот же адаптер.
