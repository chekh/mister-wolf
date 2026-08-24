# Phase 8 — Schema-Driven Taxonomy + Оркестрационные типы + Надёжность записи + Одна миграция layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать таксономию памяти управляемой через `.wolf/config.yaml` (генератор из кода-канона), добавить 7 оркестрационных типов + сплит `document` → `document-ref/native`, выполнить единственную миграцию layout `objects/<тип>/` → `threads/<id>/<подкаталог>/` + `shared/`, и закрыть надёжность записи (lockfile, толерантный JSONL, карантин битых объектов, `wolf validate`, SQLITE_BUSY retry) до мультиагентной записи Phase 9.

**Architecture:** Гексагональная структура сохраняется. Канон таксономии — декларативный `CORE_TAXONOMY` в домене; per-type zod-схемы становятся проекциями декларации через `buildTypeSchema`; `config.yaml` — генерируемое зеркало core-блока + точка расширения project-типов. Store переходит на dual-read/write-new layout. Все операции записи оборачиваются в lockfile-транзакцию через новый порт `MemoryLock`.

**Tech Stack:** TypeScript (ESM), zod 4, better-sqlite3 9, commander 12, js-yaml 4, vitest. Новых зависимостей нет.

---

## 0. Сверка с реальным доменом (проверено перед написанием)

Все утверждения концепции проверены по коду. Расхождения зафиксированы и закрыты решениями ниже.

| #   | Факт                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Источник                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| V1  | `MemoryStatus` — 14 статусов: `active, open, resolved, stale, conflicting, superseded, archived, paused, completed, answered, rejected, obsolete, proposed, accepted`                                                                                                                                                                                                                                                                                                | `src/domain/memory-types.ts:19-33`                                             |
| V2  | **Все lifecycles оркестрационных типов из concept §6 состоят только из существующих статусов.** Новые значения `MemoryStatus` не нужны: task-brief `[active,completed,superseded]` ✓, report `[active,completed]` ✓, council-question `[open,answered,archived]` ✓, council-opinion `[proposed,accepted]` ✓, synthesis `[proposed,accepted]` ✓, escalation `[open,resolved,archived]` ✓, decision-request `[open,answered,archived]` ✓                               | сверка множеств с V1                                                           |
| V3  | **Пробелы `ALLOWED_TRANSITIONS`:** нет `active → completed` (нужен task-brief/report/work-thread) и `open → answered` (нужен council-question/decision-request). `open → resolved` есть (escalation ок), `proposed → accepted` есть (council-opinion/synthesis ок)                                                                                                                                                                                                   | `src/domain/governance.ts:35-50`                                               |
| V4  | `MEMORY_TYPES` — 13 типов, hardcoded; используются в 4 местах: `memory-object-schema.ts:7`, `fs-project-initializer.ts:31`, `memory-add.ts:9`, сам `memory-types.ts`                                                                                                                                                                                                                                                                                                 | grep `MEMORY_TYPES`                                                            |
| V5  | Per-type zod-схемы есть только у 7 типов: decision `[active,superseded,rejected,obsolete]`, blocker `[active,resolved,obsolete]`, work-thread `[active,paused,completed,archived]`, info-request `[open,answered,rejected,obsolete,archived]`, article `[proposed,accepted,stale,superseded,archived]`, rule `[active,superseded,obsolete]`, session-checkpoint (базовый статус-enum, без override). Остальные 6 типов валидируются базовой схемой (все 14 статусов) | `src/domain/schemas/*-schema.ts`                                               |
| V6  | Store: плоский `objects/<тип>/<id>.md`; `parseFile` **кидает** исключение на любом битом файле → один плохой файл роняет `list`/`get` для всех                                                                                                                                                                                                                                                                                                                       | `markdown-memory-store.ts:91-110`                                              |
| V7  | JSONL: `parseEventLine`/`parseRelationLine` кидают на битой строке → роняют `readAll`; запись — голый `appendFile` без блокировок                                                                                                                                                                                                                                                                                                                                    | `jsonl-event-log.ts:28-44`, `jsonl-relation-log.ts:35-51`                      |
| V8  | SQLite: better-sqlite3 без `busy_timeout`, без retry; одновременный доступ CLI + MCP-сервера даст `SQLITE_BUSY`                                                                                                                                                                                                                                                                                                                                                      | `sqlite-search-index.ts:11-15`                                                 |
| V9  | Запись — прямой `fs.writeFile` (не атомарный); транзакция «файл + JSONL-append + индекс» нигде не защищена                                                                                                                                                                                                                                                                                                                                                           | `markdown-memory-store.ts:18`, `add-memory-object.ts:60-70`                    |
| V10 | Id объектов и тредов — `mem_<date>_<slug>_<hash>`; поле `thread` в frontmatter хранит **полный** id треда                                                                                                                                                                                                                                                                                                                                                            | `hash-id-generator.ts`, `create-work-thread.ts:28`, CLI `--thread <thread-id>` |
| V11 | Единственный производитель типа `document` — сканер (`scan-project.ts:90`); документ всегда by-reference (`source.path`)                                                                                                                                                                                                                                                                                                                                             | `scan-project.ts:90-103`                                                       |

### Отклонения от concept.md (осознанные, документируются в README)

| #      | Концепция говорит                                                                   | Спека решает                                                                                                                                                           | Почему                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-dev1 | Каталоги тредов `threads/csv-export/` (человекочитаемый slug)                       | `threads/mem_<date>_<slug>_<hash>/` — полный id треда                                                                                                                  | Поле `thread` уже хранит полный mem-id (V10); короткие slug требуют нового пространства имён и обработки коллизий. Upgrade-path: поле-алиас в будущей фазе |
| D-dev2 | Имена файлов `YYYY-MM-DD-<slug>.md`                                                 | Файл остаётся `<id>.md` — id уже содержит ISO-дату и slug, лексикографическая сортировка сохраняется                                                                   | Переименование ломает резолв по имени (V6) и не добавляет свойств                                                                                          |
| D-dev3 | `report.required_fields: [summary]`, `task-brief: [... related]`                    | `report` — без обязательных полей (summary — секция тела, промптная дисциплина); `related` изъят (уже базовое поле)                                                    | Поля дублируют существующую базовую схему                                                                                                                  |
| D-dev4 | Narrowed lifecycles для schema-less типов (например, session-checkpoint `[active]`) | Генератор пишет код-канон: полные 14 статусов для типов без per-type enum (lesson, observation, open-question, context, session-checkpoint, session-summary, document) | Canon-first: конфиг — зеркало кода, не пожеланий. Сужение — отдельное микро-решение после Phase 8                                                          |
| D-dev5 | Конфиги советов `.wolf/councils/*.yaml`                                             | Out of scope Phase 8; quorum/threshold — параметры use-case'ов                                                                                                         | Советам нужен роутер/агенты (Phase 9–10); конфиг-файлы вводим вместе с ними                                                                                |

Примечание: `docs/superpowers/plans/roadmap-v2.md` §Phase 8 устарел (там `debug/code-snippet/design`, `wolf type add/remove`). Канон — concept.md v2 §6 (changelog 2026-08-23). Задача T8 обновляет roadmap-v2 пометкой.

---

## 1. Решения: закрытие пяти вопросов

### D1 — Генератор lifecycles из `MemoryStatus` + `ALLOWED_TRANSITIONS` (Q1)

**Команда:** `wolf taxonomy sync`.

**Канон:** код. Источник генерации — тройка:

1. порядок статусов — `MemoryStatus` (`src/domain/memory-types.ts`);
2. допустимые переходы — глобальный `ALLOWED_TRANSITIONS` (`src/domain/governance.ts`);
3. lifecycle типа — массив статусов из декларации типа в `CORE_TAXONOMY` (T1).

**Формат в config.yaml:** переходы **не хранятся** per-type вообще. Хранится только `lifecycle` (множество статусов типа). Эффективные переходы для объекта считаются в рантайме как `ALLOWED_TRANSITIONS[from] ∩ lifecycle[type]`. Это исключает целый класс рассинхронов (матрица N×N в YAML никем не читается).

**Что делает sync:** регенерирует секцию `memory_types.core` в `.wolf/config.yaml` из `CORE_TAXONOMY`, сохраняя нетронутыми `artifact_sources` и `memory_types.project`. Детерминированный вывод (`js-yaml.dump` с фиксированной сортировкой ключей) → повторный запуск байт-в-байт идентичен.

**Валидация расхождений:** `wolf validate` (T7) регенерирует ожидаемый core-блок в памяти и сравнивает с фактическим. Любая разница → ошибка со списком расходящихся путей и подсказкой `run: wolf taxonomy sync`. Ручные правки core-блока перетираются следующим `sync` — это задокументированное поведение (заголовок-комментарий в файле).

### D2 — Канон между zod-схемами кода и config.yaml (Q2)

**Разделение ролей:**

| Слой                                                           | Канон для чего                                                            | Кто валидирует                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `CORE_TAXONOMY` + `MemoryStatus` + `ALLOWED_TRANSITIONS` (код) | Все 22 core-типа: существование, lifecycle, поля, governance, layout      | Компилятор + zod-схемы, производные от деклараций     |
| `config.yaml` → `memory_types.project`                         | Project-типы (новые, пользовательские): lifecycle, подкаталоги, доп. поля | Динамический zod через `buildTypeSchema` при загрузке |
| `config.yaml` → `memory_types.core`                            | Ничего (зеркало для человека + drift-детект)                              | `wolf validate` сравнивает с регенерированным         |

Правила:

