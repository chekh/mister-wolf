# Архитектура Mr. Wolf

> Документ для **разработчика Wolf**: как устроена система, где какой слой живёт в коде и какие механизмы скрепляют слои. Продуктовый концепт — [docs/concept/concept.md](../concept/concept.md) (главный источник; ссылки на его параграфы — как `§3.2`). Справочник команд — [docs/reference/cli.md](../reference/cli.md).

---

## 1. Обзор

Формула концепта (§2):

> **Память — носитель. Процессы — суть. Агенты — форма. Инструменты — руки.**

Ключевая идея — **«всё есть память»**: решения, уроки, правила, документы проекта, процессы и инструменты суть объекты единой памяти проекта. Слои — не стопка, а **петля**: агенты исполняют процессы; процессы читают и пишут память; инструменты приводят всё в действие; результаты работы возвращаются в память как новые знания и инструменты.

```
┌──────────┐   исполняют   ┌──────────┐   читают/пишут   ┌──────────┐
│  АГЕНТЫ  │ ────────────► │ ПРОЦЕССЫ │ ───────────────► │  ПАМЯТЬ  │
│ (рамки + │               │          │                  │ (канон)  │
│ playbook)│               └──────────┘                  └──────────┘
└──────────┘                    ▲                              ▲
     ▲                          │                              │
     │ доставка                 │ приводят                     │ результаты:
     │ (scaffold,               │ в действие                   │ новые знания
     │ инжекция)                │                              │ и инструменты
     │                          │                              │
     └──────────────┐  ┌────────┴──────┐  ┌────────────────────┘
                    │  │               │  │
                    └─►│  ИНСТРУМЕНТЫ  │──┘
                       │   (CLI+MCP)   │
                       └───────────────┘
```

Из петли следуют два продуктовых обещания (§5 концепта): **живая память** — знание пишется, обрабатывается по триггерам, обновляется (цикл жизни §3.1); **растущие инструменты** — удачное рассуждение-скрипт кристаллизуется в постоянный инструмент (Code-as-Reasoning, см. [docs/guide/tool-economy.md](tool-economy.md)).

## 2. Слои и их место в коде

| Слой            | Ответственность                                                                                                                      | Код / каталогы                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Память**      | Единая точка правды: объекты (24 активных core-типа + 1 deprecated `document`), supersede-цепочки версий, relations, атрибуция actor | `src/domain/` (сущности, `taxonomy.ts`, `governance.ts`), `src/adapters/fs/markdown-memory-store.ts` (Markdown-канон), `src/adapters/sqlite/` (FTS-индекс), `.wolf/memory/` |
| **Процессы**    | Протоколы работы: bootstrap, cold-start (`call`→`brief`), complain-канал, checkpoint/wrap-up, effectiveness, цикл самообучения       | `src/app/use-cases/`, `src/adapters/cli/commands/`, протоколы в `docs/guide/`                                                                                               |
| **Агенты**      | Тонкие рамки (персона) + playbook'и (методика — объект памяти); Стюард и его лица                                                    | `.opencode/agents/` (рамки), `src/app/use-cases/scaffold-agent.ts` (генерация рамок), `.opencode/plugins/wolf-router.ts` (доставка playbook в system-промпт)                |
| **Инструменты** | CLI и MCP — «руки», приводящие память и процессы в действие                                                                          | `src/adapters/cli/`, `src/adapters/mcp/`, входные точки `src/bootstrap/` (`cli.js`, `mcp.ts`)                                                                               |

Use-case'ы (сценарии) в `src/app/use-cases/` по факту: `activate-draft`, `add-memory-object`, `bootstrap-project`, `build-solve-pack`, `create-article`, `create-blocker`, `create-decision`, `create-info-request`, `create-memory-repair-request`, `create-rule`, `create-session-checkpoint`, `create-synthesis`, `create-work-thread`, `diff-thread`, `effectiveness`, `generate-agent-brief`, `generate-insights`, `generate-recap`, `get-call-injections`, `get-latest-memory-object`, `get-memory-object`, `get-thread-brief`, `init-project-memory`, `learn-decay`, `list-memory-objects`, `pattern-detection`, `propose-draft`, `rebuild-memory-index`, `record-relation`, `resolve-blocker`, `scaffold-agent`, `scan-project`, `search-memory`, `should-summarize`, `summarize-session`, `supersede-memory-object`, `tally-council-votes`, `template-evolve`, `thinking`, `tool-librarian`, `tool-stats`, `transition-memory-object`, `validate-draft`.

