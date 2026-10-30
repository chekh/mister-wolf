---
slug: patch-2-21-1-multi-project-schema-isolation
title: '2.21.1 — Изоляция схем памяти между проектами — план'
status: approved
approved_by: L1
approved_at: 2026-10-27
created: 2026-10-27
requires: 2.21.0 (73a731f)
thread: mem_20261027_patch_2_21_1_izolyatsiya_skhem_pamyati_m_5f472b
mode: FIX
---

# 2.21.1 — Изоляция схем памяти между проектами — план

<!-- Задачи: цель + ссылка на раздел требований + file:line базлайна. Без копипасты реализации. -->

Рабочая копия: worktree `.worktrees/patch-2-21-1-schema-isolation`, ветка
`fix/2.21.1-multi-project-schema-isolation`, базовый SHA `73a731f` (main, 2.21.0).

## Задачи

- [x] **T-1 — Артефакт FIX-профиля.** Создать `docs/dev/2026-10-27-patch-2-21-1-multi-project-schema-isolation/`
      (`wolf scaffold artifact … --fix`), заполнить требование (REQ-01..04), план и журнал CR —
      requirements.md §1–§3, этот файл. — сделано → коммит `docs(patch-2.21.1): артефакт fix-профиля`
- [x] **T-2 — Регрессионный тест (RED).** Два корня в одном процессе: таксономия второго не
      наследуется от первого. Базлайн: `src/adapters/fs/markdown-memory-store.ts:36-40`.
      Файл: `tests/unit/adapters/markdown-memory-store-schema-isolation.test.ts`. — сделано → коммит
- [x] **T-3 — Фикс изоляции схем (GREEN).** Кэш схем по `baseDir` (образец: `syncConfigCache`,
      `src/adapters/fs/config-file.ts:184`). Базлайн: `src/adapters/fs/markdown-memory-store.ts:36-40`.
      — сделано → коммит
- [x] **T-4 — Проверки проекта.** `npm run check` (english-surface + format:check + lint + build +
      test:run) и целевые тесты; evidence в отчёте. — сделано → коммит
- [x] **T-5 — Саморевизия изменения.** wolf-review по диффу (независимый ревьюер), приёмка по
      REQ-01..04. Вердикт ревьюера: APPROVED (0 critical / 0 major / 7 minor); minor-находки
      M-02/M-03 закрыты расширением теста, M-01/M-04 зафиксированы как известные ограничения
      (requirements.md §2.1), M-05 — этим чекбоксом, M-06 — в релизном шаге T-6. — сделано → коммит
- [ ] **T-6 — Релиз 2.21.1.** `npm version 2.21.1` (полный X.Y.Z), запись в `CHANGELOG.md`, тег
      `v2.21.1`, публикация: `git push origin main`, `git push origin v2.21.1`, `npm publish`,
      публикация docs (`npm run docs:build`), очистка временного worktree релиза. — сделано → коммит
