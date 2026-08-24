# Phase 9 — wolf solve / wolf call — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Спека:** `docs/superpowers/specs/2026-08-23-phase-9-solve-call.md` (refined autorefine r3, коммит `5b91054`). План — развёртка спеки 1:1; все решения D1–D11 и отклонения D-dev1–D-dev7 определены там и здесь не дублируются. V-факты кода — спека §0.

**Goal:** Реализовать `wolf solve "<problem>" [--save] [--thread]` (сценарный Solve Pack, read-only по умолчанию), `wolf call [--for] [--thread] [--compact]` (компактная инъекция с провенансом и бюджетом 1200 символов), `wolf relation add` (закрытие CLI-дыры V15a) и core-тип `call-injection`. Без LLM, без эмбеддингов, без новых зависимостей.

**Tech Stack:** TypeScript (ESM), zod 4, better-sqlite3 9, commander 12, js-yaml 4, vitest — только существующие зависимости (спека V11).

---

## Предусловия

- [ ] **Шаг 0.1: Ветка.** `git checkout dev && git checkout -b feat/phase9-solve-call`
- [ ] **Шаг 0.2: Базовая линия.** `npm run check` зелёный (54 файла / 169 тестов на момент написания плана). Если красное — починить до старта, не тащить в фазу.

---

### Task 1: `wolf relation add` — закрытие CLI-дыры

**Files:** Create `src/adapters/cli/commands/memory-relation.ts`, `tests/e2e/relation-add.e2e.ts`; Modify `src/adapters/cli/cli-entry.ts`.

- [ ] **Step 1.1: Failing-тест.** В `tests/e2e/relation-add.e2e.ts` (импортирует существующий helpers.ts): spawnSync `relation add <subject> answers <object>` → status 0, stdout содержит 'Recorded relation'; повторный вызов с теми же аргументами пишет вторую пару (инверсии дублируются осознанно, как везде); невалидный предикат → status != 0.
- [ ] **Step 1.2: Run → FAIL** (`npm run e2e` или точечно `npx vitest run --config tests/e2e/vitest.config.ts tests/e2e/relation-add.e2e.ts`) — unknown command.
- [ ] **Step 1.3: Реализация.** Команда `relation add <subject> <predicate> <object>` c `.addOption(new Option('--source').choices(['manual','agent','system']).default('agent'))`; deps из createCliContainer; вызов recordRelation(deps, new Date(), subject, predicate, object, source); валидация предиката — zod-enum бросает сам. Вывод: `Recorded relation: <subject> -<predicate>- <object>`.
- [ ] **Step 1.4: GREEN + полный `npm run check`.** Коммит: `feat(relation): expose relation add via CLI`.

---

### Task 2: тип call-injection + optional thread у info-request

**Files:** Modify `src/domain/memory-types.ts`, `tests/unit/domain/taxonomy.test.ts`.

- [ ] **Step 2.1: Failing-тест.** В `tests/unit/domain/taxonomy.test.ts`: `expect(MEMORY_TYPES).toHaveLength(23)`; `expect(getDeclaration('call-injection').subdirShared).toBe('calls')`; `expect(getDeclaration('call-injection').lifecycle).toEqual(['active','superseded','archived'])`; `expect(getDeclaration('info-request').fields?.thread).toEqual({ kind: 'string', optional: true })`. Эквивалентность-тест 'covers every MEMORY_TYPES entry exactly once' обновится сам.
- [ ] **Step 2.2: Run → FAIL** (`npm run test:run -- tests/unit/domain/taxonomy.test.ts`) — типа нет, длина 22.
- [ ] **Step 2.3: Реализация.** MEMORY_TYPES += 'call-injection' (в конец, после decision-request); декларация `{ name: 'call-injection', lifecycle: ['active','superseded','archived'], subdirThread: null, subdirShared: 'calls', fields: { trigger_keywords: { kind:'string[]', default: [] }, related_objects: { kind:'string[]', default: [] } } }`; `info-request.thread` → `{ kind: 'string', optional: true }`. Per-type схема строится билдером автоматически.
- [ ] **Step 2.4: GREEN + полный `npm run check`** (guard-тесты схем зелёные — hand-written схемы не затронуты). Затем `npm run build && node dist/bootstrap/cli.js taxonomy sync` в песочнице/копии проекта для проверки генератора (в рабочем репо `.wolf/` gitignored — sync локальный, коммитить нечего). Коммит: `feat(domain): call-injection type, info-request.thread optional`.

