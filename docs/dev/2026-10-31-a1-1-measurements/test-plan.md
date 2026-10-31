---
slug: a1-1-measurements
title: A1.1 — тест-план
status: draft
created: 2026-10-31
---

# A1.1 — тест-план

## Сценарии

### RQ-01 (источник подтверждён / недоступен)

- Given fixture БД с одной сессией и одним завершённым turn,
  When `importUsage` с указанным путём,
  Then записано одно событие `run` с полями из маппинга design.
  Маппинг: `tests/unit/app/import-usage.test.ts`.
- Given несуществующий путь БД,
  When импорт,
  Then результат — отказ с причиной, сигнальный лог не изменён (размер и
  содержимое до/после равны).
  Маппинг: `tests/unit/app/import-usage.test.ts`,
  `tests/unit/adapters/opencode-usage-db.test.ts`.
- Given БД без таблиц `session_v2`/`session_message`,
  When чтение источника,
  Then диагностируемая ошибка, не падение.
  Маппинг: `tests/unit/adapters/opencode-usage-db.test.ts`.

### RQ-02 (один writer)

- Given граф импортов проекта,
  When поиск писателей `event: 'run'` вне `import-usage`/`session-metrics-log`,
  Then других нет (проверка ревью + grep-evidence в отчёте).
  Маппинг: manual (REV-1).

### RQ-03 (run-итог, устойчивые ID)

- Given два разных run (две сессии) одной задачи с `retry.attempt` отсутствующим
  и с `attempt=2`, When `summarizeRuns`,
  Then две строки, у первой `attempt` неизвестен (не 0), у второй `2`;
  `task_id` — из карты, иначе неизвестен.
  Маппинг: `tests/unit/domain/usage-signal.test.ts`.
- Given fixture-источник и пустой лог, When импорт дважды,
  Then первый прогон `appended = N`, второй `appended = 0`, `duplicate = N`,
  размер лога не изменился.
  Маппинг: `tests/unit/app/import-usage.test.ts`.
- Given повтор первого исходного события внутри одного прогона,
  Then одно событие (дедуп по `event_id`).
  Маппинг: `tests/unit/domain/usage-signal.test.ts`.

### RQ-04 (старые и неполные логи)

- Given лог с v1-записью (без `event_id`) и битой строкой,
  When импорт,
  Then v1-запись сохранена, битая строка не роняет импорт, `readSignalLog`
  сообщает `malformedLines = 1`.
  Маппинг: `tests/unit/app/import-usage.test.ts`.
- Given turn без `time.completed`,
  When маппинг,
  Then событие не создаётся и не попадает в счётчик расхода.
  Маппинг: `tests/unit/domain/usage-signal.test.ts`.

### RQ-05 (суррогаты и ограничения)

- Given turn с `tokens.reasoning > 0` и `cache.write > 0`,
  When маппинг,
  Then `weighted` считается только из `input/output/cache_read`, `output` не
  включает `reasoning`.
  Маппинг: `tests/unit/domain/usage-signal.test.ts`.
- Given turn без блока `tokens`,
  Then `tokens`/`weighted` отсутствуют (undefined), а не нули; run-итог
  показывает `tokens: unknown`.
  Маппинг: `tests/unit/domain/usage-signal.test.ts` +
  `tests/unit/app/import-usage.test.ts`.
- Given вывод команды,
  Then содержит блок ограничений источника (model variant, reasoning/cache
  write, cost, task link).
  Маппинг: `tests/unit/app/import-usage.test.ts` (текст отчёта).

### RQ-06 / NFR (совместимость, идемпотентность, read-only, целый гейт)

- Given `git diff` среза,
  Then `SignalEventSchema` не изменена (ревью + diff-evidence).
- NFR-02: повторный прогон — см. RQ-03.
- NFR-03: адаптер открывает источник с `readonly: true`; тест на копии БД
  после импорта побайтово не изменён (mtime/hash основных файлов).
- NFR-04: окно по умолчанию 1 сутки (unit на разбор аргументов/дефолта);
  замер 7 суток зафиксирован в design, не является тестом.
- RQ-06: `npm run check` (format:check + lint + build + vitest run) exit 0.

## Прогоны

- Точечные: `npx vitest run tests/unit/domain/usage-signal.test.ts`,
  `npx vitest run tests/unit/adapters/opencode-usage-db.test.ts`,
  `npx vitest run tests/unit/app/import-usage.test.ts`.
- Полный гейт: `npm run check` (включает генераторы справочников).
- Fixtures: `tests/fixtures/usage-turns.json` (записи источника, без
  содержимого сообщений), временная SQLite-БД создаётся в тесте из
  `mkdtemp`, реальная БД площадки в тестах не используется.
