# L1-отчёт: phase-a-dobor — драфт требований 2.18.0

## Metadata

- task_id: phase-a-dobor-2.18.0
- thread: `mem_20261014_faza_a_dobor_b0_reliz_2_17_2_2_18_0_34c39f`
- base_sha: 621c2c8 (HEAD main после 2.17.1)
- worktree: `.worktrees/2.18.0` (ветка `feature/2.18.0`)
- режим: FULL (несколько компонентов, новые контракты; миграции возможны — A9 расширяет типы памяти, A11 меняет контракт claim-реестра)
- allowlist записи: `docs/`, `src/app/`, `src/core/`, `src/adapters/`, `templates/base/`, `tests/`, `CHANGELOG.md`, `README.md`, `README.ru.md`, `package.json`
- стадия: стадия 1 (Requirements) — драфт для утверждения L0

## Summary

Подготовлен драфт требований `requirements.md` для релиза 2.18.0. Покрыты все REQ-01..05 из брифа (A9, A10, A11, B0, релиз). Зафиксированы 7 открытых вопросов (OQ-01..07), критичные для старта design: OQ-01 (TTL), OQ-04 (heartbeat vs TTL-маркер), OQ-05 (объём A10). Design, plan, test-plan и реализация НЕ начаты — ожидается утверждение L0 требований и ответы на OQ.

## Changes

| Действие | Файл                                                                  | SHA до/после    |
| -------- | --------------------------------------------------------------------- | --------------- |
| create   | `.worktrees/2.18.0/docs/dev/2026-10-14-phase-a-dobor/requirements.md` | new (176 строк) |
| create   | `.worktrees/2.18.0/docs/dev/2026-10-14-phase-a-dobor/.placeholder`    | new (маркер)    |
| branch   | `feature/2.18.0` (от 621c2c8)                                         | —               |
| worktree | `.worktrees/2.18.0`                                                   | —               |

## Task Decomposition

| #   | Что                                        | Статус       | Следующий шаг                                    |
| --- | ------------------------------------------ | ------------ | ------------------------------------------------ |
| 1   | Создать worktree                           | DONE         | —                                                |
| 2   | Папка `docs/dev/2026-10-14-phase-a-dobor/` | DONE         | —                                                |
| 3   | `requirements.md` (REQ-01..05, OQ-01..07)  | DONE (драфт) | L0: утвердить + ответить на OQ                   |
| 4   | `design.md` (технические решения, ADR)     | TODO         | после L0; A11 — выбор механизма                  |
| 5   | `plan.md` (декомпозиция в work-items)      | TODO         | после design; A9/A10/A11/B0 — worktree-задачи L2 |
| 6   | `test-plan.md` (unit + e2e)                | TODO         | параллельно plan                                 |
| 7   | REQ-01 A9 — код + тесты                    | TODO         | worktree `2.18.0-t1-req01-a9`                    |
| 8   | REQ-02 A10 — аудит доков                   | TODO         | worktree `2.18.0-t2-req02-a10`                   |
| 9   | REQ-03 A11 — heartbeat                     | TODO         | worktree `2.18.0-t3-req03-a11`                   |
| 10  | REQ-04 B0 — доводка                        | TODO         | worktree `2.18.0-t4-req04-b0`                    |
| 11  | REQ-05 — релизный цикл                     | TODO         | после всех REQ; скилл `wolf-release-docs` (L0)   |

Классификация (L1 — таблица декомпозиции):

- Шаги 1–6 — TRIVIAL (L1 делает сам): setup + документация.
- Шаги 7–10 — НЕ TRIVIAL → L2 воркеры в worktree (allowlist = один компонент/папка на воркера).
- Шаг 11 — релизный цикл; L1 координирует, L0 принимает.

## Workers Used

- 0 (L1-фаза; воркеры будут задействованы на стадии реализации).

## Validation Results

- `requirements.md` создан в worktree, проверена структура YAML frontmatter, длина 176 строк, AC по каждому REQ.
- Открытые вопросы OQ-01..07 явно выделены в §3 документа.
- Противоречие «TTL 30s (как сейчас)» vs `CLAIM_TTL_MS = 24h` в `claim-registry.ts:26` — зафиксировано как OQ-01, требует решения L0.
- Запрос на утверждение L0 — в §7 документа.

## FRICTION

- 0.

## Open Questions (L0 → L1)

1. Утвердить ли REQ-01..05 в текущем объёме?
2. Ответить ли на OQ-01 (TTL), OQ-04 (heartbeat-файл vs TTL-маркер), OQ-05 (объём A10) до старта design?
3. B0 (REQ-04) — остаётся в 2.18.0 или переносится в 2.18.1?
4. Параллелизм A9/A10/A11/B0 (worktree per REQ) — допустим или строго последовательно?

## Готовность к приёмке L0

- Драфт требований — готов; нужна явная отмашка L0.
- Design — НЕ начат (по протоколу).
- План — НЕ начат (по протоколу).
- Реализация — НЕ начата (по протоколу).