---

### Task 3: домен solve — сценарии, классификатор, релевантность, сборщик

**Files:** Create `src/domain/solve/scenarios.ts`, `src/domain/solve/classify.ts`, `src/domain/solve/relevance.ts`, `src/app/use-cases/build-solve-pack.ts`, `tests/unit/domain/solve-classify.test.ts`, `tests/unit/domain/solve-relevance.test.ts`, `tests/unit/use-cases/build-solve-pack.test.ts`.

- [ ] **Step 3.1: Failing-тест классификатора** (`tests/unit/domain/solve-classify.test.ts`):
  - 'classifies deprecated-command symptom as stale-instruction' — строка «agent keeps using deprecated get command» → scenarioId 'stale-instruction', matchedSymptoms непустой;
  - 'classifies repeated-correction symptom as missing-rule' — «user repeats the same instruction every session» → 'missing-rule';
  - 'falls back to generic on unknown symptom' — «weather is nice today» → 'generic';
  - 'tie breaks by scenario order in registry'.
- [ ] **Step 3.2: Run → FAIL** (модуля нет).
- [ ] **Step 3.3: Реализация classify.ts.** `classifyScenario(problemText): { scenarioId, matchedSymptoms }` — нормализация (lowercase, split по не-буквам, стоп-слова en/ru в константе STOP_WORDS), подсчёт пересечений со словами symptoms сценария, максимум; tie → порядок реестра; 0 → generic. Реестр `scenarios.ts` задаёт include_types: stale-instruction → [rule, decision, session-checkpoint]; missing-rule → [rule, decision, article]; generic → [rule, decision, article, document-ref, session-checkpoint] (D9) — ассерты Steps 3.7/6.1 зависят от rule+decision в выдаче первых двух.
- [ ] **Step 3.4: GREEN** (`npm run test:run -- tests/unit/domain/solve-classify.test.ts`).
- [ ] **Step 3.5: Failing-тест релевантности** (`tests/unit/domain/solve-relevance.test.ts`): 'recency factor decays with age' — fresh ≈ 1.0, 30 дней ≈ 0.5, 90 дней ≈ 0.25 (допуск ±0.01); 'finalScore multiplies fts/importance/confidence/recency' — контрольный пример с ручным расчётом.
- [ ] **Step 3.6: Run → FAIL → реализация relevance.ts**: `recencyFactor(updatedAt, now) = 1/(1+ageDays/30)`; `finalScore = ftsScore * (1+importance) * confidenceWeight * recencyFactor`, confidenceWeight high=1.2/medium=1.0/low=0.8 (D8). → GREEN.
- [ ] **Step 3.7: Failing-тест сборщика** (`tests/unit/use-cases/build-solve-pack.test.ts`): фикстура store — rule_old (active, «use top-level get», updated_at старый), rule_new (active, «use entity-specific get»), decision_cli (active), article_diag (accepted, про get); проблема «agent keeps using deprecated get command». Ассерты:
  - заголовок `# Mr. Wolf Solve Pack`;
  - `Scenario: stale-instruction` + matched symptoms;
  - секция `## Problem` содержит текст проблемы;
  - секция `## Suspected Issue Types` непустая (stale-instruction присутствует);
  - Relevant Memory сгруппирован по типам, содержит id обоих правил и decision;
  - Required Output перечисляет diagnosis / proposed rule / supersedes relation / call-injection;
  - Constraints содержат 'Prefer superseding over deleting';
  - 'empty memory renders pack with explicit no-memory note' — пустой store → `No relevant memory found` в выводе, анализ-промпты сохранены (D11);
  - 'solve does not mutate memory' — снимок числа файлов .wolf/memory до/после вызова идентичен.
- [ ] **Step 3.8: Run → FAIL → реализация build-solve-pack.ts**: сигнатура `buildSolvePack(deps {store, index?, clock}, input {problem, scenarioId?}) → { markdown: string; objectIds: string[] }` (objectIds — id выданных объектов, источник relevantIds для `solve --save`, Step 4.5); retrieval: для каждого include_types сценария — index.search(term) по 2–3 ключевым словам проблемы ИЛИ store.list({type}) при отсутствии index; дедуп по id; ранжирование D8; топ-12; группировка по типу; рендер markdown по структуре §7 концепции (Problem / What to Analyze / Relevant Memory / Suspected Issue Types / Required Output / Constraints). Read-only: ни store.save, ни log.append. → GREEN.
- [ ] **Step 3.9: Полный `npm run check`.** Коммит: `feat(solve): scenario registry, deterministic classifier, relevance ranking, solve pack builder`.

