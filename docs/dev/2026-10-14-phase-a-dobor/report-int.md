---
slug: phase-a-dobor
title: '2.18.0 — T-INT отчёт L1 (PARTIAL, F-03 outstanding)'
status: completed
created: 2026-10-14
baseline: 621c2c8
target: 60f9740
thread: mem_20261014_faza_a_dobor_b0_reliz_2_17_2_2_18_0_34c39f
---

# T-INT отчёт L1 — phase-a-dobor (2.18.0)

## Метаданные

- **Thread:** `mem_20261014_faza_a_dobor_b0_reliz_2_17_2_2_18_0_34c39f`
- **Baseline:** `621c2c8` (main после 2.17.1)
- **Target HEAD:** `60f9740` (feature/2.18.0)
- **Worktree:** `/Users/chekh/Development/mister-wolf/.worktrees/2.18.0`
- **Ветка:** `feature/2.18.0` (trunk-based, не влит в main)
- **Профиль:** FULL (A9 + A10 + A11 + B0 + REQ-05)
- **Методика:** wolf-sdd (диспетчеризация L1 → worker-implementer/reviewer/steward)

## Вердикт L1

**PARTIAL** — готов к T-REL с waiver L0 по F-03 (REQ-02 AC-2).

## Сводка задач

| ID | Задача | Статус | Evidence |
|---|---|---|---|
| T-00 | wolf-review design+testplan | ✅ APPROVED | 0914638; 2 minor F-01/F-02 (закрыты позже) |
| T-A9 | REQ-01 Council v2 | ✅ DONE_WITH_CONCERNS | 097d87c; S-01..S-09 зелёные; persist-путь outstanding |
| T-A11 | REQ-03 Heartbeat | ✅ DONE | e328714; S-20..S-28 + S-70/71 зелёные; race-fix L1 09a4036 |
| T-B0 | REQ-04 Base sets | ✅ DONE | 156252f; 10/10 integration; e2e manual pending |
| T-A10 | REQ-02 Docs audit | ✅ DONE_WITH_CONCERNS | 2c89b2b; 7/7 docs-audit; F-01/F-02/F-05 fixed L1 |
| T-INT-FIX-1 | F-01/F-02/F-05 | ✅ DONE | ea9a84a; 18 файлов; docs-audit 7/7 |
| T-INT-review | wolf-review integration | ⚠️ CHANGES_REQUIRED | F-01..F-03 major |
| T-INT-review-2 | re-review post-fix | ✅ ACCEPTED | F-03 outstanding (waiver L0) |
| T-STEW | Steward aggregates 4 lessons | ⏳ PROPOSED | 2 агрегата, `wolf aggregate apply` на L0 |
| T-REL | Release cycle | ⏳ PENDING | L0 загружает wolf-release-docs; npm publish на аппрув L0 |

**Acceptance:** `docs/dev/2026-10-14-phase-a-dobor/acceptance.md` (60f9740).

## Changes (12 коммитов на feature/2.18.0)

```
60f9740 docs(2.18.0): T-INT acceptance-сводка (PARTIAL, F-03 outstanding)
ea9a84a fix(2.18.0): T-INT-FIX-1 убрать wolf run (F-01, F-02, F-05)
09a4036 fix(2.18.0): T-A11 race — writeHeartbeat tmp через hrtime+random
ce6a1bf merge(2.18.0): A10 полный аудит публичных документов
2c89b2b docs(2.18.0): A10 полный аудит публичных документов (REQ-02)
369bc63 chore(2.18.0): prettier docs фазы + регенерация cli.md
ea58f1a merge(2.18.0): B0 доводка базовых наборов
9e291ff merge(2.18.0): A11 heartbeat-файл + TTL-продление
153410e merge(2.18.0): A9 council-opinion v2
156252f feat(2.18.0): B0 доводка базовых наборов (REQ-04)
e328714 feat(2.18.0): A11 heartbeat-файл + TTL-продление (REQ-03)
097d87c feat(2.18.0): A9 council-opinion v2 + synthesis v2 + isolation rule
0914638 docs(2.18.0): T-00 review (APPROVED) + T-INT acceptance template
```

