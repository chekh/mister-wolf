# S12: Аудит памяти — проверить, что не устарело

## User story

Раз в неделю/месяц команда хочет проверить состояние project memory: что устарело, что конфликтует, что пропущено.

## Контекст

- Память накопилась, есть риск stale/conflicting objects.
- Пользователь хочет не искать вручную, а получить сводку проблем.

## Триггер

> «Давай проверим, не устарела ли наша память.»

## Пошаговый поток

1. Пользователь вводит:

   ```bash
   wolf list --stale
   ```

2. Mr. Wolf возвращает объекты, не обновлявшиеся 30+ дней:

   ```text
   article_001 [article] Early API design notes [stale]
   decision_002 [decision] Use JSON for config [stale]
   ```

3. Пользователь ищет конфликты:

   ```bash
   wolf solve --scenario conflicting-memory
   ```

4. Mr. Wolf возвращает отчет:

   ```markdown
   ## Potential Memory Conflicts

   - decision_002 says "Use JSON for config" (active)
   - decision_009 says "Use YAML for config" (active)
   - No supersedes relation found.
   ```

5. Пользователь решает, что делать:

   ```bash
   wolf supersede decision_002 decision_009
   ```

6. Или создает info-request для глубокого аудита:
   ```bash
   wolf info-request create \
     --title "Audit config format decisions" \
     --question "Which config format is canonical now?" \
     ...
   ```

## Ожидаемый результат

- Команда видит stale-объекты.
- Обнаруживаются конфликты active memory.
- Память поддерживается в актуальном состоянии без ручного перебора.

## Покрываемые команды

- `wolf list --stale`
- `wolf solve --scenario conflicting-memory`
- `wolf supersede`
- `wolf info-request create`

## Открытые вопросы

- Нужен ли отдельный `wolf doctor` для health-check памяти?
- Как определять конфликты: по ключевым словам, по relations, по LLM-анализу?
- Стоит ли автоматически напоминать об audit раз в N дней?
