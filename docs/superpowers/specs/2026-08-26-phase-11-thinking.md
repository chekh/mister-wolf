# Phase 11 — wolf think: структурированные последовательности рассуждений — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать `wolf think start|add|conclude|abandon` и MCP-тулы `start_thinking`/`add_thought`/`conclude_thinking`/`abandon_thinking` — явные последовательности рассуждений (goal → мысли 4 типов → conclusion), где conclude создаёт `decision` с `based_on`-связями на все мысли последовательности и встроенным trace-разделом в body.

**Architecture:** Гексагон сохраняется. Новый use-case-модуль `thinking.ts` (четыре функции над scratch-файлом `.wolf/thinking/<seq-id>.jsonl` + вызов существующего `createDecision`). Новых доменных типов, миграций и зависимостей нет. Store/таксономия/событийная схема не затрагиваются: мысли живут вне памяти объектов как working-notes и встраиваются в decision при завершении.

**Tech Stack:** TypeScript (ESM), zod 4 (уже в deps через MCP-схемы), commander 12, vitest. **Новых зависимостей нет.**

---

## 0. Сверка с реальным доменом (проверено перед написанием)

Все утверждения сверены с кодом dev @ 45e6e51 (2026-08-26).

| #   | Факт                                                                                                                                                                                                                                                                                                                       | Источник                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| V1  | Roadmap-scope фазы: `think start --goal --thread`, `think add --sequence --type hypothesis\|reasoning\|evidence\|concern`, `think conclude --sequence --title --body`; conclude создаёт decision с based_on на все мысли; хранение — working-notes или embedded; out of scope: ветвящиеся деревья, автоматическое мышление | docs/superpowers/plans/roadmap-v2.md:301-321                                                                                                        |
| V2  | `CreateDecisionInput { title, body, thread?, basedOn?: string[], createdBy }`; объект создаётся со статусом `active`, governance-дефолтами, `DecisionSchema.parse`, save + event `memory.added` + index                                                                                                                    | src/app/use-cases/create-decision.ts:13-19,40-75                                                                                                    |
| V3  | `basedOn` идёт НЕ во frontmatter, а в relation log: на каждый id — пара `based_on` (decision→basis) и обратная `basis_for`; существование целевого id НЕ валидируется (свободные строки)                                                                                                                                   | src/app/use-cases/create-decision.ts:80-82; src/app/use-cases/record-relation.ts:11,25-56                                                           |
| V4  | Relation log — append-only jsonl (`.wolf/memory/relations.jsonl`) с zod-валидацией строк; `list()` фильтрует по subject/object/predicate                                                                                                                                                                                   | src/adapters/fs/jsonl-relation-log.ts:7-42; src/adapters/fs/project-paths.ts:29-31                                                                  |
| V5  | 23 core-типа, единственный источник `CORE_TAXONOMY_DECLS`; новый тип = запись в массиве + per-type schema + lifecycle; у decision lifecycle `['active','superseded','rejected','obsolete']`                                                                                                                                | src/domain/memory-types.ts:66-225,68-76                                                                                                             |
| V6  | Store читает ТОЛЬКО `threads/`, `shared/`, `objects/` (legacy) под `.wolf/memory/`; файлы вне корней невидимы для `get/list/scanProblems/quarantine`                                                                                                                                                                       | src/adapters/fs/markdown-memory-store.ts:52-55,90-133                                                                                               |
| V7  | Прецеденты не-memory путей: `.wolf/cache/` (derived SQLite-индекс), `.wolf/memory/events.jsonl`, `.wolf/memory/briefs/` — jsonl/derived-артефакты живут вне md-стора                                                                                                                                                       | src/adapters/fs/project-paths.ts:13-27                                                                                                              |
| V8  | Контейнер даёт `store/log/index/relations/clock/idGen/lock/declarations`; `createCliContainer(process.cwd())` — штатный вход CLI и MCP                                                                                                                                                                                     | src/bootstrap/container.ts:25-40                                                                                                                    |
| V9  | CLI-паттерн: группа команд с subcommand — `wolf council tally                                                                                                                                                                                                                                                              | synthesize`(memory-council.ts); типизированная команда с опциями —`wolf decision add --title --body --thread --based-on --created-by` (comma-split) | src/adapters/cli/commands/memory-council.ts:6-51; src/adapters/cli/commands/memory-decision.ts:10-31 |
| V10 | Регистрация CLI = import + `program.addCommand(...)` в `createCli()` (28 команд, прецедент точки вставки рядом с council/insights)                                                                                                                                                                                         | src/adapters/cli/cli-entry.ts:42-76                                                                                                                 |
| V11 | MCP-паттерн: один `registerTool(name, {description, inputSchema}, handler)` на операцию; zod-схемы в mcp-schemas.ts; ответ — text-content                                                                                                                                                                                  | src/adapters/mcp/mcp-tools.ts:36-41,215-232; src/adapters/mcp/mcp-schemas.ts:3-7                                                                    |
| V12 | `create_decision` MCP-тул уже принимает `basedOn?: string[]` — conclude может идти через него напрямую                                                                                                                                                                                                                     | src/adapters/mcp/mcp-tools.ts:222-231                                                                                                               |
| V13 | Id-генератор: `generateMemoryId(now, slug)` → `mem_<дата>_<slug40>_<hash6>` (детерминируемый, читаемый); `generateEventId` → `evt_...`                                                                                                                                                                                     | src/adapters/fs/hash-id-generator.ts:43-52                                                                                                          |
| V14 | Ошибки — голый `throw new Error` с текстом; lock (`FsMemoryLock`) оборачивает мутирующие use-cases — `createDecision` уже берёт его сам                                                                                                                                                                                    | src/app/use-cases/create-decision.ts:91; src/bootstrap/container.ts:37                                                                              |
| V15 | `createDecision` вызывает `summarizeSession` (auto wrap-up, Phase 12) с catch-and-log — conclude получит этот побочный эффект бесплатно                                                                                                                                                                                    | src/app/use-cases/create-decision.ts:85-87                                                                                                          |
| V16 | `npm run check` = format:check + lint + test:run + build; prettier форматирует `docs/**/*.md` — спека формат-критична                                                                                                                                                                                                      | package.json:15-20                                                                                                                                  |
| V17 | Кода `think`/`thinking`/working-notes в src/ нет — поле чистое; council-механизм (question/opinion/synthesis) существует отдельно                                                                                                                                                                                          | grep по src/; src/domain/memory-types.ts:180-200                                                                                                    |