Протоколы слоя процессов, оформленные как гайды: [steward-bootstrap.md](steward-bootstrap.md) (bootstrap), [user-guide.md](user-guide.md) (cold-start `call`→`brief`, checkpoint/wrap-up), [complaint-protocol.md](complaint-protocol.md) (complain-канал), [effectiveness.md](effectiveness.md) (метрики), [steward-learn.md](steward-learn.md) (обучение).

## 3. Ключевые механизмы

### 3.1. Канон и экспозиция (§3.3)

Истина всегда в памяти: playbook и tool-объект — канонические объекты. Платформенные носители — скиллы, команды, MCP-тулы — **генерируемые отпечатки**: регенерируются scaffold'ом после каждой версии канона. Реверс-импорт внешних артефактов возможен только с пометкой «непроверенный».

- Код: `src/app/use-cases/scaffold-agent.ts` (команда `wolf scaffold`), генерируемый `.wolf/SKILL.md`.
- Доставка playbook в system-промпт — плагин-инъекция `.opencode/plugins/wolf-router.ts`: маркер `agent-id` в теле рамки → `wolf search --type playbook` → максимальная `version` → инжект; fallback — `wolf search` из самой рамки.

### 3.2. Конвейер активации (§3.2)

Единый для всего, что меняет поведение или знания:

```
draft → Sandbox Replay → активация → пост-аудит владельца → доставка
```

Создание — без пре-аппрува; доставка пользователю — только после зелёного прогона. **Создание ≠ активация**: draft (`status: proposed`) невидим для доставки, `wolf call` матчит только `status: active`.

- Код: `src/app/use-cases/propose-draft.ts` → `validate-draft.ts` (детерминированный holdout-реплей лога, не LLM-as-a-judge) → `activate-draft.ts`.
- **STOP-гейт** (Ф23): автономная активация проходит давление pressure-сценария — `npm run pressure-test` (= `wolf learn gate`); гейт в `src/domain/gates/stop-gate.ts`.
- Протокол: [steward-learn.md](steward-learn.md).

### 3.3. Цикл жизни знаний (§3.1)

Память не «write-once»: **накопление → обработка по триггерам → обновлённое знание**. Обработка затрагивает часть памяти (по триггерам, не всё сразу): обобщение однотипного, актуализация устаревшего (supersede), забывание неиспользуемого — decay по **пробегу** (сессии, не календарь).

- Код: `pattern-detection.ts` (триггеры-паттерны), `supersede-memory-object.ts` (актуализация), `learn-decay.ts` (TTL по пробегу → очередь `review_required`; срабатывание = delivery-событие, реактивация автоматическая).

### 3.4. Атрибуция и статусы (§3.4)

Каждый объект памяти имеет автора (`created_by`), статус жизненного цикла и, для изменяемых объектов, цепочку версий (supersede). Приоритет разрешения автора — `src/domain/actor.ts`: флаг CLI `--created-by` > env `WOLF_ACTOR` > fallback (`user:cli`). Авторство мутаций агентов обязательно: Стюард вносит записи от имени лица (`steward:archivist`, `steward:mentor`).

### 3.5. Read-only зоны и автономия по пробегу (§6.5)

Барьер автономной адаптации — зоны, неизменяемые для контура обучения (`src/domain/policies/read-only-zones.ts`; мутация → `UserFacingError`):

- логи: `events.jsonl`, `relations.jsonl`, `session-metrics.jsonl`, `patterns.jsonl` (исключение — append сигналов наблюдения);
- код гейтов/валидаторов: `src/domain/gates/`, `src/domain/policies/`;
- скелет платформы: `.opencode/`, `AGENTS.md`.

Автономия растёт по пробегу, уровни **B → B+ → C** (спека §14): B — пре-аппрув человека; B+ — пост-аудит (текущий стартовый режим v1: Стюард вносит записи от своего имени, владелец ревизует дайджестом задним числом); C — автономные переходы. Возврат уровня — при ≥30% отмен. Матрица «кто что меняет» — часть governance (спека §13–14).

### 3.6. Сигнальный лог (Ф20)

`.wolf/metrics/session-metrics.jsonl` — append-only лог измеренного опыта (derived-артефакт: rebuildable, в git не коммитится). События: `run` (`wolf run`), `complaint` (`wolf complain`), `delivery` (`wolf scaffold` / `wolf tool expose` / `wolf call`), `tool_error` (класс — детерминированный классификатор `src/domain/error-class.ts`). Формат OTEL GenAI-совместимый, `gen_ai.modelID` обязательно. Writer'ы — сами команды (`wolf metrics emit` не существует). Паттерн-детекция (Ф21): кластер `tool:class` / `complaint:<about>` / `delivery:<name>` при **N≥3** (`learning.pattern_threshold`, дефолт 3) фиксируется в `.wolf/metrics/patterns.jsonl` событийно — в момент перевала порога. Подробно: [signal-log.md](signal-log.md).

