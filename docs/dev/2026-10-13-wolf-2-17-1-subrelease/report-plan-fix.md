# Отчёт: правки по ревью фазы 3 + раунд 2 (план и тест-план 2.17.1)

- **task_id:** wolf-2171-plan-fix
- **Дата:** 2026-10-13
- **Автор правок:** L1 (executor-lead), сессия ses_eca1d252effeuotRP0eEzUoWJv (продолжение)
- **Артефакты:** `plan.md`, `test-plan.md` (база 6556f57 + правки этого отчёта; коммит — см. RESULT L1, файл входит в тот же коммит)
- **Вход:** report-plan-review.md (раунд 1: 0 critical / 2 major / 5 minor, CHANGES_REQUIRED) + решение L0 по S-17
- **Методика:** wolf-review (цикл исправлений), receiving-code-review (обработка находок), продолжение wolf-plan/wolf-testplan

## Ответы на находки раунда 1

| finding | Исход | Действие |
| --- | --- | --- |
| P-M1 (Major) | ACCEPTED | plan.md: allowlist T6 — вместо `docs/**` явные пути (`docs/dev/2026-10-12-wave-2-17-faces/report-wave-2-17-execute.md`, `docs/dev/roadmap/wave-2.17.md`) + явный запрет каталога `docs/dev/2026-10-13-wolf-2-17-1-subrelease/**`; allowlist T7 сужен до `artifacts/**` + отчёт фазы T7, `plan.md`/чекбоксы — зона L1; из цели T7 убрана «фиксация [x] в плане» (write-зоны разведены явно; plan.md «[x] ставит L1» не нарушается) |
| T-M1 (Major) | ACCEPTED | test-plan: F5 → «выполнены шаги 1–5, resume дозавершивает только `announce` + `op_committed`»; F6 → «выполнены шаги 1–6, только `op_committed`» (опечатка «comitted» устранена); F7 — семантика зафиксирована («сбой записи `op_committed`»: шаги 1–6 целы — не потеря первичных данных, после восстановления — «завершено») + абзац «Oracle ядра REQ-03» (первичные данные vs производный FTS-индекс, по REQ-03 AC-4) |
| P-m1 (minor) | ACCEPTED | plan.md T2: якорь «+ NFR-02 (полный след читаем — матрица F1–F9, S-30; вклады T5/S-42 и T6/S-52 — карта покрытия test-plan)» |
| P-m2 (minor) | ACCEPTED | test-plan R2-02: «подстановка `{{model.*}}` (`{{model.primary}}`; у worker-implementer — `{{model.worker}}`, по факту шаблонов)» |
| T-m1 (minor) | ACCEPTED | Oracle-строки добавлены в 9 сценариев: S-07 (REQ-01 AC-5 + §3.6 diverged), S-16 (REQ-02 AC-6 + §3.2), S-17 (AC-6 + §3.1/§3.2 + решение L0), S-28 (REQ-03 AC-1/AC-2 + усыновление), S-29 (AC-2 + авто-resume), S-30 (AC-5 + doctor), S-41 (REQ-05 AC-2 + явная передача), S-44 (REQ-06 AC-1), S-49 (REQ-07 AC-5) |
| T-m2 (minor) | ACCEPTED | `supersede_legacy` включён в матрицу как F9 (шаг migrate между `supersede_prev` и `announce`, design §3.4; состояние и идемпотентный skip зафиксированы); упоминания согласованы: S-32 → «F1–F9», NFR-02 → F1–F9, карта покрытия → F1–F9 |
| T-m3 (minor) | ACCEPTED | S-14: механизм порчи зафиксирован (указатель `.git` worktree → несуществующий путь, падение `git worktree list --porcelain`; отдельный случай — вне git), результат — ассерты (stderr-предупреждение + отсутствие чужих инъекций) |
| S-17 (решение L0) | ВНЕСЕНО | Маркер открытого вопроса снят; в test-plan записано: «Решение L0 (2026-10-13): exit 0 подтверждён — promote при `id === null` это корректный пустой результат («0 promoted + честный отчёт, объекты не изменены»), не ошибка операции; деривация из design подтверждена независимым ревью» |

## Раунд 2 (независимый worker-reviewer, чистая сессия)

- **Область:** plan (T6/T7 write-зоны, якорь NFR-02), test-plan (F5–F7/F9, Oracle-строки, S-14/S-17, R2-02, карта покрытия).
- **SUMMARY: 0 critical / 0 major / 1 minor — VERDICT: APPROVED.**
- P-M1 и T-M1 подтверждены закрытыми; все minor раунда 1 закрыты; привязки Oracle→AC сверены с requirements (неверных нет); регрессий не найдено; решение L0 по S-17 зачтено.
- **R2-01 | Minor | атрибуция F9 между T2 и T3** — ACCEPTED и исправлено в этом же цикле: вводка матрицы дополнена «F1–F9 реализуются в наборе T2 на механизме §3.3 (F9 — операция с command `migrate` через общий механизм, без `migrate-faces.ts`); S-32 (T3) перепроверяет F1–F9 реальной командой `wolf face migrate`». Non-blocking.

## Границы

- REQ/не-цели не менялись; правки не выходят за находки раунда 1 и решение L0 по S-17.
- Коммит: план/тест-план/отчёт ревью (раунд 1)/этот отчёт; push не выполнялся (по брифу).
