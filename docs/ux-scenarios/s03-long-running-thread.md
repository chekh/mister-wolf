# S03: Долгоживущая задача — вести work-thread между сессиями

## User story

Разработчик начинает большую задачу (например, рефакторинг архитектуры), которая займет несколько сессий. Нужно сохранять контекст между сессиями, чтобы каждый раз не начинать с нуля.

## Контекст

- Задача сложная, с побочными вопросами и промежуточными решениями.
- В ней участвуют несколько сессий агента и пользователя.

## Триггер

> «Это займет больше одной сессии. Нужно, чтобы следующая сессия сразу поняла, где мы.»

## Пошаговый поток

1. Пользователь создает thread:

   ```bash
   wolf thread create \
     --title "Refactor auth module to schema-driven taxonomy" \
     --goal "Replace hardcoded MEMORY_TYPES with config-driven registry" \
     --current-state "Phase 6-7 complete; Phase 8 direction unclear" \
     --next-steps "Collect expert reviews, decide solve/call vs taxonomy"
   ```

2. Mr. Wolf создает `work-thread` и возвращает `thread_001`.

3. Во время первой сессии возникает побочный вопрос:

   > «А как другие проекты решают проблему устаревания guidance?»

4. Пользователь создает info-request:

   ```bash
   wolf info-request create \
     --title "Research how projects handle stale agent instructions" \
     --thread thread_001 \
     --question "What patterns exist for keeping agent instructions fresh across sessions?" \
     --detour-reason "Deep research would derail the main thread" \
     --expected-answer "List of patterns with tradeoffs" \
     --preliminary-answer "Solve/call + supersedes relation seems common."
   ```

5. В следующей сессии пользователь (или другой агент) отвечает на info-request статьей:

   ```bash
   wolf article add \
     --title "Patterns for stale agent instruction repair" \
     --thread thread_001 \
     --summary "..." \
     --body "..." \
     --answers ireq_001
   ```

6. Перед продолжением основной работы пользователь запрашивает бриф:

   ```bash
   wolf thread brief thread_001
   ```

7. Mr. Wolf возвращает актуальное состояние thread: goal, current_state, next_steps, открытые вопросы, статьи, решения, blockers.

## Ожидаемый результат

- В `.wolf/memory/objects/threads/` создан thread с историей.
- Связи между thread, info-request и article записаны в `relations.jsonl`.
- Новая сессия начинается с полным контекстом.

## Покрываемые команды

- `wolf thread create`
- `wolf thread list`
- `wolf thread brief <id>`
- `wolf info-request create`
- `wolf info-request list`
- `wolf article add`
- `wolf article list`

## Открытые вопросы

- Когда создавать новый thread, а когда достаточно `decision` или `article`?
- Как thread brief должен обрезать старую историю, чтобы не перегружать контекст?
- Нужен ли thread-level `recall` (`wolf recall --thread thread_001`)?
- Как thread связывается с `session-checkpoint`?
