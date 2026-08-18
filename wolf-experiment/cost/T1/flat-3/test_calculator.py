"""unittest-тесты для calculator.py (COST-T1, flat-3).

Покрытие: положительные числа, отрицательные числа, ноль.
Запуск: python3 cost/T1/flat-3/test_calculator.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from calculator import add, multiply


class TestAdd(unittest.TestCase):
    """Тесты сложения."""

    def test_add_positive(self):
        """Сложение положительных чисел."""
        self.assertEqual(add(2, 3), 5)
        self.assertEqual(add(0.5, 0.25), 0.75)

    def test_add_negative(self):
        """Сложение отрицательных чисел и смешанных знаков."""
        self.assertEqual(add(-2, -3), -5)
        self.assertEqual(add(-2, 3), 1)
        self.assertEqual(add(2, -3), -1)

    def test_add_zero(self):
        """Сложение с нулём."""
        self.assertEqual(add(0, 0), 0)
        self.assertEqual(add(0, 5), 5)
        self.assertEqual(add(-5, 0), -5)


class TestMultiply(unittest.TestCase):
    """Тесты умножения."""

    def test_multiply_positive(self):
        """Умножение положительных чисел."""
        self.assertEqual(multiply(2, 3), 6)
        self.assertEqual(multiply(0.5, 4), 2)

    def test_multiply_negative(self):
        """Умножение отрицательных чисел и смешанных знаков."""
        self.assertEqual(multiply(-2, -3), 6)
        self.assertEqual(multiply(-2, 3), -6)
        self.assertEqual(multiply(2, -3), -6)

    def test_multiply_zero(self):
        """Умножение на ноль."""
        self.assertEqual(multiply(0, 0), 0)
        self.assertEqual(multiply(0, 7), 0)
        self.assertEqual(multiply(-7, 0), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
