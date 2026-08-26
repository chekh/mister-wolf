# Phase 10 — wolf insights: эвристическая аналитика памяти (Level 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать `wolf insights --topic <topic> --type <type>` и MCP-тул `insights` — детерминированный (Level 1, без LLM) анализ активной памяти: top tags, частые `related.files`, stale/superseded/conflicting decisions, density decision/lesson/debug. Пять analysis types (`patterns | technical_debt | decisions | lessons | activity`) — линзы рендера над одним вычислением. Level 2 (LLM-синтез) исключён из фазы решением пользователя.

**Architecture:** Гексагон сохраняется. Новый read-only use-case `generateInsights` (deps `{ store, clock }`) — один `store.list()` плюс агрегации в памяти, по образцу `generateAgentBrief`. Новых доменных типов, миграций и зависимостей нет. Новая CLI-команда `wolf insights`, новый MCP-тул `insights`.

**Tech Stack:** TypeScript (ESM), zod 4, commander 12, vitest. **Новых зависимостей нет.** Эмбеддинги/LLM-клиенты запрещены.

---

## 0. Сверка с реальным доменом (проверено перед написанием)

Все утверждения сверены с кодом main post-Phase 9 (2026-08-26). Расхождения зафиксированы и закрыты решениями ниже.

| #   | Факт                                                                                                                                                                                                                                                                                                        | Источник                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Roadmap-scope фазы: `wolf insights --topic <topic> --type <type>`; Level 1 (no LLM): top tags, frequent `related.files`, stale/superseded/conflicting decisions, decision/lesson/debug density; analysis types `patterns/technical_debt/decisions/lessons/activity`; out of scope: real-time, cross-project | docs/superpowers/plans/roadmap-v2.md:267-297                                                                                                                     |
| V2  | Поля объекта: `tags: string[]`, `related.files/docs/decisions: string[]`, `status`, `created_at/updated_at` (ISO datetime), `confidence`, `importance`, governance-дефолты `memory_class/truth_role/lifetime`                                                                                               | src/domain/schemas/memory-object-schema.ts:9-49                                                                                                                  |
| V3  | 23 core-типа, единственный источник `CORE_TAXONOMY_DECLS`; **типа `debug` в таксономии нет**                                                                                                                                                                                                                | src/domain/memory-types.ts:66-229                                                                                                                                |
| V4  | 14 статусов вкл. `stale/conflicting/superseded`; `superseded` — терминальный                                                                                                                                                                                                                                | src/domain/memory-types.ts:1-15; src/domain/governance.ts:43                                                                                                     |
| V5  | Эффективные переходы = `ALLOWED_TRANSITIONS ∩ lifecycle`; lifecycle decision = `['active','superseded','rejected','obsolete']` ⇒ **статус `conflicting` для decision недостижим** (достижим для FULL-lifecycle типов: lesson, observation, …)                                                               | src/domain/memory-types.ts:31,70; src/domain/governance.ts:35-52                                                                                                 |
| V6  | `store.list(filters?: ListFilters{type?,status?,stale?})` без пагинации; каждый вызов — полный обход корней с reparse всех md-файлов                                                                                                                                                                        | src/ports/memory-store.port.ts:3-14; src/adapters/fs/markdown-memory-store.ts:92-116                                                                             |
| V7  | Staleness уже считается: `isStale` = `updated_at` старше `STALE_DAYS=30`, но через глобальный `Date.now()` (не инъекцию)                                                                                                                                                                                    | src/adapters/fs/markdown-memory-store.ts:13,233-237                                                                                                              |
| V8  | Governance-фильтров в портах нет: `ListFilters` = type/status/stale; в `SearchOptions` из governance только `includeSuperseded`; `memoryClass/truthRole/lifetime` принимаются MCP-схемами, но внизу молча игнорируются                                                                                      | src/ports/memory-store.port.ts:3-7; src/ports/search-index.port.ts:8-19; src/adapters/mcp/mcp-schemas.ts:13-15; src/adapters/sqlite/sqlite-search-index.ts:42-95 |
| V9  | Теги сохраняются как есть (без нормализации), агрегаций тегов в коде нет; FTS пишет их через `tags.join(',')`, фильтр — `LIKE '%…%'` (неточное совпадение множества)                                                                                                                                        | src/app/use-cases/add-memory-object.ts:58; src/adapters/sqlite/sqlite-search-index.ts:74-77,146                                                                  |
| V10 | Прецедент read-only агрегатора: `generateAgentBrief(deps {store,fs,clock})` делает один `store.list()` и фильтрует в памяти                                                                                                                                                                                 | src/app/use-cases/generate-agent-brief.ts:14-40                                                                                                                  |
| V11 | CLI-паттерн: commander, `createCliContainer(process.cwd())`, вывод `console.log(`${id} [${type}] ${title}`)`; регистрация = import + `addCommand` в cli-entry                                                                                                                                               | src/adapters/cli/commands/memory-search.ts:5-45; src/adapters/cli/cli-entry.ts:31,68                                                                             |
| V12 | MCP-паттерн: zod-схема в mcp-schemas.ts + `server.registerTool(name, {description, inputSchema}, handler)` с text-content ответом                                                                                                                                                                           | src/adapters/mcp/mcp-schemas.ts:18-33; src/adapters/mcp/mcp-tools.ts:38-65                                                                                       |
| V13 | Контейнер даёт `store/index/clock/…`; `Clock` — порт с адаптером `SystemClock`, инъекция — штатный приём (brief, solve)                                                                                                                                                                                     | src/bootstrap/container.ts:13-27; src/ports/clock.port.ts:1-3                                                                                                    |
| V14 | Ошибки — голый `throw new Error`; некритичное — `warnings: string[]`; флага `--json` нет нигде, весь CLI-вывод — human text                                                                                                                                                                                 | src/app/use-cases/add-memory-object.ts:31-34,70-77                                                                                                               |
| V15 | Упоминаний «insight» в src/ и tests/ нет — поле чистое; `npm run check` гоняет prettier на `docs/**/*.md` (спека тоже формат-критична)                                                                                                                                                                      | grep по репо; package.json:15-20                                                                                                                                 |

