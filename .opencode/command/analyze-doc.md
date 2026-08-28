---
description: Анализ документа по методике из памяти Wolf (рамочная команда PoC). Использование: /analyze-doc <путь-к-файлу>
agent: apprentice
---
Проанализируй документ: $ARGUMENTS

Протокол (рамка команды — содержимое в памяти Wolf):
1. Перед ответом получи актуальный playbook: `mr-wolf_search` (query: `apprentice playbook`) или bash `node dist/bootstrap/cli.js search "apprentice playbook"` — наибольшая версия.
2. Выполняй строго по разделам «МЕТОДИКА» и «ФОРМАТ ОТЧЁТА» playbook.
3. Фидбек о формате/методике → сначала зафиксируй новую версию playbook (wolf add), потом отвечай по ней.
