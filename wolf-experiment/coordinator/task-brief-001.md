# Task Brief: TEST-001

## Metadata
- created_by: wolf-coordinator
- executor: executor-lead

## Task
Создать Python-калькулятор в песочнице wolf-experiment (повторный прогон, нативный режим):

1. Спавнить воркера (`worker-implementer`, тул `task`) для создания файла
   `workers/calculator.py` с функциями `add(a, b)` и `multiply(a, b)`.
   Только стандартная библиотека Python, строгая типизация (аннотации).
2. Спавнить воркера (или переиспользовать) для создания файла
   `workers/test_calculator.py` с тестами `unittest`, покрывающими
   `add` и `multiply` (позитивные кейсы, ноль, отрицательные числа).
3. Прогнать тесты (`python -m unittest`) и зафиксировать результат.
4. Написать отчёт `executor/report-001.md`: статус, список созданных
   файлов, вывод тестов, вердикт по Acceptance Criteria.

Корень проекта: `/Users/chekh/Development/RestAdviser/ZetaFlow/wolf-experiment`.

## Acceptance Criteria
- [ ] Файл `workers/calculator.py` существует и содержит `add(a, b)` и `multiply(a, b)`
- [ ] Файл `workers/test_calculator.py` существует и содержит тесты `unittest` для обеих функций
- [ ] Тесты проходят (`python -m unittest` → OK)
- [ ] Используется только стандартная библиотека Python
- [ ] Отчёт `executor/report-001.md` создан и содержит статус + вывод тестов

## Constraints
- Воркеры спавнятся только тулом `task` (subagent_type=`worker-implementer`), без CLI-обходов
- Executor сам код не пишет — только через воркеров
- Не выходить за пределы каталога `wolf-experiment/`
- Обмен между уровнями — только файлами (brief/report/код)
