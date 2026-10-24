---
slug: unified-update
title: unified-update — отчёт исполнения Ф5
status: final
created: 2026-10-24
---

# unified-update — отчёт исполнения Ф5 (волна 2.19.0)

Executor-lead: сессия exec-2-19-0-unified-update (продолжение; Ф1–Ф4 —
ACCEPTED, см. phase{2,3,4}-execution-report.md). Thread:
mem_20261023_volna_2_19_0_unified_update_odno_obnovle_15b75a.
Ветка dev/unified-update-2-19-0 (тот же worktree). Попытки 1–3 старта Ф5 и
ход с воркером T8 обрывались сбоями провайдера/рестартом сервера; T8
восстановлен из записанных воркером файлов с верификацией lead (без
ретраев воркеров).

## Metadata

- Методика: wolf-sdd. Декомпозиция: T9 MEDIUM → воркер; T10 MEDIUM →
  воркер; T8 MEDIUM → воркер (обрыв → верификация lead); T14 SIMPLE → lead.
  Строгая последовательность T9 → T10 → T8 (общий файл memory-upgrade.ts);
  T14 после T8, до гейта.

## Summary

Ф5 завершена полностью: `wolf upgrade --here` (T9, полный шаг в cwd вне
реестра), `--check` (T10, read-only freshness парка), CLI-транспорт с
re-exec (T8, spawn-контракт + склейка фаз + hidden upgrade-projects),
cli-reference регенерация (T14). Гейт Ф5 — полный `npm run check` зелёный
(счётчики ниже); e2e полный отложен до гейта влития T13, целевой e2e T8
прогнан (3/3).

## Task Decomposition

| Задача               | Класс  | Исполнитель | Статус |
| -------------------- | ------ | ----------- | ------ |
| T9 `--here`          | MEDIUM | воркер      | DONE   |
| T10 `--check` парка  | MEDIUM | воркер      | DONE   |
| T8 re-exec/транспорт | MEDIUM | воркер+lead | DONE   |
| T14 cli-reference    | SIMPLE | lead        | DONE   |

## Changes (коммиты)

- `5cd903f` T9 wolf upgrade --here (REQ-14): guard `.wolf/memory` →
  «run wolf init first»; подтверждение REQ-02 (confirm получает plans-узел);
  exit-модель одного проекта; точечные экспорты T7-словаря (statusOf/
  STATUS_TEXT/OutcomeStatus/mapCategories); 8 unit + 2 integration; e2e
  upgrade.e2e 5/5 (npm-ветка цела).
- `fd63b19` T10 wolf upgrade --check (REQ-08): read-only freshness
  (inspectBaseSet — 0 записей; классификация current/behind/needs decision/
  unknown, deprecated report-only); деградация без карты; битый/пустой
  реестр — строки; exit всегда 0; 11 unit + 1 integration (R08.1, слепок
  0 мутаций).
- `fa028ad` T8 wolf upgrade re-exec (REQ-01/04, ADR-2/5): hidden
  `upgrade-projects` (COMMANDS hidden) с прод-deps (registry/loadMap/
  hereStepDeps/UpgradeLock/scanUnregistered), TTY-confirm с plans ДО
  вопроса; reExecUpgradeProjects (state до spawn, stdio inherit, env
  process.env, exit=exit, сбой → UserFacingError «CLI updated; projects
  not touched…»); runUpgradeWithProjects (banner только фаза 1; npm-сбой →
  `└ Failed` ДО spawn; up-to-date → re-exec идёт; local-newer/linked —
  нет); 14 unit + R01.3 integration + 3 e2e self-spawn smoke.
- `eebd427` T14: регенерация docs/reference/cli.md генератором (+24/−1):
  поверхности upgrade --here/--yes/--check + hidden `upgrade-projects`
  (ADR-5/D-m4); cli-reference-guard 1/1.

## Контрактные решения Ф5 (приняты lead)

T9:

1. hereStepDeps минует createCliContainer (selfHealRegistry пишет реестр —
   REQ-14 запрещает): адаптеры те же, привязка к cwd (per-root deps).
2. Финальная строка exit-таблицы — line-узел со словарём T7 (паритет с
   решением Ф4: суффикс summary фиксирован).
3. Строка состава — локальная копия stampVersions (приватна в T7).

T10: 4. Расширение allowlist lead'ом: opencode-renderer.ts + base-set-renderer.port.ts — read-only `inspectBaseSet` (+61/+11, существующее не
тронуто): renderBaseSet/syncBaseSet ПИШУТ файлы (writeFileAtomic) и
sync-state — read-only источника контент-diff не существовало, REQ-08
(«никаких мутаций») требует инспектор в renderer. 5. AGENTS.md-инспект по фактическим веткам: штампованный — цельная сверка
(mutated по свидетелю); unstamped+маркер — сверка блока; unstamped без
маркера → foreign (wx-политика). 6. differs/missing по unchanged-целям → тоже «behind» (состав разошёлся,
вкл. штамп set= при смене релиза); приоритет классов mutated > behind >
unknown > current; несуществующий путь реестра → unknown-строка.

