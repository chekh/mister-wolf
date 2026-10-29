# Phase 9 — wolf solve / wolf call: Memory-Assisted Problem Repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать два магических командных контура из концепции `docs/research/2026-07-03-wolf-solve.md`: `wolf solve "<problem>"` — сценарно-управляемый генератор Solve Pack для чистой AI-сессии (read-only по умолчанию, `--save` создаёт info-request с тегами solve/memory-repair), и `wolf call [--for topic] [--thread id] [--compact]` — компактная корректирующая инъекция памяти в активную сессию. Без LLM внутри Mr. Wolf, без эмбеддингов, без новых тяжёлых зависимостей.

**Architecture:** Гексагональная структура сохраняется. Новое в домене: реестр solve-сценариев (данные, не код агентов), детерминированный классификатор симптомов, формула релевантности поверх существующего FTS5-индекса, сборщик Solve Pack. Новый core-тип `call-injection` в `CORE_TAXONOMY` (23-й). Новые use-cases: `buildSolvePack`, `createMemoryRepairRequest`, `getCallInjections`. Новые CLI-команды: `wolf solve`, `wolf call`, `wolf relation add`. Ничего из этого не делает Mr. Wolf агентом: он только готовит память.

**Tech Stack:** TypeScript (ESM), zod 4, better-sqlite3 9, commander 12, js-yaml 4, vitest. **Новых зависимостей нет** — используются только уже установленные (см. V11). Эмбеддинги/LLM-клиенты запрещены.

---

## 0. Сверка с реальным доменом (проверено перед написанием)

Все утверждения концепции сверены с кодом dev post-Phase 8. Расхождения зафиксированы и закрыты решениями ниже.

