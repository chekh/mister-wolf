# Task Brief — COST-T1 (итерация orch-3, оркестрованный прогон)

## Metadata

- **ID:** COST-T1 / orch-3
- **Корень проекта:** `/Users/chekh/Development/RestAdviser/ZetaFlow/wolf-experiment`
- **Отчёт executor'а:** `executor/report-cost-T1-orch-3.md`
- **Тип:** оркестрованный прогон (воркеры пишут файлы, executor координирует,
  обязательное ревью worker-reviewer)

## Task

Реализовать Python-калькулятор:

- Функция `add(a, b)` — сложение двух чисел.
- Функция `multiply(a, b)` — умножение двух чисел.
- Тесты на `unittest`: положительные числа, отрицательные числа, ноль
  (для обеих функций).
- Только стандартная библиотека (stdlib), без внешних зависимостей.

### Файлы (точные пути)

- `cost/T1/orch-3/calculator.py`
- `cost/T1/orch-3/test_calculator.py`

## Acceptance Criteria

1. Файл `cost/T1/orch-3/calculator.py` существует и содержит функции
   `add(a, b)` и `multiply(a, b)` с корректной реализацией.
2. Файл `cost/T1/orch-3/test_calculator.py` существует, использует
   `unittest`, покрывает для обеих функций случаи: положительные,
   отрицательные, ноль.
3. Тесты запускаются (`python -m unittest` из каталога `cost/T1/orch-3` или
   с указанием пути) и ВСЕ проходят.
4. Используется только stdlib (нет импортов внешних пакетов).
5. Проведено ревью worker-reviewer; замечания устранены, вердикт ревью —
   одобрено.
6. Отчёт записан в `executor/report-cost-T1-orch-3.md`.

## Constraints

- Не выходить за пределы каталога `wolf-experiment/`.
- Обмен между уровнями — только файлами (brief / report / код).
- Executor код сам не пишет — только через воркеров; ревью — отдельным
  worker-reviewer.
- Язык артефактов и отчёта — русский.
