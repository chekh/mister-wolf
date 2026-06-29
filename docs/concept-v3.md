# Mr. Wolf — Project Semantic Memory

> **Mr. Wolf — это локальный слой семантической памяти проекта для AI coding agents.**
>
> Не ещё один агент. Подложка памяти под агентов.

---

## 1. Что такое Mr. Wolf сейчас

Mr. Wolf превращает документацию, решения, планы, заметки, сессии агентов, уроки и артефакты проекта в управляемые, searchable, читаемые агентами объекты памяти.

Он не оркеструет агентов и не заменяет OpenCode, Claude Code, Codex или Cursor. Он даёт им долговременную память о проекте: что было решено, почему, что не сработало, какие файлы связаны с какими решениями, какие вопросы остались открытыми.

Ключевая формула:

```text
project = code + docs + decisions + plans + sessions + lessons + artifacts

всё не-кодовое знание проекта = memory

agents read/write/update this memory through a governed protocol
```

---

## 2. Почему pivot: от оркестратора к памяти

Изначально Mr. Wolf задумывался как универсальный адаптивный агент-фасад: оркестратор, workflow engine, registry агентов, model router, политики, gates. Этот путь привёл к нескольким проблемам:

- **Оркестраторов уже много**, их число растёт, и конкурировать с ними как с универсальной средой выполнения — неразумно.
- **Память нужна всем агентам** независимо от того, кто их запускает.
- **Память полезна даже без автономного агента**: через CLI, MCP, экспорт в `AGENTS.md`, интеграцию с IDE и CI.
- **Старый scope размывал фокус**: orchestrator + memory + graph + agents + policies + UI + integrations одновременно.

Поэтому фокус сдвинут:

```text
Старый фокус:
  Mr. Wolf = универсальный координатор агентов

Новый фокус:
  Mr. Wolf = долговременная семантическая память проекта для агентов
```

Это сильнее и реалистичнее. Рынок движется в ту же сторону: от "агент всё делает сам" к "локальный долговременный слой памяти, доступный любым агентам".

---

## 3. Принципы

1. **Project-first, not agent-first.** Память принадлежит проекту, не конкретному агенту или диалогу.
2. **Файлы памяти — операционный source of truth.** Markdown-объекты с YAML frontmatter каноничны. SQLite и другие индексы — производные кеши, которые можно пересоздать в любой момент.
3. **Тонкие адаптеры, толстый домен.** CLI и MCP не содержат бизнес-логики. Они вызывают одни и те же use-cases.
4. **Inbound vs outbound адаптеры.** CLI и MCP — inbound. Файловая система и SQLite — outbound.
5. **Governed write protocol.** Хранится не всё подряд, а только то, что меняет понимание проекта, объясняет решение, предотвращает повтор ошибки или связывает документы и код.
6. **Инвалидация, а не удаление.** Устаревшие знания помечаются `superseded` или `invalidated`, но не стираются молча.
7. **Прогрессивная индексация.** Начинаем с путей файлов, тегов и FTS5. Эмбеддинги и графовый retrieval — позже.

---

## 4. Модель объекта памяти

### 4.1. Базовый объект

Объект памяти — это Markdown-файл с YAML frontmatter.

```yaml
---
id: mem_2026_06_29_router_reconnect
type: lesson
title: Router reconnect failure mode
status: active
review_state: accepted
confidence: high
importance: 0.82
created_at: 2026-06-29T14:00:00Z
updated_at: 2026-06-29T14:00:00Z
created_by: user:chekh
schema_version: 1
source:
  kind: session
  path: .wolf/memory/objects/sessions/2026-06-29-router-work.md
related:
  files:
    - src/router/reconnect.ts
  docs:
    - docs/architecture/router.md
  decisions:
    - mem_2026_06_28_router_retry_policy
tags:
  - router
  - reconnect
  - failure
superseded_by: null
---
# Router reconnect failure mode

During the reconnect investigation, we found that...
```

### 4.2. Типы объектов (MVP-A)

- `document` — существующие документы/спеки/заметки проекта, зарегистрированные как объекты памяти.
- `decision` — ADR-подобные записи: что решено, почему, ограничения.
- `lesson` — извлечённые уроки, особенно из неудач или сюрпризов.
- `observation` — факты о проекте, кодовой базе или окружении.
- `session-summary` — краткое содержание агентской сессии и её результаты.
- `open-question` — нерешённые вопросы с контекстом.

### 4.3. Жизненный цикл

```text
status: active → superseded
review_state: accepted | proposed | rejected
```

- `status` — жизненный цикл знания: `active` или `superseded`.
- `review_state` — уровень доверия: `accepted` (человек), `proposed` (агент), `rejected` (исключено).

По умолчанию поиск возвращает только `active` объекты. Статус `invalidated` отложен до фазы Governance.

### 4.4. Событие памяти

Каждая мутация памяти порождает append-only событие в `.wolf/memory/events.jsonl`:

```json
{
  "id": "evt_2026_06_29_abc123",
  "type": "memory.added",
  "timestamp": "2026-06-29T14:00:00Z",
  "actor": "user:chekh",
  "payload": {
    "memory_id": "mem_2026_06_29_router_reconnect"
  }
}
```

---

## 5. Хранилище

### 5.1. Расположение

```text
.wolf/
  config.yaml

  memory/
    events.jsonl

    objects/
      decisions/
      lessons/
      observations/
      sessions/
      documents/
      questions/

    briefs/
      project-brief.md
      agent-brief.md
      active-warnings.md

  cache/
    index.sqlite
```

### 5.2. Source of truth

- `.wolf/memory/**/*.md` — объекты памяти.
- `.wolf/memory/events.jsonl` — неизменяемый журнал мутаций.
- `docs/`, `specs/`, `adr/`, `plans/`, `notes/` в корне проекта — управляемые пользователем документы, регистрируемые по ссылке, а не копируемые.

