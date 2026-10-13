---
slug: wolf-2-17-1-subrelease
title: '2.17.1 — фаза 4: исполнение (отчёт L1, пополняемый)'
status: in-progress
created: 2026-10-13
plan: docs/dev/2026-10-13-wolf-2-17-1-subrelease/plan.md
test-plan: docs/dev/2026-10-13-wolf-2-17-1-subrelease/test-plan.md
---

# Фаза 4 — исполнение T1..T7 (wolf-sdd)

Методика: wolf-sdd (исполнение утверждённого плана) + test-driven-development.
Порядок: T1 → T2 → (T3 ∥ T4) → T5 → T6 → T7. Интеграция — L1; воркеры — чистые
сессии с allowlist из плана; каждый отчёт воркера принят по RESULT-контракту,
независимое ревью каждой задачи, финальное интегральное код-ревью — перед
финальным пакетом.

## Промежуточный отчёт 1: T1 (после интеграции)

### Статус: COMPLETE (принято L1, интегрировано в main)

- **base_sha**: b6852e1 (ветка feature/2-17-1-t1-req02-scope)
- **Коммиты**: d7859f5 (T1), merge 11d62d5 в main; [x] в плане — 5bf434f
- **Исполнение**: worker-implementer (воркер-1): DONE_WITH_CONCERNS → ревью
  worker-reviewer: CHANGES_REQUIRED (MAJOR-1 + 3 minor) → фикс-раунд
  (worker-implementer, воркер-2): DONE, все находки устранены.

### Изменения (8 файлов, allowlist соблюдён)

- `src/adapters/fs/memory-root.ts` — WT-ID `worktree:w-<12hex sha1(realpath)>`, resolveWorktreeIdentity, fail-closed
- `src/app/use-cases/get-call-injections.ts` — isVisible во всех 5 ветвях, scopeConflicts, stderr-предупреждения, R2-01 fallthrough (чужой WT-ID-токен → legacy-разбор)
- `src/app/use-cases/promote-memory.ts` — promote обоих токенов владельца; неоднозначный legacy → конфликт; null-identity → 0 promoted/exit 0 (S-17, решение L0)
- `tests/e2e/worktree-memory.e2e.ts` — переписан под контракт 2.17.1 (был закодирован контракт 2.16)
- тесты: unit (3 файла переписаны) + integration worktree-scope-isolation (S-10…S-18)

### Evidence

- RED/GREEN: 2 волны TDD (RED-wave1/GREEN-wave1, RED-wave2/GREEN-wave2), e2e RED-базлайн 2 failed → GREEN
- Верификация L1: integration 9/9, e2e точечный 4/4, allowlist-проверка diff — чисто
- Полный гейт после интеграции: `npm run check` GREEN — 174 файла / 1335 тестов
- Полный e2e: `npm run e2e` GREEN — 220/220 (59 файлов)

### Ревью: находки → исход

- MAJOR-1: tests/e2e/worktree-memory.e2e.ts кодировал отменённый контракт 2.16 → устранено (переписан: WT-ID-ассерт, S-17 из main + S-15 из копии, orphan-тест на предсказуемой фикстуре), полный e2e 220/220
- MINOR-1 (R2-01 fallthrough): устранено, 2 RED→GREEN теста
- MINOR-2 (дыра предупреждения при сбое git worktree list): устранено, RED→GREEN
- MINOR-3 (S-17 exit 0 на CLI): устранено в e2e (CLI-спавн — единственное место реального процесса); отклонение от буквы «в integration» зафиксировано честно
- Вне мандата (пре-существующее, 2.14): banner уроков считает по всему пулу включая чужие worktree-scoped объекты (утекает счётчик, не контент) → риски фазы, бэклог

### Отклонения/уроки

- Урок зафиксирован (mem_20261013_smena_kontrakta_e2e_nabor_tests_e2e_vne_a8fa85): e2e-набор вне npm run check — при смене контрактов гонять целевой e2e + grep по каталогу
- pre-existing format:check красный на 11 doc-файлах фаз 1–3 → prettier-фикс отдельным коммитом 6c97743 до интеграции T1 (семантика не менялась)
- concern T2-зоны: doctor не знает про WT-ID-токены (ложные orphan для WT-ID-объектов) и не показывает scopeConflicts — memory-doctor.ts в allowlist T2, покроется там (S-13 doctor-часть)

## T2 — в исполнении