### Отклонения от roadmap (осознанные)

| #      | Roadmap говорит                                                   | Спека решит                                                                                                          | Почему                                                                                                           |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D-dev1 | `think add --sequence <id> --type <t>` — без параметра содержания | Добавлен обязательный `--text <s>` (CLI) / `text` (MCP): мысль без содержания не имеет смысла, а хранить её неоткуда | Roadmap не определяет носитель содержания; это пробел, а не запрет                                               |
| D-dev2 | Lifecycle описан как start→add→conclude                           | Добавлен `think abandon --sequence <id>` — явный выход из последовательности без decision                            | Требование lifecycle-полноты (бриф): без abandon заброшенные scratch-файлы не имеют пути удаления средствами CLI |
| D-dev3 | «Хранится как working-notes или embedded» — выбор не сделан       | Гибрид (D1): scratch-jsonl во время размышления + встраивание trace в body decision при conclude                     | Оба roadmap-варианта по отдельности нефункциональны — см. D1                                                     |

---

## 1. Решения: закрытие открытых вопросов

### D1 — хранение последовательности: scratch-jsonl + встраивание в decision (главное решение)

Рассмотрены три варианта:

**(a) Новый core-тип `thinking-sequence` (+ типы мыслей) в таксономии.** Отвергнут. Мысли — transient working state: попав в store, они навсегда загрязняют `list/search/brief/recap` (V6: каждый list — полный обход). Дорога в коде: запись в `CORE_TAXONOMY_DECLS` (V5) тянет per-type schema, lifecycle-решения, generic-add, e2e-таблицу типов. Прецедент против: фаза 10 отвергла новый core-тип ради одной метрики («taxonomy churn», спека phase-10, D-dev1). Наконец, roadmap предлагает только «working-notes или embedded» (V1) — новый тип в scope не входит.

