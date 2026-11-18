---
slug: r4-contradiction-ops
title: Требования R-4 — операции противоречий доступны ведущему через CLI/MCP
status: approved (мандат владельца «делай», mem_20261118_94caa3)
created: 2026-11-18
---

# 1. Цель

Домен противоречий микро-заметок (S-27) существует с 3.2.0
(`src/app/use-cases/micro-note-contradiction.ts`: `reportMicroNoteContradiction`,
`resolveMicroNoteSuppression`), но доступен только из тестов — пользовательского
маршрута нет (находка R-4 пост-релизного ревью v3.2.0). Требование: ведущий
регистрирует противоречие и разрешает его через CLI и MCP, evidence сохраняется.

Носители: журнал подавлений `MicroNoteDeliveryLog` (реализация
`SQLiteSearchIndex`, инъектится как `noteLog: index` в CLI `memory-call.ts:48` и
MCP `mcp-tools.ts:473` — контейнер менять не нужно).

Базовая ревизия: `3e4be1e9` (main после релиза 3.2.1), рабочая ветка `en-base-wave`.

# 2. Дизайн-решения (зафиксированы ведущим; разработчик может предложить альтернативу с обоснованием до реализации)

- CLI: одна команда с подкомандами — `wolf contradict report|resolve|list`
  (прецедент сабкоманд: `wolf learn`). `list` — read-only обзор открытых подавлений
  (наблюдаемость для ведущего, дёшево: порт уже отдаёт `suppressions()`).
  Опции report: `--note <id>` (обяз.), `--reason <text>` (обяз.),
  `--evidence <text>` (обяз., verbatim-наблюдение). Опции resolve: `--note <id>`
  (обяз.), `--resolution <text>` (обяз.). Актёра в схему журнала НЕ вводим
  (схема 3.2.0 не меняется).
- MCP: ОДИН тул `note_contradiction` с `action: 'report' | 'resolve'`
  (прецедент составного тула: `propose_candidate`; каталог 9 → 10, порог ≤ 12
  сохранён). Схема: action, note_id, reason, contradiction_evidence (report),
  resolution (resolve).
- Вывод (CLI и MCP): человекочитаемая строка с точным `id@rev12` (note_evidence),
  состоянием («suppressed until resolved» / «resolved»), и — при report —
  повторением вербатимного evidence. Ошибки use-case (unknown id, пустые поля)
  пробрасываются как UserFacingError без подмены текстов.
- `reconcileMicroNoteObservations` (третья функция use-case) — ВНЕ scope: у неё
  другой адресат (аналитика наблюдений), маршрутизация обсуждается отдельно.

# 3. Требования и критерии приёмки (AC)

## REQ-R4-1 — CLI `wolf contradict`

- AC-1.1: `report` регистрирует подавление активной micro-note: вывод содержит
  точный `id@rev12`, evidence вербатим, повторный вывод `wolf call` НЕ содержит
  заметку до разрешения.
- AC-1.2: `report` по неизвестному/не-micro-note id — отказ с текстом use-case
  («unknown micro-note ...»), журнал не изменён.
- AC-1.3: `resolve` снимает открытое подавление (указывается resolution-текст),
  после чего заметка снова доставляется; запись остаётся в журнале аудита
  (evidence пары не стирается).
- AC-1.4: `resolve` по id без открытого подавления — отказ (порт), текст назван.
- AC-1.5: `list` показывает открытые подавления с id@rev и причиной; пустой
  список — явное «no open suppressions».
- AC-1.6: обязательные опции без значений — отказ с именованной причиной.

## REQ-R4-2 — MCP-тул `note_contradiction`

- AC-2.1: тул в каталоге `MCP_TOOL_NAMES` (10 тулов ≤ 12), action=report
  подавляет так же, как CLI (та же запись журнала — один носитель).
- AC-2.2: action=resolve снимает подавление; неизвестный id — отказ use-case.
- AC-2.3: схема входа требует action/note_id и соответствующие поля действия;
  неполный вход — ошибка схемы, не тихий пропуск.

## REQ-R4-3 — документация и артефакты

- AC-3.1: `docs/reference/cli.md` перегенерирован (guard-тест P224 зелёный).
- AC-3.2: MCP-поверхность в документации (страница тулов) упоминает
  `note_contradiction` (10 тулов); find/replace-сверка формулировки «9 тулов» по
  docs/site — все живые места обновлены.

# 4. Верификация волны

- TDD: тесты на каждый AC (CLI unit/e2e + MCP-тул), красные до реализации.
- Полный `npm run check`; docs:verify; e2e-кампания 63/63; smoke pack/init/upgrade.
- Независимое ревью diff'а до коммита.
- Выпуск: PR → merge → тег (версия 3.3.0 — подтверждается владельцем при выпуске;
  новая функциональность).