### Отклонения от roadmap (осознанные, документируются в README)

| #      | Roadmap говорит                                                   | Спека решит                                                                                                                                                            | Почему                                                                                  |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D-dev1 | «decision/lesson/**debug** density»                               | Типа `debug` нет (V3). Debug-density = эвристика по тегам `DEBUG_TAGS=['debug','bug','bugfix','memory-repair','solve']` поверх всех типов; новый core-тип не заводится | Taxonomy churn ради одной метрики; debugging-сигналы сегодня живут в тегах solve/repair |
| D-dev2 | Success criteria: «With LLM adapter, returns synthesized summary» | Level 2 исключён из фазы (решение пользователя); критерий сужен до Level 1; LLM-адаптер — отдельная будущая фаза                                                       | Пользовательское решение 2026-08-26; порт не абстрагируем заранее (см. D12)             |
| D-dev3 | `--topic <topic> --type <type>` выглядят обязательными            | Оба флага optional с дефолтами: без аргументов `wolf insights` = project-wide overview, type=`patterns`                                                                | Whole-project обзор — штатный кейс; обязательность не даёт выгоды                       |

---

## 1. Решения: закрытие открытых вопросов

### D1 — один проход агрегации, пять линз рендера

`generateInsights` делает **ровно один** `store.list()` (каждый вызов — полный reparse, V6), строит полный `InsightsReport` (все метрики сразу), а `renderInsights(report)` выбирает видимые секции по `report.analysisType`. Альтернатива «считать метрики per-type» отвергнута: N полных reparse на один вызов.

```typescript
export type AnalysisType = 'patterns' | 'technical_debt' | 'decisions' | 'lessons' | 'activity';

export interface InsightsInput {
  topic?: string; // undefined/null => весь проект
  analysisType?: AnalysisType; // default 'patterns'
}

export interface TagCount {
  tag: string;
  count: number;
}
export interface FileCount {
  file: string;
  count: number;
}
export interface WeekBucket {
  week: string; // YYYY-MM-DD понедельника ISO-недели
  decisions: number;
  lessons: number;
  debug: number;
  total: number;
}

export interface InsightsReport {
  topic: string | null;
  analysisType: AnalysisType;
  generatedAt: string;
  scope: { total: number; matched: number };
  topTags: TagCount[]; // top 10, убывание count, tie => алфавит
  topFiles: FileCount[]; // top 10 из related.files, та же сортировка
  typeDistribution: TagCount[]; // {tag: type, count} — распределение по типам
  stale: MemoryObject[]; // см. D5
  supersededDecisions: MemoryObject[]; // decision status='superseded', с superseded_by
  conflicts: { statusConflicting: MemoryObject[]; candidates: MemoryObject[][] }; // см. D6
  lowConfidenceActive: MemoryObject[];
  openBlockers: MemoryObject[];
  decisionsByStatus: Record<string, MemoryObject[]>; // active/superseded/rejected/obsolete
  lessonsTopTags: TagCount[]; // top 5 по типам lesson+observation
  density: WeekBucket[]; // 8 недель, см. D7
  statusTally: TagCount[]; // {tag: status, count} — для activity
  truthRoleTally: TagCount[]; // прозрачность governance, см. D9
}

export async function generateInsights(
  deps: { store: MemoryStore; clock: Clock },
  input: InsightsInput
): Promise<InsightsReport>;

export function renderInsights(report: InsightsReport): string; // human text, см. D8
```

