"""Unittest-тесты для модуля calculator (add, multiply)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import calculator


class TestAdd(unittest.TestCase):
    """Тесты для calculator.add."""

    def test_add_positive(self):
        self.assertEqual(calculator.add(2, 3), 5)
        self.assertAlmostEqual(calculator.add(0.1, 0.2), 0.3)
        self.assertEqual(calculator.add(100, 200), 300)

    def test_add_negative(self):
        self.assertEqual(calculator.add(-1, -2), -3)
        self.assertEqual(calculator.add(-10, -5), -15)
        self.assertEqual(calculator.add(-3.5, -1.5), -5.0)

    def test_add_zero(self):
        self.assertEqual(calculator.add(0, 0), 0)
        self.assertEqual(calculator.add(5, 0), 5)
        self.assertEqual(calculator.add(0, -7), -7)


class TestMultiply(unittest.TestCase):
    """Тесты для calculator.multiply."""

    def test_multiply_positive(self):
        self.assertEqual(calculator.multiply(2, 3), 6)
        self.assertEqual(calculator.multiply(4, 5), 20)
        self.assertEqual(calculator.multiply(1.5, 2), 3.0)

    def test_multiply_negative(self):
        self.assertEqual(calculator.multiply(-2, -3), 6)
        self.assertEqual(calculator.multiply(-4, 5), -20)
        self.assertEqual(calculator.multiply(7, -3), -21)

    def test_multiply_zero(self):
        self.assertEqual(calculator.multiply(0, 0), 0)
        self.assertEqual(calculator.multiply(5, 0), 0)
        self.assertEqual(calculator.multiply(0, -7), 0)


if __name__ == "__main__":
    unittest.main()
