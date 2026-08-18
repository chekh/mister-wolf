"""Тесты для in-memory rate limiter (скользящее окно, независимые клиенты).

Все тесты используют FakeClock — время продвигается вручную,
реальные паузы отсутствуют.
"""

from __future__ import annotations

import time
import unittest
from typing import Callable

from rate_limiter import RateLimitError, RateLimiter


class FakeClock:
    """Имитация часов с ручным управлением временем.

    Attributes:
        _now: Текущее время (монотонно возрастает через advance).
    """

    def __init__(self, initial: float = 1000.0) -> None:
        self._now: float = initial

    def __call__(self) -> float:
        """Вернуть текущее время."""
        return self._now

    def advance(self, seconds: float) -> None:
        """Продвинуть время на указанное количество секунд."""
        self._now += seconds


class TestRateLimiter(unittest.TestCase):
    """Тесты для RateLimiter."""

    # ------------------------------------------------------------------
    # Основные сценарии
    # ------------------------------------------------------------------

    def test_exceeds_limit_raises_rate_limit_error(self) -> None:
        """Превышение лимита: max_requests вызовов успешны, следующий — ошибка."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=3, window_seconds=10.0, clock=clock)

        # Первые 3 вызова — успех
        limiter.acquire("client1")
        limiter.acquire("client1")
        limiter.acquire("client1")

        # Четвёртый — превышение
        with self.assertRaises(RateLimitError):
            limiter.acquire("client1")

    def test_window_expiry_allows_new_request(self) -> None:
        """Восстановление после окна: advance(window_seconds) освобождает лимит."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=5.0, clock=clock)

        limiter.acquire("client1")
        limiter.acquire("client1")

        # Лимит исчерпан
        with self.assertRaises(RateLimitError):
            limiter.acquire("client1")

        # Продвигаем время ровно на window_seconds — старые метки неактивны
        clock.advance(5.0)
        limiter.acquire("client1")  # Не должен кидать исключение

    def test_clients_are_independent(self) -> None:
        """Независимость клиентов: лимит клиента A не влияет на клиента B."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)

        limiter.acquire("a")

        # Клиент a исчерпан
        with self.assertRaises(RateLimitError):
            limiter.acquire("a")

        # Клиент b свободен
        limiter.acquire("b")  # Успешно

    # ------------------------------------------------------------------
    # Граничные случаи
    # ------------------------------------------------------------------

    def test_exactly_max_requests_all_succeed(self) -> None:
        """Ровно max_requests запросов — все успешны, без ошибки."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=5, window_seconds=60.0, clock=clock)

        for _ in range(5):
            limiter.acquire("client1")  # Ни один не должен кидать

    def test_window_minus_epsilon_still_blocks(self) -> None:
        """Метка ЕЩЁ активна при advance(window_seconds - epsilon).

        Активность определяется строгим неравенством: (now - t) < window_seconds.
        При сдвиге на window_seconds - 0.001 неравенство выполняется, лимит
        сохраняется.
        """
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)

        limiter.acquire("client1")

        # Сдвиг на 9.999 — метка ещё активна (1009.999 - 1000 < 10)
        clock.advance(10.0 - 0.001)

        with self.assertRaises(RateLimitError):
            limiter.acquire("client1")

    def test_constructor_rejects_zero_max_requests(self) -> None:
        """ValueError при max_requests=0."""
        clock = FakeClock()
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=0, window_seconds=10.0, clock=clock)

    def test_constructor_rejects_zero_window_seconds(self) -> None:
        """ValueError при window_seconds=0."""
        clock = FakeClock()
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=5, window_seconds=0.0, clock=clock)

    def test_constructor_rejects_negative_max_requests(self) -> None:
        """ValueError при отрицательном max_requests."""
        clock = FakeClock()
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=-1, window_seconds=10.0, clock=clock)

    def test_constructor_rejects_negative_window_seconds(self) -> None:
        """ValueError при отрицательном window_seconds."""
        clock = FakeClock()
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=5, window_seconds=-1.0, clock=clock)

    def test_sliding_window_expires_stamps_one_by_one(self) -> None:
        """Скользящее окно: метки истекают по одной при постепенном advance.

        Паттерн: limiter(1, 3s). acquire на t=0, t=1, t=2 — три успешных
        (запрос на t=2 добавляет третью метку, но лимит уже исчерпан после
        третьего acquire при max_requests=3). Затем при advance(1) метка t=0
        истекает,名额 освобождается, следующий acquire успешен.
        """
        clock = FakeClock()
        limiter = RateLimiter(max_requests=3, window_seconds=3.0, clock=clock)

        limiter.acquire("client1")  # t=1000
        clock.advance(1.0)
        limiter.acquire("client1")  # t=1001
        clock.advance(1.0)
        limiter.acquire("client1")  # t=1002 — ровно лимит

        # Все 3 метки активны, лимит исчерпан
        with self.assertRaises(RateLimitError):
            limiter.acquire("client1")

        # Продвигаем на 1с: метка t=1000 истекла (1003 - 1000 = 3, не < 3)
        clock.advance(1.0)
        limiter.acquire("client1")  # Успешно — освободилась одна ячейка

        # Снова исчерпан (метки: 1001, 1002, 1003)
        with self.assertRaises(RateLimitError):
            limiter.acquire("client1")

    def test_rate_limit_error_does_not_alter_state(self) -> None:
        """RateLimitError не изменяет состояние (количество активных меток).

        После неудачного acquire количество успешных попыток до следующего
        ошибки не увеличивается.
        """
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)

        limiter.acquire("client1")
        limiter.acquire("client1")

        # Неудачные вызовы не добавляют метки
        for _ in range(5):
            with self.assertRaises(RateLimitError):
                limiter.acquire("client1")

        # После освобождения окна — лимит полностью свободен (2 слота),
        # а не 2 - N неудачных вызовов
        clock.advance(10.0)
        limiter.acquire("client1")
        limiter.acquire("client1")

        # И третий всё ещё невозможен
        with self.assertRaises(RateLimitError):
            limiter.acquire("client1")


if __name__ == "__main__":
    unittest.main()
