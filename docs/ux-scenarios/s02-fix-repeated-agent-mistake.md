# S02: Агент повторяет ошибку — исправить память через solve/call

## User story

Разработчик работает с агентом. Агент несколько раз использует устаревшую команду или игнорирует недавнее решение. Пользователь устал повторять одно и то же.

## Контекст

- В памяти уже есть правило или решение, но агент его не видит/не понимает в текущей сессии.
- Или в памяти есть старое правило, которое противоречит новому, и агент путается.

## Триггер

> «Агент опять использует `get` вместо `wolf thread get`. Я уже объяснял ему это дважды.»

## Пошаговый поток

### Часть A: Clean solve session

1. Пользователь открывает отдельную чистую сессию (или переключается в CLI) и вводит:

   ```bash
   wolf solve "agent keeps using deprecated top-level get command even though entity-specific get is required"
   ```

2. Mr. Wolf выбирает сценарий `stale-instruction` и собирает релевантную память:
   - старые правила, упоминающие `get`;
   - новые правила про entity-specific commands;
   - связанные decisions;
   - session-checkpoints, где это обсуждалось.

3. Mr. Wolf генерирует Solve Pack:

   ```markdown
   # Solve Pack: deprecated get command

   ## Problem

   Agent keeps using top-level `get` despite newer guidance.

   ## Suspected Issues

   - stale-instruction
   - missing-call-injection

   ## Relevant Memory

   - rule_old_get_usage_20260628 (still active)
   - rule_cli_entity_get_20260703 (active)
   - decision_cli_entity_commands_20260702

   ## Required Analysis

   1. Diagnose why agent keeps using old command.
   2. Determine if old rule should be superseded.
   3. Draft a compact call injection.

   ## Output Artifacts Expected

   - diagnosis article
   - supersedes relation
   - call-injection
   ```

4. Пользователь или чистый агент анализирует Solve Pack и создает артефакты:
   ```bash
   wolf article add --title "Why top-level get is deprecated" ...
   wolf rule add --title "Use entity-specific get commands" ...
   wolf call-injection add --for get --body "..."
   wolf supersede rule_old_get_usage_20260628 rule_cli_entity_get_20260703
   ```

### Часть B: Return to working session

5. Пользователь возвращается в рабочую сессию и говорит:

   > «Слушай Wolf.»

   Или вводит:

   ```bash
   wolf call --for get
   ```

6. Mr. Wolf возвращает compact injection:

   ```text
   Do not use deprecated top-level `get`.
   Use entity-specific commands:
   - wolf thread get <id>
   - wolf info-request get <id>
   - wolf article get <id>
   Older guidance is superseded by rule_cli_entity_get_20260703.
   ```

7. Агент в рабочей сессии получает инъекцию и продолжает без повторного объяснения.

## Ожидаемый результат

- В памяти появляются:
  - `article` с диагнозом;
  - `rule` с новым требованием;
  - `call-injection` для активных сессий;
  - `relation` supersedes между старым и новым правилом.
- В рабочей сессии агент перестает повторять ошибку.

## Покрываемые команды

- `wolf solve` (предлагается добавить).
- `wolf call` (предлагается добавить).
- `wolf article add`.
- `wolf rule add`.
- `wolf supersede`.
- `wolf add --type call-injection` (если call-injection станет типом).

## Открытые вопросы

- `call-injection` — отдельный тип или специальный subtype `rule`?
- Как `wolf solve` матчит сценарий: по ключевым словам, по LLM-классификации, по шаблонам?
- Кто создает артефакты после Solve Pack: пользователь, чистый агент, или Mr. Wolf в `--plan` режиме?
- Как предотвратить, чтобы `solve` мутировал в workflow engine?
