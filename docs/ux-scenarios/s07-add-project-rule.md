# S07: Правило проекта — добавить rule и заставить агентов следовать

## User story

Команда устала повторять одно и то же требование агентам. Нужно превратить его в durable project rule, которое агенты будут видеть в контексте.

## Контекст

- Правило — это behavioral guardrail, а не разовая инструкция.
- Правила требуют explicit user request для создания (агент не может создать proactive).

## Триггер

> «Каждый агент должен знать: никаких миграций без плана отката.»

## Пошаговый поток

1. Пользователь явно запрашивает создание rule:

   ```bash
   wolf rule add \
     --title "Never run migrations without rollback plan" \
     --body "Every migration must have a rollback plan reviewed by the team." \
     --scope project \
     --applies-to "src/migrations/*" \
     --trigger "when creating or modifying migrations"
   ```

2. Mr. Wolf создает `rule` со статусом `active`.

3. Rule появляется в:
   - `wolf recall`;
   - `wolf call --for migrations`;
   - `wolf search "migration"`.

4. Агент в рабочей сессии видит rule через MCP tool `get_rules` или через `wolf call`.

5. Если правило устаревает, пользователь может заместить его:
   ```bash
   wolf rule add --title "Migrations require rollback plan and data backup" ...
   wolf supersede rule_007 rule_008
   ```

## Ожидаемый результат

- Правило сохранено в project memory.
- Агенты получают его в контексте при работе с релевантными файлами/темами.
- Правила не создаются агентами без explicit запроса.

## Покрываемые команды

- `wolf rule add`
- `wolf rule list`
- `wolf recall`
- `wolf call`
- `wolf supersede`

## Открытые вопросы

- Как rule связывается с `call-injection`? (rule = durable policy; call-injection = operational patch.)
- Нужен ли `get_rules` MCP tool отдельно или `call` достаточно?
- Как агент узнает, какие rules применяются к текущей задаче: по `applies_to`, по `trigger`, по поиску?
