# S08: Поиск по памяти — найти, почему так сделано

## User story

Разработчик видит в коде странное решение и хочет понять, почему оно так сделано. Память проекта должна ответить быстрее, чем `git blame` и разбор коммитов.

## Контекст

- В памяти есть decisions, articles, lessons, observations, rules.
- Пользователь работает через CLI или агент через MCP.

## Триггер

> «Почему мы вообще используем relations.jsonl вместо SQLite для связей?»

## Пошаговый поток

1. Пользователь ищет:

   ```bash
   wolf search "relations.jsonl canonical source"
   ```

2. Mr. Wolf возвращает ранжированный список:

   ```text
   decision_002 [decision] Store relations in relations.jsonl
   article_004 [article] Relations storage design
   lesson_012 [lesson] SQLite index rebuild cost for relations
   ```

3. Пользователь получает полный объект:

   ```bash
   wolf get decision_002
   ```

4. Mr. Wolf показывает:
   - обоснование решения;
   - связанные артефакты;
   - статус (active/superseded);
   - когда обновлялось.

5. (Опционально) пользователь запрашивает объяснение, почему объект попал в выдачу:
   ```bash
   wolf search "relations" --explain
   ```

## Ожидаемый результат

- Пользователь быстро находит обоснование решения.
- Видит, актуально ли оно или устарело.
- Не тратит время на археологию в git/chats.

## Покрываемые команды

- `wolf search`
- `wolf get`
- `wolf search --explain` (предлагается добавить)

## Открытые вопросы

- Должен ли поиск по умолчанию исключать superseded-объекты?
- Как ранжировать: по времени, importance, confidence, связям?
- Что показывать в `--explain`: matched terms, active status, freshness?
