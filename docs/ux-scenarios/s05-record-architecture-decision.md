# S05: Архитектурное решение — зафиксировать decision

## User story

Команда принимает важное архитектурное или процессное решение. Нужно зафиксировать его так, чтобы будущие сессии и агенты знали, почему выбран этот путь.

## Контекст

- Решение влияет на код, процессы или инструменты.
- Возможны альтернативы, и важно сохранить обоснование.

## Триггер

> «Давайте запомним, почему мы выбрали sqlite-vec вместо pgvector.»

## Пошаговый поток

1. Пользователь (или агент по итогам solve-сессии) создает decision:

   ```bash
   wolf decision add \
     --title "Use sqlite-vec for optional hybrid search" \
     --body "Local-first constraint is primary. sqlite-vec keeps vectors in the same SQLite file. pgvector is allowed only as optional adapter." \
     --thread thread_001 \
     --based-on article_003,ireq_002
   ```

2. Mr. Wolf создает `decision` со статусом `active` и связывает его с article и info-request.

3. Decision появляется в:
   - `wolf recall`;
   - `wolf thread brief thread_001`;
   - `wolf search "sqlite-vec"`.

4. Если позже решение устаревает, пользователь создает новое decision и замещает старое:
   ```bash
   wolf decision add --title "Drop vector search, use FTS5 only" ...
   wolf supersede decision_004 decision_005
   ```

## Ожидаемый результат

- Активное решение видно в контексте.
- Есть обоснование и связи с артефактами.
- Старые решения сохраняются в истории.

## Покрываемые команды

- `wolf decision add`
- `wolf decision list`
- `wolf supersede`
- `wolf search`

## Открытые вопросы

- Должен ли `decision` требовать review_state `accepted` для появления в recall?
- Как decision связывается с code/файлами (через `related.files`)?
- Нужна ли интеграция с ADR-шаблоном?
