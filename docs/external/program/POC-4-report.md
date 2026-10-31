# PoC #4: модель из памяти на лету + детерминированная доставка playbook плагином

**Дата:** 2026-08-29 · **Исполнитель:** Mr.Wolf · **Статус:** завершён

## Гипотезы и вердикты

| # | Гипотеза | Вердикт | Доказательство |
|---|---|---|---|
| H3 (возврат) | Модель берётся из памяти Wolf и меняется посреди сессии без рестарта | ✅ | Одна сессия `ses_fb301ed10ffetaXfRqjEuhJ91E`: msg@10:08 modelID=**glm-5.3-flash**→"ping" (routing v1), msg@10:11 modelID=**glm-5.2**→"pong" (routing v2 после `wolf supersede`), sqlite opencode.db |
| B | Playbook доставляется в system-промпт плагином на каждый шаг; агент НЕ делает wolf-вызовов | ✅ | `experimental.chat.system.transform`: «transform fired, match=true» в логе на каждый шаг; tools агента = **[read]** только; ответ `[lean]…`, 3 строки |

## Механика (фактическая, opencode 1.18.25)

- **Роутинг:** внутрисессионного провайдера-диспатча НЕТ (provider hook = только статические описания моделей `api.npm`; chat.params = только sampling). Роутер реализован как **адаптер запуска** `.wolf/run-with-routing.sh`: чтение routing-объекта через Wolf CLI (следование supersede-цепочке v1→v2) → `opencode run --model <из памяти>`. Соответствует спеке «LLM — внешний адаптер».
- **Доставка:** плагин `.opencode/plugins/wolf-router.ts`, хук `experimental.chat.system.transform` — добавляет свежий playbook (2s-кэш) в system на каждый шаг LLM. Детерминированно, без участия агента.

## Цена (weighted = in + 0.1×cache + 5×out)

| Прогон | Доставка | Weighted | Tool calls |
|---|---|---|---|
| PoC#3 A1 (apprentice) | wolf search агентом | 29055 | 7 |
| PoC#4 B1c (apprentice-inj) | **плагин** | **13851** | **1** |
| PoC#3 B1' (static) | в рамке | 12500 | 1 |

Инжекция плагином ≈ цене статической рамки и **в ~2× дешевле** доставки через wolf search. Точность формата B1c: маркер `[lean]` первой строкой ✅, ≤5 строк ✅, но шапка без версии и без футера (модель вольнее при T=0.2) — контент доставляет плагин, дисциплину формата должна держать рамка.

## Находки для спеки

1. **Слой доставки №3 в §13**: плагин-инжекция (`system.transform`) — детерминированная, ~бесплатная, на каждый шаг. Рекомендация: основной механизм доставки методик; wolf search — fallback.
2. **Роутинг моделей** = класс «параметры» в памяти (TTL «пробег», POST-audit не нужен — вне контура); исполнитель — адаптер запуска Wolf, не платформа. H3 закрыт на уровне адаптера.
3. Документ пользователя концептуален: хуки `config`(createModel), `chat.message`(systemPrompt) в 1.18.25 отсутствуют; реальные — `provider`(описания), `chat.params`(sampling), `experimental.chat.system.transform`(system), `experimental.chat.messages.transform`(сообщения).
4. Frontmatter агента НЕ попадает в system — маркер для хука-фильтра держать в теле рамки; рамка без `model:` падает в `run` (Unexpected server error).
5. Скилл analyze-doc снова контаминировал прогон (перехватил задачу у агента) — подтвердилось правило дистанции описаний скиллов.
6. `wolf supersede` внутри составной bash-команды с `2>/dev/null` однажды промолчал об ошибке — вывод Wolf не глушить.

## Артефакты

`.opencode/plugins/wolf-router.ts`, `.opencode/agents/apprentice-inj.md`, `.wolf/run-with-routing.sh`, `.wolf/router.log`, routing-объекты `mem_20260829_llm_routing_v1…966883` (superseded) / `…v2…51652f` (active), сырые прогоны в T/opencode/poc4-*.json