| #   | Факт                                                                                                                                                                                                                                                                                                                                                                                   | Источник                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| V1  | Brief генерируется из `store.list({status:'active'})`; Active Memory = accepted, минус context/open-question/blocker, сортировка updated_at desc, top-10; секции: Project Snapshot / What This Project Is / Technology Stack / Key Files & Entry Points / Architecture Notes / Active Memory / Open Questions / Blockers / Sources / Limitations / Recommended First Steps             | src/app/use-cases/generate-agent-brief.ts:19-38,100-165                                               |
| V2  | Реестр таксономии: `mergeTaxonomy(config \| null)` возвращает Map всех деклараций (core + project, конфликт имён → ProjectTypeConflictError); `transitionsFor(decl)` = ALLOWED_TRANSITIONS ∩ lifecycle                                                                                                                                                                                 | src/domain/taxonomy.ts:13-45                                                                          |
| V3  | Relations: 16 предикатов с полными инверсиями (answers↔answered_by, supersedes↔superseded_by, based_on↔basis_for, related_to↔related_to, …); RelationSchema = {id, subject, predicate, object, created_at, source, confidence}; recordRelation пишет forward+inverse парой                                                                                                             | src/domain/schemas/relation-schema.ts:3-30, src/app/use-cases/record-relation.ts:6-57                 |
| V4  | RelationLog port: `append(relation)`, `list(filters?: {subject?, object?, predicate?})` — tally уже использует `list({object, predicate:'answers'})`                                                                                                                                                                                                                                   | src/ports/relation-log.port.ts:3-6, src/app/use-cases/tally-council-votes.ts:17                       |
| V5  | Layout v2: work-thread → `threads/<id>/WORK-THREAD.md`; объект с thread → `threads/<tid>/<subdirThread>/`; иначе `shared/<subdirShared ?? subdirThread>/`; store dual-read корни `[threads, shared, objects(legacy)]`, дедуп по id (v2 выигрывает)                                                                                                                                     | src/adapters/fs/project-paths.ts:90-97, src/adapters/fs/markdown-memory-store.ts:47-49,93-110         |
| V6  | `validate` имеет 7 секций (taxonomy/layout/objects/events/relations/index/locks), exit 1 при errors; `--fix` карантинит битые объекты через `store.quarantineFiles` в `.wolf/memory/quarantine/<rel-path>/` + sidecar `.meta.json`                                                                                                                                                     | src/adapters/cli/commands/memory-validate.ts:29-205, src/adapters/fs/markdown-memory-store.ts:178-189 |
| V7  | Поиск: FTS5 `memory_search(memory_id,type,title,body,tags,status,review_state)` + `memory_meta`; query оборачивается в фразу `"..."`; ранжирование `ORDER BY rank`, итоговый score = `-rawRank * (1 + importance) * confidenceWeight(high=1.2/medium=1.0/low=0.8)`; **recency в ранжировании НЕ участвует**; limit — post-slice                                                        | src/adapters/sqlite/sqlite-schema.ts:2-27, src/adapters/sqlite/sqlite-search-index.ts:43-127          |
| V8  | Generic-создание: `extra` присваивается до валидации; неизвестный ключ → throw `Unknown field`; per-type `buildTypeSchema(decl).safeParse` обязателен; статус по умолчанию = голова lifecycle (`input.status ?? getDeclaration(type).lifecycle[0]`)                                                                                                                                    | src/app/use-cases/add-memory-object.ts:48,66-78                                                       |
| V9  | Council: tally собирает голоса из council-opinion по relations answers→questionId; extractVote = поле vote → `/^VOTE:\s*(\S+)/m` из body → 'TIMEOUT'; quorum/threshold дают winner; synthesis создаётся со статусом proposed + based_on на каждый opinion                                                                                                                              | src/app/use-cases/tally-council-votes.ts:13-42, src/app/use-cases/create-synthesis.ts:12-59           |
| V10 | Memory lock: `.wolf/memory/.lock`, эксклюзивный `open('wx')` c `{pid,ts}`, stealIfStale (STALE_MS=30s), ожидание до MAX_WAIT_MS=5s → LockHeldError; все write-use-cases принимают `lock?: MemoryLock`, вложенные вызовы стрипают lock                                                                                                                                                  | src/adapters/fs/memory-lock.ts:5-106                                                                  |
| V11 | Зависимости: @modelcontextprotocol/server, better-sqlite3, commander, fast-glob, js-yaml, uuid, zod — ничего нового для solve/call не требуется                                                                                                                                                                                                                                        | package.json:20-28                                                                                    |
| V12 | 22 типа; обязательные поля: work-thread.goal; info-request.{thread,question,detour_reason,expected_answer}; article.{thread,summary}; blocker.impact; session-checkpoint.thread; rule.scope; task-brief.{executor,priority}; council-question.question; council-opinion.vote; synthesis.recommendation; escalation.question; decision-request.question; document-ref.requireSourcePath | src/domain/memory-types.ts:92-232                                                                     |
| V13 | Lifecycle-головы: active — большинство; open — info-request, council-question, escalation, decision-request; proposed — article, council-opinion, synthesis                                                                                                                                                                                                                            | src/domain/memory-types.ts:92-232                                                                     |
| V14 | E2E-каркас: helpers runCli/tmpProject/writeRelationScript/ensureBuilt; файлы `*.e2e.ts` + отдельный tests/e2e/vitest.config.ts (singleFork, timeout 120s); `npm run e2e` = build + vitest; корневой check e2e не подхватывает                                                                                                                                                          | tests/e2e/helpers.ts:7-47, tests/e2e/vitest.config.ts:7-11, package.json:17                           |
| V15 | CLI-дыры, подтверждённые E2E: (a) команды создания relations нет вовсе; (b) `add --set k=v` не выражает array/nested поля — info-request и document-ref через generic CLI не создаются                                                                                                                                                                                                 | tests/e2e/generic-add.e2e.ts, README Testing                                                          |

### Отклонения от концепции (осознанные, документируются в README)

