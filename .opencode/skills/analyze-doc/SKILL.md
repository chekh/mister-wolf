---
name: analyze-doc
description: Анализирует документ по методике из памяти Wolf (Playbook). Use when the user asks to analyze a document, review documentation quality, find improvements in a markdown file, or critique docs structure.
---

# Analyze Doc — рамочный скилл (PoC)

Содержимое методики НЕ в этом файле — оно в памяти Wolf и эволюционирует
без рестарта. Этот файл — только рамка: протокол подтягивания и границы.

## Протокол (обязателен)

1. **ДО анализа** получи актуальный playbook:
   - `mr-wolf_search` (query: `apprentice playbook`), ИЛИ
   - bash: `node dist/bootstrap/cli.js search "apprentice playbook"`.
   Возьми запись с наибольшей версией.
2. Выполняй анализ строго по разделам «МЕТОДИКА» и «ФОРМАТ ОТЧЁТА»
   playbook. Формат отчёта (шапка с версией, структура, футер) — из него.
3. **Фидбек пользователя** о формате/методике → сначала зафиксируй новую
   версию playbook (`mr-wolf_add` или CLI `wolf add`, тег `apprentice`,
   title с новой версией, причина в конце тела), затем работай по ней.
4. Без фидбека версию не меняй.

## Границы рамки

- Критичные запреты: `rm -rf`, `sudo`, деструктивный git, секреты.
- Экономность: результат и короткий след, без длинных рассуждений.
- Этот файл не содержит методику и не должен её содержать.
