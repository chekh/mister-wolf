# s3 — диагностика ведущего после отклонения

- Дата: 2026-11-16
- Fixture: `/private/var/folders/p_/p7msymwd55vbzp44kkmnbc3w0000gn/T/opencode/wf-behavior/lang`
- Агент: `mr-wolf` (диагностика выполнял ведущий вручную, без агента)
- Команда: ручные CLI-проверки ведущего — grep `supersede` по транскрипту `/tmp/wf_s3.txt`, `wolf supersede --help`, grep по `agent-language.md` и секции Session language в `AGENTS.md` fixture
- Реплика/TASK пользователя: — (отдельного прогона нет; это диагностика отклонения s3)
- Статус: действие ведущего в рамках отклонения s3 (вердикт прогона см. s3.md)

## Вывод проверок (`wf_s3diag.txt`, дословно)

```text
=== supersede в транскрипте сессии 3? ===
0
=== wolf supersede доступен? ===
Usage: wolf supersede [options] <old-id> <new-id>

Supersede a memory object with another

Arguments:
  old-id      Id of the memory object to supersede
=== что говорит agent-language.md про supersede ===
=== Session language в AGENTS.md fixture ===
19:   `wolf transition <id> blocked`), outdated items — `wolf supersede <old-id> <new-id>`.
20-3. Ask Wolf for project state (`wolf search`, `wolf get`, `wolf brief`):
21-   static lists in files go stale. Wolf memory is the only source of project state.
--
53:decision supersedes the old.
54-
```
