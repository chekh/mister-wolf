"""Простой калькулятор: сложение и умножение."""

from __future__ import annotations

from typing import Union


Number = Union[int, float]


def add(a: Number, b: Number) -> Number:
    """Вернуть сумму двух чисел.

    Args:
        a: Первое слагаемое.
        b: Второе слагаемое.

    Returns:
        Сумма a + b. Тип результата совпадает с типом более широкого операнда
        (float, если хотя бы один аргумент — float).
    """
    return a + b


def multiply(a: Number, b: Number) -> Number:
    """Вернуть произведение двух чисел.

    Args:
        a: Первый множитель.
        b: Второй множитель.

    Returns:
        Произведение a * b. Тип результата совпадает с типом более широкого
        операнда (float, если хотя бы один аргумент — float).
    """
    return a * b


if __name__ == "__main__":
    print(f"add(2, 3)      = {add(2, 3)}")
    print(f"add(2.5, 3)    = {add(2.5, 3)}")
    print(f"multiply(4, 5) = {multiply(4, 5)}")
    print(f"multiply(2.5, 4) = {multiply(2.5, 4)}")
