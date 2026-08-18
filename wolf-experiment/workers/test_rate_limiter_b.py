"""Unit tests for rate_limiter_b (fixed window counter).

All tests use an injectable FakeClock — no real time.sleep.
"""

from __future__ import annotations

import time
import unittest
from typing import Any

try:
    from workers.rate_limiter_b import RateLimiter, RateLimitError
except ImportError:  # прямой запуск файла: python3 workers/test_rate_limiter_b.py
    from rate_limiter_b import RateLimiter, RateLimitError


class FakeClock:
    """Injectable clock with manual time control."""

    def __init__(self, start: float = 0.0) -> None:
        self._now: float = start

    def __call__(self) -> float:
        return self._now

    def advance(self, dt: float) -> None:
        self._now += dt


class TestRateLimiter(unittest.TestCase):
    """Tests for RateLimiter (round B)."""

    # ------------------------------------------------------------------
    # 1. Limit exceeded
    # ------------------------------------------------------------------

    def test_limit_exceeded_raises_error(self) -> None:
        """N requests pass; (N+1)-th raises RateLimitError."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=3, window_seconds=60.0, clock=clock)

        for _ in range(3):
            limiter.acquire("alice")

        with self.assertRaises(RateLimitError) as ctx:
            limiter.acquire("alice")

        exc = ctx.exception
        self.assertEqual(exc.client_id, "alice")
        self.assertGreater(exc.retry_after, 0.0)
        # retry_after == window_start + T - now == 0 + 60 - 0 == 60
        self.assertAlmostEqual(exc.retry_after, 60.0)

    # ------------------------------------------------------------------
    # 2. Recovery after window
    # ------------------------------------------------------------------

    def test_recovery_after_window(self) -> None:
        """After advancing by T, counter resets and N requests pass again."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=60.0, clock=clock)

        limiter.acquire("bob")
        limiter.acquire("bob")

        # Still within window — should be rejected
        with self.assertRaises(Exception):
            limiter.acquire("bob")

        clock.advance(60.0)

        # New window — should accept requests from scratch
        limiter.acquire("bob")
        limiter.acquire("bob")

        # Back to limit
        with self.assertRaises(Exception):
            limiter.acquire("bob")

    # ------------------------------------------------------------------
    # 3. Client independence
    # ------------------------------------------------------------------

    def test_clients_independent(self) -> None:
        """One client's limit does not affect another."""
        clock = FakeClock()
        limiter = RateLimiter(max_requests=1, window_seconds=60.0, clock=clock)

        limiter.acquire("alice")
        with self.assertRaises(Exception):
            limiter.acquire("alice")

        # Different client — should pass
        limiter.acquire("bob")
        with self.assertRaises(Exception):
            limiter.acquire("bob")

    # ------------------------------------------------------------------
    # 4. Boundary — exact edge
    # ------------------------------------------------------------------

    def test_exact_boundary_opens_new_window(self) -> None:
        """advance(T) exactly opens a new window."""
        clock = FakeClock()
        T = 60.0
        limiter = RateLimiter(max_requests=1, window_seconds=T, clock=clock)

        limiter.acquire("c")
        # advance(T) → now - window_start = T >= T → new window
        clock.advance(T)
        limiter.acquire("c")  # should NOT raise

    def test_just_before_boundary_keeps_window(self) -> None:
        """advance(T - eps) does NOT open a new window."""
        clock = FakeClock()
        T = 60.0
        limiter = RateLimiter(max_requests=1, window_seconds=T, clock=clock)

        limiter.acquire("c")
        # advance(T - 0.5) → now - window_start = 59.5 < 60 → same window
        clock.advance(T - 0.5)
        with self.assertRaises(Exception):
            limiter.acquire("c")

    # ------------------------------------------------------------------
    # 5. Boundary — burst 2N on window boundary
    # ------------------------------------------------------------------

    def test_burst_2n_on_boundary(self) -> None:
        """N requests at end of window + N at start of next — all pass.

        Documents the accepted trade-off of the fixed-window algorithm.
        """
        clock = FakeClock()
        N = 5
        T = 60.0
        limiter = RateLimiter(max_requests=N, window_seconds=T, clock=clock)

        # Fill first window to the limit
        for _ in range(N):
            limiter.acquire("d")
        # Next request in same window must fail
        with self.assertRaises(Exception):
            limiter.acquire("d")

        # Cross the boundary — new window opens
        clock.advance(T)

        # N more requests pass (total 2N across two windows)
        for _ in range(N):
            limiter.acquire("d")

        # Now the second window is also full
        with self.assertRaises(Exception):
            limiter.acquire("d")

    # ------------------------------------------------------------------
    # 6. Constructor validation
    # ------------------------------------------------------------------

    def test_max_requests_lt_1_raises_value_error(self) -> None:
        """max_requests < 1 raises ValueError."""
        clock = FakeClock()
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=0, window_seconds=60.0, clock=clock)

        with self.assertRaises(ValueError):
            RateLimiter(max_requests=-5, window_seconds=60.0, clock=clock)

    def test_window_seconds_le_0_raises_value_error(self) -> None:
        """window_seconds <= 0 raises ValueError."""
        clock = FakeClock()
        with self.assertRaises(ValueError):
            RateLimiter(max_requests=10, window_seconds=0.0, clock=clock)

        with self.assertRaises(ValueError):
            RateLimiter(max_requests=10, window_seconds=-1.0, clock=clock)

    def test_non_callable_clock_raises_type_error(self) -> None:
        """Non-callable clock raises TypeError."""
        with self.assertRaises(TypeError):
            RateLimiter(max_requests=10, window_seconds=60.0, clock="not_a_clock")  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
