# Интеграция MCP

## Что такое MCP

Model Context Protocol — стандарт подключения внешних инструментов к AI-агентам. Mr. Wolf поставляет MCP-сервер: вся память и процессы проекта доступны агенту любой MCP-совместимой платформы. Сервер запускается по stdio командой `wolf mcp`.

## Подключение

`wolf init` сам детектирует платформу и пишет MCP-конфиг. Платформы v1: opencode, Claude Code; явно — `wolf init --platform opencode,claude`. После init перезапустите платформу — сервер подключается при старте.

Каноническая команда запуска — глобальный бинарник, **никогда npx**:

```json
{ "command": "wolf", "args": ["mcp"] }
```

### opencode

Пишется в `opencode.json`, ключ `mcp.wolf`:

```json
{ "mcp": { "wolf": { "type": "local", "command": ["wolf", "mcp"], "enabled": true } } }
```

### Claude Code

Пишется в `.mcp.json`, ключ `mcpServers.wolf`:

```json
{ "mcpServers": { "wolf": { "command": "wolf", "args": ["mcp"] } } }
```

Оговорка: try-out-режим (`npx mister-wolf init`) никогда не пишет MCP-конфиги — установите пакет глобально и запустите `wolf init`, чтобы подключить платформу.

MCP-клиент автоматически добавляет префикс `<имя-сервера>_`, поэтому агент видит инструменты как `mr-wolf_search`, `mr-wolf_get` и т.д.

## Все инструменты

22 инструмента (21 + `ping`):

