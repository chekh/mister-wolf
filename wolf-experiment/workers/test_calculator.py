"""Unittest-тесты для модуля calculator (add, multiply)."""

import unittest

from calculator import add, multiply


class TestAdd(unittest.TestCase):
    """Тесты функции add."""

    def test_positive(self) -> None:
        self.assertEqual(add(2, 3), 5)
        self.assertEqual(add(100, 200), 300)

    def test_zero(self) -> None:
        self.assertEqual(add(0, 5), 5)
        self.assertEqual(add(0, 0), 0)

    def test_negative(self) -> None:
        self.assertEqual(add(-2, -3), -5)
        self.assertEqual(add(-10, 7), -3)

    def test_float(self) -> None:
        self.assertAlmostEqual(add(0.5, 0.25), 0.75)
        self.assertAlmostEqual(add(1.1, 2.2), 3.3)


class TestMultiply(unittest.TestCase):
    """Тесты функции multiply."""

    def test_positive(self) -> None:
        self.assertEqual(multiply(2, 3), 6)
        self.assertEqual(multiply(4, 5), 20)

    def test_zero(self) -> None:
        self.assertEqual(multiply(0, 7), 0)
        self.assertEqual(multiply(0, 0), 0)

    def test_negative(self) -> None:
        self.assertEqual(multiply(-2, 3), -6)
        self.assertEqual(multiply(-4, -5), 20)

    def test_float(self) -> None:
        self.assertAlmostEqual(multiply(1.5, 2), 3.0)
        self.assertAlmostEqual(multiply(0.5, 0.4), 0.2)


if __name__ == "__main__":
    unittest.main()
