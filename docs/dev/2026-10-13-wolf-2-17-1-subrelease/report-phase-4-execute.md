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

## Промежуточный отчёт 2: T2 (после интеграции)

### Статус: COMPLETE (принято L1, интегрировано в main)

- **base_sha**: 5bf434f (ветка feature/2-17-1-t2-req03-face-op, merge с main)
- **Коммиты**: 4e35cb5 (T2), merge в main; [x] в плане
- **Исполнение**: worker-implementer: NEEDS_CONTEXT (2 контракта вне allowlist, доказано PROOF-тестами) → L1 расширил allowlist (memory-types.ts, cli.md-регенерация; урок зафиксирован) → перезапуск: DONE → ревью worker-reviewer: CHANGES_REQUIRED (M1 + 3 minor) → фикс-раунд: DONE.

### Изменения (12 файлов, allowlist соблюдён)
- `src/app/use-cases/face-operation.ts` (новый) — механизм операций §3.3: op_started/op_step/op_committed/op_aborted, цепочка add_face→g17_record→proposal_relation→activate→supersede_prev→announce→op_committed, reconcile по store, resume/abort, усыновление по op_id, авто-resume, doctor-API, fault-seam, safeIndex
- `src/domain/schemas/memory-event-schema.ts` — 4 события memory.face.op_*
- `src/domain/memory-types.ts` — face lifecycle += candidate, fields += op_id (ADR-3, санкционировано L1)
- `src/app/use-cases/create-face-version.ts` — guard/валидация до op_started под lock → делегирование runFaceMutation
- `src/adapters/cli/commands/face.ts` — --op-id, recover <opId> [--abort], list скрывает candidate
- `src/adapters/cli/commands/memory-doctor.ts` — секция «Face operations» (issue + opId + подсказка recover)
- `docs/reference/cli.md` — только регенерация (идемпотентность доказана ревью)
- тесты: integration face-operation-recovery (16), unit face-operation (8), unit face-recover-cli (5), memory-doctor (7), taxonomy-пин обновлён

### Fault-матрица F1–F8 (T2-часть): все GREEN
F1 add_face / F2 g17_record / F3 proposal_relation → «не применено», resume доводит, candidate скрыт (canon=null до activation); F4 activate / F5 supersede_prev / F6 announce / F7 op_committed → «применено, требуется восстановление следа», resume дописывает ровно недостающее (идемпотентно); F8 FTS → операция успешна (индекс производный), rebuild лечит. Общие проверки матрицы (1)–(4) в каждом F; S-28 усыновление (3 случая), S-29 авто-resume (иной input + same-input), S-30 abort/doctor-матрица.

### Ревью: находки → исход
- M1 (major): ветка same-input авто-resume не покрыта тестом → integration-тест добавлен, RED-чувствительность доказана (ветка отключалась → тест ловит дубль версий; восстановлена байт-в-байт)
- m1: doctor-CLI печать под ассертом (7/7)
- m3: canon/доставка-ассерты добавлены в F2/F3/F8
- m2: recover без guard по актору — по design не требуется; путь включён в аудит T3 (S-36), передано

### Evidence
- Верификация L1: integration 16/16, tsc чист, allowlist-проверка
- Полный гейт после интеграции: `npm run check` GREEN — 1365 тестов на main
- Отклонения исполнителя: same-input=resume (выведено из AC-2, обосновано ревьюером, теперь покрыто тестом); prettier-only правка отчёта фазы; +memory.transitioned на activate/abort (консистентно с объектным журналом)

## T3 ∥ T4 — в исполнении (параллель по плану: разные файлы, раздельные worktree)