| Инструмент                    | Описание                                                                                                                                                                                               | Параметры                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mr-wolf_search`              | Поиск объектов памяти по запросу с фильтрами                                                                                                                                                           | query — обяз.; опц.: type, status, confidence (low\|medium\|high), memoryClass, truthRole, lifetime, tags (string[]), minImportance/maxImportance (number), createdAfter/createdBefore (string), file_path, limit, includeSuperseded (boolean) |
| `mr-wolf_get`                 | Получить объект по id                                                                                                                                                                                  | id — обяз.                                                                                                                                                                                                                                     |
| `mr-wolf_list`                | Список объектов с фильтрами                                                                                                                                                                            | опц.: type, status, stale (boolean), memoryClass, truthRole, lifetime                                                                                                                                                                          |
| `mr-wolf_add`                 | Добавить объект памяти                                                                                                                                                                                 | type, title, createdBy — обяз.; опц.: body, tags (string[]), confidence, importance (number)                                                                                                                                                   |
| `mr-wolf_transition`          | Сменить статус жизненного цикла                                                                                                                                                                        | id, status — обяз.; actor фиксируется как `agent:mcp`                                                                                                                                                                                          |
| `mr-wolf_create_thread`       | Создать рабочий тред                                                                                                                                                                                   | title, goal, createdBy — обяз.; опц.: currentState, nextSteps (string[])                                                                                                                                                                       |
| `mr-wolf_create_info_request` | Создать запрос информации                                                                                                                                                                              | title, thread, question, detourReason, expectedAnswer (string[]), createdBy — обяз.; опц.: neededFor (string[]), preliminaryAnswer                                                                                                             |
| `mr-wolf_create_article`      | Создать статью                                                                                                                                                                                         | title, thread, summary, body, createdBy — обяз.; опц.: answers, supports, evidence (string[])                                                                                                                                                  |
| `mr-wolf_create_decision`     | Создать решение                                                                                                                                                                                        | title, body, createdBy — обяз.; опц.: thread, basedOn (string[])                                                                                                                                                                               |
| `mr-wolf_create_blocker`      | Создать блокер                                                                                                                                                                                         | title, impact, createdBy — обяз.; опц.: workaround, thread                                                                                                                                                                                     |
| `mr-wolf_resolve_blocker`     | Закрыть блокер                                                                                                                                                                                         | id — обяз.; опц.: resolvedBy                                                                                                                                                                                                                   |
| `mr-wolf_scan`                | Скан проекта и регистрация документов                                                                                                                                                                  | —                                                                                                                                                                                                                                              |
| `mr-wolf_brief`               | Бриф агента по последнему scan и памяти                                                                                                                                                                | — (переиспользует кэшированный снапшот проекта)                                                                                                                                                                                                |
| `mr-wolf_insights`            | Эвристический анализ памяти (Level 1, без LLM)                                                                                                                                                         | опц.: topic, type (patterns\|technical_debt\|decisions\|lessons\|activity)                                                                                                                                                                     |
| `mr-wolf_recap`               | Сводка активной памяти: правила, треды, блокеры, вопросы, info requests, недавние решения                                                                                                              | —                                                                                                                                                                                                                                              |
| `mr-wolf_create_rule`         | Создать правило (только по запросу пользователя)                                                                                                                                                       | title, body, scope (project\|global), createdBy — обяз.; опц.: appliesTo (string[]), trigger                                                                                                                                                   |
| `mr-wolf_start_thinking`      | Начать структурированную последовательность мышления (goal → мысли → вывод)                                                                                                                            | goal, createdBy — обяз.; опц.: thread                                                                                                                                                                                                          |
| `mr-wolf_add_thought`         | Добавить мысль в последовательность                                                                                                                                                                    | sequenceId, type (hypothesis\|reasoning\|evidence\|concern), text — обяз.                                                                                                                                                                      |
| `mr-wolf_conclude_thinking`   | Завершить последовательность решением с встроенным trace и based_on-связями                                                                                                                            | sequenceId, title, body, createdBy — обяз.                                                                                                                                                                                                     |
| `mr-wolf_abandon_thinking`    | Отбросить последовательность без создания решения                                                                                                                                                      | sequenceId — обяз.                                                                                                                                                                                                                             |
| `mr-wolf_analytics`           | Аналитика эффективности: ledger'ы, недельная активность, агенты, steward view, консилиумы, выбросы, readiness, жизненный цикл памяти, координация, кампании — тот же JSON, что `wolf analytics --json` | опц.: view, class, type, origin, agent, top (number), weeks (number), silent (boolean)                                                                                                                                                         |
| `mr-wolf_ping`                | Health check MCP-сервера                                                                                                                                                                               | — (возвращает `pong`)                                                                                                                                                                                                                          |

## Бриф и кэш скана

`mr-wolf_brief` не пересканирует проект на каждый вызов — он переиспользует кэшированный снапшот проекта. Кэш инвалидируется автоматически при **структурных** изменениях: добавление, удаление или переименование файлов, смена зависимостей в `package.json`, переключение ветки. Контентные правки существующих файлов перескана не требуют: бриф зависит от множества путей, а не от содержимого файлов.

Если нужен гарантированно свежий снапшот — `mr-wolf_scan` (или CLI `wolf scan`) всегда делает полный перескан с регистрацией документов: это его работа, не работа брифа.

Кроме того, бриф читает память через mtime-кэш разбора, поэтому повторные брифы дёшевы: неизменённые объекты памяти отдаются без перечитывания и перепарсивания файлов.

## Доставка: дедупликация сессии и бюджет контекста

Инъекции `wolf call` дедуплицируются в рамках сессии: запись доставляется в сессию **один раз**, повторно — только при изменении текста (контрольная сумма блока). Ключ сессии берётся из `WOLF_SESSION` — плагин wolf-router ставит один ключ на процесс платформы, поэтому все спавны `wolf call` внутри сессии делят его; свежая сессия всегда получает полную доставку. Когда дедупликация отфильтровывает всё, вызов объясняет себя вместо пустого списка: `[wolf] N инъекций уже доставлены в этой сессии (дедупликация; изменившиеся записи доставляются повторно)`. Реестр доставок — derived-кэш в `.wolf/cache/sessions/`, файлы старше 7 дней удаляются. Вызовы без ключа сессии не дедуплицируются — каждый новый контекст получает свою конституцию.

`wolf call` также считает, сколько байт инъекций накопила сессия (аппроксимация токенов: bytes/4), и при превышении настроенной доли бюджета контекста (дефолт 20% от 200 000 токенов) печатает одну строку в stderr:

```text
[wolf] инъекции сессии ~27% бюджета контекста (216000 bytes / 200000 tokens) — лимит предупреждения 20%
```

Предупреждение не блокирует доставку и не меняет код возврата. Настраивается (или отключается) в `.wolf/config.yaml` — см. [Конфигурация](/ru/guide/configuration):

```yaml
delivery:
  context_budget_tokens: 200000 # бюджет контекста сессии, токены
  context_warning_pct: 20 # порог предупреждения, %; 0 — выключить
```

Общая картина доставки — топ доставляемых записей, miss-rate по агентам, средний размер инъекции — видна в `wolf recap` (строка доставки) и `wolf analytics --view delivery` ([CLI-аналитика](/ru/guide/cli/analytics)).

## Типичная сессия агента

1. **`mr-wolf_ping`** — проверка, что сервер жив.
2. **`mr-wolf_scan` / `mr-wolf_brief`** — бриф по состоянию проекта (brief переиспользует кэшированный снапшот — см. [Бриф и кэш скана](#бриф-и-кэш-скана)).
3. **`mr-wolf_search`** — поиск по памяти перед решением: решения, уроки, правила по теме.
4. **`mr-wolf_add` / `mr-wolf_create_decision` / `mr-wolf_create_blocker` / `mr-wolf_transition`** — фиксация нового: решения, блокеры, смены статусов.
5. **`mr-wolf_recap`** — итоговая сводка в конце сессии.

Каждый шаг имеет CLI-эквивалент (`wolf scan`, `wolf brief`, `wolf search`, `wolf add`, `wolf recap`) — память одна и та же, канал любой.

Атрибуция: объекты, созданные через MCP, несут `createdBy`, который вы передали (actor-строки вида `agent:mcp`); `mr-wolf_transition` фиксирует actor как `agent:mcp`.
