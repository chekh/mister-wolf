"""Тесты RateLimiter без реального ожидания: время управляется FakeClock.

Запуск: python3 cost/T2/flat-3/test_rate_limiter.py
"""

import unittest

from rate_limiter import RateLimiter, RateLimitError


class FakeClock:
    """Детерминированный источник времени с ручным продвижением."""

    def __init__(self, start: float = 0.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class RateLimiterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = FakeClock()
        self.limiter = RateLimiter(
            max_requests=3, window_seconds=10.0, clock=self.clock
        )

    # --- Базовое поведение ---

    def test_requests_within_limit_pass(self) -> None:
        for _ in range(3):
            self.limiter.acquire("alice")

    def test_exceeding_limit_raises(self) -> None:
        for _ in range(3):
            self.limiter.acquire("alice")
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("alice")

    def test_recovery_after_full_window(self) -> None:
        for _ in range(3):
            self.limiter.acquire("alice")
        self.clock.advance(10.0)
        # Окно полностью истекло — лимит восстановлен.
        for _ in range(3):
            self.limiter.acquire("alice")

    def test_clients_are_independent(self) -> None:
        for _ in range(3):
            self.limiter.acquire("alice")
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("alice")
        # Лимит bob не зависит от исчерпанного лимита alice.
        for _ in range(3):
            self.limiter.acquire("bob")

    # --- Граничные случаи ---

    def test_boundary_exact_window_edge_releases_slot(self) -> None:
        # Отметка ровно на границе окна (t=0, окно 10, сейчас t=10) истекла.
        self.limiter.acquire("alice")  # t=0
        self.clock.advance(10.0)
        for _ in range(3):  # t=10: слот освободился
            self.limiter.acquire("alice")
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("alice")

    def test_boundary_sliding_partial_expiry(self) -> None:
        # Окно скользящее: слоты освобождаются по одному, а не всем окном.
        self.limiter.acquire("alice")  # t=0
        self.clock.advance(6.0)
        self.limiter.acquire("alice")  # t=6
        self.clock.advance(6.0)  # t=12: отметка t=0 истекла, t=6 активна
        self.limiter.acquire("alice")  # активны t=6, t=12
        self.limiter.acquire("alice")  # активны t=6, t=12, t=12
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("alice")

    def test_boundary_rejection_does_not_extend_window(self) -> None:
        # Отклонённый запрос не занимает слот и не меняет окно:
        # серия отказов не «замораживает» и не расширяет историю.
        for _ in range(3):
            self.limiter.acquire("alice")  # t=0
        for _ in range(5):
            with self.assertRaises(RateLimitError):
                self.limiter.acquire("alice")
        self.clock.advance(10.0)
        for _ in range(3):
            self.limiter.acquire("alice")  # окно чистое — снова 3 запроса


if __name__ == "__main__":
    unittest.main()
