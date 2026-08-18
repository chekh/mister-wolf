"""Тесты для calculator.py."""

import unittest

from calculator import add, multiply


class TestAdd(unittest.TestCase):
    """Тесты функции add."""

    def test_positive(self) -> None:
        self.assertEqual(add(2, 3), 5)

    def test_negative(self) -> None:
        self.assertEqual(add(-4, -6), -10)

    def test_zero_plus_positive(self) -> None:
        self.assertEqual(add(0, 7), 7)

    def test_positive_plus_zero(self) -> None:
        self.assertEqual(add(9, 0), 9)

    def test_zero_plus_zero(self) -> None:
        self.assertEqual(add(0, 0), 0)


class TestMultiply(unittest.TestCase):
    """Тесты функции multiply."""

    def test_positive(self) -> None:
        self.assertEqual(multiply(3, 4), 12)

    def test_negative(self) -> None:
        self.assertEqual(multiply(-3, -4), 12)

    def test_zero_times_positive(self) -> None:
        self.assertEqual(multiply(0, 5), 0)

    def test_positive_times_zero(self) -> None:
        self.assertEqual(multiply(7, 0), 0)

    def test_zero_times_zero(self) -> None:
        self.assertEqual(multiply(0, 0), 0)


if __name__ == "__main__":
    unittest.main()
