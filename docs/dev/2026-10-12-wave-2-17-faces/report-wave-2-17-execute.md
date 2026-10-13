---
slug: wave-2-17-faces
title: wave-2.17-faces — исполнение (T-01…T-11)
status: in-progress
created: 2026-10-13
updated: 2026-10-13
---

# wave-2.17-faces — отчёт исполнения

## Metadata

- TASK: wave-2.17-execute; THREAD: mem_20261012_2_17_litsa_artefakt_versii_mutatsiya_vol_b69113
- L1: executor-lead (wolf-sdd); воркеры: worker-implementer / worker-reviewer.
- Worktree: `.worktrees/wave-2.17-faces`, ветка `wave-2.17-faces`, base = 269d549 (main).
- Baseline-гейт: `npm run check` ЗЕЛЁНЫЙ — 164 test files / 1233 tests (2026-10-13, worktree, после npm ci).
- Журнал восстановления: этот файл + git log ветки. Обновляется после каждой задачи.
- FRICTION: 1× read/edit-инструменты — для файлов, созданных после старта сессии в `.worktrees/…`, видят «призрачную» копию с искажённым именем (`report-wave.2.17-execute.md` вместо `-2-17-`), отдают «File not found» по реальному пути; обошёл через write (полная перезапись файла) + shell/rtk для верификации (git видит реальное состояние).

## Summary

Исполнение волны 2.17 «Лица» по plan.md (T-01…T-11), вариант Б (CR-2026-10-13-02).
Статус по задачам — в таблице; детали/evidence — в Changes по каждой задаче.

| Задача | Статус | Примечание |
|---|---|---|
| T-01 face+proposal схемный фундамент | DONE (принято L1) | commit после сводки |
| T-02 createFaceVersion + guard | pending | — |
| T-03 G17-запись мутации | pending | — |
| T-04 CLI `wolf face` | pending | — |
| T-05 миграция + alias + seed | pending | — |
| T-06 doctor NFR-02 + memory-sync | pending | — |
| T-07 guard `wolf add` | pending | — |
| T-08 wolf-router вариант Б | pending | — |
| T-09 proposals save/deliver + CLI | pending | — |
| T-10 интеграция + e2e + полный гейт | pending | — |
| T-11 документация/сайт/версия (без публикации) | pending | — |

## Task Decomposition

Декомпозиция задана планом (T-01…T-11, сверка план↔test-plan в plan.md).
Исполнение — воркеры worker-implementer (L2), проверки соответствия/качества — L1 +
worker-reviewer (после T-08 и T-10). Класс задач MEDIUM — код только через воркеров.

## Workers Used

| Задача | Воркер | Исход |
|---|---|---|
| T-01 | worker-implementer (ses_ecbe897e1ffeAksUlbNbPzBlNt) | DONE_WITH_CONCERNS → принято L1 после сверки diff |

## Validation Results

### T-01 (2026-10-13, worktree)

- `npx vitest run tests/unit/domain/` — ✅ 24 файла / 166 тестов passed.
- `npx tsc --noEmit` — ✅ exit 0.
- `npx vitest run tests/unit/` (ripple-контроль сверх плана) — ✅ 154 файла / 1219 тестов passed.
- `npx prettier --check` (9 тронутых файлов) — ✅ clean.
- TDD соблюдён: красный прогон (12 failed) → реализация → зелёный.

## Changes

### T-01 — схемный фундамент `face` + `proposal`

Файлы (9, numstat +315/−29):
- `src/domain/memory-types.ts` — `face` в CORE_TAXONOMY_DECLS (owner_skill/version/reason required, based_on optional, initiator enum steward|owner|breakglass|migration|seed, lifecycle active/superseded/archived, subdirShared faces); DEFAULT_CHARACTER_FACETS += 'proposal' (7→8); SIGNAL_FACETS=['proposal'].
- `src/domain/type-schema-builder.ts` — PROPOSAL_FACET/PROPOSAL_CONTRACT_FIELDS (addressee, basis, proposed_change, expected_benefit, applicability_bounds); facet-enum из SIGNAL_FACETS для не-note core-типов (инжект в buildTypeSchema, не в decl.fields — иначе CLI-генератор делает --facet mandatory); superRefine: facet='proposal' ⇒ все 5 полей обязательны и непусты.
- `src/domain/schemas/memory-event-schema.ts` — enum += memory.face.versioned/breakglass/denied, memory.proposal.delivered + payload-ключи по design.
- Тесты: taxonomy.test.ts (якорь 7→8, состав, словарь фасетов 8/10), type-schema-builder.test.ts (контракт face + proposal на note/decision/face, отсутствие любого поля вкл. applicability_bounds — отказ), memory-event-schema.test.ts (новые события + payload).

Отклонения от allowlist (приняты L1, обоснованный ripple):
1. `src/domain/facet-colors.ts` +1 — цвет proposal (тест итерирует словарь).
2. `src/adapters/cli/type-command-generator.ts` +2 — ключ face в Record (tsc), runtime инертен.
3. `tests/unit/use-cases/add-memory-object.test.ts` 2/2 — regex-якоря списка фасетов.

Передачи/риски:
- Ожидаемый красный до T-07: e2e `generic-add.e2e.ts` (инвариант «TYPES покрывает MEMORY_TYPES»); guard `add --type face` — T-07.
- `based_on` не nullable (алфавит FieldSpec): первая версия опускает поле; расширять FieldSpec только если T-02 упрётся.
- payload `memory.face.breakglass` зеркалит versioned (наличие ключей) — правится одной строкой при необходимости в T-02/T-04.
