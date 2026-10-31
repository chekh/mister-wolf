Моя оценка: **проект уже прошёл стадию “идея/прототип” и стал рабочей alpha-системой проектной памяти**, но сейчас у него главный риск не технический, а продуктово-архитектурный: он может расползтись в “ещё один agent framework”, если не зафиксировать главный UX-цикл.

## 1. Текущее состояние

Сейчас репозиторий позиционируется уже правильно: **“Local-first Project Semantic Memory layer for AI coding agents”** и отдельно подчёркивает, что это **не агент, а memory substrate для агентов**. Это сильный pivot от старой идеи универсального оркестратора. ([GitHub][1])

По README реализованы Phases 0–5: core memory, work threads, info requests, articles, decisions, blockers, incremental indexing, document registration, relations, session checkpoints, search/retrieval improvements. Следующим этапом обозначена Governance. ([GitHub][1])

В CLI уже зарегистрирован широкий набор команд: `init`, `add`, `list`, `get`, `search`, `rebuild-index`, `supersede`, `transition`, `scan`, `brief`, `thread`, `decision`, `blocker`, `info-request`, `article`, `session`, `mcp`, `rule`. То есть это уже не минимальный MVP, а довольно широкий memory CLI. ([GitHub][2])

Технологически проект выглядит как TypeScript CLI с `commander`, `better-sqlite3`, `fast-glob`, `js-yaml`, `zod`, `vitest`, MCP package dependency и стандартным `npm run check`, который включает format check, lint, tests и build. ([GitHub][3])

## 2. Что получилось хорошо

### 2.1. Правильная продуктовая ниша

Самая сильная часть проекта — формулировка: **project-owned memory**, а не “ещё один агент”. Это важно. Рынок уже переполнен агентами, но почти все они плохо решают проблему переноса проектного контекста между сессиями.

У Mr. Wolf хорошая ниша:

```text
Git-native / local-first project memory for AI coding agents
```

То есть память принадлежит проекту, а не конкретному чату, модели, IDE или SaaS.

### 2.2. Хорошая доменная модель

Сущности `work-thread`, `info-request`, `article`, `decision`, `blocker`, `document`, `session-checkpoint`, `rule` хорошо описывают реальные проблемы AI-assisted development. В user guide уже объяснено, что `work-thread` — это долгоживущая линия работы, `info-request` — отложенный побочный вопрос, `article` — переиспользуемый ответ, `decision` — фиксированный выбор, `blocker` — препятствие, а `thread brief` — собранный контекст для старта новой сессии. ([GitHub][4])

Это не абстрактный CRUD. Это действительно близко к тому, как разработчик работает с агентами: задача идёт долго, возникают побочные исследования, часть решений надо сохранить, новую сессию надо быстро погрузить.

### 2.3. Хорошее отношение к источнику правды

В MEMORY.md зафиксировано, что SQLite не является источником правды, а canonical source — markdown-файлы в `.wolf/memory`; также есть правило не копировать документы целиком, а регистрировать их по ссылке и сохранять выжимку. Это правильный инженерный выбор. ([GitHub][5])

Это отличает проект от “чёрного ящика памяти”. Память можно читать, ревьюить, коммитить, архивировать, сравнивать через Git.

### 2.4. Есть self-dogfooding

`AGENTS.md` уже является generated/curated agent brief по самому проекту: там есть project snapshot, active memory, open questions, blockers, recommended first steps. Это хороший знак: проект уже пытается пользоваться своей собственной идеей. ([GitHub][6])

### 2.5. Документация начала отделять новое от старого

В docs index видно, что старые orchestrator-era материалы вынесены в archive, а canonical concept теперь — Project Memory Harness. Это важно, потому что старый Mr. Wolf как workflow/orchestrator engine может постоянно тянуть проект назад. ([GitHub][7])

## 3. Главные проблемы

### 3.1. README всё ещё не продаёт главный workflow

Quick Start сейчас показывает:

```bash
npm install
npm run build
node dist/bootstrap/cli.js init
node dist/bootstrap/cli.js add --type lesson --title "First lesson" --body "What we learned"
node dist/bootstrap/cli.js search "lesson"
```

Это демонстрирует техническую возможность добавить и найти память, но не показывает главный use case: “начал новую сессию → получил контекст → вынес побочный вопрос → получил article → вернулся к thread brief”. ([GitHub][1])

Для внешнего пользователя сейчас проект может выглядеть как “CLI для заметок с поиском”, хотя идея намного сильнее.

### 3.2. Команд слишком много, главный вход не очевиден

В README перечислены core memory, threads, info-requests, articles, decisions, blockers, scan, brief, session checkpoints, diff, search filters, rules. ([GitHub][1])

