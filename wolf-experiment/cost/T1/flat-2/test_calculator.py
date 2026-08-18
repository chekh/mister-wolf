"""Unittest-тесты для калькулятора COST-T1 (flat-2).

Покрытие: положительные числа, отрицательные числа, ноль.
Только stdlib.
"""

import unittest

from calculator import add, multiply


class TestAdd(unittest.TestCase):
    """Тесты функции add."""

    def test_add_positive(self):
        """Сложение положительных чисел."""
        self.assertEqual(add(2, 3), 5)
        self.assertEqual(add(0.5, 0.25), 0.75)

    def test_add_negative(self):
        """Сложение отрицательных чисел."""
        self.assertEqual(add(-2, -3), -5)
        self.assertEqual(add(-1, 5), 4)

    def test_add_zero(self):
        """Сложение с нулём."""
        self.assertEqual(add(0, 0), 0)
        self.assertEqual(add(7, 0), 7)
        self.assertEqual(add(0, -7), -7)


class TestMultiply(unittest.TestCase):
    """Тесты функции multiply."""

    def test_multiply_positive(self):
        """Умножение положительных чисел."""
        self.assertEqual(multiply(2, 3), 6)
        self.assertEqual(multiply(0.5, 4), 2)

    def test_multiply_negative(self):
        """Умножение отрицательных чисел."""
        self.assertEqual(multiply(-2, 3), -6)
        self.assertEqual(multiply(-2, -3), 6)

    def test_multiply_zero(self):
        """Умножение на ноль."""
        self.assertEqual(multiply(0, 0), 0)
        self.assertEqual(multiply(123, 0), 0)
        self.assertEqual(multiply(0, -123), 0)


if __name__ == "__main__":
    unittest.main()
