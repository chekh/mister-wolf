# Task Brief: LONG-001, итерация orch-3 (оркестрованный прогон)

## Metadata

- ID: LONG-001-orch-3
- Дата: 2026-08-17
- Уровень: coordinator → executor-lead → workers
- Корень проекта: `/Users/chekh/Development/RestAdviser/ZetaFlow/wolf-experiment/long-task/orch-3`

## Task

Полностью мигрировать API-слой в каталоге `long-task/orch-3` с фреймворка
miniframe (`frameworks/miniframe.py`) на swiftframe (`frameworks/swiftframe.py`):

1. Все эндпоинты 15 доменов (`app/api/*.py`), фабрика `app/factory.py`,
   утилита `app/utils/response.py` — на swiftframe. Стиль:
   `app.add(method, pattern, handler)`, `handler(req)` с `req.params` /
   `req.body`, ответы `sf.ok` / `sf.created` / `sf.fail`, ошибки через
   `app.on_error`, middleware через `app.use`.
2. Поведение и HTTP-статусы (400 / 403 / 404 / 409 / 500) сохранить без
   изменений.
3. Тесты НЕ менять; все зелёные: из каталога `long-task/orch-3` —
   `python3 -m unittest discover -s tests -t .` (167 тестов).
4. В `app/` не должно быть рабочих импортов miniframe
   (docstring-упоминания допустимы).
5. `frameworks/miniframe.py` не трогать; `frameworks/swiftframe.py` можно
   дорабатывать без изменения контракта `handle()`.
6. `app/config.py`: `FRAMEWORK = swiftframe`.

## Acceptance Criteria

1. Все эндпоинты 15 доменов, `app/factory.py` и `app/utils/response.py`
   работают на swiftframe (стиль по п.1).
2. Поведение и статусы (400/403/404/409/500) сохранены.
3. `python3 -m unittest discover -s tests -t .` из `long-task/orch-3` —
   167 тестов, все зелёные; тесты не изменялись.
4. В `app/` нет рабочих импортов miniframe (docstring-упоминания ок).
5. `frameworks/miniframe.py` не изменён; контракт `handle()` в swiftframe
   не нарушен.
6. `app/config.py` содержит `FRAMEWORK = swiftframe`.

## Constraints

- Тесты (`tests/`) не модифицировать.
- `frameworks/miniframe.py` — read-only.
- Работать только внутри `wolf-experiment/long-task/orch-3`.
- Обмен артефактами — файлами.

## Требования к исполнению (для executor-lead)

- Декомпозиция задачи с таблицей подзадач (TRIVIAL/SIMPLE/MEDIUM/COMPLEX).
- Воркеров привлекать для MEDIUM/COMPLEX; TRIVIAL/SIMPLE — сам.
- Обязательное ревью через worker-reviewer.
- Прогнать полный тестовый набор и зафиксировать результат.
- Отчёт: `executor/report-long-orch-3.md`.
- Соблюдать формат тайминг-лога: строки START/END (и PROGRESS для долгих
  этапов) в отчёте.