- Project-тип **не может** перекрыть имя core-типа или статус из `MemoryStatus` → жёсткая ошибка при загрузке с внятным сообщением.
- Типы полей в project-декларации ограничены дискретным алфавитом `FieldSpec` (`string` / `string[]` / `enum`); неизвестный kind — ошибка загрузки, не молчаливый skip.
- Существующие 7 per-type схем переписываются как проекции деклараций (`buildTypeSchema`); экспортируемые имена (`DecisionSchema`, `BlockerSchema`, ...) и выводимые типы сохраняются — публичный API не меняется, существующие тесты остаются зелёными как guard эквивалентности.

### D3 — Поведение без config.yaml (Q3)

Файла нет → `loadTaxonomy` возвращает чистый `CORE_TAXONOMY` (все 22 типа, включая 7 оркестрационных и оба document-типа). Никаких деградаций: это ровно сегодняшнее поведение Phases 0–7 плюс новые типы. `wolf init` создаёт `config.yaml` вызовом того же генератора — файл существует с дефолтами, но его отсутствие легитимно навсегда.

### D4 — Миграция layout (Q4)

Одна миграция, выполняется когда таксономия финальна (после T1–T3).

- **Команда:** `wolf migrate` c флагами `--dry-run` (default) / `--apply`.
- **Маппинг:** `TYPE_TO_SUBDIR` из деклараций (concept §1.4): work-thread → `threads/<tid>/WORK-THREAD.md`; объект с `thread` (и тред существует) → `threads/<thread>/<subdir>/<id>.md`; иначе → `shared/<subdir>/<id>.md`. Shared-only типы (`rule`, `document-ref`) всегда в `shared/`.
- **Сплит документа (§7 #13):** `document` с непустым `source.path` → `document-ref`; без → `document-native`. Конвертация = перезапись frontmatter при переносе. Старый тип `document` остаётся в enum как `deprecated: true` (read-only compat, исключён из `wolf add --type` и из выдачи сканера — сканер сразу пишет `document-ref`).
- **dry-run отчёт:** markdown-таблица на stdout (формат — шаг 5.4), exit 0; конфликты перечисляются, ничего не меняется.
- **Dual-read:** store читает оба корня (`objects/` legacy + `threads/` + `shared/`) постоянно — стоимость один readdir, отдельного «переходного периода с выключателем» нет. Пишет только новый layout. Коллизия id между корнями → побеждает новый + warning (concept §6).
- **Идемпотентность:** без маркер-файлов. `objects/` пуст или отсутствует → «nothing to migrate», exit 0. Повторный запуск после сбоя докатывает оставшееся (каждый объект переносится независимо).
- **Не мигрируется:** `relations.jsonl`, `events.jsonl` — id объектов не меняются (V10).
- **DoD миграции:** см. чек-лист в шаге 5.8.

### D5 — Надёжность записи (Q5)

| Механизм                    | Решение                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lockfile scope**          | Порт `MemoryLock` (`withLock(fn)`), реализация — `.wolf/memory/.lock` через эксклюзивное создание файла (`wx`) с `{pid, ts}` внутри. Охват — вся транзакция «save файла + JSONL-append + индекс»: оборачивается **тело каждого write-use-case** (опциональная зависимость `lock` в deps — обратная совместимость вызовов и тестов). Stale-порог 30с (кража зависшего лока), ожидание до 5с, затем `LockHeldError`. Известный потолок: гонка при одновременной краже stale-лока двумя процессами — приемлема (local-first, комментарий в коде) |
| **Карантин**                | Пассивный при чтении: невалидный frontmatter → объект пропускается, проблема собирается (`onProblem` колбэк + `store.scanProblems()`), `list`/`search` не падают (чинит V6). Активная изоляция — только `wolf validate --fix`: перенос в `.wolf/memory/quarantine/<относительный путь>/` + sidecar `meta.json` с ошибкой и датой. Чтение никогда не пишет — никакого сюрпризного мутейта                                                                                                                                                      |
| **JSONL при чтении**        | `scanJsonlFile(path)` возвращает `{items, problems:[{line,error}]}`; `readAll` пропускает битые строки (warn в stderr, чинит V7), `wolf validate` показывает полный список с номерами строк                                                                                                                                                                                                                                                                                                                                                   |
| **`wolf validate`**         | Секции: taxonomy drift / layout leftovers / объекты (битый frontmatter) / events.jsonl / relations.jsonl (+dangling endpoints) / свежесть индекса (ids store vs sqlite) / stale locks. Exit 0 — чисто; exit 1 — есть ошибки. Формат вывода — шаг 7.7                                                                                                                                                                                                                                                                                          |
| **SQLITE_BUSY**             | `db.pragma('busy_timeout = 5000')` в конструкторе (SQLite сам ждёт) + синхронный retry-обёртка `runWithRetry` (5 попыток, экспоненциально 50→800ms, только на `SQLITE_BUSY`) вокруг `indexObject/removeObject/rebuild` (чинит V8)                                                                                                                                                                                                                                                                                                             |
| **Бонус: атомарная запись** | `writeFileAtomic` (tmp → rename) в `store.save` — закрывает «читатель видит половину файла» (V9), 6 строк, бесплатно в рамках фазы                                                                                                                                                                                                                                                                                                                                                                                                            |

### D6 — Явно вне scope Phase 8

Конфиги советов (D-dev5), MCP-тулы для project-типов и tally, `wolf recap`, редактирование тел объектов (Phase 11), распределённая работа, расширяемость предикатов relations (открытый вопрос концепции №7 — предикаты остаются фиксированным набором Phase 4).

---

## 2. Структура файлов

**Create:**

- `src/domain/type-schema-builder.ts` — `buildTypeSchema`, `FieldSpec` → zod
- `src/domain/taxonomy.ts` — `Taxonomy`, `mergeTaxonomy`, `generateCoreConfigBlock`
- `src/adapters/fs/config-file.ts` — чтение/валидация `.wolf/config.yaml`, `loadProjectTypes`
- `src/adapters/fs/memory-lock.ts` — `FsMemoryLock`, `withMemoryLock`, `LockHeldError`
- `src/adapters/fs/jsonl-scan.ts` — `scanJsonlFile`
- `src/adapters/fs/layout-migration.ts` — `planLayoutMigration`, `applyLayoutMigration`
- `src/adapters/sqlite/busy-retry.ts` — `runWithBusyRetry`, `sleepSync`
- `src/app/use-cases/tally-council-votes.ts`, `src/app/use-cases/create-synthesis.ts`
- `src/ports/memory-lock.port.ts`
- `tests/unit/domain/taxonomy.test.ts`, `tests/unit/domain/type-schema-builder.test.ts`
- `tests/unit/adapters/memory-lock.test.ts`, `tests/unit/adapters/jsonl-scan.test.ts`
- `tests/unit/adapters/layout-migration.test.ts`, `tests/unit/adapters/busy-retry.test.ts`
- `tests/unit/use-cases/tally-council-votes.test.ts`, `tests/unit/use-cases/create-synthesis.test.ts`
- `tests/integration/phase8-workflow.test.ts`
- `src/adapters/cli/commands/memory-taxonomy.ts`, `memory-migrate.ts`, `memory-validate.ts`, `memory-council.ts`

**Modify:**

- `src/domain/governance.ts` (+2 перехода)
- `src/domain/memory-types.ts` (+9 типов, `CORE_TAXONOMY`, `MemoryTypeDeclaration`, `FieldSpec`)
- `src/domain/schemas/{decision,blocker,thread,info-request,article,rule}-schema.ts` → проекции деклараций; `session-checkpoint-schema.ts` → проекция + `captured_state`
- `src/domain/schemas/memory-object-schema.ts` — без изменений по сути (enum расширяется автоматически через `MEMORY_TYPES`)
- `src/adapters/fs/project-paths.ts` — `threadsDir`, `sharedDir`, `quarantineDir`, `targetPathFor`
- `src/adapters/fs/markdown-memory-store.ts` — dual-read, write-new, `writeFileAtomic`, `onProblem`, per-type схемы
- `src/adapters/fs/jsonl-event-log.ts`, `jsonl-relation-log.ts` — толерантное чтение
- `src/adapters/fs/fs-project-initializer.ts` — scaffolding `threads/ shared/` вместо per-type каталогов, генерация config.yaml
- `src/adapters/sqlite/sqlite-search-index.ts` — busy_timeout + retry
- `src/bootstrap/container.ts` — `lock`, `taxonomy`, прокидывание в store
- `src/app/use-cases/add-memory-object.ts` (+`extra`), `transition-memory-object.ts` (lifecycle-проверка), остальные write-use-cases (+`lock`)
- `src/app/use-cases/scan-project.ts:90` — `document` → `document-ref`
- `src/adapters/cli/cli-entry.ts` — регистрация 4 команд
- Тесты: `project-paths.test.ts`, `markdown-memory-store.test.ts`, `init-project-memory.test.ts`, `transition-memory-object.test.ts`, `scan-project.test.ts`, `memory-add` CLI-тесты (если есть)

---

## 3. Предусловия

- [ ] **Шаг 0.1: Ветка.** По правилу git-flow репозитория (merge через `dev`):

```bash
git checkout dev && git pull && git checkout -b feat/phase-8-schema-taxonomy
```

- [ ] **Шаг 0.2: Базовая линия.**

```bash
npm run check
```

Expected: format:check ok, tsc ok, vitest pass (45 файлов), build ok. Если красное — починить до старта, не тащить в фазу.

---

### Task 1: Домен — переходы + декларация таксономии

**Files:**

- Modify: `src/domain/governance.ts:36,38`
- Modify: `src/domain/memory-types.ts`
- Test: `tests/unit/domain/governance.test.ts`, `tests/unit/domain/taxonomy.test.ts` (new)

- [ ] **Step 1.1: Failing-тест на новые переходы.** В `tests/unit/domain/governance.test.ts` добавить:

```typescript
describe('phase 8 transitions', () => {
  it('allows active -> completed (task-brief, report, work-thread)', () => {
    expect(canTransition('active', 'completed')).toBe(true);
  });
  it('allows open -> answered (council-question, decision-request)', () => {
    expect(canTransition('open', 'answered')).toBe(true);
  });
});
```

- [ ] **Step 1.2: Запуск, ожидаем FAIL.**

```bash
npx vitest run tests/unit/domain/governance.test.ts
```

Expected: FAIL — `expected false to be true`.

- [ ] **Step 1.3: Правка `ALLOWED_TRANSITIONS`** в `src/domain/governance.ts`:

```typescript
export const ALLOWED_TRANSITIONS: Record<MemoryStatus, MemoryStatus[]> = {
  active: ['stale', 'superseded', 'archived', 'conflicting', 'completed'],
  open: ['resolved', 'rejected', 'archived', 'answered'],
  // ...остальные строки без изменений
};
```

- [ ] **Step 1.4: Тест зелёный**, коммит `feat(domain): allow active->completed and open->answered transitions`.

- [ ] **Step 1.5: Расширить `MEMORY_TYPES` и добавить декларации.** `src/domain/memory-types.ts` — первые 13 имён не трогать (стабильность), дописать в конец:

```typescript
export const MEMORY_TYPES = [
  // --- Phases 0-7 (позиции стабильны) ---
  'document',
  'decision',
  'lesson',
  'observation',
  'session-summary',
  'open-question',
  'context',
  'work-thread',
  'info-request',
  'article',
  'blocker',
  'session-checkpoint',
  'rule',
  // --- Phase 8: document split (contradiction #13) ---
  'document-ref',
  'document-native',
  // --- Phase 8: orchestration pack (concept §1.2) ---
  'task-brief',
  'report',
  'council-question',
  'council-opinion',
  'synthesis',
  'escalation',
  'decision-request',
] as const;

export type MemoryStatus = /* без изменений */;

/** Алфавит типов полей для project-типов (config.yaml) и деклараций core-типов. */
export type FieldSpec =
  | { kind: 'string'; required: true; min?: number }
  | { kind: 'string'; optional: true }
  | { kind: 'string'; default: string }
  | { kind: 'string[]'; required: true; minItems?: number }
  | { kind: 'string[]'; default?: string[] }
  | { kind: 'enum'; values: readonly string[] };

export interface MemoryTypeDeclaration {
  name: MemoryType;
  /** Множество статусов типа; эффективные переходы = ALLOWED_TRANSITIONS ∩ lifecycle */
  lifecycle: readonly MemoryStatus[];
  /** Подкаталог внутри threads/<tid>/; null — тип не живёт в треде */
  subdirThread: string | null;
  /** Подкаталог внутри shared/; null — тип не живёт в shared */
  subdirShared: string | null;
  /** Спецслучай: work-thread кладётся как threads/<tid>/WORK-THREAD.md */
  layout?: 'work-thread-file';
  fields?: Record<string, FieldSpec>;
  /** document-ref: требует непустой source.path */
  requireSourcePath?: boolean;
  deprecated?: boolean;
}

const FULL: readonly MemoryStatus[] = [
  'active', 'open', 'resolved', 'stale', 'conflicting', 'superseded', 'archived',
  'paused', 'completed', 'answered', 'rejected', 'obsolete', 'proposed', 'accepted',
];

export const CORE_TAXONOMY: readonly MemoryTypeDeclaration[] = [
  { name: 'document', lifecycle: FULL, subdirThread: 'documents', subdirShared: 'documents', deprecated: true },
  { name: 'decision', lifecycle: ['active', 'superseded', 'rejected', 'obsolete'], subdirThread: 'decisions', subdirShared: 'decisions' },
  { name: 'lesson', lifecycle: FULL, subdirThread: 'lessons', subdirShared: 'lessons' },
  { name: 'observation', lifecycle: FULL, subdirThread: 'lessons', subdirShared: 'lessons' },
  { name: 'session-summary', lifecycle: FULL, subdirThread: 'sessions', subdirShared: null },
  { name: 'open-question', lifecycle: FULL, subdirThread: 'notes', subdirShared: 'notes' },
  { name: 'context', lifecycle: FULL, subdirThread: 'notes', subdirShared: 'notes' },
  {
    name: 'work-thread', lifecycle: ['active', 'paused', 'completed', 'archived'],
    subdirThread: null, subdirShared: null, layout: 'work-thread-file',
    fields: {
      goal: { kind: 'string', required: true, min: 1 },
      current_state: { kind: 'string', default: '' },
      next_steps: { kind: 'string[]', default: [] },
    },
  },
  {
    name: 'info-request', lifecycle: ['open', 'answered', 'rejected', 'obsolete', 'archived'],
    subdirThread: 'notes', subdirShared: 'notes',
    fields: {
      thread: { kind: 'string', required: true, min: 1 },
      question: { kind: 'string', required: true, min: 1 },
      detour_reason: { kind: 'string', required: true, min: 1 },
      needed_for: { kind: 'string[]', default: [] },
      expected_answer: { kind: 'string[]', required: true, minItems: 1 },
      preliminary_answer: { kind: 'string', default: '' },
    },
  },
  {
    name: 'article', lifecycle: ['proposed', 'accepted', 'stale', 'superseded', 'archived'],
    subdirThread: 'notes', subdirShared: 'notes',
    fields: {
      thread: { kind: 'string', required: true, min: 1 },
      summary: { kind: 'string', required: true, min: 1 },
      answers: { kind: 'string[]', default: [] },
      supports: { kind: 'string[]', default: [] },
      evidence: { kind: 'string[]', default: [] },
    },
  },
  {
    name: 'blocker', lifecycle: ['active', 'resolved', 'obsolete'],
    subdirThread: 'blockers', subdirShared: 'blockers',
    fields: {
      impact: { kind: 'string', required: true, min: 1 },
      workaround: { kind: 'string', optional: true },
    },
  },
  {
    name: 'session-checkpoint', lifecycle: FULL,
    subdirThread: 'sessions', subdirShared: null,
    fields: { thread: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'rule', lifecycle: ['active', 'superseded', 'obsolete'],
    subdirThread: null, subdirShared: 'rules',
    fields: {
      scope: { kind: 'enum', values: ['project', 'global'] },
      applies_to: { kind: 'string[]', default: [] },
      trigger: { kind: 'string', default: '' },
    },
  },
  {
    name: 'document-ref', lifecycle: ['active', 'stale', 'superseded'],
    subdirThread: 'documents', subdirShared: 'documents', requireSourcePath: true,
  },
  { name: 'document-native', lifecycle: ['active', 'superseded', 'archived'], subdirThread: 'documents', subdirShared: 'documents' },
  {
    name: 'task-brief', lifecycle: ['active', 'completed', 'superseded'],
    subdirThread: 'tasks', subdirShared: null,
    fields: {
      executor: { kind: 'string', required: true, min: 1 },
      priority: { kind: 'string', required: true, min: 1 },
    },
  },
  { name: 'report', lifecycle: ['active', 'completed'], subdirThread: 'tasks', subdirShared: null },
  {
    name: 'council-question', lifecycle: ['open', 'answered', 'archived'],
    subdirThread: 'councils', subdirShared: null,
    fields: { question: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'council-opinion', lifecycle: ['proposed', 'accepted'],
    subdirThread: 'councils', subdirShared: null,
    fields: { vote: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'synthesis', lifecycle: ['proposed', 'accepted'],
    subdirThread: 'councils', subdirShared: null,
    fields: { recommendation: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'escalation', lifecycle: ['open', 'resolved', 'archived'],
    subdirThread: 'escalations', subdirShared: null,
    fields: { question: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'decision-request', lifecycle: ['open', 'answered', 'archived'],
    subdirThread: 'escalations', subdirShared: null,
    fields: { question: { kind: 'string', required: true, min: 1 } },
  },
];

export function getDeclaration(type: MemoryType): MemoryTypeDeclaration {
  const decl = CORE_TAXONOMY.find((d) => d.name === type);
  if (!decl) throw new Error(`No taxonomy declaration for type: ${type}`);
  return decl;
}

export function subdirectoryFor(type: MemoryType, scope: 'thread' | 'shared'): string | null {
  const d = getDeclaration(type);
  return scope === 'thread' ? d.subdirThread : d.subdirShared;
}
```

Проверка соответствия V5: lifecycles decision/blocker/work-thread/info-request/article/rule дословно совпадают с текущими zod-enum'ами — это инвариант, который защитит тест из Step 1.6.

- [ ] **Step 1.6: Failing-тест эквивалентности** `tests/unit/domain/taxonomy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CORE_TAXONOMY, MEMORY_TYPES, getDeclaration, subdirectoryFor } from '../../../src/domain/memory-types.js';
import { ALLOWED_TRANSITIONS } from '../../../src/domain/governance.js';

describe('CORE_TAXONOMY', () => {
  it('covers every MEMORY_TYPES entry exactly once', () => {
    expect(CORE_TAXONOMY.map((d) => d.name).sort()).toEqual([...MEMORY_TYPES].sort());
  });
  it('every lifecycle status exists in MemoryStatus canon', () => {
    for (const d of CORE_TAXONOMY) {
      for (const s of d.lifecycle) {
        expect(ALLOWED_TRANSITIONS, `${d.name}: ${s}`).toHaveProperty(s);
      }
    }
  });
  it('orchestration lifecycles match concept §6', () => {
    expect(getDeclaration('task-brief').lifecycle).toEqual(['active', 'completed', 'superseded']);
    expect(getDeclaration('council-question').lifecycle).toEqual(['open', 'answered', 'archived']);
    expect(getDeclaration('escalation').lifecycle).toEqual(['open', 'resolved', 'archived']);
  });
  it('subdir mapping follows concept §1.4', () => {
    expect(subdirectoryFor('task-brief', 'thread')).toBe('tasks');
    expect(subdirectoryFor('rule', 'shared')).toBe('rules');
    expect(subdirectoryFor('rule', 'thread')).toBeNull();
    expect(getDeclaration('work-thread').layout).toBe('work-thread-file');
  });
});
```

- [ ] **Step 1.7: Run + fix.** Обновить `tests/unit/domain/governance.test.ts`/`memory-object-schema.test.ts`, если они фиксируют полный список типов (ожидаемо: тест полного перечня упадёт — дополнить новыми 9 именами).

```bash
npx vitest run tests/unit/domain/
```

Expected: PASS. Commit: `feat(domain): core taxonomy declarations + orchestration types`.

---

### Task 2: Схемы как проекции деклараций

**Files:**

- Create: `src/domain/type-schema-builder.ts`
- Modify: все 7 файлов `src/domain/schemas/*-schema.ts`
- Test: `tests/unit/domain/type-schema-builder.test.ts` (new); существующие schema-тесты — guard

- [ ] **Step 2.1: Билдер.** `src/domain/type-schema-builder.ts`:

```typescript
import { z } from 'zod';
import { MemoryObjectSchema } from './schemas/memory-object-schema.js';
import { FieldSpec, MemoryTypeDeclaration } from './memory-types.js';

function fieldToZod(spec: FieldSpec): z.ZodTypeAny {
  switch (spec.kind) {
    case 'string':
      if (spec.required) {
        const s = z.string();
        return spec.min !== undefined ? s.min(spec.min) : s;
      }
      if (spec.optional) return z.string().optional();
      return z.string().default(spec.default);
    case 'string[]':
      if (spec.required) return z.array(z.string()).min(spec.minItems ?? 0);
      return z.array(z.string()).default(spec.default ?? []);
    case 'enum':
      return z.enum(spec.values as [string, ...string[]]);
  }
}

export function buildTypeSchema(decl: MemoryTypeDeclaration) {
  let schema = MemoryObjectSchema.extend({
    type: z.literal(decl.name),
    status: z.enum(decl.lifecycle as unknown as [MemoryStatus, ...MemoryStatus[]]),
  }).superRefine((obj, ctx) => {
    if (decl.requireSourcePath && !obj.source?.path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'path'],
        message: `${decl.name} requires source.path`,
      });
    }
  });
  for (const [name, spec] of Object.entries(decl.fields ?? {})) {
    schema = schema.extend({ [name]: fieldToZod(spec) }) as typeof schema;
  }
  return schema;
}

import { MemoryStatus } from './memory-types.js';
```

Замечание: `MemoryStatus` импортировать сверху вместе с остальными; приведение нужно, потому что `readonly`-массив не матчит tuple-тип `z.enum` — это осознанный cast, lifecycle непуст по построению.

- [ ] **Step 2.2: Переписать 6 схем** (пример — `decision-schema.ts`; остальные аналогично, заменяя только имя типа):

```typescript
import { z } from 'zod';
import { buildTypeSchema } from '../type-schema-builder.js';
import { getDeclaration } from '../memory-types.js';

const decl = getDeclaration('decision');
export const DecisionSchema = buildTypeSchema(decl);
export type Decision = z.infer<typeof DecisionSchema>;
```

Аналогично: `BlockerSchema` ('blocker'), `WorkThreadSchema` ('work-thread'), `InfoRequestSchema` ('info-request'), `ArticleSchema` ('article'), `RuleSchema` ('rule'). `SessionCheckpointSchema` — проекция + вложенное поле поверх билдера:

```typescript
const base = buildTypeSchema(getDeclaration('session-checkpoint'));
export const SessionCheckpointSchema = base.extend({
  captured_state: z.object({
    thread_current_state: z.string().default(''),
    related_ids: z.array(z.string()).default([]),
  }),
});
export type SessionCheckpoint = z.infer<typeof SessionCheckpointSchema>;
```

- [ ] **Step 2.3: Guard-тесты.** Существующие `tests/unit/domain/{thread,rule,info-request,article}-schema.test.ts` обязаны пройти без правок — они фиксируют поведение (обязательность `goal`, `scope` enum и т.д.), что и доказывает эквивалентность проекции. Если какой-то падает — чинится **билдер/декларация**, не тест.

```bash
npx vitest run tests/unit/domain/
```

Expected: PASS все.

- [ ] **Step 2.4: Юнит-тест билдера** `tests/unit/domain/type-schema-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildTypeSchema } from '../../../src/domain/type-schema-builder.js';
import { getDeclaration } from '../../../src/domain/memory-types.js';

const minimalBase = {
  id: 'mem_x',
  title: 't',
  review_state: 'accepted',
  confidence: 'medium',
  importance: 0.5,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  created_by: 'user:test',
  source: { kind: 'manual' },
  tags: [],
  superseded_by: null,
};

describe('buildTypeSchema', () => {
  it('rejects status outside type lifecycle', () => {
    const s = buildTypeSchema(getDeclaration('task-brief'));
    expect(() => s.parse({ ...minimalBase, type: 'task-brief', status: 'open' })).toThrow();
  });
  it('rejects missing declared field (executor)', () => {
    const s = buildTypeSchema(getDeclaration('task-brief'));
    expect(() => s.parse({ ...minimalBase, type: 'task-brief', status: 'active' })).toThrow(/executor/i);
  });
  it('accepts valid task-brief with executor+priority', () => {
    const s = buildTypeSchema(getDeclaration('task-brief'));
    const obj = s.parse({
      ...minimalBase,
      type: 'task-brief',
      status: 'active',
      executor: 'executor-lead',
      priority: 'high',
    });
    expect(obj.executor).toBe('executor-lead');
  });
  it('document-ref requires source.path', () => {
    const s = buildTypeSchema(getDeclaration('document-ref'));
    expect(() => s.parse({ ...minimalBase, type: 'document-ref', status: 'active', source: { kind: 'scan' } })).toThrow(
      /source\.path/
    );
  });
});
```

- [ ] **Step 2.5: Run + commit** `refactor(domain): derive per-type zod schemas from taxonomy declarations`.

---

### Task 3: Реестр таксономии, config.yaml, `wolf taxonomy sync`

**Files:**

- Create: `src/domain/taxonomy.ts`, `src/adapters/fs/config-file.ts`, `src/adapters/cli/commands/memory-taxonomy.ts`
- Modify: `src/adapters/cli/cli-entry.ts`, `src/bootstrap/container.ts`, `src/adapters/cli/commands/memory-init.ts`, `src/app/use-cases/transition-memory-object.ts`, `src/app/use-cases/scan-project.ts:90`, `src/adapters/cli/commands/memory-add.ts:9`
- Test: `tests/unit/domain/taxonomy.test.ts` (дополнить)

- [ ] **Step 3.1: Домен мерджа.** `src/domain/taxonomy.ts`:

```typescript
import { CORE_TAXONOMY, FieldSpec, MemoryType, MemoryTypeDeclaration, MemoryStatus } from './memory-types.js';
import { ALLOWED_TRANSITIONS } from './governance.js';

export interface WolfConfig {
  artifact_sources: string[];
  projectTypes: MemoryTypeDeclaration[];
  /** Сырой core-блок как он лежит в файле (для drift-детекта); null — файла/блока нет */
  rawCoreBlock: unknown;
}

export class ProjectTypeConflictError extends Error {}

export function mergeTaxonomy(config: WolfConfig | null): {
  types: Map<MemoryType, MemoryTypeDeclaration>;
} {
  const types = new Map<MemoryType, MemoryTypeDeclaration>();
  for (const d of CORE_TAXONOMY) types.set(d.name, d);
  if (config) {
    for (const p of config.projectTypes) {
      if (types.has(p.name)) {
        throw new ProjectTypeConflictError(
          `Project type "${p.name}" conflicts with core type. Core types cannot be overridden.`
        );
      }
      for (const s of p.lifecycle) {
        if (!(s in ALLOWED_TRANSITIONS)) {
          throw new ProjectTypeConflictError(
            `Project type "${p.name}" uses unknown status "${s}". Valid: ${Object.keys(ALLOWED_TRANSITIONS).join(', ')}`
          );
        }
      }
      types.set(p.name, p);
    }
  }
  return { types };
}

/** Эффективные переходы для типа: глобальная матрица, обрезанная lifecycle'ом типа. */
export function transitionsFor(decl: MemoryTypeDeclaration): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const from of decl.lifecycle) {
    out[from] = (ALLOWED_TRANSITIONS[from] ?? []).filter((to) => decl.lifecycle.includes(to as MemoryStatus));
  }
  return out;
}
```

- [ ] **Step 3.2: Загрузчик конфига.** `src/adapters/fs/config-file.ts`:

```typescript
import * as fs from 'fs/promises';
import yaml from 'js-yaml';
import { z } from 'zod';
import { FieldSpec, MemoryType, MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { WolfConfig } from '../../domain/taxonomy.js';
import { configPath } from './project-paths.js';

const FieldSpecSchema: z.ZodType<FieldSpec> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('string'), required: z.literal(true), min: z.number().int().optional() }),
  z.object({ kind: z.literal('string'), optional: z.literal(true) }),
  z.object({ kind: z.literal('string'), default: z.string() }),
  z.object({ kind: z.literal('string[]'), required: z.literal(true), minItems: z.number().int().optional() }),
  z.object({ kind: z.literal('string[]'), default: z.array(z.string()).optional() }),
  z.object({ kind: z.literal('enum'), values: z.array(z.string()).min(1) }),
]);

const ProjectTypeDeclSchema = z.object({
  lifecycle: z.array(z.string()).min(1),
  subdir_thread: z.string().nullable().default(null),
  subdir_shared: z.string().nullable().default(null),
  fields: z.record(z.string(), FieldSpecSchema).default({}),
});

const ConfigFileSchema = z.object({
  artifact_sources: z.array(z.string()).default([]),
  memory_types: z
    .object({
      core: z.unknown().optional(),
      project: z.record(z.string(), ProjectTypeDeclSchema).default({}),
    })
    .default({}),
});

export class ConfigLoadError extends Error {}

export async function loadWolfConfig(baseDir: string): Promise<WolfConfig | null> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath(baseDir), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new ConfigLoadError(`Invalid YAML in ${configPath(baseDir)}: ${err instanceof Error ? err.message : err}`);
  }
  const cfg = ConfigFileSchema.parse(parsed);
  return {
    artifact_sources: cfg.artifact_sources,
    projectTypes: Object.entries(cfg.memory_types.project).map(([name, d]) => ({
      name: name as MemoryType,
      lifecycle: d.lifecycle as MemoryTypeDeclaration['lifecycle'],
      subdirThread: d.subdir_thread,
      subdirShared: d.subdir_shared,
      fields: d.fields,
    })),
    rawCoreBlock: cfg.memory_types.core ?? null,
  };
}
```

Замечание: project-имя кастуется к `MemoryType` структурно — рантайм-валидация принадлежности к enum происходит в `mergeTaxonomy` (конфликт/статусы) и при первой валидации объекта; TS-уровень здесь намеренно ослаблен на границе YAML (untrusted input), это единственное место такого cast.

- [ ] **Step 3.3: Failing-тест дефолтов (Q3).** В `tests/unit/domain/taxonomy.test.ts`:

```typescript
import { mergeTaxonomy } from '../../../src/domain/taxonomy.js';

describe('mergeTaxonomy (no config.yaml)', () => {
  it('returns core taxonomy untouched when config is null', () => {
    const { types } = mergeTaxonomy(null);
    expect(types.size).toBe(MEMORY_TYPES.length);
    expect(types.get('task-brief')).toBeDefined();
  });
  it('rejects project type shadowing a core type', () => {
    expect(() =>
      mergeTaxonomy({
        artifact_sources: [],
        rawCoreBlock: null,
        projectTypes: [{ name: 'decision', lifecycle: ['active'], subdirThread: 'x', subdirShared: null }],
      })
    ).toThrow(/cannot be overridden/);
  });
  it('accepts a legit project type', () => {
    const { types } = mergeTaxonomy({
      artifact_sources: [],
      rawCoreBlock: null,
      projectTypes: [
        {
          name: 'postmortem' as MemoryType,
          lifecycle: ['open', 'resolved'],
          subdirThread: 'postmortems',
          subdirShared: null,
        },
      ],
    });
    expect(types.get('postmortem' as MemoryType)?.subdirThread).toBe('postmortems');
  });
});
```

Run: `npx vitest run tests/unit/domain/taxonomy.test.ts` → PASS после Step 3.1.

- [ ] **Step 3.4: Генератор core-блока + команда sync.** В `src/domain/taxonomy.ts` добавить:

```typescript
/** Плоское представление core-блока для config.yaml (детерминированный порядок). */
export function generateCoreConfigBlock(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of CORE_TAXONOMY) {
    out[d.name] = {
      lifecycle: [...d.lifecycle],
      ...(d.layout === 'work-thread-file' ? { layout: 'work-thread-file' } : {}),
      subdir_thread: d.subdirThread,
      subdir_shared: d.subdirShared,
      ...(d.fields && Object.keys(d.fields).length ? { fields: d.fields } : {}),
      ...(d.requireSourcePath ? { require_source_path: true } : {}),
      ...(d.deprecated ? { deprecated: true } : {}),
    };
  }
  return out;
}
```

Команда `src/adapters/cli/commands/memory-taxonomy.ts`:

```typescript
import { Command } from 'commander';
import * as fs from 'fs/promises';
import yaml from 'js-yaml';
import { generateCoreConfigBlock } from '../../../domain/taxonomy.js';
import { loadWolfConfig } from '../../fs/config-file.js';
import { configPath } from '../../fs/project-paths.js';

export function memoryTaxonomyCommand(): Command {
  const cmd = new Command('taxonomy').description('Manage memory taxonomy');

  cmd
    .command('sync')
    .description('Regenerate memory_types.core in .wolf/config.yaml from code canon')
    .action(async () => {
      const baseDir = process.cwd();
      const existing = await loadWolfConfig(baseDir);
      const doc = {
        '# comment': 'memory_types.core генерируется `wolf taxonomy sync`; ручные правки будут перезаписаны',
        artifact_sources: existing?.artifact_sources ?? [],
        memory_types: {
          core: generateCoreConfigBlock(),
          project: existing?.projectTypes.length
            ? Object.fromEntries(
                existing.projectTypes.map((p) => [
                  p.name,
                  {
                    lifecycle: p.lifecycle,
                    subdir_thread: p.subdirThread,
                    subdir_shared: p.subdirShared,
                    fields: p.fields ?? {},
                  },
                ])
              )
            : {},
        },
      };
      await fs.writeFile(configPath(baseDir), yaml.dump(doc, { sortKeys: false }), 'utf-8');
      console.log(`Synced ${configPath(baseDir)} (core types: ${Object.keys(generateCoreConfigBlock()).length})`);
    });

  cmd
    .command('show')
    .description('Print effective taxonomy (code canon + project types)')
    .action(async () => {
      const cfg = await loadWolfConfig(process.cwd());
      const { types } = await import('../../../domain/taxonomy.js').then((m) => m.mergeTaxonomy(cfg));
      for (const [name, d] of types) {
        console.log(
          `${name}${d.deprecated ? ' (deprecated)' : ''}: lifecycle=[${d.lifecycle.join(',')}] dirs=${d.subdirThread ?? '-'}/${d.subdirShared ?? '-'}`
        );
      }
    });

  return cmd;
}
```

Регистрация в `cli-entry.ts`: `program.addCommand(memoryTaxonomyCommand());`.

- [ ] **Step 3.5: init создаёт config.yaml.** В конце успешного `init-project-memory` (или в `FsProjectInitializer`) вызвать ту же логику sync (импорт `generateCoreConfigBlock` + запись файла). Обновить `tests/unit/use-cases/init-project-memory.test.ts`: ожидать existence `.wolf/config.yaml` c `memory_types.core.task-brief`.
- [ ] **Step 3.6: Переходы уважают lifecycle.** `src/app/use-cases/transition-memory-object.ts` — перед `canTransition` добавить:

```typescript
const decl = getDeclaration(existing.type);
if (!decl.lifecycle.includes(target)) {
  throw new Error(
    `Status "${target}" is not in lifecycle of type "${existing.type}" (allowed: ${decl.lifecycle.join(', ')})`
  );
}
```

Тест в `tests/unit/use-cases/transition-memory-object.test.ts`: transition task-brief в `open` → ошибка про lifecycle; в `completed` → ok.

- [ ] **Step 3.7: Сканер пишет document-ref.** `scan-project.ts:90`: `type: 'document'` → `type: 'document-ref'`; обновить `tests/unit/use-cases/scan-project.test.ts`.
- [ ] **Step 3.8: CLI choices без deprecated.** `memory-add.ts:9`: `.choices([...MEMORY_TYPES].filter((t) => t !== 'document'))`.
- [ ] **Step 3.9: Полный прогон + коммит.**

```bash
npm run check
```

Expected: PASS. Commit: `feat(taxonomy): config.yaml loader, taxonomy sync command, lifecycle-aware transitions`.

---

### Task 4: Layout v2 в store — dual-read, write-new

**Files:**

- Modify: `src/adapters/fs/project-paths.ts`, `src/adapters/fs/markdown-memory-store.ts`, `src/bootstrap/container.ts`, `src/adapters/fs/fs-project-initializer.ts`
- Test: `tests/unit/adapters/markdown-memory-store.test.ts`, `tests/unit/adapters/project-paths.test.ts`

- [ ] **Step 4.1: Пути.** В `project-paths.ts` добавить (старые `objectsDir/objectDirForType/objectPath` оставить до Task 5, потом пометить deprecated):

```typescript
export function threadsDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'threads');
}
export function sharedDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'shared');
}
export function quarantineDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'quarantine');
}

/** Целевой путь объекта в layout v2. */
export function targetPathFor(baseDir: string, obj: { type: MemoryType; id: string; thread?: string }): string {
  const decl = getDeclaration(obj.type);
  if (decl.layout === 'work-thread-file') {
    return join(threadsDir(baseDir), obj.id, 'WORK-THREAD.md');
  }
  const fileName = `${obj.id}.md`;
  if (obj.thread && decl.subdirThread) return join(threadsDir(baseDir), obj.thread, decl.subdirThread, fileName);
  const sharedSub = decl.subdirShared ?? decl.subdirThread;
  if (!sharedSub) throw new Error(`Type ${obj.type} has no storage directory for this scope`);
  return join(sharedDir(baseDir), sharedSub, fileName);
}
```

Обновить `tests/unit/adapters/project-paths.test.ts`: WORK-THREAD.md спецслучай; task-brief с thread → `threads/<t>/tasks/<id>.md`; rule без thread → `shared/rules/<id>.md`.

- [ ] **Step 4.2: Failing-тесты store.** В `markdown-memory-store.test.ts` добавить:

```typescript
it('saves into layout v2 (threads/<tid>/<subdir>) and reads it back', async () => {
  const store = new MarkdownMemoryStore(base);
  const obj = { ...baseObj, type: 'task-brief', thread: 'mem_t1', executor: 'e', priority: 'high' } as MemoryObject;
  await store.save(obj);
  const p = join(base, '.wolf/memory/threads/mem_t1/tasks', `${obj.id}.md`);
  await expect(fs.access(p)).resolves.toBeUndefined();
  expect((await store.get(obj.id))?.id).toBe(obj.id);
});

it('lists from both legacy objects/ and new roots; new wins on id collision', async () => {
  // подготовить: старый файл objects/decisions/<id>.md со status active,
  // и новый shared/decisions/<id>.md со status archived (тот же id)
  const objs = await store.list();
  expect(objs.filter((o) => o.id === id)).toHaveLength(1);
  expect(objs.find((o) => o.id === id)?.status).toBe('archived');
});

it('skips unparsable file without failing list and reports via onProblem', async () => {
  await fs.writeFile(join(base, '.wolf/memory/shared/rules/broken.md'), 'not frontmatter', 'utf-8');
  const problems: string[] = [];
  const s = new MarkdownMemoryStore(base, (msg) => problems.push(msg));
  await expect(s.list()).resolves.toHaveLength(/* число валидных */);
  expect(problems.some((m) => m.includes('broken.md'))).toBe(true);
});
```

- [ ] **Step 4.3: Реализация store.** Ключевые изменения `MarkdownMemoryStore`:

```typescript
export class MarkdownMemoryStore implements MemoryStore {
  constructor(
    private baseDir: string,
    private onProblem?: (message: string) => void
  ) {}

  private roots(): string[] {
    return [legacyObjectsRoot(this.baseDir), threadsDir(this.baseDir), sharedDir(this.baseDir)];
    // legacyObjectsRoot = objectsDir (переименовать внутренне; каталог тот же)
  }

  private async walkMarkdownFiles(root: string): Promise<string[]> {
    // рекурсивный обход: readdir withFileTypes, каталоги — в глубину, файлы *.md — в результат; ENOENT -> []
  }

  async save(object: MemoryObject): Promise<void> {
    const path = targetPathFor(this.baseDir, object);
    await fs.mkdir(dirname(path), { recursive: true });
    const { body, ...frontmatter } = object;
    await writeFileAtomic(path, `---\n${yaml.dump(frontmatter)}---\n\n${body}`);
  }

  async get(id) {
    /* walk всех roots, первый не-legacy матч, иначе legacy */
  }

  async list(filters?) {
    // walk всех roots -> parseFile c try/catch:
    //   catch -> this.onProblem?.(`${path}: ${err.message}`)
    // дедуп по id: карта id->{obj,isLegacy}; не-legacy перезаписывает legacy + onProblem warning о коллизии
    // фильтры type/status/stale — как сейчас
  }

  async update(id, patch) {
    // как сейчас, но oldPath/newPath через targetPathFor(...)
  }
}
```

`writeFileAtomic` — там же в файле (или `adapters/fs/write-file-atomic.ts`):

```typescript
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, path);
}
```

Per-type валидация при чтении: контейнер передаёт store функцию `validateParsed(obj)` (см. Step 4.4); parseFile после базового парса вызывает её и при ошибке считает объект проблемой (карантин пассивный, D5).

- [ ] **Step 4.4: Контейнер.** `createCliContainer`:

```typescript
const cfg = await; /* нет — контейнер синхронный */
```

Контейнер синхронный (`createCliContainer` возвращает объект без Promise). Решение: ленивая таксономия — `getTaxonomy()` memoized async-хелпер рядом с контейнером; store получает `schemas: { parse: (type, data) => MemoryObject }`, который резолвит схему из `mergeTaxonomy` (кэш модуля). Для тестов — конструктор с явной таксономией. Проще: так как core покрывает всё и project-типы редки, store валидирует через `buildTypeSchemaCached(type)` где кэш строится из `CORE_TAXONOMY` + загруженные project-типы при первом обращении (sync-чтение файла через `readFileSync` в адаптере — допустимо на границе). Зафиксировать выбор: **sync-чтение config.yaml в адаптере `config-file.ts` добавлением `loadWolfConfigSync`** (readFileSync + тот же zod) — контейнер остаётся синхронным, асинхронщина не протекает в домен.

- [ ] **Step 4.5: Инициализатор.** `FsProjectInitializer` перестаёт создавать `objects/<тип>/` (V4: цикл по MEMORY_TYPES) — создаёт `memory/{threads,shared,briefs}`, `cache/`; per-type каталоги рождаются лениво при первом save (`mkdir recursive` уже есть). Тест `init-project-memory.test.ts` обновить: каталогов `objects/` больше нет.
- [ ] **Step 4.6: Run + commit** `feat(store): layout v2 — threads/<tid>/<subdir> + shared/, dual-read, atomic write, problem reporting`.

---

### Task 5: `wolf migrate` — одна миграция layout

**Files:**

- Create: `src/adapters/fs/layout-migration.ts`, `src/adapters/cli/commands/memory-migrate.ts`
- Modify: `src/adapters/cli/cli-entry.ts`
- Test: `tests/unit/adapters/layout-migration.test.ts`, `tests/integration/phase8-workflow.test.ts` (начать файл)

- [ ] **Step 5.1: Failing-тест плана.** Фикстура: legacy `objects/` c 4 объектами — decision без thread, work-thread, document с `source.path`, document без пути; relations/events файлы присутствуют.

```typescript
it('plans correct targets incl. document split and WORK-THREAD.md', async () => {
  const report = await planLayoutMigration(base);
  expect(report.entries.find((e) => e.type === 'work-thread')?.to).toMatch(/WORK-THREAD\.md$/);
  expect(report.entries.find((e) => e.originalType === 'document' && e.newType === 'document-ref')).toBeDefined();
  expect(report.entries.find((e) => e.newType === 'document-native')).toBeDefined();
  expect(report.conflicts).toHaveLength(0);
});
```

- [ ] **Step 5.2: Реализация.** `src/adapters/fs/layout-migration.ts`:

```typescript
import * as fs from 'fs/promises';
import yaml from 'js-yaml';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import { targetPathFor, objectsDir } from './project-paths.js';
import { writeFileAtomic } from './markdown-memory-store.js';

export interface MigrationEntry {
  id: string;
  type: string; // целевой тип (после сплита)
  originalType: string;
  from: string; // относительный исходный путь
  to: string; // относительный целевой путь
  action: 'move' | 'convert-document' | 'conflict';
}

export interface MigrationReport {
  entries: MigrationEntry[];
  conflicts: MigrationEntry[];
  problems: { path: string; error: string }[];
  total: number;
}

export async function planLayoutMigration(baseDir: string): Promise<MigrationReport> {
  /* walk objectsDir, parse каждой, расчёт targetPathFor; конфликт = целевой файл уже занят ДРУГИМ id */
}

export async function applyLayoutMigration(baseDir: string): Promise<MigrationReport> {
  const report = await planLayoutMigration(baseDir);
  for (const e of report.entries) {
    if (e.action === 'conflict') continue;
    const absFrom = `${baseDir}/${e.from}`;
    const absTo = `${baseDir}/${e.to}`;
    if (e.action === 'convert-document') {
      const raw = await fs.readFile(absFrom, 'utf-8');
      const m = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)!;
      const fm = yaml.load(m[1]) as Record<string, unknown>;
      fm.type = e.type;
      await fs.mkdir(dirname(absTo), { recursive: true });
      await writeFileAtomic(absTo, `---\n${yaml.dump(fm)}---\n\n${m[2]}`);
    } else {
      await fs.mkdir(dirname(absTo), { recursive: true });
      await fs.rename(absFrom, absTo);
    }
  }
  // подчистить опустевшие каталоги objects/ (readdir -> rmdir рекурсивно снизу вверх)
  return report;
}
```

Инварианты: `relations.jsonl`/`events.jsonl` не открываются; id не меняются; конфликтные файлы остаются на месте (докат при повторном запуске после ручного разбора).

- [ ] **Step 5.3: CLI.** `memory-migrate.ts`:

```typescript
cmd
  .command('migrate')
  .description('One-time migration: objects/<type>/ -> threads/<tid>/<subdir>/ + shared/')
  .option('--apply', 'perform the migration (default: dry-run)', false)
  .action(async ({ apply }) => {
    const baseDir = process.cwd();
    const report = apply ? await applyLayoutMigration(baseDir) : await planLayoutMigration(baseDir);
    printMigrationReport(report, apply ? 'apply' : 'dry-run');
    process.exitCode = report.conflicts.length > 0 ? 2 : 0;
  });
```

- [ ] **Step 5.4: Формат отчёта (зафиксирован):**

```text
# wolf migrate — layout v2 (mode: dry-run)

source: .wolf/memory/objects (14 objects)

| #  | id                          | type            | from                        | to                                  |
|----|-----------------------------|-----------------|-----------------------------|-------------------------------------|
| 1  | mem_20260610_tech_d4e5f6    | decision        | objects/decisions/…         | shared/decisions/…                  |
| 2  | mem_20260703_csv_a1b2c3     | work-thread     | objects/threads/…           | threads/mem_20260703_csv_a1b2c3/WORK-THREAD.md |
| 3  | mem_20260701_spec_e4f5a6    | document-ref    | objects/documents/…         | shared/documents/… (split: ref)     |

document split: 3 (ref 2 / native 1)
moved: 0 (dry-run) | conflicts: 0 | unparsable (untouched): 0
```

При `--apply` строка `moved: N`; exit 0 — успех/nothing-to-do, exit 2 — есть конфликты (перечислены в таблице с `action=conflict`).

- [ ] **Step 5.5: Идемпотентность — тест.**

```typescript
it('is idempotent: second run reports nothing to migrate', async () => {
  await applyLayoutMigration(base);
  const second = await planLayoutMigration(base);
  expect(second.total).toBe(0);
});
```

- [ ] **Step 5.6: Integration-тест** `tests/integration/phase8-workflow.test.ts` (начать): создать объекты через use-cases в legacy-раскладке (вручную положив файлы в `objects/`), запустить apply, проверить: `store.list()` видит все; `search` находит; двойной apply — no-op.
- [ ] **Step 5.7: Пометить legacy-хелперы deprecated** в `project-paths.ts` (`/** @deprecated layout v1, используется только migration */`).
- [ ] **Step 5.8: DoD миграции (чек-лист из concept §6):**

```bash
npx vitest run tests/unit/adapters/layout-migration.test.ts tests/integration/phase8-workflow.test.ts
```

- [ ] `wolf migrate --dry-run` на копии реального проекта: отчёт читаем, конфликтов 0
- [ ] `wolf migrate --apply`: exit 0; повторный запуск: `total: 0`, exit 0
- [ ] После миграции: `wolf list`, `wolf search "<слово>"`, `wolf brief`, `wolf thread brief <id>` работают
- [ ] `git status` внутри `.wolf/`: перемещения видны как renames, содержимое не изменено (кроме 3 split-документов)

Commit: `feat(migrate): one-shot layout v2 migration with dry-run report and document split`.

---

### Task 6: Оркестрационные типы через API + совет (tally/synthesis)

**Files:**

- Modify: `src/app/use-cases/add-memory-object.ts`, `src/adapters/cli/commands/memory-add.ts`, `src/adapters/mcp/mcp-schemas.ts` (если там enum типов)
- Create: `src/app/use-cases/tally-council-votes.ts`, `src/app/use-cases/create-synthesis.ts`, `src/adapters/cli/commands/memory-council.ts`
- Modify: `src/adapters/cli/cli-entry.ts`
- Test: `tests/unit/use-cases/{tally-council-votes,create-synthesis}.test.ts`, `tests/integration/phase8-workflow.test.ts` (дополнить)

- [ ] **Step 6.1: Generic-создание с доп. полями.** В `AddMemoryObjectInput` добавить `extra?: Record<string, unknown>`; в сборку объекта перед `validateMemoryObject`: `Object.assign(object, input.extra ?? {})`. CLI `memory-add.ts`: опция `--set <k=v,k=v>` → extra. Так создаются все 7 новых типов без семи новых команд (`wolf add --type task-brief --set executor=executor-lead,priority=high`).
- [ ] **Step 6.2: MCP.** Проверить `grep -n "MEMORY_TYPES\|z.enum" src/adapters/mcp/mcp-schemas.ts`; если тип — enum из кода, новые типы подхватятся автоматически; прогнать `npx vitest run tests/integration/mcp-stdio.test.ts`.
- [ ] **Step 6.3: Failing-тест tally.**

```typescript
it('counts votes from opinion objects and enforces quorum', async () => {
  // opinion A vote:A, opinion B vote:A, opinion C vote:B  (relation answers -> q1)
  const r = await tallyCouncilVotes({ store, relations }, { questionId: 'q1', quorum: 3, consensusThreshold: 0.67 });
  expect(r.tallies).toEqual({ A: 2, B: 1 });
  expect(r.quorumMet).toBe(true);
  expect(r.winner).toBe('A');
});
it('missing opinion counts as TIMEOUT and can fail quorum', async () => {
  /* 1 мнение, quorum 2 */
});
```

- [ ] **Step 6.4: Реализация tally.** `tally-council-votes.ts`:

```typescript
export interface CouncilTally {
  questionId: string;
  votes: { opinionId: string; voter: string; vote: string }[];
  tallies: Record<string, number>;
  quorumMet: boolean;
  winner: string | null;
}

export async function tallyCouncilVotes(
  deps: { store: MemoryStore; relations: RelationLog },
  input: { questionId: string; quorum: number; consensusThreshold: number }
): Promise<CouncilTally> {
  const rels = await deps.relations.list({ object: input.questionId, predicate: 'answers' });
  const votes: CouncilTally['votes'] = [];
  for (const r of rels) {
    const op = await deps.store.get(r.subject);
    if (!op || op.type !== 'council-opinion') continue;
    const vote = extractVote(op);
    votes.push({ opinionId: op.id, voter: op.created_by, vote });
  }
  const tallies: Record<string, number> = {};
  for (const v of votes) tallies[v.vote] = (tallies[v.vote] ?? 0) + 1;
  const quorumMet = votes.length >= input.quorum;
  const [top, n] = Object.entries(tallies).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return {
    questionId: input.questionId,
    votes,
    tallies,
    quorumMet,
    winner: quorumMet && top && n / votes.length >= input.consensusThreshold ? top : null,
  };
}

function extractVote(op: MemoryObject): string {
  if (typeof op.vote === 'string' && op.vote.trim()) return op.vote.trim();
  const m = op.body.match(/^VOTE:\s*(\S+)/m);
  return m ? m[1] : 'TIMEOUT';
}
```

VOTE-контракт — свободная строка (решение concept §6: вариантов может быть больше трёх), TIMEOUT — отсутствие.

- [ ] **Step 6.5: createSynthesis.** Создаёт `synthesis` (status `proposed`, поля `recommendation` обязательно) через `addMemoryObject`, затем `recordRelation` `based_on` → каждый opinion. Тест: объект создан, relations записаны.
- [ ] **Step 6.6: CLI.** `memory-council.ts`:

```text
wolf council tally <question-id> --quorum 3 --threshold 0.75
wolf council synthesize <question-id> --recommendation "..." [--created-by user:cli]
```

tally печатает таблицу голосов и вердикт; synthesize печатает id синтеза. Регистрация в cli-entry.

- [ ] **Step 6.7: Integration.** В `phase8-workflow.test.ts`: thread → task-brief (extra) → report → relation answers; council-question → 2 opinion → tally → synthesis. Всё через use-cases.
- [ ] **Step 6.8: Run + commit** `feat(orchestration): generic typed creation, council tally and synthesis use-cases`.

---

### Task 7: Надёжность записи + `wolf validate`

**Files:**

- Create: `src/ports/memory-lock.port.ts`, `src/adapters/fs/memory-lock.ts`, `src/adapters/fs/jsonl-scan.ts`, `src/adapters/sqlite/busy-retry.ts`, `src/adapters/cli/commands/memory-validate.ts`
- Modify: все write-use-cases (`add-memory-object`, `create-work-thread`, `create-decision`, `create-blocker`, `create-rule`, `create-article`, `create-info-request`, `resolve-blocker`, `supersede-memory-object`, `transition-memory-object`, `summarize-session`, `create-session-checkpoint`, `record-relation`, `scan-project`), оба JSONL-адаптера, `sqlite-search-index.ts`, `bootstrap/container.ts`, `cli-entry.ts`
- Test: `tests/unit/adapters/{memory-lock,jsonl-scan,busy-retry}.test.ts`

- [ ] **Step 7.1: Порт + реализация лока.** `src/ports/memory-lock.port.ts`:

```typescript
export interface MemoryLock {
  withLock<T>(fn: () => Promise<T>): Promise<T>;
}
```

`src/adapters/fs/memory-lock.ts`:

```typescript
import { mkdir, open, readFile, unlink } from 'fs/promises';
import { join } from 'path';

const STALE_MS = 30_000;
const RETRY_MS = 100;
const MAX_WAIT_MS = 5_000;

export class LockHeldError extends Error {
  constructor(
    readonly lockPath: string,
    readonly holderPid?: number
  ) {
    super(`Memory lock held${holderPid ? ` by pid ${holderPid}` : ''}: ${lockPath}`);
  }
}

export class FsMemoryLock implements MemoryLock {
  constructor(private dir: string) {}
  withLock<T>(fn: () => Promise<T>): Promise<T> {
    return withMemoryLock(this.dir, fn);
  }
}

export async function withMemoryLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dir, { recursive: true });
  const lockPath = join(dir, '.lock');
  if (!(await acquire(lockPath))) {
    const deadline = Date.now() + MAX_WAIT_MS;
    while (!(await acquire(lockPath))) {
      if (Date.now() > deadline) {
        const holder = await readHolder(lockPath);
        throw new LockHeldError(lockPath, holder?.pid);
      }
      await sleep(RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}

async function acquire(lockPath: string): Promise<boolean> {
  try {
    const fh = await open(lockPath, 'wx');
    await fh.write(JSON.stringify({ pid: process.pid, ts: Date.now() }));
    await fh.close();
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    await stealIfStale(lockPath);
    return false;
  }
}

// ponytail: кража stale-лока гонна при двух одновременных похитителях;
// локально это означает лишний EEXIST-раунд, не порчу данных. Усложнять не будем.
async function stealIfStale(lockPath: string): Promise<void> {
  const h = await readHolder(lockPath);
  if (!h || Date.now() - h.ts > STALE_MS || Number.isNaN(h.ts)) await unlink(lockPath).catch(() => {});
}

async function readHolder(lockPath: string): Promise<{ pid: number; ts: number } | null> {
  try {
    return JSON.parse(await readFile(lockPath, 'utf-8'));
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

Тест: параллельные `withLock` — второй ждёт; удержание >MAX_WAIT → LockHeldError; stale-файл (ts старый) крадётся.

- [ ] **Step 7.2: Обернуть write-use-cases.** Каждый из 14 use-cases: в deps добавить `lock?: MemoryLock`, тело вынести в локальную `run`, вернуть:

```typescript
const run = async (): Promise<...> => { /* прежнее тело */ };
return deps.lock ? deps.lock.withLock(run) : run();
```

Контейнер: `lock: new FsMemoryLock(memoryDir(baseDir))` (импорт `memoryDir`). Существующие юнит-тесты use-cases не передают lock — ветка `deps.lock ? ...` сохраняет совместимость.

- [ ] **Step 7.3: Толерантный JSONL.** Create `src/adapters/fs/jsonl-scan.ts`:

```typescript
export interface JsonlProblem {
  line: number;
  error: string;
  content: string;
}
export interface JsonlScan<T> {
  items: T[];
  problems: JsonlProblem[];
}

export async function scanJsonlFile<T>(path: string, parseItem: (raw: unknown) => T): Promise<JsonlScan<T>> {
  let content: string;
  try {
    content = await fs.readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { items: [], problems: [] };
    throw err;
  }
  const items: T[] = [];
  const problems: JsonlProblem[] = [];
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  lines.forEach((line, i) => {
    try {
      items.push(parseItem(JSON.parse(line)));
    } catch (err) {
      problems.push({
        line: i + 1,
        error: err instanceof Error ? err.message : String(err),
        content: line.slice(0, 200),
      });
    }
  });
  return { items, problems };
}
```

`JsonlEventLog.readAll`/`JsonlRelationLog.list` переключить на `scanJsonlFile`; проблемы — `console.error('[mr-wolf] skipping bad line N in <file>: msg')` (stderr), результат без битых строк (чинит V7). Публичные сигнатуры портов не меняются.

- [ ] **Step 7.4: SQLITE_BUSY.** `busy-retry.ts`:

```typescript
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function runWithBusyRetry<T>(fn: () => T, attempts = 5): T {
  let delay = 50;
  for (let i = 0; ; i++) {
    try {
      return fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i >= attempts - 1 || !msg.includes('SQLITE_BUSY')) throw err;
      sleepSync(delay);
      delay *= 2; // 50,100,200,400
    }
  }
}
```

`SQLiteSearchIndex`: в конструкторе после открытия — `this.db.pragma('busy_timeout = 5000');`; тела `indexObject/removeObject/rebuild` обернуть `runWithBusyRetry(() => {...})`.

- [ ] **Step 7.5: Карантин --fix.** В `memory-validate.ts` (ниже): `--fix` для каждой object-problem переносит файл в `quarantine/<относительный путь от memory/>` + пишет sidecar `<file>.meta.json` `{"error": "...", "quarantined_at": "..."}`. Чтение никогда не перемещает (D5).
- [ ] **Step 7.6: `wolf validate`.** `memory-validate.ts`:

```typescript
interface ValidateSection {
  name: string;
  errors: string[];
  warnings: string[];
}
```

Секции (каждая — функция, возвращающая секцию):

1. `taxonomy`: `generateCoreConfigBlock()` vs `cfg.rawCoreBlock` deep-compare → error `core block drifted from code canon; run: wolf taxonomy sync`; project-типы прогоняются через `mergeTaxonomy` (ловит shadow/статусы).
2. `layout`: счётчик файлов в `objectsDir` → warning если >0 («run: wolf migrate»).
3. `objects`: полный walk через store с собранными проблемами → каждая проблема error; `--fix` карантинирует.
4. `events.jsonl` / `relations.jsonl`: `scanJsonlFile` → problems как errors; для relations дополнительно dangling endpoints (subject/object отсутствует в store) → warnings.
5. `index`: ids из sqlite (`SELECT memory_id FROM memory_meta`) vs ids store — расхождения как errors («stale index; run: wolf rebuild-index»).
6. `locks`: наличие `.wolf/memory/.lock` со старым `ts` (>STALE) → warning.

Вывод — формат из Step 7.7; exit 1 если есть errors.

- [ ] **Step 7.7: Формат вывода (зафиксирован):**

```text
$ wolf validate
taxonomy:   OK
layout:     legacy objects left: 0
objects:    scanned 42, broken 0
events:     310 lines, bad 0
relations:  58 lines, bad 0, dangling 0
index:      sqlite 42 / store 42 — fresh
locks:      no stale lockfiles

