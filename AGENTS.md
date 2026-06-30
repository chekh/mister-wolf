# Agent Brief: mr-wolf

## Project Snapshot
- Root: .
- Project name: mr-wolf
- Branch: main
- Commit: a48d167d38d0a6039f7df9170a727fc1b5c34c59
- Generated: 2026-06-30T13:45:28.237Z

## What This Project Is
Mr. Wolf

> **"I solve problems."**
>
> Local-first Project Semantic Memory layer for AI coding agents.
>
> Not another agent. A memory substrate for agents.
>
> See docs/concept-v3.md for the full architecture and concept.

## Technology Stack
- Languages: json, jsonl, log, md, py, ts, yaml, yml
- Key dependencies: @dietrichgebert/ponytail, @types/better-sqlite3, @types/glob, @types/js-yaml, @types/node, @types/uuid, better-sqlite3, commander, fast-glob, js-yaml

## Key Files & Entry Points
- src/bootstrap/cli.ts
- .opencode/package.json (config)
- .prettierrc (config)
- package.json (config)
- tsconfig.json (config)
- vitest.config.ts (config)

## Architecture Notes
Project appears to use a ports-and-adapters (hexagonal) architecture.

## Active Memory
- [decision] Use decision and blocker types for Phase 2
  Phase 2 implements first-class decision and blocker memory objects with CLI commands and brief integration.
- [session-summary] Session 2026-06-30: гэп в onboarding устранён, готовность к Phase 2
  Проблема: при старте сессии информация о текущей работе была размазана по git, thread, article, events.jsonl, brief; пои
- [document] Роадмап MVP Mr. Wolf
  MVP-A: Core Memory + Search — реализован. MVP-B: Project Scan + Agent Brief — в плане, цель: wolf scan и wolf brief. MVP
- [observation] Источник правды — markdown-файлы в .wolf/memory
  Memory-объекты хранятся как markdown-файлы в .wolf/memory/<type>/<id>.md. События пишутся в .wolf/memory/events.jsonl. S
- [observation] Доступные CLI-команды в MVP-A
  Доступные команды: memory init, memory add --type <type> --title <title> --body <body>, memory get <id>, memory list, me
- [decision] Не коммитить .codegraph/ в репозиторий
  Каталог .codegraph/ содержит SQLite-индекс CodeGraph и не должен попадать в git. Добавлен в .gitignore. Если индекс отсу
- [decision] Использовать git-flow: все изменения через dev
  Решено: вся разработка ведётся через ветку dev. Фичи и фиксы создаются как feat/* и fix/*, мёржатся в dev, а в main попа
- [lesson] Документирование сессии: cleanup docs + план MVP-B
  В этой сессии выполнили документальный cleanup после пивота Mr. Wolf на Project Semantic Memory: перенесли устаревшие об

## Open Questions
- Автоматическая регистрация проектных документов при scan
  Сейчас memory scan (MVP-B) создаёт только context-объект project-scan-latest. Нужно ли расширить сканер, чтобы он находи
- Нужна ли инкрементальная индексация вместо rebuild-index?
  Сейчас после каждого memory add поиск не видит новые объекты, пока не выполнить memory rebuild-index. Это соответствует 

## Blockers
- Need incremental indexing

## Sources
- Project scan: project-scan-latest
- README.md
- package.json
- Active memory objects: 8

## Limitations
- This brief is generated from the latest scan and accepted active memory.
- It may be incomplete if the scan is outdated or memory has not been reviewed.

## Recommended First Steps
- Review the active memory and open questions below.
- Read project documentation (README.md, docs/concept-v3.md, AGENTS.md).
- Run the project checks (`npm run check` or equivalent).