## 4. Контур самообучения (Ф20–26)

Полный цикл (замкнут, roadmap v3 Phase D3):

```
сигналы (Ф20) → паттерны N≥3 (Ф21) → draft (propose)
  → Sandbox Replay Holdout (validate) → активация (activate) → доставка (wolf call)
```

| Фаза               | Механизм                                                                 | Команда                                       | Use-case                                                     |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------ |
| Ф20 сигнальный лог | writer'ы CLI пишут `session-metrics.jsonl`                               | — (побочный эффект команд)                    | —                                                            |
| Ф21 паттерны       | кластеризация по порогу N≥3                                              | `wolf learn digest` / `status`                | `pattern-detection.ts`                                       |
| Ф22 кандидаты      | propose → holdout → activate (гейт «создание ≠ активация»)               | `wolf learn propose/validate/activate`        | `propose-draft.ts`, `validate-draft.ts`, `activate-draft.ts` |
| Ф23 STOP-гейт      | pressure-сценарии + read-only зоны — барьер автономной адаптации         | `npm run pressure-test` (= `wolf learn gate`) | `src/domain/gates/stop-gate.ts`                              |
| Ф24 GEPA           | эволюция шаблонов брифов: dry-run сравнение по детерминированной метрике | `wolf learn evolve <id>`                      | `template-evolve.ts`                                         |
| Ф25 AFlow          | эвристики глубины ревью: рекомендация flat / review-council              | `wolf learn route`                            | — (детерминированная таблица)                                |
| Ф26 decay          | TTL по пробегу → очередь `review_required`; реактивация доставкой        | `wolf learn decay`                            | `learn-decay.ts`                                             |

LLM в контуре — только опциональные адаптеры за интерфейсами `DraftGenerator` / `TemplateReflector`; запись и валидация никогда не требуют LLM (local-first). Канон контура — спека [docs/superpowers/specs/2026-08-26-self-learning-design.md](../superpowers/specs/2026-08-26-self-learning-design.md), продуктовый протокол — [steward-learn.md](steward-learn.md).

## 5. Стюард — фоновый агент контура

**Место (§4.1):** Стюард никогда не выходит на первый план — не ведёт сессий, не отвечает владельцу напрямую, не primary-агент. Вызывается вложенно; виден владельцу только как артефакты, прошедшие конвейер активации (§3.2).

**Каналы вызова (§4.2):**

| Инициатор                   | Триггер                                                     |
| --------------------------- | ----------------------------------------------------------- |
| Координатор (Mr. Wolf, L0)  | жалоба `complain` → Наставник; порог паттернов → Архивариус |
| Воркер-агент в своей сессии | полученная жалоба → вложенный вызов Стюарда                 |
| Автоматика                  | чекпоинт пробега, объёмный порог, decay-обход, health-check |

**Инвариант:** вызов Стюарда — всегда **исполнение правила, записанного в памяти**, а не свободная инициатива LLM; каждый вызов имеет триггер-основание в логе.

**Лица — открытый реестр (§4.3).** Лицо = playbook (объект работы + триггер + конвейер) + экспозиция скиллом; новое лицо — новый playbook, не новый агент.