**(b) Чистый scratch-файл с удалением после conclude, без встраивания.** Отвергнут в чистом виде: после удаления `.wolf/thinking/<id>.jsonl` содержание мыслей теряется безвозвратно, а `based_on`-связи (V3) указывают на идентификаторы, которые больше ничего не покрывает — провенанс без данных.

**(c) Чистое встраивание в decision без промежуточного состояния.** Невозможен функционально: мысли накапливаются между отдельными CLI/MCP-вызовами (start … add … add … conclude) — промежуточное состояние обязательно существует, вопрос лишь в его форме.

**Принят гибрид (b+c):** во время размышления мысли копятся в scratch-файле `.wolf/thinking/<seq-id>.jsonl` (working-notes, V7-прецедент jsonl для не-md состояния); `conclude` строит decision, чей body содержит user-body + встроенный «Thinking trace» (embedded), создаёт `based_on` на каждый tid (V2-V3) и удаляет scratch. Обоснование по принципам проекта:

- **Markdown source of truth:** единственный durable-артефакт — decision md; scratch после conclude не оставляет второго неполного источника.
- **Derived/ephemeral артефакты — вне памяти:** `.wolf/thinking/` — sibling `.wolf/cache/` (V7); store его не видит (V6) — нулевое загрязнение поиска/брифов.
- **Минимальность:** ни одного изменения в таксономии, схемах объектов, store, event-схеме; весь новый код — один use-case-модуль + адаптеры.
- **based_on работает механически:** `recordRelation` не валидирует цель (V3), связь — провенанс в append-only журнале (V4); данные мысли при этом выживают внутри body decision, так что dangling-цель не теряет информацию.

Совет (`wolf council`) не собирался: бриф требует совет только при реальном равноправии вариантов; здесь асимметрия доказуется кодом (невозможность (c), потеря данных в (b), churn в (a)).

### D2 — формат scratch-файла

Путь: `.wolf/thinking/<sequence-id>.jsonl`. По одной JSON-строке на запись, append-only:

```jsonl
{"kind":"sequence","id":"mem_20260826_<slug>_<h>","goal":"...","thread":null,"created_at":"<ISO>"}
{"kind":"thought","tid":"mem_20260826_<slug>_<h>","n":1,"type":"hypothesis","text":"...","created_at":"<ISO>"}
{"kind":"thought","tid":"mem_20260826_<slug>_<h>","n":2,"type":"evidence","text":"...","created_at":"<ISO>"}
```

Первая строка — всегда `kind:"sequence"` (мета), последующие — `kind:"thought"`. При чтении: отсутствие файла, битый JSON, неверный `kind`, несовпадение `meta.id` с именем файла, неизвестный `type` — `throw new Error` (стиль V14). `n` — сквозной номер мысли (1-based), присваивается при add как `последний n + 1`.

Доменные типы (внутри use-case-модуля, не в domain/schemas — scratch не является memory object):

```typescript
export type ThoughtType = 'hypothesis' | 'reasoning' | 'evidence' | 'concern';

export interface SequenceMeta {
  kind: 'sequence';
  id: string;
  goal: string;
  thread: string | null;
  created_at: string;
}

export interface Thought {
  kind: 'thought';
  tid: string;
  n: number;
  type: ThoughtType;
  text: string;
  created_at: string;
}
```

### D3 — идентификаторы

Sequence id и thought tid генерируются штатно: `idGen.generateMemoryId(now, goal)` для последовательности, `idGen.generateMemoryId(now, \`${type}: ${text}\`)`для мысли (читаемые slugs, V13). Именно tids идут в`basedOn` при conclude — связи в relation log получают осмысленные человекочитаемыми slug-ами идентификаторы (V3).

