# Agent Brief: mr-wolf

Mr. Wolf — local-first project memory harness for AI coding agents («I solve problems»). Не оркестратор: слой памяти для агентов. Стек: TypeScript, Node, vitest; валидация — `npm run check`.

## ПРОТОКОЛ холодного старта (обязателен для каждой свежей сессии)

1. **Начинай сессию с состояния проекта:** запусти `wolf call` и `wolf brief`
   (CLI: установленный `wolf`, или `node <путь-к-repo-wolf>/dist/bootstrap/cli.js` в репо Wolf; MCP-инструменты: `mr-wolf_*`).
   Возвращённые injections и brief — активное руководство проекта.
2. **Фиксируй значимое через Wolf:** решения — `wolf add --type decision`,
   уроки — `--type lesson`, блокеры — thread со статусом `blocked`
   (`wolf thread add`, затем `wolf transition <id> blocked`), устаревшее —
   `wolf supersede <old-id> <new-id>`.
3. **Состояние проекта спрашивай у Wolf** (`wolf search`, `wolf get`, `wolf brief`) —
   не читай статические списки из файлов: они устаревают. Память Wolf —
   единственный источник состояния проекта.

## Указатели

- План работ: `docs/superpowers/plans/roadmap-v2.md`
- Документация: `README.md`, `docs/README.md`
- Версии: только `npm version X.Y.Z`; тег `v*` = релиз; запись в `CHANGELOG.md` при релизе обязательна

## CodeGraph

ВАЖНО: codegraph не поддерживает MCP-ресурсы — НЕ вызывай `list_mcp_resources`/`read_mcp_resource` с этим сервером; вся информация доступна через `codegraph_*` тулы.

<!-- wolf:onboarding v2 -->

# Mr. Wolf — память проекта

Этот проект использует Mr. Wolf (local-first память для агентов).

## Протокол холодного старта (каждая свежая сессия)

1. **Начинай с состояния проекта:** запусти `wolf call` и `wolf brief`
   (CLI: установленный `wolf`, или `node <путь-к-repo-wolf>/dist/bootstrap/cli.js` в репо Wolf; MCP-инструменты: `mr-wolf_*`).
   Возвращённые injections и brief — активное руководство проекта.
2. **Фиксируй значимое через Wolf:** решения — `wolf add --type decision`,
   уроки — `--type lesson`, блокеры — thread со статусом `blocked`
   (`wolf thread add`, затем `wolf transition <id> blocked`); устаревшее —
   `wolf supersede <old-id> <new-id>`.
3. **Состояние проекта — только у Wolf** (`wolf search`, `wolf get`,
   `wolf brief`): статические списки в файлах устаревают. Память Wolf —
   единственный источник состояния проекта.

## Лестница приоритетов

1. Явные указания пользователя.
2. Память Wolf (решения, правила, уроки — `wolf brief`/`wolf search`).
3. Свои догадки — только если пусты 1 и 2, и уточни у пользователя.

## Указатели

- Документация: `docs/README.md`
<!-- /wolf:onboarding -->
