---
slug: hotfix-2-16-3-agent-modes
title: hotfix-2-16-3-agent-modes — план
status: in-progress
created: 2026-10-13
---

# hotfix-2-16-3-agent-modes — план

## Задачи

- [x] Задача 1 (REQ-02, TDD): guard-тест `tests/unit/agents-mode-guard.test.ts` —
      RED на текущих шаблонах (нет mode у 4 из 6), затем GREEN после задачи 2.
- [x] Задача 2 (REQ-01, REQ-04): `mode: all` в executor-lead + worker-\* (4 файла);
      steward — `model: {{model.primary}}` вместо литерала.
- [x] Задача 3 (REQ-03): пересинк агентов в репо (worktree dist): удалить
      мутированный `.opencode/agents/steward.md` → `created`; grep-доказательство
      `mode: all` в рендере; штамп set=2.16.3.
- [x] Задача 4: `npm run check` зелёный; CHANGELOG.md [2.16.3]; версия
      `npm version 2.16.3 --no-git-tag-version` (тег — только командой владельца).
- [ ] Задача 5: независимое ревью диффа (worker-reviewer через `opencode run` —
      Task-спавн мёртв до этого фикса); отчёт RESULT/EVIDENCE.

<!-- Исполнитель переворачивает чекбокс в [x] в конце задачи вместе со строкой «сделано → коммит». Чекбокс — истина завершённости. -->
