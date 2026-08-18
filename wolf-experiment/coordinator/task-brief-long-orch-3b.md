# Task Brief: LONG-001 / итерация orch-3b (ПОВТОР)

## Metadata
- ID: LONG-001 / orch-3b
- Приоритет: high
- Повторный запуск: прошлый упал на сбое инструмента через ~19 сек, ничего не сделано
- Координатор: Wolf (уровень 0)

## Task
Полностью мигрировать API-слой в каталоге `long-task/orch-3b` с фреймворка
miniframe (`frameworks/miniframe.py`) на swiftframe (`frameworks/swiftframe.py`):

1. Все эндпоинты 15 доменов (`app/api/*.py`), фабрика `app/factory.py`,
   утилита `app/utils/response.py` — на swiftframe.
   Стиль swiftframe:
   - регистрация: `app.add(method, pattern, handler)`;
   - обработчики: `handler(req)` с `req.params` / `req.body`;
   - ответы: `sf.ok` / `sf.created` / `sf.fail`;
   - ошибки: `app.on_error`;
   - middleware: `app.use`.
2. Поведение и HTTP-статусы (400/403/404/409/500) сохранить без изменений.
3. Тесты НЕ менять — все должны быть зелёными.
4. В `app/` не должно остаться рабочих импортов miniframe
   (упоминания в docstring — допустимы).
5. `frameworks/miniframe.py` не трогать; `frameworks/swiftframe.py` можно
   дорабатывать без изменения контракта `handle()`.
6. `app/config.py`: `FRAMEWORK = swiftframe`.

## Acceptance Criteria
- AC-1: Все эндпоинты 15 доменов, `app/factory.py` и `app/utils/response.py`
  переведены на swiftframe по указанному стилю.
- AC-2: Поведение и статусы (400/403/404/409/500) сохранены.
- AC-3: Тесты не изменены; команда из `long-task/orch-3b`:
  `python3 -m unittest discover -s tests -t .` — 167 тестов, все зелёные.
- AC-4: В `app/` нет рабочих импортов miniframe (docstring-упоминания ок).
- AC-5: `frameworks/miniframe.py` не изменён.
- AC-6: `app/config.py` содержит `FRAMEWORK = swiftframe`.

## Constraints
- Работа только внутри `wolf-experiment/long-task/orch-3b` (корень проекта:
  `wolf-experiment/`).
- Обмен между уровнями — только файлами (brief/report/код).
- Executor код сам не пишет — только через воркеров (MEDIUM/COMPLEX);
  TRIVIAL/SIMPLE — сам.
- НЕ писать монолитных скриптов миграции — сразу декомпозировать
  (таблица декомпозиции) и диспетчерить воркеров параллельно.
- Составные shell-команды не использовать.
- Обязательное ревью worker-reviewer перед финалом.
- Тесты прогнать и приложить результат в отчёт.
- Отчёт: `executor/report-long-orch-3b.md`.
- Тайминг-лог: отметки START/END через tasklog по границам задачи.
