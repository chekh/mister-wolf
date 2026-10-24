---
slug: unified-update
title: unified-update — отчёт исполнения Ф3
status: final
created: 2026-10-24
---

# unified-update — отчёт исполнения Ф3 (волна 2.19.0)

Executor-lead: сессия exec-2-19-0-unified-update (продолжение; Ф1+Ф2 —
ACCEPTED, см. phase2-execution-report.md). Thread:
mem_20261023_volna_2_19_0_unified_update_odno_obnovle_15b75a.
Ветка dev/unified-update-2-19-0 (тот же worktree).

## Metadata

- Методика: wolf-sdd. Декомпозиция: T6 MEDIUM → воркер; T11 TRIVIAL →
  lead сам (по плану); T12 SIMPLE → воркер. Параллельно: T6+T12 (воркеры)
  - T11 (lead), allowlist дизъюнктны.

## Summary

Ф3 завершена: проектный шаг (T6), депрекация sync (T11), скан
незарегистрированных (T12). Гейт Ф3 — полный `npm run check` зелёный:
**1646/1646 тестов, exit 0** (199 файлов; +29 тестов к Ф2). e2e не
требовался (влитий в main до T13 нет).

## Task Decomposition

| Задача                          | Класс   | Исполнитель | Статус |
| ------------------------------- | ------- | ----------- | ------ |
| T6 проектный шаг runProjectStep | MEDIUM  | worker      | DONE   |
| T11 sync → deprecated-алиас     | TRIVIAL | lead        | DONE   |
| T12 scan-unregistered           | SIMPLE  | worker      | DONE   |

## Changes (коммиты)

- `8e28d25` T11 sync → deprecated alias (REQ-07) — DEPRECATED-строка +
  redirect на `wolf upgrade --here`; integration: инвариант id-множества
  (2/2)
- `9d8cd90` T12 scan-unregistered (REQ-09) — BFS maxdepth 4, realpath-diff,
  топ-5 по давности, мягкий бюджет ≤5 с; 7 unit
- `1326078` T6 runProjectStep (REQ-03/04/11) — композиция 5 фаз,
  confirmedRemovals (fail-safe), фильтр посева map.faces[seed:true],
  schema-refusal → error без краха, park-snapshot-хелпер; 10 unit + 10
  integration

## Контрактные решения T6 (приняты lead)

1. `confirmedRemovals: string[]` — вход opts; удаление = orphaned ∩
   map[removed] ∩ confirmed; БЕЗ opts удалений нет (fail-safe),
   неподтверждённая removed-цель → error сверки. Соответствует ADR-4
   (одно подтверждение списка — у T7/T9).
2. Посев фильтруется до map.faces[seed:true] — deprecated-шаблоны не
   сеются (REQ-11 report-only).
3. Orphaned вне карты → conflict/needs-decision (design «факт без
   ожидания»).
4. **Session-summary note при посеве с legacy-absorbed** — штатный
   побочный эффект supersede-шага createFaceVersion (механика 2.13
   P210(е), тот же путь у любого `wolf face`): принят как часть посева
   (REQ-07 «изменения исчерпываются посевом» — порождение шагом 3);
   идемпотентность повторного прогона подтверждена (diff слепка пуст).
   Для T7/приёмки: session-summary учитывать как часть посева.
5. Schema-refusal (P-future-schema, вопрос design №2): error проекта,
   шаг выживает, обход продолжит T7 — предложение дизайна закреплено
   тестом.

## Validation Results

- T6: unit 10/10, integration 10/10 (R03.1–R03.4, R07.2, R11.1/11.2/11.4,
  N02.1, N04.1, wallMs); tsc 0; prettier ok.
- T11: integration 2/2 (DEPRECATED-строка; слепок id/байтов неизменен).
- T12: unit 7/7 (R09.1/R09.2, бюджет, глубина, realpath-края).
- **Гейт Ф3: `npm run check` = english-surface + format:check + lint +
  build + test:run → 1646/1646, exit 0** (прогнан на итоговом дереве
  Ф1+Ф2+Ф3 в worktree).

## COMPLAINT-TRIAGE / FRICTION

`COMPLAINT-TRIAGE: seen 0 → resolved 0 / rejected 0 / escalated 0 / open 0`
(очередь пуста при приёмке каждой задачи).

FRICTION (продолжение): rtk-хук подменял вывод npm-команд у обоих воркеров
(T6, T12) — обход «вывод в файл + чтение» сработал штатно (урок
mem_20261023_rtk_khuk_iskazhaet_vyvod_npm_komand_dlya_bfe67a применён в
брифах); у lead — 1× искажение grep-вывода (читал лог файлом). Новых
системных проблем нет.

## Риски / что дальше (Ф4)

- T7 (оркестратор): готовые входы — ProjectReport/exitKind/wallMs (T6),
  renderer + Counter{label,count} (T3), pinned/listStrict/dedup/lock
  (T4), scanUnregistered wiring после сводного отчёта (T12, hint без
  плюрализации — T7 может отформатировать); изоляция сбоев per-project;
  exit 0/1/2 по таблице.
- T9 `--here` → T10 `--check` → T8 re-exec — строго последовательно
  (общий файл memory-upgrade.ts), после T7/T6.
- P-future-schema: T7 обязан продолжать обход после error-проекта
  (R06.1).
- dist/ в worktree актуален (build в составе check).
