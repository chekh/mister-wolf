---
slug: unified-update
title: unified-update — отчёт исполнения Ф4
status: final
created: 2026-10-24
---

# unified-update — отчёт исполнения Ф4 (волна 2.19.0)

Executor-lead: сессия exec-2-19-0-unified-update (продолжение; Ф1+Ф2, Ф3 —
ACCEPTED, см. phase{2,3}-execution-report.md). Thread:
mem_20261023_volna_2_19_0_unified_update_odno_obnovle_15b75a.
Ветка dev/unified-update-2-19-0 (тот же worktree).

## Metadata

- Методика: wolf-sdd. Декомпозиция: T7 MEDIUM → воркер (единственная задача
  фазы; новый цикл диспетчеризации, ретраев не было).

## Summary

Ф4 завершена: оркестратор прохода `runUpgradeProjects` (T7) — планы из
реестра+карты, одно подтверждение REQ-02, изоляция сбоев per-project,
парковые счётчики, exit 0/1/2, wiring скана REQ-09. Гейт Ф4 — полный
`npm run check` (см. Validation Results). e2e не требовался (влитий в main
до T13 нет).

## Task Decomposition

| Задача                       | Класс  | Исполнитель | Статус |
| ---------------------------- | ------ | ----------- | ------ |
| T7 оркестратор upgrade-парка | MEDIUM | воркер      | DONE   |

## Changes (коммиты)

- `c0a7be5` T7 runUpgradeProjects (REQ-01/02/05/06/09) — 3 новых файла,
  1306 строк: оркестратор (464) + 18 unit + 3 integration-сценария парка.

## Контрактные решения T7 (приняты lead)

Из отчёта воркера (все приняты):

1. `makeStepDeps: (root) => ProjectStepDeps` в deps — адаптеры шага
   привязаны к корню проекта (Store/EventLog/MemoryLock принимают root в
   конструкторе), один набор deps на парк невозможен.
2. Поле lock названо `upgradeLock` (не `lock`) — коллизия с `SeedDeps.lock`
   (MemoryLock посева).
3. Нечитаемая карта (`loadMap` throw) → exit 1 error-строкой — тот же класс
   гварда, что нечитаемый реестр; fail-safe до любого шага.
4. Скан REQ-09 выполняется только после завершённого прохода (не после
   cancel/пустого реестра); `deps.scan` не передан → скана нет (юнит-контур
   не дёргает домашний каталог T12-дефолтом).
5. Финальная строка exit-таблицы — отдельный line-узел после summary
   (summary всегда `done:false`): суффикс summary у renderer фиксирован и
   не выражает «Done with attention»/«Failed»/«Cancelled…».
6. **updated vs up-to-date — по фактическим действиям шага** (sync
   updated/created/appended, реальные удаления, seeded/legacy-absorbed,
   schema migrated), НЕ по verify.byCode: код `removed` — состояние
   «подтверждённо отсутствует» (идемпотентность NFR-02), иначе повторный
   прогон ложно показывался бы «updated».
7. «Состав (штамп)» в строке плана = max/min `set=` по свидетелю рендера
   (`loadSyncState`+`parseStamp`) — справочно (например
   `composition 2.17.1 (stamps from 2.16.2) → 2.19.0`); контент-сверка —
   зона `--check` (T10).
8. Строки отчёта — EN-перевод вайрфреймов design.

Интеграционная правка lead (по риску воркера, прецедент T5): **`confirm`
получает plans-секцию ReportNode** — до правки колбэк вызывался без планов,
TTY-пользователь подтверждал список вслепую, что нарушало REQ-02/design
(«список+категории → подтверждение»). Сигнатура расширена additively:
`confirm?: (plans: ReportNode) => ...`; T8 перед вызовом рендерит plans
через `renderReport(plans, env)` и показывает ДО вопроса. Тест R02.1 усилен
(проверка аргумента confirm).

## Validation Results

- T7 unit: **18/18** (R01.2, R02.1–R02.4, R05.2, R06.2/R06.3, R11.6, lock ×3,
  нечитаемый реестр, дедуп, скан ×3) — exit 0.
- T7 integration: **3/3** (парк P-clean/P-mutated/P-pinned/P-worktree
  (`git worktree add`)/P-missing + realpath-дубликат + битый-yaml; R01.1,
  R02.5, R05.1, R06.1 (P-future-schema первым → error, второй обновлён,
  exit 1), R06.2, R13.1/R13.3) — exit 0.
- Регрессия соседей (воркер): project-step unit+int, projects-registry,
  upgrade-lock + файлы T7 → **61/61**, exit 0.
- `npx tsc --noEmit` — 0; `npx prettier --check` — pass (после правки lead
  повторный прогон 21/21, tsc 0, prettier unchanged).
- Гейт Ф4: полный `npm run check` (english-surface + format:check + lint +
  build + test:run) — **205 файлов, 1667/1667 тестов, exit 0** (1646 Ф3 +
  21 T7) на итоговом дереве Ф1–Ф4 в worktree.

## COMPLAINT-TRIAGE / FRICTION

`COMPLAINT-TRIAGE: seen 0 → resolved 0 / rejected 0 / escalated 0 / open 0`
(очередь пуста при приёмке).

FRICTION (продолжение): rtk-хук подменял вывод npm-команд у воркера T7 —
обход «вывод в файл + чтение» из урока
mem_20261023_rtk_khuk_iskazhaet_vyvod_npm_komand_dlya_bfe67a сработал
штатно. Новых системных проблем нет.

## Риски / что дальше (Ф5)

Для T8 (CLI-транспорт) — обязательный провайдинг (из отчёта воркера):
`deps.scan = scanUnregistered`, `upgradeLock = new UpgradeLock()`,
`makeStepDeps(root)` (прецедент сборки адаптеров — тесты T7/memory-init),
`registry = new ProjectsRegistry(wolfUserConfigDir())`,
`loadMap = () => loadUpdateMap()`; при TTY — рендер plans-узла из confirm
ДО вопроса (правка lead). T9 `--here` → T10 `--check` → T8 — строго
последовательно (общий файл memory-upgrade.ts); T14 cli-reference после T8.

Открытые UX-вопросы к владельцу (не блокеры): скан REQ-09 после cancel /
пустого реестра (сейчас — нет); plural-формы строк отчёта — EN-минимум.
