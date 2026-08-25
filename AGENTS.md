# Agent Brief: mr-wolf

Mr. Wolf — local-first project memory harness for AI coding agents («I solve problems»). Не оркестратор: слой памяти для агентов. Стек: TypeScript, Node, vitest; валидация — `npm run check`.

## ПРОТОКОЛ холодного старта (обязателен для каждой свежей сессии)

1. **Начинай сессию с состояния проекта:** запусти `wolf call` и `wolf brief`
   (CLI: `node dist/bootstrap/cli.js`; MCP-инструменты: `mr-wolf_*`).
   Возвращённые injections и brief — активное руководство проекта.
2. **Фиксируй значимое через Wolf:** решения — `wolf add --type decision`,
   уроки — `--type lesson`, блокеры — `--type blocker`, устаревшее —
   `wolf supersede <old-id> <new-id>`.
3. **Состояние проекта спрашивай у Wolf** (`wolf search`, `wolf get`, `wolf brief`) —
   не читай статические списки из файлов: они устаревают. Память Wolf —
   единственный источник состояния проекта.

## Указатели

- План работ: `docs/superpowers/plans/roadmap-v2.md`
- Документация: `README.md`, `docs/README.md`

## CodeGraph

ВАЖНО: codegraph не поддерживает MCP-ресурсы — НЕ вызывай `list_mcp_resources`/`read_mcp_resource` с этим сервером; вся информация доступна через `codegraph_*` тулы.