### 5.3. Производный кеш

- `.wolf/cache/index.sqlite` — FTS5-индекс, теги, связи, сигналы ранжирования. Может быть удалён и перестроен.

---

## 6. Архитектура

### 6.1. Направление зависимостей

```text
              bootstrap
                 |
        --------------------
        |                  |
  inbound adapters   outbound adapters
  cli / mcp          fs / sqlite
        |                  |
        v                  v
              app/use-cases
                   |
        --------------------
        |                  |
     domain             ports
```

Правило зависимостей:

```text
domain imports nothing.
app imports domain and ports.
adapters import ports (and app DTOs where needed).
bootstrap wires adapters into use-cases.
CLI and MCP import only use-cases or the container.
```

### 6.2. Структура src/

```text
src/
  domain/              # сущности, инварианты, value objects, write protocol
  app/
    use-cases/         # один файл — один use-case
    services/          # memory-service, relevance-service, stale-memory-service
  ports/               # outbound-контракты
  adapters/
    fs/                # markdown store, jsonl event log, scanner
    sqlite/            # FTS5 search index
    cli/               # thin CLI commands
    mcp/               # MCP server и tools
  bootstrap/           # create-container.ts, cli.ts, mcp.ts
  config/              # загрузчик .wolf/config.yaml
```

---

## 7. MVP-A: команды

CLI в MVP-A:

```bash
wolf memory init
wolf memory add --type lesson
wolf memory list [--type lesson] [--status active]
wolf memory search "router reconnect"
wolf memory get <id>
wolf memory link <id> src/router/index.ts
wolf memory brief
wolf memory brief --for-agent <name>
wolf memory brief --write .wolf/memory/briefs/project-brief.md
wolf memory scan
wolf memory supersede <old-id> <new-id>
wolf memory rebuild-index
```

MVP-A use-cases:

- `init-project-memory.ts`
- `add-memory-object.ts`
- `search-memory.ts`
- `get-memory-object.ts`
- `link-memory-object.ts`
- `build-agent-brief.ts`
- `supersede-memory-object.ts`
- `scan-project.ts`
- `validate-memory.ts`

---

## 8. Write Protocol

Объект принимается, если он удовлетворяет хотя бы одному критерию:

- меняет понимание проекта;
- объясняет решение или ограничение;
- предотвращает повторение ошибки;
- связывает документы, код или решения;
- содержит полезный контекст для будущего агента.

Протокол кодирует правила как предупреждения, а не жёсткие блокировки. Жёсткая блокировка применяется только к malformed обязательным полям (`id`, `type`, `title`, `created_at`).

---

## 9. Дорожная карта

| Фаза | Название                  | Суть                                                                                             |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | Reframe                   | Новый README, архивация старых concept/spec, публикация `docs/concept-v3.md`                     |
| 2    | Core Memory               | Доменная модель, Markdown-хранилище, JSONL-лог, команды `init`, `add`, `list`, `get`, `validate` |
| 3    | Index & Search            | `rebuild-index`, SQLite FTS5, `search`, теги, связи, ранжирование                                |
| 4    | Project Scan              | `scan` регистрирует внешние документы по ссылке, находит orphan docs                             |
| 5    | Agent Brief (MVP-B)       | `brief`, `brief --write`, экспорт `AGENTS.md`, `active-warnings.md`                              |
| 6    | Case Learning (MVP-C)     | `session-summary`, lessons, decisions, observations, `supersede`                                 |
| 7    | Memory Governance (MVP-D) | `check-before-edit`, stale-memory detection, `invalidated`, decay confidence/importance          |
| 8    | Code Linking (MVP-E)      | memory object → file, memory object → symbol, code-intelligence backends                         |
| 9    | Integrations              | MCP server проверен для OpenCode, Claude Code, Codex, Cursor                                     |

---

## 10. Non-goals

В текущей фазе явно вне scope:

- автономный оркестратор или multi-agent crew runtime;
- обязательная векторная БД или графовая БД;
- Web UI;
- полноценный планировщик;
- автоматическое изменение кода самим Mr. Wolf;
- remote A2A-агенты;
- enterprise RBAC.

---

## 11. Граница доверия

Память — это trust boundary. Записи, попадающие в контекст агента, влияют на его будущие решения, поэтому происхождение и уровень доверия должны быть явными.

Каждый объект хранит provenance:

- `created_by` — `user:<name>` или `agent:<name>`;
- `source.kind` — `session`, `file`, `manual`, `scan`;
- `source.path` или `source.session_id` — указатель на источник;
- `review_state` — `accepted`, `proposed`, `rejected`;
- `confidence` и `importance` — явные сигналы доверия и релевантности;
- `related` — ссылки на файлы, документы и решения.

Объекты, созданные агентом, по умолчанию имеют `review_state: proposed`. Объекты, созданные человеком, — `accepted`. В агентский brief по умолчанию включаются только `accepted` объекты; вызывающий может явно запросить `proposed`.

---

## 12. Что осталось от старого Mr. Wolf

### Архивируется

- Workflow engine, runners, graph orchestration.
- Agent registry, model router, providers.
- Streaming model response code.
- Gate lifecycle, approval workflows.

### Переиспользуется

- Policy engine → Memory Governance Engine.
- SQLite index experience → memory search index.
- Commander.js CLI → memory commands.
- File-based persistence → Markdown object store.
- Zod config loading → `.wolf/config.yaml` loader.
- TypeScript strict mode, Vitest, build scripts → без изменений.

---

## 13. Статус

MVP-A (Core Memory + Search) реализуется. Фокус: сделать память проекта доступной через CLI и подготовить поверхность для MCP.
