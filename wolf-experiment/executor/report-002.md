# Task Report: TEST-002

> **Пометка: довыполнение после прерывания.** Прошлый процесс был прерван
> на фазе исполнения после создания файлов воркерами; данная сессия —
> довыполнение по coordinator/task-brief-002.md и coordinator/decision-002.md
> без пересоздания готового.

## Metadata
- task_brief: TEST-002
- executor: executor-lead
- status: completed

## Summary

Модуль `workers/expr.py` (лексер + рекурсивный спуск, `evaluate(expression: str) -> float`)
и тесты `workers/test_expr.py` (36 тестов, unittest) созданы воркерами в прерванной
сессии и соответствуют Плану A из decision-002. В данной сессии доделано:
верификация тестов обоими способами запуска, точечный фикс импорта в тестах
(прямой запуск `python3 workers/test_expr.py` падал с `ModuleNotFoundError`),
обязательное ревью worker-reviewer (вердикт APPROVE), отчёт.

## Что было готово до прерывания
- `workers/expr.py` — лексер `_tokenize`, класс `_Parser`, публичная `evaluate`.
- `workers/test_expr.py` — класс `TestEvaluate(unittest.TestCase)`, 36 тестов.

## Что доделано в данной сессии
- Прогон тестов обоими способами; подтверждён дефект прямого запуска.
- W1 (worker-implementer, фиксер): блок импорта в `workers/test_expr.py` переведён
  на try/except — основной путь `from workers.expr import evaluate` (namespace
  package) сохранён; fallback (только при `ModuleNotFoundError`) добавляет корень
  проекта в `sys.path` через `pathlib`. Тело тестов и `workers/expr.py` не менялись.
- W2 (worker-reviewer): ревью обоих файлов против брифа и decision-002 дословно.
- Повторная верификация, grep-проверка запретов, данный отчёт.

## Changes
- created (до прерывания, воркерами): `workers/expr.py`, `workers/test_expr.py`
- modified (данная сессия, воркером-фиксером): `workers/test_expr.py` (только блок импортов, строки 5–13)

## Workers Used

| # | Подзадача | Результат |
|---|---|---|
| 1 | worker-implementer (фиксер): устранение зависимости прямого запуска тестов от cwd/sys.path, сохранение namespace-импорта | OK: try/except-импорт; обе проверки зелёные (36 тестов) |
| 2 | worker-reviewer: ревью expr.py и test_expr.py против брифа/decision-002, включая запреты | **APPROVE** (0 блокирующих замечаний; 2 неблокирующих наблюдения) |

Использовано 2 из 3 слотов; третий слот (фикс после CHANGES) не потребовался.

## Вердикт ревьюера

**APPROVE.** Проверены все Acceptance Criteria и все фиксации контракта
decision-002 (включая краевые случаи `3..5`, `.`, `1e3`, `()`, `1 2`, `+3`,
`--3`, `2*-3`, `1/(2-2)`), отсутствие `eval`/`exec`/`compile` и косвенных
обходов (`__import__`, `importlib`, `getattr(__builtins__, ...)`), только stdlib.
Неблокирующие наблюдения: поддержка записи `5.` (соответствует `\d+(\.\d*)?`
из decision-002, покрыта тестом) и корректная обработка unicode-минуса.

## Validation Results

Прогоны из корня `wolf-experiment/`:

1. `python3 -m unittest workers.test_expr -v` — **Ran 36 tests ... OK** (exit 0).
2. `python3 workers/test_expr.py` — до фикса: `ModuleNotFoundError: No module named
   'workers'` (exit 1); после фикса: **Ran 36 tests ... OK** (exit 0).
3. Grep-проверка запрета (rg `\b(eval|exec|compile)\b` по `workers/*.py`):
   `workers/expr.py:0`, `workers/test_expr.py:0` (и `calculator.py:0`,
   `test_calculator.py:0` из TEST-001) — **вхождений нет**.
4. Существование файлов: `workers/expr.py` (225 строк), `workers/test_expr.py`
   (187 строк) — подтверждено чтением.

## Acceptance Criteria брифа (пунктуально)

- [x] Существует `workers/expr.py` с функцией `evaluate(expression: str) -> float` — сигнатура точная, строгая типизация, Google-style docstring.
- [x] Поддержаны `+ - * /`, скобки, вложенные скобки, приоритет операций, целые и дробные литералы — грамматика expr/term/factor/primary; тесты приоритета и вложенных скобок зелёные.
- [x] Деление на ноль бросает `ZeroDivisionError` (`1/0`, `1/0.0`, `1/(2-2)` — проверка на вычисленный ноль); некорректный синтаксис — `SyntaxError` (пустая строка, непарные скобки, `()`, неизвестные символы, оператор без операнда, мусор в конце, `1e3`, унарный плюс).
- [x] Существует `workers/test_expr.py` на `unittest` с покрытием: все операции, приоритет, вложенные скобки, деление, ошибки — 36 тестов, все пункты обязательного списка decision-002 покрыты.
- [x] Тесты зелёные: оба способа запуска — 36/36 OK, exit 0.
- [x] Ревью worker-reviewer проведено — вердикт APPROVE.

## Constraints

- Только stdlib: `dataclasses`, `enum`, `typing` (expr.py); `sys`, `unittest`, `pathlib` (test_expr.py). Внешних зависимостей нет.
- `eval`/`exec`/`compile` отсутствуют (в любой форме, включая косвенные обходы) — grep и ревью подтверждают.
- Код — только в `workers/`; за пределы `wolf-experiment/` не выходили.
