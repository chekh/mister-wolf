"""Тесты для in-memory rate limiter (RateLimiter).

Контракт тестируемого модуля rate_limiter.py:
- RateLimiter(max_requests, window_seconds, clock=...)
- acquire(client_id) — ok или RateLimitError
- клиенты независимы, окно слайдящее
"""

from __future__ import annotations

import time
from typing import Callable

import pytest

from rate_limiter import RateLimitError, RateLimiter


# ── FakeClock ────────────────────────────────────────────────────────────────


class FakeClock:
    """Инъектируемые часы с ручным управлением временем."""

    def __init__(self, start: float = 0.0) -> None:
        self._now: float = start

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


# ── Хелпер ───────────────────────────────────────────────────────────────────


def _limiter(
    max_requests: int = 3,
    window: float = 10.0,
    clock: Callable[[], float] | None = None,
) -> RateLimiter:
    return RateLimiter(
        max_requests=max_requests,
        window_seconds=window,
        clock=clock or FakeClock(),
    )


# ── Тесты: превышение лимита ───────────────────────────────────────────────


class TestRateLimitExceeded:
    def test_raises_after_max_requests(self) -> None:
        """Запрос сверх max_requests внутри окна вызывает RateLimitError."""
        clock = FakeClock()
        limiter = _limiter(max_requests=3, window=10.0, clock=clock)
        for i in range(3):
            limiter.acquire("c1")  # 3 запроса проходят
        with pytest.raises(RateLimitError):
            limiter.acquire("c1")  # 4-й — ошибка


# ── Тесты: восстановление после окна ─────────────────────────────────────────


class TestWindowRecovery:
    def test_acquire_passes_after_window_expires(self) -> None:
        """После продвижения clock на window_seconds лимит сбрасывается."""
        clock = FakeClock()
        limiter = _limiter(max_requests=2, window=5.0, clock=clock)
        limiter.acquire("c1")
        limiter.acquire("c1")
        with pytest.raises(RateLimitError):
            limiter.acquire("c1")
        # Окно истекло
        clock.advance(5.0)
        limiter.acquire("c1")  # должен пройти без ошибки

    def test_window_does_not_reset_early(self) -> None:
        """За долю секунды ДО истечения окна лимит не сбрасывается."""
        clock = FakeClock()
        limiter = _limiter(max_requests=1, window=10.0, clock=clock)
        limiter.acquire("c1")
        clock.advance(9.999)
        with pytest.raises(RateLimitError):
            limiter.acquire("c1")
        # Теперь ровно на границе
        clock.advance(0.001)  # total = 10.0
        limiter.acquire("c1")


# ── Тесты: независимость клиентов ───────────────────────────────────────────


class TestClientIsolation:
    def test_separate_clients_have_separate_counters(self) -> None:
        """Лимит одного клиента не влияет на другого."""
        clock = FakeClock()
        limiter = _limiter(max_requests=2, window=10.0, clock=clock)
        limiter.acquire("alice")
        limiter.acquire("alice")
        with pytest.raises(RateLimitError):
            limiter.acquire("alice")
        # bob ещё ничего не делал — его лимит свободен
        limiter.acquire("bob")
        limiter.acquire("bob")
        with pytest.raises(RateLimitError):
            limiter.acquire("bob")

    def test_recovery_is_per_client(self) -> None:
        """Окно одного клиента не влияет на окно другого."""
        clock = FakeClock()
        limiter = _limiter(max_requests=1, window=5.0, clock=clock)
        limiter.acquire("x")
        limiter.acquire("y")
        # Оба исчерпаны
        with pytest.raises(RateLimitError):
            limiter.acquire("x")
        with pytest.raises(RateLimitError):
            limiter.acquire("y")
        # Продвигаем время — восстанавливаются оба
        clock.advance(5.0)
        limiter.acquire("x")
        limiter.acquire("y")


# ── Граничные случаи ────────────────────────────────────────────────────────


class TestEdgeCases:
    def test_exactly_max_requests_pass_without_error(self) -> None:
        """Ровно max_requests запросов проходят без исключения."""
        clock = FakeClock()
        limiter = _limiter(max_requests=5, window=60.0, clock=clock)
        for _ in range(5):
            limiter.acquire("c")  # не должен бросать

    def test_max_requests_of_one(self) -> None:
        """Лимит = 1: первый запрос ок, второй — ошибка."""
        clock = FakeClock()
        limiter = _limiter(max_requests=1, window=1.0, clock=clock)
        limiter.acquire("solo")
        with pytest.raises(RateLimitError):
            limiter.acquire("solo")

    def test_request_exactly_on_window_boundary(self) -> None:
        """Запрос ровно в момент window_seconds после первого должен пройти."""
        clock = FakeClock()
        limiter = _limiter(max_requests=1, window=3.0, clock=clock)
        limiter.acquire("boundary")
        clock.advance(3.0)  # ровно граница
        limiter.acquire("boundary")  # должен пройти

    def test_multiple_clients_simultaneously(self) -> None:
        """Много клиентов одновременно — лимиты не «протекают» друг в друга."""
        clock = FakeClock()
        limiter = _limiter(max_requests=1, window=10.0, clock=clock)
        clients = [f"client_{i}" for i in range(100)]
        for cid in clients:
            limiter.acquire(cid)
        # Каждый исчерпал свой единственный запрос
        for cid in clients:
            with pytest.raises(RateLimitError):
                limiter.acquire(cid)
