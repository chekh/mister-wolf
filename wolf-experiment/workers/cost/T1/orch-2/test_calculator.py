"""Unit-тесты для модуля calculator (add, multiply)."""

import unittest

from calculator import add, multiply


class TestAdd(unittest.TestCase):
    """Тесты функции add."""

    def test_add_positive(self) -> None:
        self.assertEqual(add(2, 3), 5)

    def test_add_negative(self) -> None:
        self.assertEqual(add(-2, -3), -5)

    def test_add_zero(self) -> None:
        self.assertEqual(add(0, 5), 5)
        self.assertEqual(add(0, 0), 0)


class TestMultiply(unittest.TestCase):
    """Тесты функции multiply."""

    def test_multiply_positive(self) -> None:
        self.assertEqual(multiply(2, 3), 6)

    def test_multiply_negative(self) -> None:
        self.assertEqual(multiply(-2, -3), 6)

    def test_multiply_zero(self) -> None:
        self.assertEqual(multiply(0, 5), 0)
        self.assertEqual(multiply(0, 0), 0)


if __name__ == "__main__":
    unittest.main()
