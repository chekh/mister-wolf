# Task Brief LONG-001 (итерация orch-1, оркестрованный прогон)

## Metadata

- ID: LONG-001 / orch-1
- Уровень: 0 → 1 (Wolf → Executor)
- Отчёт: `executor/report-long-orch-1.md`
- Корень проекта: `wolf-experiment/`
- Рабочий каталог: `long-task/orch-1/`
- Профиль: заведомо долгая задача (миграция API-слоя, 15 доменов) —
  executor ставит отметки tasklog START/END, PROGRESS — на осмысленных
  чекпоинтах (декомпозиция, партии воркеров, ревью, прогон тестов).

## Task

Полностью мигрировать API-слой в каталоге `long-task/orch-1` с фреймворка
miniframe (`frameworks/miniframe.py`) на swiftframe
(`frameworks/swiftframe.py`).

### Объём миграции

1. Все эндпоинты 15 доменов (`app/api/*.py`), фабрика `app/factory.py`,
   утилита `app/utils/response.py` — перевести на swiftframe.
2. Стиль swiftframe:
   - регистрация: `app.add(method, pattern, handler)`;
   - handler: `handler(req)` с `req.params` / `req.body`;
   - ответы: `sf.ok` / `sf.created` / `sf.fail`;
   - ошибки: `app.on_error`;
   - middleware: `app.use`.

### Требования

1. Поведение и HTTP-статусы (400/403/404/409/500) сохранить.
2. Тесты НЕ менять; все зелёные:
   `python3 -m unittest discover -s tests -t .` (запуск из `long-task/orch-1`,
   167 тестов).
3. В `app/` нет рабочих импортов miniframe (упоминания в docstring — ок).
4. `frameworks/miniframe.py` не трогать; `frameworks/swiftframe.py` можно
   дорабатывать без изменения контракта `handle()`.
5. `app/config.py`: `FRAMEWORK = swiftframe`.

## Acceptance Criteria

1. Все файлы `app/api/*.py` (15 доменов), `app/factory.py`,
   `app/utils/response.py` используют swiftframe-стиль (см. выше).
2. Поведение и статусы (400/403/404/409/500) сохранены.
3. Тесты не изменены; `python3 -m unittest discover -s tests -t .` из
   `long-task/orch-1` — 167/167 зелёные.
4. В `app/` нет рабочих импортов miniframe.
5. `frameworks/miniframe.py` не изменён; изменения `swiftframe.py` (если есть)
   не ломают контракт `handle()`.
6. `app/config.py` содержит `FRAMEWORK = swiftframe`.
7. Обязательное ревью `worker-reviewer` после зелёных тестов; замечания
   устранены или обоснованно отклонены.
8. Отчёт executor'а: статус, декомпозиция (таблица подзадач с
   сложностью/исполнителем), список файлов, результаты тестов, итог ревью,
   баланс «executor сам vs воркеры».

## Constraints

- Декомпозиция с таблицей подзадач (сложность: TRIVIAL/SIMPLE/MEDIUM/COMPLEX).
- Воркеры — для MEDIUM/COMPLEX; executor сам — только TRIVIAL/SIMPLE.
- Код пишут воркеры, не executor; обмен — только файлами.
- Не выходить за пределы `wolf-experiment/`.
- Язык артефактов — русский.
