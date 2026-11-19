---
slug: release-340-plan
title: План релиза 3.4.0 — состав работ, порядок, гейты
status: proposal — на утверждении ведущего
created: 2026-11-19
---

База: `en-base-wave` от `7c3674ba` (тег v3.3.2), рабочее дерево чистое.
Версия релиза: **3.4.0** (SemVer minor — D-340-1). Реализация — один
wolf-developer (TDD red→green на базе `7c3674ba`), гейты и релиз — ведущий
(D-340-3). Входы: requirements.md (заморожены), design.md (ADR-340-1..6),
test-plan.md (метки T-333-x.y). Порядок задач линейный (один исполнитель);
указанные зависимости фиксируют допустимые перестановки.

# T1 — единый валидатор строки журнала (REQ-333-3, ADR-340-4)

`parseJournalLine` в `jsonl-micro-note-delivery-log.ts`; подключение в `load`,
`repairTail` (финализация/обрезка/отказ), `isCompleteJournalLine` упраздняется.
Тесты T-333-3.1–T-333-3.3 (сначала красные на базе). Файлы: адаптер,
`tests/unit/adapters/fs/jsonl-micro-note-delivery-log.test.ts`.
Проверка задачи: unit красный→зелёный; T-332-3.x остаются зелёными.

# T2 — синхронный журнальный лок (REQ-333-2, ADR-340-1)

`withJournalLockSync` в `memory-lock.ts` (O_EXCL, {pid, ts}, retry 100 мс,
maxWait 5 с, steal-by-age 30 с, блокирующая пауза `Atomics.wait`); обёртка
всех публичных методов адаптера; `LockHeldError` → `UserFacingError`. Хелпер
`tests/helpers/journal-pause.cjs` (порт `pause333.cjs`). Тесты
T-333-2.1–T-333-2.3 (integration, реальные процессы). Зависимость: T1.
Проверка задачи: три гонки стенда r2a/r2b/r2c на кандидате зелёные.

# T3 — маркер миграции, fail-closed утрата (REQ-333-4, ADR-340-2)

Маркер `micro-note-delivery.migrated.json` (tmp+rename в критической секции
первого импорта), самозаживление, `JournalStateUnknownError`, fail-closed во
всех публичных методах, suspend micro-notes + строка-уведомление в brief/call.
Тесты T-333-4.1 (integration, реальные процессы) + unit машины состояний.
Зависимость: T1, T2. Проверка задачи: T-333-4.1 зелёный; r4-сценарий на
кандидате не воскрешает SQLite.

# T4 — импорт wt-журналов, команды import/restore (REQ-333-1, ADR-340-3)

`listWorktreeCheckouts` в `memory-root.ts` (рефакторинг
`liveWorktreeBasenames` без смены поведения); первый импорт (SQLite + wt,
порядок слияния, дедуп, re-id), `importWorktreeJournals`/`restoreFromSources`,
CLI `contradict import` / `contradict restore` с отчётом. Тесты
T-333-1.1–T-333-1.4, T-333-4.2, T-333-4.3 (integration, реальный git worktree,
реальные процессы). Зависимость: T1–T3. Проверка задачи: все пять зелёные;
повторный import идемпотентен (снимки журналов равны).

# T5 — ревизия наблюдения в report (REQ-333-5, ADR-340-5)

`observed_revision` в use-case (нормализация, префикс-сравнение, запись под
наблюдаемую ревизию + предупреждение); CLI `report --revision`; MCP-схема
report-ветки + текст ответа. Тесты T-333-5.1, T-333-5.2 (e2e spawn + MCP
stdio). Зависимость: T1 (стиль ошибок). Проверка задачи: обе зелёные;
сценарий r5 на кандидате — v2 доставляется.

# T6 — честные статусы list/resolve (REQ-333-6)

`suppressionBlockState`: не-deliverable заметка → `unknown`; хелпер
`deliverableMicroNote`; вывод `list` c `deliverable: …`; вывод и help resolve
без обещания доставки + статус остаточной блокировки; MCP resolve — тот же
статус. Тесты T-333-6.1, T-333-6.2 (unit + e2e spawn). Проверка задачи: обе
зелёные; help resolve не содержит обещания возобновления.

# T7 — один снимок и батч доставок (REQ-333-7, ADR-340-6)

`recordDeliveries` в порт+адаптер (один лок/repair/append); brief и call —
один `suppressions()` на вызов, один батч, обработка loss через
`JournalStateUnknownError`; ограниченное хвостовое чтение в `repairTail`.
Тесты T-333-7.1 (структурный guard). Зависимость: T2–T4 (адаптер стабилен).
Проверка задачи: guard зелёный (≤2 чтений, 1 append на вызов).

# T8 — интеграция и регрессия

Прогон: полный `env -u WOLF_SESSION npm run check` + `npm run e2e`; три
сценария ревью 3.3.1 без изменений; сквозной стенд repro-333 (r1..r7) на
собранном кандидате, включая измерение T-333-7.2 (медиана ≤ 3.3.1×1.10,
evidence r7-340-times.txt). Исполнитель возвращает доказательства (файлы
стенда + выводы гейтов). Зависимость: T1–T7. Проверка задачи: все гейты и
стенд зелёные, критерий AC-7.2 выполнен; расхождение — вопрос ведущему.

# T9 — документация

`CHANGELOG.md`: `[3.4.0] - 2026-11-19`, секции Fixed (7 дефектов) + Added
(`--revision`/`observed_revision`, `contradict import`, `contradict restore`).
`docs/reference/cli.md` и mcp-документация сайта — новые флаг/команды/поле,
обновлённые тексты help; границы утраты/restore — в docs. `npm run docs:verify`
зелёный. Зависимость: T8 (заморозка формулировок). Проверка задачи: docs:verify
зелёный, guard-тесты каталога MCP зелёные.

# T10 — гейт ведущего и релиз (не делегируется)

1. Приёмка результата разработчика, независимое ревью (wolf-reviewer).
2. `env -u WOLF_SESSION npm run check`, `npm run e2e`, `docs:verify`,
   стенд r1..r7 — лично.
3. Коммит волны (код + тесты + CHANGELOG + dev-пакет) → `npm version 3.4.0` →
   `node scripts/generate-update-map.mjs` → коммит → локальный check → push →
   PR → merge → тег `v3.4.0` → контроль Publish → пост-проверки (npm latest,
   GitHub Release, сайт, смок артефакта: r1/r4/r5-инварианты на
   опубликованном).

# Останов и риски

- Стоп-условие исполнителя: T1–T7 красный→зелёный, T8 гейты зелёные; любые
  расхождения с design/test-plan — вопрос ведущему, не самостоятельное
  расширение (в т.ч. смена семантик ADR — только через ведущего).
- Риск таймингов гонок в CI (медленные раннеры): паузы тестов конфигурируемы,
  maxWait лока 5 с; при флаках — вопрос ведущему, не увеличение пауз молча.
- Риск AC-7.2: если медиана выше порога — вернуть ведущему с профилем
  (repairTail-чтение, валидатор), не ослаблять критерий.
- Компакция журнала, async-лок порта — будущие CR, в 3.4.0 не входят.