| Лицо             | Объект работы                        | Триггер                       | Статус                               |
| ---------------- | ------------------------------------ | ----------------------------- | ------------------------------------ |
| **Наставник**    | методики агентов (playbook'и)        | жалоба                        | работает (PoC #3)                    |
| **Библиотекарь** | инструменты (tool-объекты, SKILL.md) | порог реестра / повтор задачи | спроектировано (tools-as-skills 6/6) |
| **Архивариус**   | знания памяти                        | объём / пробег                | спроектировано (Ф21–22, Ф26)         |

Рамка Стюарда для opencode — [.opencode/agents/steward.md](../../.opencode/agents/steward.md): протокол мутации playbook (search → add новой версии → supersede старой) и границы («не аналитик», «мутирует только по жалобе»).

## 6. Архитектура кода: ports & adapters

Гексагональная архитектура: домен ничего не импортирует наружу; use-case'ы зависят от интерфейсов портов; адаптеры реализуют порты и подключаются в `src/bootstrap/container.ts`.

| Каталог                | Ответственность                                            | Примеры файлов                                                                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`          | Доменные сущности, таксономия, governance, политики, гейты | `actor.ts`, `taxonomy.ts`, `memory-types.ts`, `governance.ts`, `gates/stop-gate.ts`, `policies/read-only-zones.ts`, `error-class.ts`, `solve/`                                                                                               |
| `src/app/use-cases/`   | Сценарии приложения (по одному на команду/механизм)        | `add-memory-object.ts`, `search-memory.ts`, `generate-agent-brief.ts`, `propose-draft.ts`                                                                                                                                                    |
| `src/ports/`           | Интерфейсы портов                                          | `memory-store.port.ts`, `search-index.port.ts`, `relation-log.port.ts`, `event-log.port.ts`, `file-system.port.ts`, `clock.port.ts`, `id-generator.port.ts`, `project-scanner.port.ts`, `memory-lock.port.ts`, `project-initializer.port.ts` |
| `src/adapters/fs/`     | Файловая память и логи (Markdown-канон)                    | `markdown-memory-store.ts`, `jsonl-relation-log.ts`, `jsonl-event-log.ts`, `session-metrics-log.ts`, `fs-project-initializer.ts`                                                                                                             |
| `src/adapters/sqlite/` | FTS-поисковый индекс                                       | `sqlite-search-index.ts`, `sqlite-schema.ts`, `busy-retry.ts`                                                                                                                                                                                |
| `src/adapters/cli/`    | CLI-команды (commander)                                    | `cli-entry.ts`, `commands/memory-*.ts` (~40 команд)                                                                                                                                                                                          |
| `src/adapters/mcp/`    | MCP-сервер поверх тех же use-case'ов                       | `mcp-server.ts`, `mcp-tools.ts`, `mcp-schemas.ts`                                                                                                                                                                                            |
| `src/bootstrap/`       | Композиция: DI-контейнер и входные точки                   | `container.ts`, `cli.ts` (запуск: `node dist/bootstrap/cli.js`), `mcp.ts`                                                                                                                                                                    |

**Поток команды:** CLI (`commander`, `src/adapters/cli/`) → use-case (`src/app/use-cases/`) → порты (`src/ports/`) → адаптеры (`fs` / `sqlite`). MCP-тулы (`mr-wolf_*`) идут через тот же слой use-case'ов — CLI и MCP не дублируют логику.

**Хранилище на диске:**

| Путь                                  | Что лежит                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `.wolf/memory/`                       | Объекты памяти: Markdown + YAML frontmatter; `threads/<tid>/` и `shared/` |
| `.wolf/memory/relations.jsonl`        | Связи между объектами                                                     |
| `.wolf/memory/events.jsonl`           | Событийный лог памяти                                                     |
| `.wolf/metrics/session-metrics.jsonl` | Сигнальный лог контура (Ф20; derived, не в git)                           |
| `.wolf/metrics/patterns.jsonl`        | Зафиксированные паттерны (Ф21; derived)                                   |
| SQLite-индекс                         | FTS-поиск поверх Markdown-канона (derived; `wolf rebuild-index`)          |
| `.wolf/config.yaml`                   | Конфиг: таксономия (в т.ч. классы ошибок), `learning.*` (пороги, TTL)     |

## 7. Принципы (§6 концепта)

1. **Files remain canonical** — файлы первичны, память — индекс и интерпретация (§3.1, §6.1 этого документа: Markdown-канон + derived-индексы).
2. **Память ≠ свалка** — запись без обработки есть техдолг знания; обработка — часть продукта (цикл жизни, §3.3).
3. **Верифицируемое рассуждение** — исполняемая проверка предпочтительнее текстового рассуждения (Code-as-Reasoning, [tool-economy.md](tool-economy.md)).
4. **Атрибуция** — actor и статус у каждого знания; авторство мутаций обязательно (§3.4).
5. **Автономия по пробегу** — read-only зоны, матрица «кто что меняет», уровни B→B+→C, возврат при ≥30% отмен (§3.5).
6. **Мультиплатформенность** — Wolf не знает внутренностей платформ; платформенные адаптеры — отдельные «нити» (opencode: `.opencode/`), зависимость однонаправленная: адаптер → Wolf, никогда наоборот.

## 8. Что не делает Wolf (§10)

- Редактирование кода как проектная функция.
- IDE-интеграция.
- Веб-интерфейс.
- Распределённая работа.
- Оркестрация общего назначения — только протоколы, доказанные практикой.