Это уже функционально богато, но UX начинает перегружаться. Пользователь должен понимать:

```text
Когда add?
Когда article?
Когда decision?
Когда rule?
Когда info-request?
Когда blocker?
Когда checkpoint?
Когда brief?
Когда scan?
```

Если не добавить “магические” высокоуровневые входы вроде `wolf recall`, `wolf solve`, `wolf call`, проект останется инструментом для автора, но будет тяжёлым для других.

### 3.3. Есть расхождение между документацией разных уровней

README говорит, что Phase 5 завершена и следующая Phase 6 — Governance. Roadmap тоже помечает Phases 0–5 как completed и Phase 6 как Governance. ([GitHub][1])

Но `AGENTS.md` говорит, что completed phases — 0–4, а next phase — Phase 5 Search and Retrieval Improvements. ([GitHub][6])

`MEMORY.md` местами тоже отстаёт: например, там говорится, что `memory scan` ещё не регистрирует documents автоматически и что это запланировано, тогда как README и roadmap говорят, что Phase 3 document registration уже реализована. ([GitHub][5])

Это критично именно для проекта памяти: если собственная память/документация расходится, агент будет наследовать противоречия.

### 3.4. Governance как следующий этап может быть преждевременным

Phase 6 обозначена как Governance: `memory_class`, `truth_role`, `lifetime`, validation rules, lifecycle transitions. ([GitHub][8])

Это логично, но я бы не шёл туда прямо сейчас. До Governance нужно стабилизировать daily UX:

```text
Как агент начинает работу?
Как он получает компактный контекст?
Как он понимает, что устарело?
Как он чинит повторяющуюся ошибку поведения?
Как он возвращает исправление в активную сессию?
```

Иначе Governance станет ещё одним слоем метаданных поверх не до конца закреплённого workflow.

### 3.5. MCP есть в коде, но не стал продуктовым интерфейсом

В CLI уже импортируется и регистрируется `memoryMcpCommand`, а в зависимостях есть `@modelcontextprotocol/server`. ([GitHub][2])

Но в README MCP не выглядит как главный способ подключения к OpenCode/Claude/Cursor-подобным агентам. Сейчас он скорее “команда среди команд”. Для такого проекта MCP должен быть не просто интеграцией, а одним из двух главных интерфейсов:

```text
CLI = human/admin/debug
MCP = agent consumption
```

## 4. Оценка зрелости

Я бы оценил так:

```text
Идея и позиционирование:        8.5/10
Доменная модель:                8/10
Архитектурное направление:      7.5/10
Рабочая CLI-база:               7/10
Документация:                   6.5/10
UX для ежедневного применения:  5.5/10
Готовность к self-dogfood:      7/10
Готовность к внешним пользователям: 4.5/10
```

Итог: **это уже хороший alpha для себя и для dogfooding, но ещё не продукт для чужого разработчика**.

## 5. Что я бы сделал дальше

### Приоритет 1 — не Governance, а UX Stabilization

Следующий этап я бы назвал не Phase 6 Governance, а:

```text
Phase 6: Agent UX Stabilization
```

Цель — не добавить ещё метаданные, а сделать три ежедневных сценария железными.

### Приоритет 2 — добавить три главные magic-команды

Я бы ввёл:

```bash
wolf recall
wolf solve "<problem>"
wolf call [--for <topic>]
```

Смысл:

```text
wolf recall = дай общий agent-ready context
wolf solve  = подготовь Solve Pack для отдельной чистой сессии
wolf call   = дай короткую corrective injection в активную сессию
```

Это не ломает существующие `wolf {command}`. Все CRUD-команды остаются. Но поверх них появляется UX-слой, который скрывает сложность.

### Приоритет 3 — сделать `wolf call` центральной фичей

Это может стать главной отличительной особенностью проекта.

Пример:

```bash
wolf call --for get
```

Возвращает:

```text
Do not use deprecated top-level `get`.
Use entity-specific commands:
- wolf thread get <id>
- wolf info-request get <id>
- wolf article get <id>

Older guidance mentioning top-level `get` is superseded.
```

Это решает реальную боль: агент в активной сессии тупит, но ему не надо отдавать весь проектный контекст. Ему нужна маленькая инъекция.

### Приоритет 4 — `wolf solve` как solve-pack generator, а не solver engine

Идеальная граница:

```text
Mr. Wolf не думает вместо агента.
Mr. Wolf достаёт правильную память для агента.
```

То есть `wolf solve "агент использует запрещённый get"` должен не запускать модель и не чинить всё сам, а собрать Solve Pack:

```text
Problem
Relevant rules
Relevant decisions
Relevant articles
Possibly stale objects
Expected analysis
Required output artifacts
```