| #      | Концепция говорит                                                                          | Спека решает                                                                                                                                                                                                                             | Почему                                                                                            |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| D-dev1 | Примеры id вида `rule_cli_entity_get_20260703`                                             | Реальные id — `mem_<date>_<slug>_<hash>` (генератор не меняется)                                                                                                                                                                         | Существующее пространство имён; Solve Pack ссылается на фактические id                            |
| D-dev2 | retrieve.include_types содержит `document`                                                 | Заменить на `document-ref` (+`document-native` где уместно); `document` deprecated и невидим для CLI-add                                                                                                                                 | Phase 8 сплит (#13); V12                                                                          |
| D-dev3 | info-request для solve-запроса хранится с полем kind=memory-repair                         | Маркер — теги `['solve','memory-repair']`, поле `kind` НЕ добавляется; `info-request.thread` расслабляется до optional (проектные запросы существуют вне тредов; create-info-request сохраняет требование thread для тредового потока)   | Не раздувать канон полей; теги уже ищутся индексом (V7); thread-required ломал бы solve вне треда |
| D-dev4 | Модули `src/domain/memory/*.ts`, `src/app/memory/*.ts`, каталог `.mrwolf/solve-scenarios/` | Плоские пути проекта: `src/domain/solve/*.ts`, `src/app/use-cases/*.ts`, `src/adapters/cli/commands/memory-{solve,call}.ts`; сценарии — код-канон в домене, проектные оверрайды через `.wolf/config.yaml` в будущей фазе (не `.mrwolf/`) | Единообразие с фактической структурой репозитория; `.mrwolf/` не существует                       |
| D-dev5 | `wolf doctor` упомянут как отдельная команда                                               | Не реализуется — его роль с Phase 8 выполняет `wolf validate` (7 секций, V6)                                                                                                                                                             | Дублирование функционала                                                                          |
| D-dev6 | `wolf recall` упомянут как отдельная команда                                               | Не реализуется в Phase 9 — роль частично покрывают `wolf brief` и `wolf search`; вынесено в roadmap-кандидат                                                                                                                             | MVP-узость (§15 концепции)                                                                        |
| D-dev7 | `wolf install-agent-rules --target opencode`                                               | Не реализуется; конвенция «listen to Wolf» добавляется в README/AGENTS.md вручную (шаг Task 6)                                                                                                                                           | Один генератор конфигов агентов — отдельная задача                                                |

---

## 1. Решения: закрытие открытых вопросов концепции (§21)

### D1 — call-injection: первый класс (Q1)

`call-injection` становится 23-м core-типом в `CORE_TAXONOMY`:

```typescript
{
  name: 'call-injection',
  lifecycle: ['active', 'superseded', 'archived'],
  subdirThread: null,
  subdirShared: 'calls',
  fields: {
    trigger_keywords: { kind: 'string[]', default: [] },
    related_objects: { kind: 'string[]', default: [] },
  },
}
```

Обоснование: инъекция — операционный артефакт с собственным коротким lifecycle (не rule: нет rationale, живёт недолго), нужен собственный подкаталог для выборки `list({type:'call-injection', status:'active'})` и собственные поля фильтрации. Tag-based подход к rule загрязнил бы выборку правил. Позиция в MEMORY_TYPES — в конец списка (стабильность первых 22). Тело инъекции — базовое поле `body`.

### D2 — repair-plan: out of scope MVP (Q2)

`solve --save` создаёт только `info-request` с тегами `['solve','memory-repair']`. Тип `memory-repair-plan` и команда `wolf repair apply` — out of scope (совпадает с §22 концепции «Do not include: automatic repair application»). Применение исправлений — руками чистой AI-сессии через существующие команды (article add, rule add, relation add, supersede).

### D3 — состав `wolf call` (Q3)

MVP: активные call-injections, отфильтрованные по topic (--for: совпадение по trigger_keywords/title/body через FTS), затем — если пусто — fallback: до 3 активных rules, релевантных topic (тот же поиск). Принятые decisions в call НЕ включаются (слишком объёмно для инъекции; их место в Solve Pack). `--thread <id>` добавляет к выдаче правила с scope=project и открытые блокеры треда. Провенанс обязателен: каждый блок вывода завершается строкой `source: <id>`.

### D4 — порядок сценариев: project-wide раньше thread-specific (Q4)

Да: MVP-сценарии работают на уровне проекта; thread-специфика ограничена флагом `--thread` у call (D3). Thread-level solve-сценарии — будущая фаза.

### D5 — расположение сценариев (Q5)

Сценарии — код-канон в `src/domain/solve/scenarios.ts` (данные: id, title, symptoms-ключевые слова, include_types, checks-описания, required_outputs). Проектные оверрайды через `.wolf/config.yaml` — явно out of scope Phase 9 (нужен парсер сценарного YAML — отдельное решение после MVP). Каталог `.mrwolf/` не используется (D-dev4).

### D6 — бюджет компактности (Q6)

`--compact` enforced жёстко по символам: бюджет 1200 символов (≈300 токенов); при переполнении — обрезка по границе блока (целая инъекция/правило выбрасывается целиком, начиная с наименее релевантного), в конце строка `[truncated: N blocks omitted]`. Бюджет параметризуем: `--compact[=N]`, дефолт 1200; без флага бюджет не применяется. Токены не считаем (нет токенизатора и не тащим) — символы детерминированы и тестируемы.

### D7 — «listen to Wolf» (Q7)

В AGENTS.md/README добавляется конвенция вручную (шаг Task 6.3), автогенерация install-agent-rules — out of scope (D-dev7).

### D8 — релевантность (требование спека-ревью)

Без эмбеддингов. Формула поверх существующего индекса (V7):

```
finalScore = ftsScore * (1 + importance) * confidenceWeight * recencyFactor
ftsScore      = -rawRank (как сейчас)
recencyFactor = 1 / (1 + ageDays / 30)   // ageDays от updated_at
confidenceWeight = high 1.2 | medium 1.0 | low 0.8
```

Реализация: `index.search()` возвращает сырые кандидаты (уже с importance/confidence весами), solve пересортировывает по finalScore с recencyFactor. Детерминировано, тестируемо, без новых зависимостей. Порог отсечения: в Solve Pack попадают объекты с finalScore > 0 (все непустые совпадения), топ-12, далее группировка по типу.

### D9 — классификация сценария (детерминированная)

Классификатор считает пересечение нормализованных слов проблемы со словами symptoms каждого сценария (lowercase, без стоп-слов ru/en); winner = максимум совпадений; tie/ноль → сценарий `generic` (broad retrieval: rule/decision/article/document-ref/session-checkpoint). Никакого ML. Сценарий выводится в заголовке Solve Pack вместе с причиной выбора (совпавшие симптомы) — прозрачность вместо магии.

### D10 — интеграция с task-brief/report жизненным циклом

Solve/call НЕ создают task-brief/report: это артефакты исполнителя, а не памяти (разные плоскости). Интеграция точечная: (a) `solve --save --thread <id>` привязывает info-request к треду (поле thread); (b) `call --thread <id>` включает незакрытые blocker'ы треда; (c) закрытие цикла ремонта фиксируется обычными средствами (diagnosis article + supersedes relation), что видно в `thread brief`. Отдельных переходов/типов не требуется.

### D11 — поведение при отсутствии данных

- `solve` на пустой памяти: Solve Pack рендерится с пустой секцией Relevant Memory и явной пометкой `No relevant memory found — this may indicate missing-rule or fresh project`; анализ-промпты сохраняются. Exit 0.
- `call` без инъекций и правил: stdout `No active call injections.` + (при --thread) блок blockers треда если есть. Exit 0.
- `solve --save` всегда создаёт info-request (даже на пустой памяти) — это первый полезный артефакт.

---

## 2. Структура файлов

**Create:**

- `src/domain/solve/scenarios.ts` — реестр сценариев (данные): stale-instruction, missing-rule, generic
- `src/domain/solve/classify.ts` — детерминированный классификатор симптомов
- `src/domain/solve/relevance.ts` — recencyFactor + finalScore
- `src/app/use-cases/build-solve-pack.ts` — сборка Solve Pack (read-only)
- `src/app/use-cases/create-memory-repair-request.ts` — info-request с тегами solve/memory-repair
- `src/app/use-cases/get-call-injections.ts` — выборка активных инъекций + fallback rules
- `src/adapters/cli/commands/memory-solve.ts` — `wolf solve`
- `src/adapters/cli/commands/memory-call.ts` — `wolf call`
- `src/adapters/cli/commands/memory-relation.ts` — `wolf relation add`
- `tests/unit/domain/solve-classify.test.ts`, `tests/unit/domain/solve-relevance.test.ts`
- `tests/unit/use-cases/build-solve-pack.test.ts`, `tests/unit/use-cases/create-memory-repair-request.test.ts`, `tests/unit/use-cases/get-call-injections.test.ts`
- `tests/e2e/solve.e2e.ts`, `tests/e2e/call.e2e.ts`, `tests/e2e/solve-empty.e2e.ts`

**Modify:**

- `src/domain/memory-types.ts` — +call-injection (MEMORY_TYPES и CORE_TAXONOMY), info-request.thread → optional
- `src/adapters/cli/cli-entry.ts` — регистрация 3 команд
- `AGENTS.md`, `README.md` — конвенция «listen to Wolf», документация команд
- `tests/unit/domain/taxonomy.test.ts` — обновить ожидания 23 типов (эквивалентность выведется сама, добавить кейс call-injection)

---

## 3. Предусловия

- [ ] **Шаг 0.1: Ветка.** `git checkout dev && git checkout -b feat/phase9-solve-call`
- [ ] **Шаг 0.2: Базовая линия.** `npm run check` зелёный (54 файла / 169 тестов на момент написания). Если красное — починить до старта.

---

### Task 1: `wolf relation add` — закрытие CLI-дыры (микробатч)

**Files:** Create `src/adapters/cli/commands/memory-relation.ts`; Modify `cli-entry.ts`; Test `tests/e2e/relation-add.e2e.ts` (spawnSync против dist — каркас tests/e2e собирает dist и гоняется через `npm run e2e`; корневой check dist не собирает, V14).

- [ ] **Step 1.1: Failing-тест.** В `tests/e2e/relation-add.e2e.ts` (импортирует существующий helpers.ts): spawnSync `relation add <subject> answers <object>` → status 0, stdout содержит 'Recorded relation'; повторный вызов с теми же аргументами пишет вторую пару (инверсии дублируются осознанно, как везде).
- [ ] **Step 1.2: Run → FAIL** (unknown command).
- [ ] **Step 1.3: Реализация.** Команда `relation add <subject> <predicate> <object>` c `.addOption(new Option('--source').choices(['manual','agent','system']).default('agent'))`; deps из createCliContainer; вызов recordRelation(deps, new Date(), subject, predicate, object, source); валидация предиката — zod-enum бросит сам (error message commander'а приемлем).
- [ ] **Step 1.4: GREEN + полный check.** Коммит: `feat(relation): expose relation add via CLI`.

Обоснование включения: чистая AI-сессия пишет supersedes/based_on-связи руками — без этой команды цикл ремонта не замыкается (E2E-дыра подтверждена, V15a).

---

### Task 2: тип call-injection (микробатч)

**Files:** Modify `src/domain/memory-types.ts`, `tests/unit/domain/taxonomy.test.ts`.

- [ ] **Step 2.1: Failing-тест.** В taxonomy.test.ts: `expect(getDeclaration('call-injection').subdirShared).toBe('calls')`; `expect(MEMORY_TYPES).toHaveLength(23)`; эквивалентность-тест (covers every entry) обновляется автоматически, но явный кейс на новый тип добавляется.
- [ ] **Step 2.2: Run → FAIL** (типа нет).
- [ ] **Step 2.3: Реализация.** MEMORY_TYPES += 'call-injection' (в конец); декларация из D1; `info-request.thread` → `{ kind: 'string', optional: true }` (D-dev3). Per-type схема строится автоматически билдером — отдельных файлов схем не нужно.
- [ ] **Step 2.4: GREEN + полный check** (guard-тесты схем зелёные — call-injection не имеет hand-written схемы). Затем `npm run build && wolf taxonomy sync` локально/в песочнице для проверки генератора — коммит `.wolf/config.yaml` невозможен (`.wolf/` в .gitignore, зеркало таксономии не расходится с каноном по построению). Коммит: `feat(domain): call-injection type, info-request.thread optional`.

---

### Task 3: домен solve — сценарии, классификатор, релевантность, сборщик

**Files:** Create `src/domain/solve/scenarios.ts`, `classify.ts`, `relevance.ts`, `src/app/use-cases/build-solve-pack.ts`; тесты `tests/unit/domain/solve-classify.test.ts`, `solve-relevance.test.ts`, `tests/unit/use-cases/build-solve-pack.test.ts`.

- [ ] **Step 3.1: Failing-тест классификатора.** 'classifies deprecated-command symptom as stale-instruction' (строка про repeated forbidden action → stale-instruction); 'classifies repeated-correction symptom as missing-rule'; 'falls back to generic on unknown symptom'; 'tie breaks by scenario order'.
- [ ] **Step 3.2: Run → FAIL.**
- [ ] **Step 3.3: Реализация classify.ts.** `classifyScenario(problemText): { scenarioId, matchedSymptoms }` — нормализация (lowercase, split по не-буквам, стоп-слова en/ru списком в константе), подсчёт пересечений со словами symptoms, максимум; tie → порядок в реестре; 0 → generic. Реестр сценариев (scenarios.ts) задаёт include_types: stale-instruction → [rule, decision, session-checkpoint]; missing-rule → [rule, decision, article]; generic → [rule, decision, article, document-ref, session-checkpoint] (D9) — ассерты Steps 3.7/6.1 зависят от rule+decision в выдаче первых двух.
- [ ] **Step 3.4: GREEN.**
- [ ] **Step 3.5: Failing-тест релевантности.** 'recency factor decays with age' (fresh=1.0, 30 дней≈0.5, 90 дней≈0.25 — допуск); 'finalScore multiplies fts/importance/confidence/recency'.
- [ ] **Step 3.6: Run → FAIL → реализация relevance.ts** (формула D8) → GREEN.
- [ ] **Step 3.7: Failing-тест сборщика.** 'builds solve pack with scenario header, grouped memory, analysis prompts, constraints' — фикстура store с rule (active, старый) + rule (active, новый) + decision; проблема про deprecated get; ассерты: заголовок `# Mr. Wolf Solve Pack`, секция Scenario: stale-instruction (matched: …), Relevant Memory сгруппирован по типам с id, Required Output содержит diagnosis/proposed rule/supersedes relation/call-injection, Constraints содержат 'Prefer superseding over deleting'; 'empty memory renders pack with explicit no-memory note' (D11).
- [ ] **Step 3.8: Run → FAIL → реализация build-solve-pack.ts**: сигнатура `buildSolvePack(deps {store, index?, clock}, input {problem, scenarioId?}) → { markdown: string; objectIds: string[] }` (objectIds — id выданных объектов, источник relevantIds для `solve --save`, Step 4.5); retrieval: для каждого include_types сценария — index.search(term) по 2-3 ключевым словам проблемы ИЛИ store.list({type}) при отсутствии index; дедуп по id; ранжирование D8; топ-12; группировка по типу; рендер markdown (структура §7 концепции). Read-only: ни store.save, ни log.append. → GREEN.
- [ ] **Step 3.9: Полный check.** Коммит: `feat(solve): scenario registry, deterministic classifier, relevance ranking, solve pack builder`.

---

### Task 4: solve --save и wolf call

**Files:** Create `src/app/use-cases/create-memory-repair-request.ts`, `get-call-injections.ts`, `src/adapters/cli/commands/memory-solve.ts`, `memory-call.ts`; Modify `cli-entry.ts`; тесты `tests/unit/use-cases/create-memory-repair-request.test.ts`, `get-call-injections.test.ts`.

- [ ] **Step 4.1: Failing-тест repair-request.** 'creates info-request tagged solve/memory-repair with expected answer contract': createMemoryRepairRequest(deps, {problem, relevantIds, thread?}) → объект type info-request, tags содержит 'solve' и 'memory-repair', question = problem, detour_reason = 'Analyzing stale project memory would derail the active development session.', expected_answer = [Diagnosis, Stale or conflicting memory objects, Proposed rule or relation changes, Compact call injection], needed_for содержит 'Create a durable memory correction', thread = input.thread (undefined допустим — D-dev3), status open (голова lifecycle). Путь записи: createMemoryRepairRequest пишет через store напрямую — не через use-case create-info-request, который сохраняет обязательный thread для тредового потока (D-dev3); это устраняет конфликт обязательности thread со схемой.
- [ ] **Step 4.2: Run → FAIL → реализация → GREEN.**
- [ ] **Step 4.3: Failing-тест get-call-injections.** 'returns active injections matching topic keywords ranked by relevance'; 'returns all active injections ranked by relevance when called without --for' (минимальный ассерт на полноту/порядок); 'thread mode appends project rules and open blockers' (--thread добавляет к выдаче правила scope=project и открытые blocker'ы треда); 'falls back to up to 3 active rules when no injections match'; 'respects compact budget dropping whole blocks' (3 инъекции по ~600 символов, бюджет 1200 → 2 блока + truncated-строка).
- [ ] **Step 4.4: Run → FAIL → реализация get-call-injections.ts**: сигнатура `getCallInjections(deps {store, index}, input {topic?, thread?, compact?}) → блоки вывода`; без --for — все активные инъекции с ранжированием D8; при --thread — дополнительно правила scope=project и открытые blocker'ы треда (D3/D10b); (D3/D6: filter type=call-injection status=active; topic-match через trigger_keywords ∩ topic-слова, иначе FTS; fallback rules; бюджет 1200 символов, обрезка целыми блоками, провенанс `source: <id>` в каждом блоке) → GREEN.
- [ ] **Step 4.5: CLI.** `wolf solve "<problem>" [--save] [--thread <id>]`: печатает Solve Pack в stdout; --save берёт relevantIds из результата buildSolvePack (`objectIds`, Step 3.8), создаёт repair-request и печатает `Saved repair request: <id>`. `wolf call [--for <topic>] [--thread <id>] [--compact]`: печатает блоки; без данных — `No active call injections.` Регистрация в cli-entry.
- [ ] **Step 4.6: Полный check.** Коммит: `feat(solve): wolf solve --save and wolf call with compact budget`.

---

### Task 5: документация и конвенция

**Files:** Modify `README.md`, `AGENTS.md`, `MEMORY.md`. <!-- MEMORY.md заархивирован 2026-08-25; с 2026-09-01 — только git-история до b31cbdd -->

- [ ] **Step 5.1:** README: секция Phase 9 — solve/call workflow (двухсессионный цикл из §13 концепции), примеры команд, safety model (read-only по умолчанию).
- [ ] **Step 5.2:** AGENTS.md: Architecture Notes += solve/call; конвенция «When the user says "listen to Wolf"/«слушай Wolf», run `wolf call` and treat returned injections as active guidance» (§14 концепции, сокращённо).
- [ ] **Step 5.3:** MEMORY.md: обновить секции фаз (Phase 9 завершена) и команд (solve/call/relation add). <!-- MEMORY.md заархивирован 2026-08-25; с 2026-09-01 — только git-история до b31cbdd -->
- [ ] **Step 5.4:** Полный check. Коммит: `docs: phase 9 solve/call documentation`.

---

### Task 6: E2E золотые сценарии

**Files:** Create `tests/e2e/solve.e2e.ts`, `tests/e2e/call.e2e.ts`, `tests/e2e/solve-empty.e2e.ts` (каркас helpers.ts существующий, \*.e2e.ts паттерн).

- [ ] **Step 6.1: solve.e2e.ts** — 'solve builds stale-instruction pack on seeded memory': init → `thread create --title <t> --goal <g>` (тред нужен для article в Step 6.2) → `rule add --scope project` старое правило («use top-level get») → `rule add --scope project` новое («use entity-specific get») → БЕЗ supersedes-relation → `solve "agent keeps using deprecated get command"` → stdout содержит `Scenario: stale-instruction`, оба id правил, `Prefer superseding over deleting`.
- [ ] **Step 6.2: call.e2e.ts** — 'clean session repairs memory and call injects the fix': продолжение фикстуры 6.1 → чистая сессия эмулируется CLI: `article add --thread <id из 6.1> --summary <s>` диагноз, `supersede <old> <new>`, `relation add <new> supersedes <old>`, сеяние call-injection скрипт-фикстурой по паттерну writeRelationScript (tests/e2e/helpers.ts): node-скрипт импортирует dist-store и пишет объект type=call-injection с array-полем `trigger_keywords=['get','deprecated']` напрямую — generic `add --set` парсит значения только в строки и не выражает string[]-поля (V15b, buildTypeSchema отклонит строку) → `call --for get` → stdout содержит тело инъекции и `source: <injection-id>`; старое правило НЕ фигурирует как активная инструкция.
- [ ] **Step 6.3: solve-empty.e2e.ts** — 'solve on empty memory degrades gracefully': init → подсчёт файлов `.wolf/memory` до → `solve "anything"` → exit 0, stdout содержит `No relevant memory found`, число файлов после не изменилось (read-only); `solve --save "anything"` → exit 0, stdout содержит id созданного info-request (D11); `call --for x` → `No active call injections.`, exit 0.
- [ ] **Step 6.4:** Полный `npm run check` + `npm run e2e`. Коммит: `test(e2e): solve/call golden scenarios — stale instruction, repair loop, empty memory`.

---

## Definition of Done (фаза)

1. `wolf solve "<problem>"` рендерит Solve Pack (scenario header, grouped memory, analysis, outputs, constraints), read-only по умолчанию; `--save` создаёт info-request с тегами solve/memory-repair.
2. `wolf call --for <topic>` возвращает компактную инъекцию с провенансом; `--compact` держит бюджет 1200 символов; fallback на rules работает; без `--for` — все активные инъекции с ранжированием D8; `--thread <id>` добавляет правила scope=project и открытые blocker'ы треда (D3/D10b).
3. `wolf relation add` закрывает CLI-дыру; цикл ремонта (диагноз → правило → supersedes → инъекция) проходится целиком через CLI.
4. Все 7 открытых вопросов концепции закрыты решениями D1–D7; отклонения D-dev1–D-dev7 задокументированы.
5. Ни одной новой зависимости (V11); domain ничего не импортирует из app/adapters.
6. E2E: 3 новых золотых сценария зелёные; полный `npm run check` и `npm run e2e` зелёные.
7. Документация обновлена (правило репозитория).

## E2E-секция (правило mem_20260823_e2e_5459cc)

Новые золотые сценарии (см. Task 6), совместимые с каркасом tests/e2e (CLI-subprocess, tmp-проекты, \*.e2e.ts):

1. **solve на засеянной памяти** — конфликтующие правила без supersedes → Solve Pack со сценарием stale-instruction и обоими id (ловит регрессию классификатора и retrieval).
2. **цикл ремонта через call** — чистая сессия чинит память CLI-командами, `call --for` инжектирует исправление, старое правило не звучит как активное (ловит регрессию фильтрации/lifecycle).
3. **solve/call на пустой памяти** — graceful degradation, exit 0 (ловит crash на отсутствующих данных — класс бага, который юнит-тесты пропускают).

Требование к прогону: `npm run e2e` зелёный перед merge; негативная проверка ценности — временно сломать классификатор (вернуть generic всем сценариям) → solve.e2e.ts краснеет.

## Self-review (что сознательно опущено относительно эталона Phase 8)

- Шаги задач даны как контракты поведения + полные интенты тестов, без дословных листингов реализации — там, где тело механически выводится из теста (паттерн эталона Phase 8: «тесты даны полностью и являются спецификацией поведения»). Исполнитель пишет тело по контрактам; расхождение с тестом = баг реализации, а не теста.
- Нет секции «Единственная миграция layout» — миграций в Phase 9 нет.
- Нет задач MCP-расширения (прецедент D6 Phase 8: новые CLI-команды без MCP-тулов; вынести в отдельное решение).
- Нет `wolf repair apply` / типа memory-repair-plan (D2).
- Нет `wolf recall` и `wolf doctor` (D-dev5, D-dev6).
- Нет проектных оверрайдов сценариев через config.yaml (D5) и thread-level сценариев (D4).
- Формула релевантности намеренно односложна; поведенческая настройка (weights в конфиг) — после первого живого использования.