### D4 — conclude: составление decision

1. Прочитать scratch (D2); мыслей ≥ 1, иначе `Error('Sequence has no thoughts: <id>')`.
2. Собрать body: `<user body>` + `\n\n## Thinking trace (<seq-id>)\n\n` + по строке `\n<n>. [<type>] <text>` в порядке накопления.
3. Вызвать `createDecision({ store, log, clock, idGen, index?, relations?, lock? }, { title, body, thread: meta.thread ?? undefined, basedOn: [tids in order], createdBy })` (V2). Побочные эффекты приходят бесплатно: event `memory.added`, индексация, связи `updates` (если thread) и `based_on`/`basis_for`, auto session-summary (V15).
4. После успешного возврата — удалить scratch (`fs.unlink`, ENOENT игнорировать). Если createDecision упал — scratch сохраняется (можно повторить conclude).

### D5 — abandon

`abandonThinking`: удалить `.wolf/thinking/<id>.jsonl`. Файла нет → `Error('Thinking sequence not found: <id>')`. Никаких событий, объектов и связей не создаётся — abandoned-размышление ephemeral by design (рабочие заметки, которые не довели до вывода, память проекта не засоряют).

### D6 — CLI поверхность

Группа `wolf think` по образцу `wolf council` (V9):

```
wolf think start    --goal <s> [--thread <id>] [--created-by <actor>]   # печатает sequence id
wolf think add      --sequence <id> --type hypothesis|reasoning|evidence|concern --text <s>   # печатает tid
wolf think conclude --sequence <id> --title <s> --body <s> [--created-by <actor>]        # печатает decision id
wolf think abandon  --sequence <id>
```

`--created-by` дефолт `'user:cli'` (конвенция memory-decision.ts:17). `--type` валидируется choices commander'а + повторной проверкой в use-case. Регистрация: import + `addCommand` в cli-entry.ts рядом с council (V10). Файл: `src/adapters/cli/commands/memory-think.ts`.

### D7 — MCP поверхность

Четыре плоских тула по конвенции «один registerTool на операцию» (V11):

| Тул                 | Схема (mcp-schemas.ts)                                                   | Ответ (text-content)                |
| ------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| `start_thinking`    | `{ goal: string, thread?: string, createdBy: string }`                   | `Started thinking sequence: <id>`   |
| `add_thought`       | `{ sequenceId: string, type: enum(4), text: string }`                    | `Added thought: <tid>`              |
| `conclude_thinking` | `{ sequenceId: string, title: string, body: string, createdBy: string }` | `Created decision: <id>`            |
| `abandon_thinking`  | `{ sequenceId: string }`                                                 | `Abandoned thinking sequence: <id>` |

`conclude_thinking` переиспользует тот же `concludeThinking` use-case, что и CLI (не голый `create_decision`, V12 — чтобы trace/basedOn/удаление scratch не дублировались в вызывающих кодах).

### D8 — конкурентность

Scratch-операции берут **без** `MemoryLock`: одна последовательность = один файл, append однострочный, сценарий single-agent (автоматическое мышление — out of scope, V1). `createDecision` внутри себя уже работает под lock (V14). `// ponytail:` комментарий в коде: потолок — один писатель на sequence; при многописательности добавить lock на файл.

### D9 — события

Новых event-типов нет, EventSchema не расширяется. Единственное событие полного цикла — штатное `memory.added` от createDecision (V2). start/add/abandon не логируются (D5).

### D10 — размещение кода

Весь use-case — один модуль `src/app/use-cases/thinking.ts` (прецедент монолита-агрегатора generate-insights, спека phase-10 D11): типы D2, четыре экспортированные функции, константа `THOUGHT_TYPES`, внутренние хелперы чтения/записи scratch. Путь scratch — `thinkingDir(baseDir)` одним хелпером в project-paths.ts (рядом с cacheDir, V7). Отдельный порт для scratch не вводится — прямой fs в adapter-слое use-case недоступен, поэтому fs-операции инкапсулируются в самом модуле (он и есть adapter-код над данными проекта; тесты гоняют его на tmp-каталоге).