### D2 — база агрегации

База = все объекты из `store.list()` кроме `status === 'archived'`. `scope.total` = размер базы; `scope.matched` = прошедшие topic-фильтр (D3). Все секции считают по matched-подмножеству, если topic задан. Статусные уточнения секций — в D5–D7.

### D3 — семантика `--topic`

Topic-фильтр, case-insensitive: объект матчится, если (a) какой-либо его `tags` элемент равен topic после `toLowerCase()` (точное совпадение тега), ИЛИ (b) `title` или `body` содержит topic как подстроку после `toLowerCase()`. Прецедент keyword-матчинга — `trigger_keywords` у call-injection. Альтернатива «FTS-запрос через search index» отвергнута: индекс не содержит governance-полей, его tag-фильтр — неточный `LIKE` (V8, V9), а детерминированный in-memory матч тривиально тестируется и не требует SQLite.

### D4 — `--type`: валидация

Значения фиксируены: `patterns | technical_debt | decisions | lessons | activity` (snake_case — как в roadmap, V1). Default `patterns`. Невалидное значение → `throw new Error` с перечнем допустимых (стиль V14); CLI дополнительно может объявить choices в опции для UX help'а.

### D5 — stale-сигнал

Объект попадает в `stale`, если `status === 'stale'` ИЛИ (`status === 'active'` И `now - updated_at > INSIGHTS_STALE_DAYS`). `INSIGHTS_STALE_DAYS = 30` — константа use-case файла, значение синхронизировано с `STALE_DAYS` стора (V7), но считается самостоятельно через **инъектированный `Clock`** (V13) — в отличие от `store.isStale`, который берёт глобальный `Date.now()`; это даёт детерминичные тесты. `archived`/`superseded` в stale не попадают (у них свой сигнал — D6/`supersededDecisions`).

### D6 — conflicting decisions

Два сигнала:

1. `statusConflicting` — любые объекты (любых типов) со `status === 'conflicting'`; для FULL-lifecycle типов статус достижим (V5).
2. `candidates` — группы из ≥2 объектов `type === 'decision'`, `status === 'active'`, с непустым пересечением тегов; каждая группа помечается «potential conflict (shared tag: X)». Для типа decision статус `conflicting` недостижим (V5), поэтому эвристика — единственный доступный Level 1 сигнал именно по decisions.

Альтернатива (семантический анализ противоречий в body) — Level 2, out of scope.

### D7 — density и activity: недельные бакеты

Бакет = ISO-неделя (ключ `YYYY-MM-DD` понедельника), окно = последние 8 недель включая текущую, привязка по `created_at`. Классы: `decisions` — `type === 'decision'`; `lessons` — `type ∈ {'lesson','observation'}` (оба живут в lessons/, V3); `debug` — `tags ∩ DEBUG_TAGS ≠ ∅` без ограничения типа (D-dev1). `total` — все matched. `activity` дополнительно показывает `statusTally`.

### D8 — формат вывода: human text, без `--json`

CLI печатает текст через `console.log` (стиль V11), MCP-тул возвращает тот же текст как text-content (стиль V12). Заголовок: `Insights [<type>] (topic: <t> | project-wide), matched M/N objects`. Сразу под заголовком, во всех линзах — Scope-строка: `Scope: matched M/N objects, truth roles: proposed_knowledge N / accepted_knowledge N / source_of_truth N` (потребляет `scope` и `truthRoleTally`, см. D9). Далее секции линзы:

- `patterns`: Top tags, Frequent related.files, Type distribution;
- `technical_debt`: Stale objects, Superseded decisions, Low-confidence active, Open blockers;
- `decisions`: Decisions by status, Potential conflicts (= `statusConflicting` + `candidates`), Recent decisions (top 5 по `updated_at` desc);
- `lessons`: Lesson/Observation counts, Stale lessons, Top lesson tags;
- `activity`: Weekly density (таблица buckets), Status tally.