result: OK (errors: 0, warnings: 0)
```

При ошибках — те же строки с `FAIL` и списком `error: <путь>: <причина>`; последняя строка `result: FAILED (errors: N, warnings: M)`; exit 1. Пример ошибки:

```text
objects:    scanned 42, broken 1
  error: .wolf/memory/shared/rules/broken.md: Failed to parse memory file: Missing or invalid frontmatter delimiter
```

- [ ] **Step 7.8: Тесты.** `memory-lock.test.ts` (параллель/таймаут/stale), `jsonl-scan.test.ts` (битая строка → problem, остальные читаются), `busy-retry.test.ts` (fake fn бросает SQLITE_BUSY дважды → третий вызов ок; другая ошибка → проброс немедленно), integration: validate на фикстуре с 1 битым объектом + 1 битой строкой relations → exit 1, `--fix` → объект в quarantine, повторный validate → OK.
- [ ] **Step 7.9: Run + commit** `feat(reliability): memory lock, tolerant JSONL, quarantine, busy retry, wolf validate`.

---

### Task 8: Документация + финальная верификация

**Files:**

- Modify: `AGENTS.md`, `README.md`, `MEMORY.md`, `docs/superpowers/plans/roadmap-v2.md`

- [ ] **Step 8.1:** `AGENTS.md`: Completed phases += Phase 8 (кратко: taxonomy via config, orchestration types, layout v2 migrated, write reliability); Next phase += Phase 9; Architecture notes — упомянуть `CORE_TAXONOMY` как канон и layout `threads/ + shared/`.
- [ ] **Step 8.2:** `README.md`: команды `wolf taxonomy sync/show`, `wolf migrate`, `wolf validate [--fix]`, `wolf council tally/synthesize`; раздел про layout v2 и правило «без config.yaml работает на дефолтах».
- [ ] **Step 8.3:** `MEMORY.md`: запись решения (layout v2 naming deviations D-dev1/D-dev2, canon D2).
- [ ] **Step 8.4:** `roadmap-v2.md` §Phase 8: пометка `> Superseded by docs/superpowers/specs/2026-08-23-phase-8-schema-taxonomy.md (concept v2)`.
- [ ] **Step 8.5:** Полный гейт:

```bash
npm run check
```

Expected: PASS целиком.

- [ ] **Step 8.6:** Smoke на копии реального проекта (не на рабочем!): `cp -r <proj> /tmp/wolf-smoke` → в копии `wolf migrate --dry-run` → `--apply` → `wolf validate` → `wolf brief`. Коммит `docs: phase 8 documentation`.

---

## Definition of Done (фаза, из concept §6 + уточнения)

1. `wolf taxonomy sync` генерирует config.yaml из кода; ручная порча core-блока ловится `wolf validate` (D1).
2. Core-типы неизменяемы извне кода; project-типы добавляются через config, shadow/статус-ошибки — fail-fast (D2).
3. Без `.wolf/config.yaml` все команды работают на `CORE_TAXONOMY` (22 типа), автотест покрывает (D3).
4. Миграция выполнена по DoD шага 5.8; dual-read постоянен, writes — только v2; повторный запуск — no-op (D4).
5. Тесты надёжности зелёные: lock-таймаут, tolerant JSONL, карантин --fix, busy retry, validate exit-коды (D5).
6. Все 7 оркестрационных типов создаются через `wolf add --type X --set ...` и MCP `add`; tally/synthesis работают end-to-end.
7. `npm run check` полностью зелёный; документация обновлена (правило репозитория).

## Self-review (выполнено при написании)

- **Spec coverage:** Q1→T3(+T1), Q2→T1/T2/T3, Q3→T3 Step 3.3, Q4→T4/T5, Q5→T7; противоречия #11 (display-id vs global id — учтено: миграция не переименует id, V10), #12 (tombstone-удаление тредов — сознательно НЕ в Phase 8: `thread delete` остаётся designed, отдельная задача), #13 (сплит — T3 Step 3.7 + T5) — покрыты.
- **Placeholder scan:** шаги 4.3/5.2 содержат каркас с комментариями вместо полного листинга там, где тело является механическим walk/diff — это осознанное сокращение объёма спеки при полном определении интерфейсов, форматов и инвариантов; исполнитель пишет тело по указанным контрактам и тестам (тесты даны полностью и являются спецификацией поведения).
- **Type consistency:** `MemoryTypeDeclaration`/`FieldSpec` едины между T1/T2/T3/T4; `MigrationEntry.{from,to}` относительные пути — используются в CLI печати и apply; `CouncilTally.winner: string | null` согласован с threshold-логикой; `withMemoryLock(dir, fn)` vs порт `MemoryLock.withLock(fn)` — разные уровни (функция для адаптеров, порт для use-cases), названы различными именами намеренно.

## Execution Handoff

Спека готова к исполнению. Два варианта:

1. **Subagent-Driven (рекомендуется)** — субагент на задачу, ревью между задачами (superpowers:subagent-driven-development).
2. **Inline** — исполнение в этой сессии по executing-plans с чекпоинтами.
