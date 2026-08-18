"""Тесты для модуля workers.expr."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

try:  # запуск как модуль из корня проекта: python3 -m unittest workers.test_expr
    from workers.expr import evaluate
except ModuleNotFoundError:  # прямой запуск: python3 workers/test_expr.py
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from workers.expr import evaluate


class TestEvaluate(unittest.TestCase):
    """Тесты калькулятора арифметических выражений."""

    # ------------------------------------------------------------------
    # 1. Все 4 бинарные операции
    # ------------------------------------------------------------------

    def test_addition(self) -> None:
        self.assertEqual(evaluate("2+3"), 5.0)

    def test_subtraction(self) -> None:
        self.assertEqual(evaluate("7-4"), 3.0)

    def test_multiplication(self) -> None:
        self.assertEqual(evaluate("6*7"), 42.0)

    def test_division(self) -> None:
        self.assertEqual(evaluate("8/2"), 4.0)

    # ------------------------------------------------------------------
    # 2. Приоритет операций
    # ------------------------------------------------------------------

    def test_precedence_mul_before_add(self) -> None:
        self.assertEqual(evaluate("2+3*4"), 14.0)

    def test_precedence_div_before_sub(self) -> None:
        self.assertEqual(evaluate("10-6/3"), 8.0)

    def test_precedence_parens_override(self) -> None:
        self.assertEqual(evaluate("(2+3)*4"), 20.0)

    # ------------------------------------------------------------------
    # 3. Вложенные скобки
    # ------------------------------------------------------------------

    def test_nested_parens(self) -> None:
        self.assertEqual(evaluate("((1+2)*(3+4))"), 21.0)

    def test_nested_parens_subtraction(self) -> None:
        self.assertEqual(evaluate("2*(3-(4-1))"), 0.0)

    # ------------------------------------------------------------------
    # 4. Целые и дробные литералы
    # ------------------------------------------------------------------

    def test_float_literal(self) -> None:
        self.assertAlmostEqual(evaluate("3.14"), 3.14)

    def test_leading_dot(self) -> None:
        self.assertEqual(evaluate(".5*4"), 2.0)

    def test_division_produces_float(self) -> None:
        self.assertEqual(evaluate("1/2"), 0.5)

    # ------------------------------------------------------------------
    # 5. Унарный минус
    # ------------------------------------------------------------------

    def test_unary_minus_at_start(self) -> None:
        self.assertEqual(evaluate("-3+5"), 2.0)

    def test_unary_minus_after_operator(self) -> None:
        self.assertEqual(evaluate("2*-3"), -6.0)

    def test_unary_minus_before_parens(self) -> None:
        self.assertEqual(evaluate("-(2+3)"), -5.0)

    def test_double_unary_minus(self) -> None:
        self.assertEqual(evaluate("--3"), 3.0)

    # ------------------------------------------------------------------
    # 6. Пробелы игнорируются
    # ------------------------------------------------------------------

    def test_spaces_ignored(self) -> None:
        self.assertEqual(evaluate("  1 +   2 "), 3.0)

    # ------------------------------------------------------------------
    # 7. Тип результата — float
    # ------------------------------------------------------------------

    def test_result_is_float(self) -> None:
        result = evaluate("2+3")
        self.assertIsInstance(result, float)

    # ------------------------------------------------------------------
    # 8. ZeroDivisionError
    # ------------------------------------------------------------------

    def test_division_by_zero_literal(self) -> None:
        with self.assertRaises(ZeroDivisionError):
            evaluate("1/0")

    def test_division_by_zero_float(self) -> None:
        with self.assertRaises(ZeroDivisionError):
            evaluate("1/0.0")

    def test_division_by_computed_zero(self) -> None:
        with self.assertRaises(ZeroDivisionError):
            evaluate("1/(2-2)")

    # ------------------------------------------------------------------
    # 9. SyntaxError — различные случаи
    # ------------------------------------------------------------------

    def test_syntax_error_empty_string(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("")

    def test_syntax_error_only_spaces(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("   ")

    def test_syntax_error_unpaired_left_paren(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("(1+2")

    def test_syntax_error_unpaired_right_paren(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("1+2)")

    def test_syntax_error_empty_parens(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("()")

    def test_syntax_error_unknown_letter(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("1+a")

    def test_syntax_error_unknown_percent(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("1%2")

    def test_syntax_error_unicode_minus(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("1 − 2")

    def test_syntax_error_operator_without_operand_right(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("1 +")

    def test_syntax_error_operator_without_operand_left(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("* 3")

    def test_syntax_error_trailing_garbage(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("1 + 2 3")

    def test_syntax_error_scientific_notation(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("1e3")

    def test_syntax_error_unary_plus(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("+3")

    def test_syntax_error_two_numbers_in_a_row(self) -> None:
        with self.assertRaises(SyntaxError):
            evaluate("1 2")

    # ------------------------------------------------------------------
    # 10. Дополнительно: 5. валидно
    # ------------------------------------------------------------------

    def test_trailing_dot_number(self) -> None:
        self.assertEqual(evaluate("5."), 5.0)


if __name__ == "__main__":
    unittest.main()