T8: 7. `WOLF_UPGRADE_CHILD_BIN` — тест-only env (default `<npmPrefix>/bin/wolf`);
null-префикс → fail-safe путь, spawn упадёт → UserFacingError (в прод до
null-префикса не доходит: linked-refusal раньше). Downstream:
задокументировать env в design §«Контракт spawn» при следующей ревизии. 8. npm-сбой: `└ Failed` печатает фаза 1, Error:-строку и exit 1 даёт runCli
(UserFacingError от installLatest пробрасывается после закрытия секции). 9. `--from/--to/--state/--no-banner` принимаются скрытой командой как
контракт транспорта; отчёт фазы 2 их не требует (state — только контекст,
NFR-02). 10. `--yes` переописан глобально («--here or the projects pass»);
`--check`-ветка — ранний return (порядок T10 сохранён: CLI-версии →
парк); upgradeProjectsAction — IO-шов ProjectsIo (юнит-тестируемость
TTY-confirm без эмуляции терминала).

T14: 11. Регенерация одним прогоном генератора закрыла весь накопленный дрейф
(T9+T10+T8); scripts/ правки не потребовались (реестр hidden-команд
генератор уже берёт полностью, D-m4).

Восстановление T8: воркер был прерван рестартом сервера после записи
файлов (18:11–18:20), отчёта не выдал; lead сверил диффы по брифу,
прогнал полный верификационный цикл (58/58 целевых, tsc 0, prettier,
english 93, e2e 3/3) и закоммитил — ретраев воркеров не потребовалось.

## Validation Results

- T9: 10/10 (8 unit + 2 int R14.1/R14.2) + регрессия T7 21/21; e2e
  upgrade.e2e 5/5; tsc 0; english-gate OK.
- T10: 12/12 (11 unit + 1 int R08.1 — слепок парка байт-в-байт, 0 мутаций)
  - регрессия 81/81; tsc 0; english-gate OK.
- T8: unit 14/14 (spawn-контракт: argv/state-до-spawn/env/stdio/exit 0/1/2,
  ENOENT → UserFacingError, up-to-date → re-exec, local-newer/linked → нет,
  npm-сбой → └ Failed без spawn, TTY-confirm, --yes, R04.1) + R01.3
  integration (в upgrade-park, слепок не тронут) + e2e upgrade-exec 3/3
  (35 с: self-spawn реального dist-бинарника, hidden --help, наследование
  stdio/env); целевая регрессия 7 файлов 58/58; tsc 0; prettier чист.
- T14: `node scripts/generate-cli-reference.mjs` exit 0; guard 1/1.
- Гейт Ф5: полный `npm run check` — **210 файлов, 1704/1704 тестов, exit 0**
  (1667 Ф4 + 37 Ф5: T9 8 unit + 2 int; T10 11 unit + 1 int; T8 14 unit +
  1 int). Первый прогон упал только на format:check неотформатированного
  черновика этого отчёта (не код); повторный после финализации — зелёный.

## COMPLAINT-TRIAGE / FRICTION

`COMPLAINT-TRIAGE: seen 0 → resolved 0 / rejected 0 / escalated 0 / open 0`
(очередь пуста при каждой приёмке).

FRICTION: rtk-хук подменял вывод npm-команд у всех троих воркеров — обход
«вывод в файл» (урок mem*20261023_rtk_khuk*…) штатно. Событие сессии:
рестарт сервера оборвал воркера T8 на финальной верификации — файлы
уцелели, восстановление верификацией lead без ретрая (см. выше). Новых
системных проблем с инструментами нет.

## Риски / что дальше (Ф6)

Ф6 = T13 интеграция: влитие dev/unified-update-2-19-0 в main после
полного check + ПОЛНОГО e2e (≥1200 с — теперь включает upgrade-exec.e2e);
слепки NFR-01 (единственная точка обновления), повтор NFR-02
(идемпотентность), тайминги NFR-03; затем T15 документация + релизный
чек-лист. Открытые пункты для T15/design-ревизии: задокументировать
`WOLF_UPGRADE_CHILD_BIN` в design §«Контракт spawn»; синхронизация
design.md (логотип — блочный вордмарк MR. WOLF, mem*20261023*…a989dd/
…201c0e); UX-вопросы владельца из Ф4 (скан после cancel/пустого реестра;
plural-формы) — в пакет приёмки волны.
