# S01: Старт новой сессии — быстро войти в контекст

## User story

Разработчик открывает проект, с которым не работал несколько дней или недель. Нужно быстро вспомнить, над чем остановился, какие решения действуют и что делать дальше.

## Контекст

- Проект уже использует Mr. Wolf.
- В памяти есть work-threads, decisions, rules, articles, session-checkpoints.
- Разработчик работает через OpenCode / CLI.

## Триггер

> «Что я делал? С чего начать?»

## Пошаговый поток

1. Пользователь открывает сессию и спрашивает агента или вводит в CLI:

   ```bash
   wolf recall
   ```

   или

   ```bash
   wolf thread brief <thread-id>
   ```

2. Mr. Wolf собирает контекст:
   - активные work-threads;
   - открытые blockers, info-requests, open-questions;
   - активные rules и недавние decisions;
   - последний session-checkpoint / session-summary.

3. Mr. Wolf возвращает компактный бриф:

   ```markdown
   # Project Context

   ## Active Threads

   - thread_001: Schema-driven taxonomy research
     - goal: выбрать между solve/call и schema-driven taxonomy
     - current_state: собраны отзывы экспертов, выбран solve/call
     - next_steps: реализовать wolf solve MVP
     - blockers: нет

   ## Active Rules

   - rule_001: After completing any phase, update AGENTS.md, README.md, MEMORY.md.
   - rule_002: Do not commit .codegraph/ to repository.

   ## Recent Decisions

   - decision_003: Use flat CLI namespace (completed Phase 6).

   ## Open Questions

   - Should call-injection be a first-class type?

   ## Recommended First Step

   Run `wolf solve "agent keeps using deprecated get"`.
   ```

4. Пользователь выбирает, с чего начать: продолжить thread, решить blocker, запустить solve.

## Ожидаемый результат

- В `.wolf/memory/` ничего не меняется (read-only операция).
- Пользователь получает полный, но компактный контекст за 1 запрос.
- Агент в сессии видит тот же контекст и не начинает с нуля.

## Покрываемые команды

- `wolf recall` (предлагается добавить).
- `wolf thread brief <id>`.
- `wolf list --status active` (неявно).
- `wolf search` (неявно).

## Открытые вопросы

- Должен ли `recall` отдавать один большой бриф или несколько вариантов (краткий/подробный/только thread)?
- Как `recall` ранжирует: по времени, по importance, по активности thread?
- Нужен ли `recall --for <topic>` для фильтрации?
- В каком формате агент получает контекст: markdown, JSON, или оба?