«Recent decisions» выводится из `decisionsByStatus.active` (top 5 по `updated_at` desc), «Lesson/Observation counts» — из `typeDistribution`, «Stale lessons» — из `stale` ∩ {lesson, observation}; отдельных полей отчёта для них не заводить. `generatedAt` печатается в конце отчёта строкой `Generated: <iso>` (прецедент — brief); для Level 2 это же поле — точка входа синтеза (D12). Пустая секция печатает `-` (graceful empty, никаких ошибок на пустой памяти). Флаг `--json` не вводится: потребителей структурированного вывода пока нет, новую CLI-конвенцию не заводим (V14); пересмотр — когда появится первый consumer.

### D9 — governance в Level 1

Фильтровать по `memory_class/truth_role/lifetime` нельзя штатно — в портах таких фильтров нет, а MCP-параметры сегодня игнорируются внизу (V8). Решение: Level 1 ничего не скрывает по governance; для прозрачности `Scope`-секция показывает `truthRoleTally`. Когда governance-фильтры появятся в портах — перейти на них (отмечено как кандидат следующей фазы поиска).

### D10 — read-only контракт

Insights ничего не пишет: lock не берётся, `log.append` не вызывается, файлы не создаются (прецедент solve). Юнит-тест ассертит неизменность каталога памяти после вызова.

### D11 — размещение кода

Вся логика и рендер — в одном `src/app/use-cases/generate-insights.ts` по образцу монолита-агрегатора `generate-agent-brief.ts` (V10). Отдельный доменный модуль не выделяем, пока не появился второй потребитель (YAGNI); CLI — `src/adapters/cli/commands/memory-insights.ts` (конвенция `memory-<команда>.ts`, V11); MCP — `InsightsInputSchema` + `registerTool('insights', …)` (V12).

### D12 — Level 2 (LLM-синтез): осознанно не делаем

Точку расширения не абстрагируем заранее. `InsightsReport` уже несёт все данные для будущего синтеза; когда придёт фаза LLM-адаптера, это будет отдельный use-case (например `synthesizeInsights`), принимающий отчёт — интерфейс D1 совместим. Сейчас это был бы спекулятивный порт с одной заглушкой-реализацией.

---

## 2. Структура файлов

```
src/app/use-cases/generate-insights.ts          # новый: AnalysisType, InsightsReport, generateInsights, renderInsights, константы
src/adapters/cli/commands/memory-insights.ts    # новый: memoryInsightsCommand(): Command('insights')
src/adapters/cli/cli-entry.ts                   # +import memoryInsightsCommand, +program.addCommand(...)
src/adapters/mcp/mcp-schemas.ts                 # +InsightsInputSchema
src/adapters/mcp/mcp-tools.ts                   # +registerTool('insights', ...)
tests/unit/use-cases/generate-insights.test.ts  # новый: агрегации + рендер + read-only
tests/unit/adapters/mcp-server.test.ts          # +тест тула insights
tests/e2e/insights.e2e.ts                       # новый: золотые сценарии
README.md                                       # +wolf insights в список команд
```

## 3. Предусловия

- [ ] Ветка `dev` актуальна, рабочее дерево чистое.
- [ ] `npm run check` зелёный до начала (базлайн 2026-08-26: 61 test files / 230 tests passed).
- [ ] Insights-код в репо отсутствует (V15).

## 4. Tasks

### Task 1: use-case `generateInsights` (TDD)

- [ ] `tests/unit/use-cases/generate-insights.test.ts`: fake `MemoryStore` (in-memory массив), fake `Clock` с фиксированным `now`.
- [ ] Тест topic-фильтра (D3): точное совпадение тега (case-insensitive); подстрока в title; подстрока в body; пустой topic → matched = total.
- [ ] Тест stale (D5): `updated_at` 29 дней назад при `active` — не stale; 31 день назад — stale; `status:'stale'` — stale независимо от возраста; `archived`/`superseded` — никогда.
- [ ] Тест конфликтов (D6): 2 active decision с общим тегом → одна группа-кандидат; без пересечения → пусто; lesson со `status:'conflicting'` → в `statusConflicting`.
- [ ] Тест density (D7): объекты в разных ISO-неделях → правильные бакеты; классы decisions/lessons/debug считаются независимо; окно 8 недель отсекает старое.
- [ ] Тест debug-эвристики (D-dev1): тег `debug` на lesson и на decision → оба в debug-класс недели.
- [ ] Тест базы (D2): `archived` исключён из total и всех секций.
- [ ] Тест рендера: каждая из 5 линз печатает свои заголовки секций; пустая память → `-`, без throw; Scope-строка присутствует во всех линзах.
- [ ] Тест сортировки/лимитов: topTags/topFiles — top 10, убывание count, tie → алфавит; lessonsTopTags — top 5.
- [ ] Тест валидации (D4): невалидный `analysisType` → `throw new Error` с перечнем пяти допустимых значений.
- [ ] Тест read-only (D10): после вызова содержимое каталога памяти бит-в-бит равно исходному.
- [ ] Имплементация `src/app/use-cases/generate-insights.ts` (D1–D12). Один `store.list()`.

