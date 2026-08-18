"""Калькулятор для задачи COST-T1 (итерация flat-3, контрольный плоский прогон).

Только stdlib. Две операции: сложение и умножение.
"""


def add(a: float, b: float) -> float:
    """Вернуть сумму двух чисел.

    Args:
        a: Первое слагаемое.
        b: Второе слагаемое.

    Returns:
        Сумма a + b.
    """
    return a + b


def multiply(a: float, b: float) -> float:
    """Вернуть произведение двух чисел.

    Args:
        a: Первый множитель.
        b: Второй множитель.

    Returns:
        Произведение a * b.
    """
    return a * b


if __name__ == "__main__":
    print("add(2, 3) =", add(2, 3))
    print("multiply(2, 3) =", multiply(2, 3))
