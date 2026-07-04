# S11: Новый разработчик — onboard через project memory

## User story

В команду приходит новый разработчик. Вместо длинного onboarding-документа он хочет быстро понять проект через актуальную память: что важно, какие правила, где какой код.

## Контекст

- Проект использует Mr. Wolf несколько месяцев.
- В памяти есть rules, decisions, articles, documents, thread briefs.

## Триггер

> «Я новый в проекте. С чего начать?»

## Пошаговый поток

1. Новый разработчик запускает скан проекта:

   ```bash
   wolf scan
   ```

2. Mr. Wolf:
   - создает `context`-объект с техническим снимком;
   - регистрирует project documents как `document`-артефакты по ссылке.

3. Затем он запрашивает общий бриф:

   ```bash
   wolf recall --topic onboarding
   ```

4. Mr. Wolf возвращает:

   ```markdown
   # Onboarding Pack

   ## Start here

   - README.md
   - docs/superpowers/specs/2026-06-30-project-memory-harness-base-concept.md

   ## Active Rules

   - rule_001: Update docs after every implementation phase.
   - rule_002: Do not commit `.codegraph/`.

   ## Key Decisions

   - decision_003: Flat CLI namespace.
   - decision_004: Markdown files are source of truth, SQLite is derived.

   ## Active Threads

   - thread_001: Schema-driven taxonomy / solve-call direction.

   ## Common Commands

   - `npm run check`
   - `wolf solve "..."`
   - `wolf call --for <topic>`
   ```

5. Разработчик может углубляться:
   ```bash
   wolf thread brief thread_001
   wolf get decision_003
   ```

## Ожидаемый результат

- Новый участник получает актуальный, структурированный onboarding pack.
- Не нужно читать весь README и разбираться в истории.
- Правила и решения видны сразу.

## Покрываемые команды

- `wolf scan`
- `wolf recall`
- `wolf thread brief`
- `wolf get`

## Открытые вопросы

- Нужен ли специальный `wolf onboard` или достаточно `recall --topic onboarding`?
- Как отличить onboarding-релевантную память от всей остальной?
- Должен ли `scan` регистрировать все документы или только важные?