А уже агент в чистой сессии формулирует repair article/rule/call-injection и сохраняет это в память.

### Приоритет 5 — выровнять документацию и память

Перед добавлением новых функций нужно сделать cleanup:

```text
README.md
AGENTS.md
MEMORY.md
docs/user-guide.md
docs/superpowers/plans/roadmap.md
```

Сейчас они частично говорят разные вещи о фазах и возможностях. Для обычного проекта это неприятно, для memory project — это системная ошибка.

Минимальный fix:

```text
1. AGENTS.md перегенерировать под актуальный main.
2. MEMORY.md обновить: scan уже регистрирует documents, если это правда.
3. README quick start заменить на главный workflow.
4. Roadmap изменить: Phase 6 = UX Stabilization, Governance перенести после.
```

## 6. Риски

### Риск 1 — снова стать orchestration framework

В src tree GitHub показывает старые каталоги вроде `agent`, `workflow`, `model`, `policy`, `tool`, `kernel`, `state`. ([GitHub][9])

Даже если они архивные/оставшиеся, они концептуально опасны: агент, workflow, model router, policy engine — это всё старый Mr. Wolf. Новая линия должна быть memory-first. Я бы либо явно архивировал старые модули, либо изолировал их так, чтобы они не диктовали roadmap.

### Риск 2 — слишком много типов памяти

Типы полезны, но после определённого порога пользователь перестаёт понимать, куда что писать. Это можно решить capture presets:

```bash
wolf capture debug
wolf capture decision
wolf capture research
wolf capture lesson
wolf capture handoff
```

Внутри они могут создавать `article`, `decision`, `session-checkpoint`, но пользователь думает сценариями, а не схемами.

### Риск 3 — поиск без объяснения

`wolf search` с фильтрами и ranking — хорошо. Но для агента важнее не просто результаты, а почему они попали в контекст:

```text
included because active rule
included because accepted decision
included because answers current info-request
warning: historical / superseded
```

То есть нужен `search --explain` и `recall --explain`.

## 7. Рекомендуемый ближайший PR

Я бы сделал PR не на Governance, а на:

```text
feat: add agent UX layer with recall/call/solve-pack
```

Scope:

```text
1. wolf recall
   - agent-ready context pack
   - markdown + json output

2. wolf call
   - active compact injections
   - --for <topic>
   - --compact

3. call-injection artifact
   - short operational instruction
   - links to rules/decisions/articles

4. wolf solve "<problem>"
   - retrieves relevant memory
   - renders Solve Pack
   - --save creates info-request kind=memory-repair

5. Documentation alignment
   - README quick start
   - MEMORY.md
   - AGENTS.md
   - user guide
```

Out of scope:

```text
LLM inside CLI
automatic memory mutation
agent orchestration
model routing
dashboard
full governance
cross-project intelligence
```

## 8. Мой итоговый вердикт

Проект перспективный. Не потому что там уже много команд, а потому что он нащупал правильную проблему: **AI-агентам нужна не просто память, а управляемая проектная память с историей, связями, актуальностью и компактными handoff-инъекциями**.

Сейчас Mr. Wolf выглядит как:

```text
рабочий local-first memory CLI с хорошей архитектурной идеей
```

Но должен стать:

```text
UX-слоем, который позволяет агентам не терять проектную память между сессиями
и исправлять повторяющиеся ошибки поведения через memory repair
```

Главный следующий шаг: **не расширять сущности, а сделать магический пользовательский цикл**:

```text
агент ошибается →
wolf solve в чистой сессии →
память уточняется →
wolf call в рабочей сессии →
агент продолжает без повторного тупняка
```

Это может стать центральной фишкой проекта.

[1]: https://github.com/chekh/mister-wolf/tree/main "GitHub - chekh/mister-wolf · GitHub"
[2]: https://github.com/chekh/mister-wolf/blob/main/src/adapters/cli/cli-entry.ts "mister-wolf/src/adapters/cli/cli-entry.ts at main · chekh/mister-wolf · GitHub"
[3]: https://raw.githubusercontent.com/chekh/mister-wolf/main/package.json "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/chekh/mister-wolf/main/docs/user-guide.md "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/chekh/mister-wolf/main/MEMORY.md "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/chekh/mister-wolf/main/AGENTS.md "raw.githubusercontent.com"
[7]: https://github.com/chekh/mister-wolf/tree/main/docs "mister-wolf/docs at main · chekh/mister-wolf · GitHub"
[8]: https://raw.githubusercontent.com/chekh/mister-wolf/main/docs/superpowers/plans/roadmap.md "raw.githubusercontent.com"
[9]: https://github.com/chekh/mister-wolf/tree/main/src "mister-wolf/src at main · chekh/mister-wolf · GitHub"
