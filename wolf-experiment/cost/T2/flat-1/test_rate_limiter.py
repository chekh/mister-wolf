"""Тесты RateLimiter (COST-T2, flat-1). Только stdlib, без реальных sleep.

Запуск: python3 cost/T2/flat-1/test_rate_limiter.py
"""

from __future__ import annotations

import unittest

from rate_limiter import RateLimiter, RateLimitError


class FakeClock:
    """Инъекция времени: advance() двигает стрелку без sleep."""

    def __init__(self, start: float = 1000.0) -> None:
        self.now = float(start)

    def __call__(self) -> float:
        return self.now

    def advance(self, dt: float) -> None:
        self.now += float(dt)


class RateLimiterTests(unittest.TestCase):
    # --- основной сценарий: превышение лимита ---

    def test_first_n_pass_then_limit_exceeded(self) -> None:
        clock = FakeClock()
        rl = RateLimiter(max_requests=3, window_seconds=60.0, clock=clock)
        for _ in range(3):
            rl.acquire("a")  # все три проходят
        with self.assertRaises(RateLimitError):
            rl.acquire("a")  # четвёртый — превышение

    def test_error_repeats_until_window_passes(self) -> None:
        clock = FakeClock()
        rl = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)
        rl.acquire("a")
        clock.advance(3.0)
        with self.assertRaises(RateLimitError):
            rl.acquire("a")
        clock.advance(3.0)  # t=6, всё ещё внутри окна
        with self.assertRaises(RateLimitError):
            rl.acquire("a")

    # --- восстановление после окна ---

    def test_recovery_after_full_window(self) -> None:
        clock = FakeClock()
        rl = RateLimiter(max_requests=2, window_seconds=30.0, clock=clock)
        rl.acquire("a")
        rl.acquire("a")
        with self.assertRaises(RateLimitError):
            rl.acquire("a")
        clock.advance(30.0)
        rl.acquire("a")  # окно полностью освободилось
        rl.acquire("a")
        with self.assertRaises(RateLimitError):
            rl.acquire("a")  # лимит снова исчерпан

    # --- независимость клиентов ---

    def test_clients_are_independent(self) -> None:
        clock = FakeClock()
        rl = RateLimiter(max_requests=1, window_seconds=60.0, clock=clock)
        rl.acquire("alice")
        with self.assertRaises(RateLimitError):
            rl.acquire("alice")
        rl.acquire("bob")  # лимит bob не тронут лимитом alice
        rl.acquire("carol")

    # --- граничные случаи ---

    def test_boundary_exact_window_age_request_frees_slot(self) -> None:
        # Граница 1: метка ровно window_seconds назад уже вышла из окна.
        clock = FakeClock()
        rl = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)
        rl.acquire("a")           # t = 1000.0
        clock.advance(9.999999)
        with self.assertRaises(RateLimitError):
            rl.acquire("a")       # ещё внутри
        clock.advance(0.000001)   # t = 1010.0 ровно: метка 1000.0 выпала
        rl.acquire("a")           # должно пройти

    def test_boundary_partial_recovery_sliding_window(self) -> None:
        # Граница 2: скользящее окно освобождает слоты частично.
        clock = FakeClock()
        rl = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)
        rl.acquire("a")           # t = 1000.0
        clock.advance(5.0)
        rl.acquire("a")           # t = 1005.0 — лимит исчерпан
        with self.assertRaises(RateLimitError):
            rl.acquire("a")
        clock.advance(5.0)        # t = 1010.0: метка 1000.0 выпала, 1005.0 жива
        rl.acquire("a")           # ровно один слот свободен
        with self.assertRaises(RateLimitError):
            rl.acquire("a")       # второй подряд — снова блок

    def test_boundary_two_windows_do_not_merge(self) -> None:
        # Граница 3: запросы из разных окон не суммируются сверх лимита
        # одного окна (окно отсчитывается от последнего запроса).
        clock = FakeClock()
        rl = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)
        rl.acquire("a")           # t = 1000.0
        clock.advance(10.0)
        rl.acquire("a")           # t = 1010.0, история чиста
        clock.advance(9.0)
        rl.acquire("a")           # t = 1019.0: 1010.0 ещё в окне — 2/2, ок
        with self.assertRaises(RateLimitError):
            rl.acquire("a")

    # --- контракт конструктора и значения по умолчанию ---

    def test_invalid_constructor_args(self) -> None:
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=0, window_seconds=10.0)
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=2, window_seconds=0.0)
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=2, window_seconds=-1.0, clock=FakeClock())

    def test_default_clock_works_without_injection(self) -> None:
        # Значение по умолчанию time.monotonic: пара мгновенных запросов
        # без sleep — только контракт сигнатуры и работоспособность.
        rl = RateLimiter(max_requests=2, window_seconds=60.0)
        rl.acquire("x")
        rl.acquire("x")
        with self.assertRaises(RateLimitError):
            rl.acquire("x")


if __name__ == "__main__":
    unittest.main(verbosity=2)