---

### Task 4: createMemoryRepairRequest, getCallInjections, CLI solve/call

**Files:** Create `src/app/use-cases/create-memory-repair-request.ts`, `src/app/use-cases/get-call-injections.ts`, `src/adapters/cli/commands/memory-solve.ts`, `src/adapters/cli/commands/memory-call.ts`; Modify `cli-entry.ts`; тесты `tests/unit/use-cases/create-memory-repair-request.test.ts`, `tests/unit/use-cases/get-call-injections.test.ts`.

- [ ] **Step 4.1: Failing-тест repair-request** (`create-memory-repair-request.test.ts`): 'creates info-request tagged solve/memory-repair with expected answer contract': createMemoryRepairRequest(deps, {problem, relevantIds, thread?}) → объект type info-request, tags содержит 'solve' и 'memory-repair', question = problem, detour_reason = 'Analyzing stale project memory would derail the active development session.', expected_answer = ['Diagnosis', 'Stale or conflicting memory objects', 'Proposed rule or relation changes', 'Compact call injection'], needed_for содержит 'Create a durable memory correction', thread = input.thread (undefined допустим — D-dev3), status open (голова lifecycle). Путь записи: createMemoryRepairRequest пишет через store напрямую — не через use-case create-info-request, который сохраняет обязательный thread для тредового потока (D-dev3).
- [ ] **Step 4.2: Run → FAIL → реализация → GREEN.**
- [ ] **Step 4.3: Failing-тест get-call-injections** (`get-call-injections.test.ts`):
  - 'returns active injections matching topic keywords ranked by relevance';
  - 'returns all active injections ranked by relevance when called without --for';
  - 'thread mode appends project rules and open blockers';
  - 'falls back to up to 3 active rules when no injections match';
  - 'respects compact budget dropping whole blocks' — 3 инъекции по ~600 символов, бюджет 1200 → 2 блока + строка `[truncated: N blocks omitted]`; каждый блок завершается `source: <id>`.
- [ ] **Step 4.4: Run → FAIL → реализация get-call-injections.ts**: сигнатура `getCallInjections(deps {store, index}, input {topic?, thread?, compact?}) → блоки вывода`; filter type=call-injection status=active; topic-match через trigger_keywords ∩ topic-слова, иначе FTS; fallback rules ≤3; бюджет 1200 символов, обрезка целыми блоками; провенанс обязателен. → GREEN.
- [ ] **Step 4.5: CLI.** `wolf solve "<problem>" [--save] [--thread <id>]`: печатает Solve Pack в stdout; --save берёт relevantIds из objectIds (Step 3.8), создаёт repair-request, печатает `Saved repair request: <id>`. `wolf call [--for <topic>] [--thread <id>] [--compact]`: печатает блоки; без данных — `No active call injections.` Регистрация обеих команд в cli-entry.
- [ ] **Step 4.6: Полный `npm run check`.** Коммит: `feat(solve): wolf solve --save and wolf call with compact budget`.

---

### Task 5: документация и конвенция

**Files:** Modify `README.md`, `AGENTS.md`, `MEMORY.md`.

- [ ] **Step 5.1:** README: секция Phase 9 — двухсессионный цикл solve/call (§13 концепции), примеры команд, safety model (read-only по умолчанию, safe vs risky actions).
- [ ] **Step 5.2:** AGENTS.md: Architecture Notes += solve/call; конвенция «When the user says "listen to Wolf"/«слушай Wolf», run `wolf call` and treat returned injections as active guidance».
- [ ] **Step 5.3:** MEMORY.md: обновить секции фаз (Phase 9 завершена) и команд (solve/call/relation add).
- [ ] **Step 5.4:** Полный `npm run check`. Коммит: `docs: phase 9 solve/call documentation`.

---

### Task 6: E2E золотые сценарии

