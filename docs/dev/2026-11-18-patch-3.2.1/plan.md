---
slug: patch-321-plan
title: План волны 3.2.1 — два мандата разработки + конвейер выпуска
status: active
created: 2026-11-18
---

# 1. Разбиение (требования: requirements.md этой папки)

| Задача                                        | REQ                           | Файлы (write allowlist)                                                                                                                                                                                                                                    | Исполнитель             |
| --------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| W-A: preflight learning apply/rollback        | REQ-321-1, REQ-321-3          | `src/app/use-cases/rollback-learning-change.ts`, `src/app/use-cases/apply-learning-change.ts`, тесты в `tests/unit/use-cases/` (rollback/apply learning)                                                                                                   | wolf-developer (свежий) |
| W-B: единый допуск доставки + тело micro-note | REQ-321-2, REQ-321-5          | `src/app/use-cases/get-call-injections.ts`, `src/app/use-cases/generate-agent-brief.ts`, `src/app/use-cases/micro-note-delivery.ts`, при необходимости общий модуль допуска в `src/domain/` или `src/app/use-cases/`, тесты доставки/call/brief/micro-note | wolf-developer (свежий) |
| W-C: GitHub Release шаг в publish.yml         | решение `mem_20261118_c7374e` | `.github/workflows/publish.yml`                                                                                                                                                                                                                            | ведущий                 |

Файльные области W-A и W-B не пересекаются; оба работают на ветке `en-base-wave`,
результат возвращают как текст (диффы), коммиты делает ведущий после ревью.

# 2. Верификация и приёмка

1. Каждый мандат: регрессионные тесты REQ (красные на текущем коде → зелёные после фикса),
   целевые vitest-прогоны, типы (`tsc --noEmit`), `npm run check` — ведущий после интеграции.
2. Независимое ревью diff'а обеих задач (wolf-reviewer, свежий) до коммита.
3. Гейт: `check:full` + пофайловая e2e-кампания 63/63 + pack/install/init smoke
   (процедура T-16, node 24 префикс).
4. Выпуск: CHANGELOG `[3.2.1]` → `npm version 3.2.1` (update-map регенерация + amend) →
   PR → merge → тег `v3.2.1` → CI publish + автоматическая GitHub-страница (W-C).

# 3. Границы

- R-4 (CLI/MCP противоречия) — отдельное поручение после 3.2.1 (`mem_20261118_c7374e`).
- Расширение автоприменения — до закрытия R-4 и повторения held-out сценариев — NO-GO.