Сигнатуры:

```typescript
export const THOUGHT_TYPES = ['hypothesis', 'reasoning', 'evidence', 'concern'] as const;

export async function startThinking(
  deps: { baseDir: string; clock: Clock; idGen: IdGenerator },
  input: { goal: string; thread?: string }
): Promise<SequenceMeta>;

export async function addThought(
  deps: { baseDir: string; clock: Clock; idGen: IdGenerator },
  input: { sequenceId: string; type: ThoughtType; text: string }
): Promise<Thought>;

export async function concludeThinking(
  deps: {
    baseDir: string;
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
    lock?: MemoryLock;
  },
  input: { sequenceId: string; title: string; body: string; createdBy: string }
): Promise<CreateDecisionResult>;

export async function abandonThinking(deps: { baseDir: string }, input: { sequenceId: string }): Promise<void>;
```

---

## 2. Структура файлов

```
src/app/use-cases/thinking.ts                    # новый: ThoughtType, SequenceMeta, Thought, THOUGHT_TYPES, 4 функции
src/adapters/fs/project-paths.ts                 # +thinkingDir(baseDir)
src/adapters/cli/commands/memory-think.ts        # новый: memoryThinkCommand(): Command('think') c 4 subcommand
src/adapters/cli/cli-entry.ts                    # +import memoryThinkCommand, +program.addCommand(...)
src/adapters/mcp/mcp-schemas.ts                  # +ThinkingStartInputSchema, ThinkingAddInputSchema, ThinkingConcludeInputSchema, ThinkingAbandonInputSchema
src/adapters/mcp/mcp-tools.ts                    # +registerTool('start_thinking'|'add_thought'|'conclude_thinking'|'abandon_thinking')
tests/unit/use-cases/thinking.test.ts            # новый: lifecycle, ошибки, формат trace, basedOn, удаление scratch
tests/unit/adapters/mcp-server.test.ts           # +тесты четырёх тулов
tests/e2e/thinking.e2e.ts                        # новый: золотой сценарий полного цикла + abandon
README.md                                        # +wolf think в список команд
```

## 3. Предусловия

- [ ] Ветка `dev` актуальна (45e6e51), рабочее дерево чистое.
- [ ] `npm run check` зелёный до начала (базлайн фиксируется в execution-отчёте).
- [ ] Think-код в репо отсутствует (V17).

## 4. Tasks

### Task 1: use-case `thinking.ts` (TDD)

- [ ] `tests/unit/use-cases/thinking.test.ts` на tmp-каталоге (`fs.mkdtemp`), fake `clock` (фиксированное время) + `HashIdGenerator`.
- [ ] start: создаёт `.wolf/thinking/<id>.jsonl`, первая строка `kind:"sequence"` с goal/thread/created_at; возвращает meta.
- [ ] add: аппендит thought с `n` по возрастанию; возвращает tid; невалидный type → Error с перечнем `THOUGHT_TYPES`; несуществующая последовательность → Error с путём.
- [ ] conclude: body = user body + `## Thinking trace (<seq-id>)` + все мысли в порядке n; `createDecision` получил `basedOn` = tids по порядку и `thread` из мета (fake store запоминает вызов); после успеха scratch удалён; при ошибке createDecision scratch остаётся.
- [ ] conclude с 0 мыслей → Error; повторный conclude (файла нет) → Error.
- [ ] abandon: файл удалён; отсутствующий файл → Error.
- [ ] Битый scratch (не-JSON строка, чужой id в мета) → Error при чтении.
- [ ] Имплементация `src/app/use-cases/thinking.ts` (D1-D5, D8-D10) + `thinkingDir` в project-paths.ts.

### Task 2: CLI `wolf think`