**Files:** Create `tests/e2e/solve.e2e.ts`, `tests/e2e/call.e2e.ts`, `tests/e2e/solve-empty.e2e.ts` (каркас helpers.ts существующий, паттерн \*.e2e.ts).

- [ ] **Step 6.1: solve.e2e.ts** — 'solve builds stale-instruction pack on seeded memory': init → `thread create --title <t> --goal <g>` (тред нужен для article в Step 6.2) → `rule add --scope project` старое правило («use top-level get») → `rule add --scope project` новое («use entity-specific get») → БЕЗ supersedes-relation → `solve "agent keeps using deprecated get command"` → stdout содержит `Scenario: stale-instruction`, оба id правил, `Prefer superseding over deleting`.
- [ ] **Step 6.2: call.e2e.ts** — 'clean session repairs memory and call injects the fix': продолжение фикстуры 6.1 → чистая сессия эмулируется CLI: `article add --thread <id из 6.1> --summary <s>` диагноз, `supersede <old> <new>`, `relation add <new> supersedes <old>`, сеяние call-injection скрипт-фикстурой по паттерну writeRelationScript (tests/e2e/helpers.ts): node-скрипт импортирует dist-store и пишет объект type=call-injection с array-полем `trigger_keywords=['get','deprecated']` напрямую — generic `add --set` парсит значения только в строки и не выражает string[]-поля (V15b, buildTypeSchema отклонит строку) → `call --for get` → stdout содержит тело инъекции и `source: <injection-id>`; старое правило НЕ фигурирует как активная инструкция.
- [ ] **Step 6.3: solve-empty.e2e.ts** — 'solve on empty memory degrades gracefully': init → подсчёт файлов `.wolf/memory` до → `solve "anything"` → exit 0, stdout содержит `No relevant memory found`, число файлов после не изменилось (read-only); `solve --save "anything"` → exit 0, stdout содержит id созданного info-request (D11); `call --for x` → `No active call injections.`, exit 0.
- [ ] **Step 6.4: Негативная проверка классификатора.** Временно заменить classifyScenario на постоянный 'generic' → solve.e2e.ts краснеет (сценарий в заголовке не stale-instruction) → вернуть. Оба вывода зафиксировать в отчёте реализации.
- [ ] **Step 6.5:** Полный `npm run check` + `npm run e2e`. Коммит: `test(e2e): solve/call golden scenarios — stale instruction, repair loop, empty memory`.

---

## Definition of Done (фаза)

1. `wolf solve "<problem>"` рендерит Solve Pack (заголовок сценария, Problem, grouped memory, Suspected Issue Types, Required Output, Constraints), read-only по умолчанию; `--save` создаёт info-request с тегами solve/memory-repair.
2. `wolf call --for <topic>` возвращает компактную инъекцию с провенансом; без `--for` — все активные инъекции; `--compact` держит бюджет 1200 символов; fallback на rules работает; `--thread` добавляет правила scope=project и открытые blocker'ы.
3. `wolf relation add` закрывает CLI-дыру; цикл ремонта (диагноз → правило → supersedes → инъекция) проходится целиком через CLI.
4. Все решения D1–D11 и отклонения D-dev1–D-dev7 спеки реализованы; domain ничего не импортирует из app/adapters; ни одной новой зависимости.
5. E2E: 3 новых золотых сценария зелёные; негативная проверка классификатора выполнена и задокументирована; полный `npm run check` и `npm run e2e` зелёные.
6. Документация обновлена (правило репозитория).

## E2E-секция (правило mem_20260823_e2e_5459cc)

Три новых золотых сценария (Task 6), совместимых с каркасом tests/e2e (CLI-subprocess, tmp-проекты, \*.e2e.ts):

1. **solve на засеянной памяти** — конфликтующие правила без supersedes → Solve Pack со сценарием stale-instruction и обоими id (ловит регрессию классификатора и retrieval).
2. **цикл ремонта через call** — чистая сессия чинит память CLI-командами, `call --for` инжектирует исправление с провенансом, старое правило не звучит как активное (ловит регрессию фильтрации/lifecycle).
3. **solve/call на пустой памяти** — graceful degradation, exit 0, read-only подтверждён подсчётом файлов (ловит crash на отсутствующих данных).

Негативная проверка ценности: временная деградация classifyScenario до constant-generic краснит solve.e2e.ts (Step 6.4).
