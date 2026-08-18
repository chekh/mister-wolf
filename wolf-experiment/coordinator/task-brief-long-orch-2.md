# Task Brief: LONG-001 / orch-2 — миграция API-слоя с miniframe на swiftframe

## Metadata

- **ID**: LONG-001, итерация `orch-2` (оркестрованный прогон)
- **Корень проекта**: `/Users/chekh/Development/RestAdviser/ZetaFlow/wolf-experiment`
- **Целевой каталог**: `long-task/orch-2/`
- **Отчёт**: `executor/report-long-orch-2.md`
- **Тип**: оркестрованный прогон — декомпозиция, воркеры, ревью, тесты

## Task

Полностью мигрировать API-слой в каталоге `long-task/orch-2` с фреймворка
**miniframe** (`frameworks/miniframe.py`) на **swiftframe**
(`frameworks/swiftframe.py`):

1. **Объём миграции**:
   - все эндпоинты 15 доменов: `app/api/*.py`;
   - фабрика `app/factory.py`;
   - утилита `app/utils/response.py`.
2. **Стиль swiftframe**:
   - регистрация: `app.add(method, pattern, handler)`;
   - хэндлеры: `handler(req)` с `req.params` / `req.body`;
   - ответы: `sf.ok` / `sf.created` / `sf.fail`;
   - обработка ошибок: `app.on_error`;
   - middleware: `app.use`.
3. **Конфигурация**: в `app/config.py` установить `FRAMEWORK = swiftframe`.

## Acceptance Criteria

1. Все эндпоинты 15 доменов (`app/api/*.py`), `app/factory.py` и
   `app/utils/response.py` переведены на swiftframe (стиль по п.2 Task).
2. Поведение и HTTP-статусы сохранены: 400 / 403 / 404 / 409 / 500 — как в
   miniframe-версии.
3. Тесты **не изменялись**, все зелёные. Команда проверки (из каталога
   `long-task/orch-2`):
   `python3 -m unittest discover -s tests -t .` — 167 тестов, 0 failures/errors.
4. В `app/` нет рабочих импортов miniframe (упоминания в docstring/комментариях
   допустимы).
5. `frameworks/miniframe.py` **не тронут**; `frameworks/swiftframe.py` можно
   дорабатывать, но без изменения контракта `handle()`.
6. `app/config.py` содержит `FRAMEWORK = swiftframe`.

## Constraints

- Обмен только файлами; не выходить за пределы `wolf-experiment/`.
- Тесты (`long-task/orch-2/tests/`) — read-only, менять запрещено.
- `frameworks/miniframe.py` — read-only.
- Процедура executor'а (обязательна):
  - **декомпозиция** задачи с таблицей подзадач (TRIVIAL / SIMPLE / MEDIUM /
    COMPLEX) в начале отчёта;
  - **TRIVIAL/SIMPLE** — executor выполняет сам;
  - **MEDIUM/COMPLEX** — только через воркеров;
  - **обязательное ревью** через `worker-reviewer` по итогам;
  - **прогон тестов** — финальная проверка, результат зафиксировать в отчёте.
- Отчёт: `executor/report-long-orch-2.md` — декомпозиция, кто что делал
  (executor vs воркеры), результат ревью, вывод тестов, вердикт по каждому
  пункту Acceptance Criteria.
