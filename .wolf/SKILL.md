# Mr. Wolf Skill — ритуалы работы с памятью для агентов

Mr. Wolf — local-first project memory harness («I solve problems»). Не оркестратор:
слой памяти для агентов. CLI: `node dist/bootstrap/cli.js` (алиас `wolf`);
MCP-тулы: `mr-wolf_*`.

## 1. Session Startup Ritual (обязателен в каждой свежей сессии)

1. **`wolf recap`** — быстрый вход в сессию: активные `rule`, активные
   `work-thread`, открытые `blocker` / `open-question` / `info-request`,
   последние `decision`. Возвращённое — активное руководство.
2. **`wolf search "<тема>"`** — точечный вспом перед погружением в задачу.
3. Опционально **`wolf brief`** — полный обзор проекта (скан + активная память).
4. Перед использованием сомнительного тула — **`wolf call --for <имя тула>`**:
   вернёт активные call-injection-предупреждения и рекомендации.

MCP-эквиваленты: `recap`, `search`, `brief`, `call`.

## 2. Trigger → Memory Type

Фиксируй значимое через Wolf сразу, не откладывай. Карта «ситуация → тип»:

| Trigger                                   | Type              | Как создать                                  |
| ----------------------------------------- | ----------------- | -------------------------------------------- |
| Принял выбор с обоснованием               | `decision`        | `wolf decision add`                          |
| Открылся неочевидный инсайт / урок        | `lesson`          | `wolf add --type lesson`                     |
| Наблюдение о проекте/коде                 | `observation`     | `wolf add --type observation`                |
| Контекст, который стоит сохранить         | `context`         | `wolf add --type context`                    |
| Работа остановлена препятствием           | `blocker`         | `wolf blocker add`                           |
| Отложенный вопрос, ответ переиспользуем   | `info-request`    | `wolf info-request create`                   |
| Готов переиспользуемый ответ              | `article`         | `wolf article add`                           |
| Начата многошаговая работа                | `work-thread`     | `wolf thread create`                         |
| Конец сессии / веха                       | `session-summary` | `wolf session wrap-up`                       |
| Починил баг / расследовал проблему        | `lesson`          | `wolf add --type lesson --tags debug,bugfix` |
| Пользователь явно просит «всегда делай X» | `rule`            | только пользователь, см. §3                  |

Устаревшее помечай: `wolf supersede <old-id> <new-id>` — не оставляй мусор в памяти.

## 3. Правила создания `rule`

- `rule` создаётся **ТОЛЬКО по явному запросу пользователя**. Агент не имеет
  права создавать правила сам ни через CLI (`wolf rule add`), ни через MCP
  (`create_rule`).
- Агент считает нужным правило → предложи через `decision` или `open-question`,
  пользователь решит.
- Правило создано → оно автоматически попадает в `wolf recap` и `wolf brief`
  (auto-load активных правил).

## 4. Info Request → Article Flow

Внешнее знание не выдумывай — заведи запрос и закрой его статьёй:

1. **Застрял на внешнем вопросе** (нужна докa/факт вне кодовой базы):
   `wolf info-request create` — обязательны `question`, `detour_reason`
   (почему нельзя ответить сейчас), `expected_answer`; укажи `needed_for`.
2. **Ответ получен и переиспользуем**: оформи `wolf article add` в том же
   треде — `summary`, `body`, поля `answers` / `supports` / `evidence`.
3. Закрой запрос: `wolf transition <id> answered`.
4. Свежая статья по теме — кандидат в `wolf call --for` injections: если ответ
   должен всплывать автоматически, добавь `call-injection` c `trigger_keywords`.
