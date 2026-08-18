"""Калькулятор COST-T1 (итерация flat-2).

Простейшие арифметические операции: сложение и умножение.
Только stdlib, без зависимостей.
"""


def add(a: float, b: float) -> float:
    """Вернуть сумму двух чисел.

    Args:
        a: первое слагаемое.
        b: второе слагаемое.

    Returns:
        Сумма a + b.
    """
    return a + b


def multiply(a: float, b: float) -> float:
    """Вернуть произведение двух чисел.

    Args:
        a: первый множитель.
        b: второй множитель.

    Returns:
        Произведение a * b.
    """
    return a * b


if __name__ == "__main__":
    print(f"add(2, 3) = {add(2, 3)}")
    print(f"multiply(2, 3) = {multiply(2, 3)}")
