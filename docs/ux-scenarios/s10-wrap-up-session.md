# S10: Конец сессии — зафиксировать итоги

## User story

Сессия подходит к концу. Пользователь хочет сохранить, что было сделано, какие решения приняты и что делать дальшему агенту.

## Контекст

- В течение сессии создавались артефакты, решения, разрешались блокеры.
- Часть событий уже авто-триггернула session-summary, но пользователь хочет явную сводку.

## Триггер

> «Давай зафиксируем, что мы сделали сегодня.»

## Пошаговый поток

1. Пользователь вводит:

   ```bash
   wolf session wrap-up --title "Session 2026-07-03: expert review aggregation" --tags expert-review,solve-call
   ```

2. Mr. Wolf читает `events.jsonl` за последние N минут/часов и формирует `session-summary`:

   ```markdown
   # Session Summary

   ## What happened

   - Aggregated external expert reviews.
   - Discovered `npm run check` failure in MCP schemas.
   - Decided to prioritize solve/call UX over schema-driven taxonomy.

   ## Artifacts created/modified

   - docs/external-experts-review-aggregate-2026-07-03.md
   - docs/ux-scenarios/ (new folder)

   ## Decisions

   - Next phase = solve/call UX, not governance.

   ## Blockers resolved

   - None.

   ## Next steps

   - Fix `npm run check`.
   - Implement `wolf solve` MVP.
   ```

3. `session-summary` сохраняется в `.wolf/memory/objects/sessions/`.

4. При следующем `wolf recall` этот summary учитывается.

## Ожидаемый результат

- В памяти есть структурированная сводка сессии.
- Следующая сессия видит итоги без разбора events.jsonl.
- Авто-триггеры не создают дубликаты благодаря cooldown guard.

## Покрываемые команды

- `wolf session wrap-up`
- `wolf recall`
- `wolf session checkpoint` (связанный сценарий)

## Открытые вопросы

- Сколько истории events учитывать при wrap-up: фиксированное окно или с последнего summary?
- Должен ли wrap-up авто-определять теги?
- Нужна ли интеграция с `session checkpoint`?
