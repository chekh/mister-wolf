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

- [ ] **T1 (L2-A, implementer): реализация команды + unit-тесты + текст wolf-git.**
  `src/app/use-cases/git-inspect.ts` (collectGitFacts, computeVerdict,
  GitInspectReport), `src/adapters/cli/commands/git-inspect.ts`, регистрация в
  `src/adapters/cli/cli-entry.ts`, unit `tests/unit/use-cases/git-inspect.test.ts`
  (таблица решений, санитизация, таймаут, exit-коды), правка
  `templates/base/skills/wolf-git/SKILL.md` по REQ-06. — design §Компоненты,
  §Контракты; базлайн `src/adapters/cli/commands/memory-scan.ts:6`,
  `src/adapters/cli/cli-entry.ts:100`.
- [ ] **T2 (L2-A continue): e2e-сценарии на реальном состоянии.**
  `tests/e2e/git-inspect.e2e.ts`: clean/dirty/unfinished-merge/ahead/behind/
  unreachable-remote/no-remote + повторный запуск (стабильность, REQ-05) +
  неизменность refs (REQ-03). Хелперы `tests/e2e/helpers.js`
  (ensureBuilt/runCli), git-фикстуры в tmp. — design §Контракты, test-plan.
- [ ] **T3 (L1): интеграция и полный гейт.** `npm run check`, `npm run e2e`,
  повторные прогоны сценариев на реальном состоянии для отчёта приёмки L0.
- [ ] **T4 (L2-C, reviewer): независимое ревью** соответствия design/REQ и
  качества; findings с ID, вердикт.
- [ ] **T5 (L1): регистрация документов** в памяти Wolf (note, зарегистрированный
  документ этапа) + коммиты после завершённых блоков; merge/релиз — вне плана
  (после приёмки L0).

Порядок: T1 → T2 (тот же результат, continue) → T3 → T4 → T5; правки по T4 —
цикл не более двух на задачу, затем пересмотр L1.

<!-- Чекбокс [x] ставит L1 после проверки; рядом revision/evidence. -->
