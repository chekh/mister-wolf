---
slug: a1-1-measurements
title: A1.1 — план
status: draft
created: 2026-10-31
---

# A1.1 — план

Baseline: `main` = `9a67d82` (roadmap v4 ред. 9 фиксирует релизную базу
`v2.22.1`/`cff3598`; HEAD сдвинут двумя docs-коммитами обзора — кода они не
меняют). Рабочая ветка: `a1-1-measurements`, worktree
`.worktrees/a1-1-measurements`. Владелец интеграции: L1 (executor-lead).

Каждая задача — конечный мандат L2 по контракту using-skills (ядро TASK +
профиль implement). Общий план и приёмка остаются у L1.

## Задачи

- [ ] **IMP-1 — чистый маппинг и агрегация** (`task_id A1-1-IMP-1`)
      Цель: `src/domain/usage-signal.ts` + адресные тесты + fixture исходных
      записей. Проверяемый результат: детерминированный `event_id`, полный
      маппинг turn → `run`-событие по design §Контракты, `summarizeRuns` с
      явными «неизвестно». design §Маппинг, §Дедупликация, §Run-итог.
      Базлайн: `src/adapters/fs/session-metrics-log.ts:50` (схема, не менять).
      Проверка: `npx vitest run tests/unit/domain/usage-signal.test.ts`.
      Зависимостей нет.

- [ ] **IMP-2 — адаптер источника, use-case, CLI, документация**
      (`task_id A1-1-IMP-2`, зависит от IMP-1)
      Цель: `src/adapters/fs/opencode-usage-db.ts` (read-only чтение
      `session_v2`/`session_message`), `src/app/use-cases/import-usage.ts`
      (дедуп + `appendSignal`), `src/adapters/cli/commands/usage.ts`
      (`wolf usage import`), регистрация в `cli-entry.ts`, тесты адаптера и
      use-case на временной SQLite-fixture, раздел ограничений в
      `docs/guide/signal-log.md`, регенерация `docs/reference/cli.md` и
      site-страниц. design §Источник, §Компоненты.
      Проверка: адресные тесты + `node scripts/generate-cli-reference.mjs` и
      `node scripts/generate-cli-site-page.mjs` идемпотентны.

- [ ] **REV-1 — независимое ревью** (`task_id A1-1-REV-1`, после IMP-1/IMP-2)
      Линза: соответствие requirements/design и AC среза; отдельно — качество
      (идемпотентность, честные unknown, отсутствие второго писателя,
      неизменность схемы). Вердикт + findings.

- [ ] **INT-1 — интеграция и гейт** (`task_id A1-1-INT-1`, владелец L1)
      Коммит в `a1-1-measurements`, прогон `npm run check` на точной revision,
      сбор ACCEPTANCE по AC 1–7, запись в память Wolf. Merge/тег — только
      после приёмки L0, вне этого плана.

## Риски и контрольные точки

- Стоимость чтения источника: окно по умолчанию 1 сутки; при 7 сутках замер
  ≈ 39 с на 13.4 GB (NFR-04). Задача не расширяет окно по умолчанию.
- `better-sqlite3` на живом WAL: проверено чтение `readonly: true` при
  существующих `-wal/-shm` (Slice Reality Check). Отсутствие файла — отказ.
- Промежуточная точка: после IMP-1 адресный тест зелёный до начала IMP-2.