### Task 2: CLI `wolf insights`

- [ ] `src/adapters/cli/commands/memory-insights.ts` по образцу `memory-search.ts` (V11): `.option('--topic <topic>')`, `.option('--type <type>', …)` (choices пяти значений), action → `createCliContainer(process.cwd())` → `generateInsights({ store, clock }, …)` → `console.log(renderInsights(report))`.
- [ ] Регистрация в `src/adapters/cli/cli-entry.ts`: import + `addCommand` рядом с solve/call (V11).
- [ ] Ручная проверка: `wolf insights --help`, `wolf insights --topic auth --type patterns` на тестовом проекте.

### Task 3: MCP-тул `insights`

- [ ] `InsightsInputSchema = z.object({ topic: z.string().optional(), type: z.enum(['patterns','technical_debt','decisions','lessons','activity']).optional() })` в `mcp-schemas.ts`.
- [ ] `registerTool('insights', …)` в `mcp-tools.ts` (V12): description «Heuristic pattern analysis over project memory (Level 1, no LLM)»; ответ — `renderInsights(...)` как text-content.
- [ ] `tests/unit/adapters/mcp-server.test.ts`: вызов тула возвращает текст с заголовком `Insights [patterns]`; неверный `type` → ошибка схемы.

### Task 4: E2E золотые сценарии

- [ ] `tests/e2e/insights.e2e.ts`, helpers `runCli`/`tmpProject` (каркас tests/e2e/helpers.ts):
  - сценарий populated: init → add decision (тег `auth`) → add lesson (теги `auth`,`debug`) → `insights --topic auth --type patterns` → exit 0, stdout содержит `Insights [patterns]`, `Top tags`, `auth`;
  - сценарий empty: init → `insights` без аргументов → exit 0, graceful `-`.
- [ ] `npm run e2e` зелёный.

### Task 5: документация + финальная верификация

- [ ] README: команда `wolf insights` в списке команд + абзац про Level 1/Level 2 и отклонения D-dev1–D-dev3.
- [ ] `npm run check` зелёный (prettier затрагивает и эту спеку — формат-чистота обязательна, V15).

## Definition of Done (фаза)

- [ ] Все 5 analysis types работают через CLI и MCP; `wolf insights --topic auth --type patterns` даёт эвристический анализ без LLM (roadmap success criteria, сужённый D-dev2).
- [ ] Real-time и cross-project insights отсутствуют (out of scope, V1); LLM-адаптера нет (D-dev2).
- [ ] Read-only контракт подтверждён тестом (D10).
- [ ] `npm run check` и `npm run e2e` зелёные.

## E2E-секция (правило mem_20260823_e2e_5459cc)

Полное E2E выполняется после реализации плана: оба золотых сценария из Task 4 прогоняются через `npm run e2e` (build + vitest, каркас tests/e2e/). Результат фиксируется в execution-отчёте фазы.

## Self-review (что сознательно опущено)

- `--json` и структурированный вывод — до первого потребителя (D8).
- Нормализация тегов (lowercase-миграция стора) — отдельная фаза; здесь только case-insensitive сравнение на лету (V9).
- Tag co-occurrence и графовые метрики — YAGNI для Level 1.
- Governance-фильтры в UI — ждут портов (D9).
- Наполнение линз шире четырёх roadmap-пулий Level 1 (`typeDistribution`, `lowConfidenceActive`, `openBlockers`, `statusTally`) — осознанное расширение: roadmap именует линзы, но не исчерпывает их содержание; все метрики детерминированы и бесплатны после единственного `list()` (D1).
- Производительность: `list()` — O(N) reparse на вызов; для local-first масштабов приемлемо, потолок зафиксирован в D1 (один вызов на отчёт).

## Execution Handoff

Исполнение по задачам Task 1–5 (воркеры: implementer на Task 1–4, документация — микробатч). Валидация каждого шага: `npm run check`; финал — `npm run check` + `npm run e2e`. Ревью спеки — worker-reviewer до APPROVED.