- [ ] `src/adapters/cli/commands/memory-think.ts` (D6) по образцу memory-council.ts/memory-decision.ts (V9).
- [ ] Регистрация в cli-entry.ts (V10).
- [ ] Юнит/e2e-проверка: полный цикл через CLI на tmp-проекте; `--help` показывает все 4 subcommand.

### Task 3: MCP-тулы

- [ ] 4 схемы в mcp-schemas.ts (D7), `type: z.enum(['hypothesis','reasoning','evidence','concern'])`.
- [ ] 4 registerTool в mcp-tools.ts (D7), ответы согласно таблице.
- [ ] `tests/unit/adapters/mcp-server.test.ts`: старт→add→conclude через тула создаёт decision (fake/real container на tmp), невалидный type → ошибка схемы.

### Task 4: E2E золотые сценарии

- [ ] `tests/e2e/thinking.e2e.ts` (helpers `runCli`/`tmpProject`, tests/e2e/helpers.ts):
  - полный цикл: init → think start → add ×4 (по одному каждого типа) → think conclude → exit 0; stdout содержит decision id; на диске: decision md содержит `Thinking trace` и 4 пронумерованные мысли; `relations.jsonl` содержит 4 пары `based_on`/`basis_for`; `.wolf/thinking/` пуст;
  - abandon: init → start → add → abandon → exit 0; `.wolf/thinking/` пуст; decision в памяти отсутствует.
- [ ] `npm run e2e` зелёный.

### Task 5: документация + финальная верификация

- [ ] README: команда `wolf think` и MCP-тулы в списках; абзац о модели хранения (scratch → embed, D1) и отклонениях D-dev1–D-dev3.
- [ ] `npm run check` зелёный (prettier затрагивает и эту спеку — формат-чистота обязательна, V16).

## Definition of Done (фаза)

- [ ] Полный цикл start→add×N→conclude создаёт active-decision, чей body содержит trace всех мыслей, а relation log — `based_on` на каждую мысль (roadmap success criteria «decision with linked thoughts»).
- [ ] Все 4 типа мыслей принимаются и попадают в trace; невалидный тип отклоняется.
- [ ] abandon удаляет последовательность без следов в памяти.
- [ ] Ветвящиеся деревья и автоматическое мышление отсутствуют (out of scope, V1).
- [ ] `npm run check` и `npm run e2e` зелёные.

## E2E-секция (правило mem_20260823_e2e_5459cc)

Полное E2E выполняется после реализации плана: оба золотых сценария из Task 4 прогоняются через `npm run e2e` (build + vitest, каркас tests/e2e/). Результат фиксируется в execution-отчёте фазы.

## Self-review (что сознательно опущено)

- `wolf think show/list` — просмотр накопленных мыслей: агент и так видит собственные мысли, а scratch — plain jsonl (`cat` решает); команда появится при первом реальном запросе.
- События start/add/abandon в event log — шум для ephemeral-состояния (D9); если понадобится аудит — отдельная фаза с расширением EventSchema.
- Ретеншн-политика для заброшенных scratch-файлов (старше N дней) — YAGNI; abandon покрывает штатный путь, вручную удалённый файл безвреден (никто его не читает).
- Локи на scratch (D8) — однописатель на sequence; многописательность не входит в scope.
- Восстановление последовательности после краша между createDecision и unlink — worst case: decision создан, scratch остался; повторный conclude создаст дубль decision. Приемлемо для local-first (ручная очистка), фиксируется как известный потолок.
- Встраивание мыслей как отдельных memory-объектов ради «настоящих» узлов графа — отвергнуто в D1a; если когда-нибудь понадобятся searchable-мысли, это будет миграция поверх того же jsonl-формата.

## Execution Handoff

Исполнение по задачам Task 1–5 (воркеры: implementer на Task 1–4, документация — микробатч). Валидация каждого шага: `npm run check`; финал — `npm run check` + `npm run e2e`. Ревью спеки — worker-reviewer до APPROVED.
