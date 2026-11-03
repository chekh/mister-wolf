---
slug: b05-git-inspect
title: B0.5 — read-only git inspect — план
status: draft
created: 2026-11-03
---

# B0.5 — read-only git inspect — план

Базлайн: worktree `.worktrees/b05-git-inspect`, ветка `b05-git-inspect` от
main `f1e3fc9` (2.26.0). Единственный источник контрактов — design.md.

## Задачи

- [x] **T1 (L2-A, implementer): реализация команды + unit-тесты + текст wolf-git.** → сделано: коммит 6ff9dc3, unit 28/28; cli-reference перегенерирован (L1).
      `src/app/use-cases/git-inspect.ts` (collectGitFacts, computeVerdict,
      GitInspectReport), `src/adapters/cli/commands/git-inspect.ts`, регистрация в
      `src/adapters/cli/cli-entry.ts`, unit `tests/unit/use-cases/git-inspect.test.ts`
      (таблица решений, санитизация, таймаут, exit-коды), правка
      `templates/base/skills/wolf-git/SKILL.md` по REQ-06. — design §Компоненты,
      §Контракты; базлайн `src/adapters/cli/commands/memory-scan.ts:6`,
      `src/adapters/cli/cli-entry.ts:100`.
- [x] **T2 (L2-A continue): e2e-сценарии на реальном состоянии.** → сделано: коммит d067d0e, 10/10; HB-1 (бюджет help) — fix 6464645 (`hidden: true`, канон P224).
      `tests/e2e/git-inspect.e2e.ts`: clean/dirty/unfinished-merge/ahead/behind/
      unreachable-remote/no-remote + повторный запуск (стабильность, REQ-05) +
      неизменность refs (REQ-03). Хелперы `tests/e2e/helpers.js`
      (ensureBuilt/runCli), git-фикстуры в tmp. — design §Контракты, test-plan.
- [x] **T3 (L1): интеграция и полный гейт.** → сделано: check 2092/2092, e2e 244/244 (после 1b0e87a); живой прогон worktree: PASS/0, повтор идентичен (норм. времени); замеченные флаки `memory-sync`/`skill-runtime-helpers` — вне среза, в финальных прогонах зелёные. `npm run check`, `npm run e2e`,
      повторные прогоны сценариев на реальном состоянии для отчёта приёмки L0.
- [x] **T4 (L2-C, reviewer): независимое ревью** соответствия design/REQ и качества. → сделано: reject (C-1, C-2 major) → fix-раунд 1b0e87a (unit 34/34) → верификация **approve_with_minor**, N-1..N-3 закрыты (CR-03).
- [x] **T5 (L1): регистрация документов** в памяти Wolf. → сделано: коммиты fe448f8..1b0e87a (7 блоков); note-регистрация поставки — mem_20261103_b05_git_inspect_delivery (см. отчёт L1); merge/релиз — после приёмки L0.

Порядок: T1 → T2 (тот же результат, continue) → T3 → T4 → T5; правки по T4 —
цикл не более двух на задачу, затем пересмотр L1.

<!-- Чекбокс [x] ставит L1 после проверки; рядом revision/evidence. -->
