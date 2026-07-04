# S04: Побочное исследование — отложить через info-request

## User story

В середине рабочей сессии возникает интересный, но отвлекающий вопрос. Пользователь хочет его зафиксировать и отложить, чтобы не терять фокус.

## Контекст

- Пользователь уже работает внутри thread или без него.
- Вопрос требует исследования, но ответ будет полезен не только сейчас.

## Триггер

> «Это важно, но если я сейчас уйду в это, не закончу основное.»

## Пошаговый поток

1. Пользователь создает info-request:

   ```bash
   wolf info-request create \
     --title "Compare sqlite-vec vs pgvector for hybrid search" \
     --thread thread_001 \
     --question "Which vector extension fits Mr. Wolf local-first constraint?" \
     --detour-reason "Vector research would distract from solve/call MVP" \
     --expected-answer "Recommendation with tradeoffs" \
     --preliminary-answer "sqlite-vec keeps everything local, but pgvector is more mature."
   ```

2. Mr. Wolf создает `info-request`, связывает его с thread и возвращает `ireq_002`.

3. Пользователь продолжает основную работу.

4. В отдельной сессии пользователь или другой агент берут info-request:

   ```bash
   wolf info-request list --thread thread_001
   ```

5. После исследования создается article-ответ:

   ```bash
   wolf article add \
     --title "Vector search options for Mr. Wolf" \
     --thread thread_001 \
     --summary "sqlite-vec is recommended for local-first; pgvector as optional adapter." \
     --body "..." \
     --answers ireq_002
   ```

6. info-request автоматически переводится в статус `answered`.

## Ожидаемый результат

- Вопрос не потерян.
- Основная работа не прервана.
- Ответ сохранен как reusable knowledge.

## Покрываемые команды

- `wolf info-request create`
- `wolf info-request list`
- `wolf article add`
- `wolf thread brief` (показывает открытые info-requests)

## Открытые вопросы

- Чем info-request отличается от open-question? (info-request предполагает конкретный ответ и статью; open-question — гипотеза.)
- Нужен ли автоматический статус `answered` при создании article с `--answers`?
- Кто может отвечать на info-request: только автор thread, любой агент, или любой пользователь?