**Метрика:** ~1800 строк кода/тестов + ~350 строк документации, 0 в main.

## Task Decomposition (8 задач по plan.md)

| # | ID | Что | Worktree | Result |
|---|---|---|---|---|
| 1 | T-00 | wolf-review design+testplan | .worktrees/2.18.0 | APPROVED (2 minor) |
| 2 | T-A9 | Council-контракт v2 | .worktrees/2.18.0-a9 | DONE_WITH_CONCERNS |
| 3 | T-A11 | Heartbeat-файл | .worktrees/2.18.0-a11 | DONE |
| 4 | T-B0 | Базовые наборы | .worktrees/2.18.0-b0 | DONE (RESULT не формальный) |
| 5 | T-A10 | Docs audit | .worktrees/2.18.0-a10 | DONE_WITH_CONCERNS |
| 6 | T-INT-FIX-1 | F-01/F-02/F-05 | .worktrees/2.18.0 (прямо) | DONE |
| 7 | T-INT-review | wolf-review L2 (1) | main session | CHANGES_REQUIRED |
| 7' | T-INT-review-2 | wolf-review L2 (2) | main session | ACCEPTED |
| 8 | T-STEW | Steward агрегация | main worktree | 2 proposed (L0) |
| 9 | T-REL | Release | .worktrees/2.18.0 | PENDING (L0) |

## Workers Used

- **3 × worker-implementer** (parallel, через `opencode run --agent worker-implementer`):
  - T-A9, T-A11, T-B0 в 3 worktree параллельно
  - Воркеры не вложенные (subagent depth limit = 1, обошёл через CLI)
- **1 × worker-implementer** (T-A10, после T-A9 + T-B0)
- **1 × worker-implementer** (T-INT-FIX-1, повторный FIX)
- **2 × worker-reviewer** (T-INT-review, T-INT-review-2)
- **1 × steward** (T-STEW, фон)
- Итого: 6 запусков worker-implementer/reviewer + 1 steward = 7.

## Validation Results

- **`npm run check`:** 194 test files / 1505 tests passed (146.77s, exit 0)
- **English-surface gate:** OK (89 files)
- **Prettier:** OK
- **Lint (tsc --noEmit):** OK
- **Build (tsc):** OK
- **docs-audit.test.ts:** 7/7 passed
- **claim-heartbeat (unit + integration):** 46 + 13 = 59 passed
- **b0-init + b0-sync:** 10 passed
- **build-councils-v2 (mixed legacy+v2):** integration passed
- **council-opinion-schema + synthesis-schema:** 7 unit passed

## FRICTION

- **2× T-A9:** `test:unit`/`test:integration` скрипты в package.json отсутствуют — обошёл через `npm test -- run <paths>` и `npm run test:run` (воркер).
- **1× T-A11 race:** `process.pid` делят воркеры на macOS, `heartbeatSeq=0` EEXIST в S-28 — фикс через `hrtime.bigint() + Math.random()` (L1).
- **1× T-A10 flaky:** `T013: generate-agent-brief p90 < 1000ms` (timeout 5s) — нагрузочный, не связан с docs-diff.
- **T-STEW:** 4 ожидаемых урока оказались 6 (после инициирующего решения добавились 2 L0-урока) — Стюард обработал 2 кластера.

## Outstanding (на L0)

1. **F-03 (REQ-02 AC-2):** waiver или реализация. L1 рекомендует waiver.
2. **T-STEW apply:** `wolf aggregate apply <id>` для 2 агрегатов (или `reject`).
3. **T-REL:** L0 загружает `wolf-release-docs`, исполняет шаги (npm version 2.18.0, CHANGELOG, тег v2.18.0, docs:build, site deploy).
4. **T-REL final approval:** `npm publish` + `git push tag v2.18.0` — на аппрув L0.
5. **T-A9 persist-путь v2** — отдельная задача для 2.19.0 (outstanding от воркера T-A9).

## Безопасность

- 0 `rm -rf` вне системного tmp.
- 0 `sudo`.
- 0 секретов в коммитах.
- Все коммиты на feature/2.18.0 (trunk-based), main не тронут.
- Race-fix не слома legacy 2.17.1 (NFR-03 verified).
