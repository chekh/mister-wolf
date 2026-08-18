# -*- coding: utf-8 -*-
"""Тесты in-memory rate limiter (COST-T2, flat-2). Только stdlib, без реальных sleep."""

import unittest

from rate_limiter import RateLimiter, RateLimitError


class FakeClock:
    """Поддельные часы: время двигается только явным advance()."""

    def __init__(self) -> None:
        self.now: float = 1000.0  # произвольная стартовая точка

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TestRateLimiterBasics(unittest.TestCase):
    """Базовое поведение: лимит и исключение при превышении."""

    def test_within_limit_allows_all_requests(self):
        clock = FakeClock()
        limiter = RateLimiter(max_requests=3, window_seconds=60.0, clock=clock)
        for _ in range(3):
            limiter.acquire("alice")  # не должно бросить

    def test_exceeding_limit_raises(self):
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=60.0, clock=clock)
        limiter.acquire("alice")
        limiter.acquire("alice")
        with self.assertRaises(RateLimitError):
            limiter.acquire("alice")


class TestWindowRecovery(unittest.TestCase):
    """Восстановление после истечения окна."""

    def test_requests_recover_after_window_passes(self):
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=30.0, clock=clock)
        limiter.acquire("alice")
        limiter.acquire("alice")
        with self.assertRaises(RateLimitError):
            limiter.acquire("alice")
        clock.advance(30.0)  # окно истекло
        limiter.acquire("alice")  # снова можно

    def test_old_requests_expire_one_by_one(self):
        """Окно скользящее: каждый запрос истекает по своему сроку."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10.0, clock=clock)
        limiter.acquire("alice")          # t=1000, истекает в 1010
        clock.advance(5.0)
        limiter.acquire("alice")          # t=1005, истекает в 1015
        with self.assertRaises(RateLimitError):
            limiter.acquire("alice")
        clock.advance(5.0)                # t=1010: первый истёк, второй ещё активен
        limiter.acquire("alice")          # место освободилось
        with self.assertRaises(RateLimitError):
            limiter.acquire("alice")      # второй (t=1005) ещё в окне


class TestClientIsolation(unittest.TestCase):
    """Независимость клиентов: лимит одного не влияет на другого."""

    def test_clients_are_independent(self):
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=60.0, clock=clock)
        limiter.acquire("alice")
        with self.assertRaises(RateLimitError):
            limiter.acquire("alice")
        limiter.acquire("bob")  # bob не задет лимитом alice

    def test_unknown_client_never_throws_first_time(self):
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=60.0, clock=clock)
        limiter.acquire("alice")
        limiter.acquire("bob")
        limiter.acquire("carol")


class TestBoundaryCases(unittest.TestCase):
    """Граничные случаи."""

    def test_acquire_exactly_at_window_boundary_expires_old(self):
        """Запрос ровно window_seconds назад истекает: строгое неравенство возраста."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)
        limiter.acquire("alice")   # t=1000
        clock.advance(10.0)        # t=1010: возраст первого ровно 10.0 -> истёк
        limiter.acquire("alice")   # должно пройти

    def test_just_before_window_boundary_still_limited(self):
        """За эпсилон до границы окна старый запрос ещё считается."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=10.0, clock=clock)
        limiter.acquire("alice")   # t=1000
        clock.advance(9.999)       # чуть меньше окна
        with self.assertRaises(RateLimitError):
            limiter.acquire("alice")

    def test_zero_max_requests_rejects_everything(self):
        """Вырожденный лимит 0: ни один запрос не проходит."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=0, window_seconds=60.0, clock=clock)
        with self.assertRaises(RateLimitError):
            limiter.acquire("alice")

    def test_fractional_window_seconds(self):
        """Дробное окно (float) работает корректно."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=0.5, clock=clock)
        limiter.acquire("alice")
        clock.advance(0.5)
        limiter.acquire("alice")


class TestClockInjection(unittest.TestCase):
    """Инъекция времени обязательна: дефолт — time.monotonic."""

    def test_default_clock_is_monotonic(self):
        import time
        limiter = RateLimiter(max_requests=1, window_seconds=60.0)
        self.assertIs(limiter._clock, time.monotonic)

    def test_constructor_rejects_bad_arguments(self):
        clock = FakeClock()
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=-1, window_seconds=60.0, clock=clock)
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=1, window_seconds=0.0, clock=clock)
        with self.assertRaises(TypeError):
            RateLimiter(max_requests=1, window_seconds=60.0, clock="not-callable")  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
