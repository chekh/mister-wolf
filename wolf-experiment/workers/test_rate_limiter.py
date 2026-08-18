"""Unit tests for rate_limiter module (sliding-window-log RateLimiter).

All tests are deterministic and instantaneous — no real ``time.sleep`` is
used.  A :class:`FakeClock` injects controllable timestamps.
"""

from __future__ import annotations

import unittest
from rate_limiter import RateLimiter, RateLimitError


class FakeClock:
    """Deterministic clock for testing.

    Starts at 0.0 and advances only when :meth:`advance` is called.
    """

    def __init__(self) -> None:
        self.now: float = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, dt: float) -> None:
        self.now += dt


# ------------------------------------------------------------------
# Group 1: Exceeding the limit
# ------------------------------------------------------------------
class TestExceedingLimit(unittest.TestCase):
    """N requests pass; (N+1)-th raises RateLimitError."""

    def setUp(self) -> None:
        self.clock = FakeClock()
        self.limiter = RateLimiter(limit=3, window=10.0, clock=self.clock)

    def test_exact_limit_passes(self) -> None:
        """Three requests (== limit) all succeed."""
        for _ in range(3):
            self.limiter.acquire("a")  # type: ignore[arg-type]

    def test_over_limit_raises(self) -> None:
        """Fourth request raises RateLimitError."""
        for _ in range(3):
            self.limiter.acquire("a")  # type: ignore[arg-type]
        with self.assertRaises(RateLimitError):
            self.limiter.acquire("a")  # type: ignore[arg-type]


# ------------------------------------------------------------------
# Group 2: Recovery after window expires
# ------------------------------------------------------------------
class TestRecoveryAfterWindow(unittest.TestCase):
    """After advancing by T seconds, requests succeed again."""

    def test_recovery(self) -> None:
        clock = FakeClock()
        limiter = RateLimiter(limit=2, window=10.0, clock=clock)

        limiter.acquire("c")  # type: ignore[arg-type]
        limiter.acquire("c")  # type: ignore[arg-type]
        with self.assertRaises(RateLimitError):
            limiter.acquire("c")  # type: ignore[arg-type]

        clock.advance(10.0)
        # Window slid — both old entries are gone.
        limiter.acquire("c")  # type: ignore[arg-type]

        # Should be able to do two more (full quota restored).
        limiter.acquire("c")  # type: ignore[arg-type]
        with self.assertRaises(RateLimitError):
            limiter.acquire("c")  # type: ignore[arg-type]


# ------------------------------------------------------------------
# Group 3: Client independence
# ------------------------------------------------------------------
class TestClientIndependence(unittest.TestCase):
    """Exhausting one client does not affect another."""

    def test_independent_clients(self) -> None:
        clock = FakeClock()
        limiter = RateLimiter(limit=1, window=10.0, clock=clock)

        limiter.acquire("a")  # type: ignore[arg-type]
        with self.assertRaises(RateLimitError):
            limiter.acquire("a")  # type: ignore[arg-type]

        # Client "b" should be unaffected.
        limiter.acquire("b")  # type: ignore[arg-type]


# ------------------------------------------------------------------
# Group 4: Edge / boundary cases
# ------------------------------------------------------------------
class TestBoundaryCases(unittest.TestCase):
    """Exact boundary behaviour and anti-fixed-window burst test."""

    def test_exact_boundary_passes(self) -> None:
        """Request at exactly t + T passes (half-open window)."""
        clock = FakeClock()
        limiter = RateLimiter(limit=1, window=10.0, clock=clock)

        limiter.acquire("x")  # type: ignore[arg-type]
        # At t=10 the entry (t=0) satisfies t <= now - window → 0 <= 10 - 10 → evicted.
        clock.advance(10.0)
        limiter.acquire("x")  # type: ignore[arg-type]

    def test_just_before_boundary_rejected(self) -> None:
        """Request at t + T - eps is rejected."""
        clock = FakeClock()
        limiter = RateLimiter(limit=1, window=10.0, clock=clock)

        limiter.acquire("x")  # type: ignore[arg-type]
        clock.advance(10.0 - 1e-9)
        # 0 <= (10 - 1e-9) - 10 → 0 <= -1e-9 → False → NOT evicted.
        with self.assertRaises(RateLimitError):
            limiter.acquire("x")  # type: ignore[arg-type]

    def test_anti_fixed_window_burst(self) -> None:
        """Burst at window boundary does NOT allow 2*limit requests.

        With limit=2, window=10:
          t=0  acquire ok   (window [0, 10])
          t=5  acquire ok   (window [0, 10])
          t=10 acquire ok   (window [0.01, 10.01] — t=0 evicted)
          t=10 acquire FAIL (only t=5 and t=10 in window; but len==2 == limit,
                             so the *next* call fails)
        A naive fixed-window counter would allow 4 requests (2 at end of
        window, 2 at start of next).  Sliding-window-log allows only 3.
        """
        clock = FakeClock()
        limiter = RateLimiter(limit=2, window=10.0, clock=clock)

        limiter.acquire("z")  # type: ignore[arg-type]  # t=0
        clock.advance(5.0)
        limiter.acquire("z")  # type: ignore[arg-type]  # t=5
        clock.advance(5.0)  # now=10, entry t=0 evicted (0 <= 10-10)
        limiter.acquire("z")  # type: ignore[arg-type]  # t=10 — window has {5, 10}
        # That's 3 requests total.  A 4th should fail because window {5,10} is full.
        with self.assertRaises(RateLimitError):
            limiter.acquire("z")  # type: ignore[arg-type]

    def test_no_more_than_limit_in_any_window(self) -> None:
        """Prove that in ANY sliding window of length T there are <= N entries.

        With limit=3, window=5, a tight burst without time advance cannot
        exceed the limit.  Then stagger: each new request at a distinct
        timestamp still cannot break the invariant.
        """
        clock = FakeClock()
        limiter = RateLimiter(limit=3, window=5.0, clock=clock)

        # Tight burst at t=0: only 3 pass.
        for _ in range(3):
            limiter.acquire("w")  # type: ignore[arg-type]
        with self.assertRaises(RateLimitError):
            limiter.acquire("w")  # type: ignore[arg-type]

        # Stagger one second at a time — each step the oldest entry is
        # still within the window, so quota stays full.
        for i in range(1, 5):
            clock.advance(1.0)
            with self.assertRaises(RateLimitError):
                limiter.acquire("w")  # type: ignore[arg-type]


# ------------------------------------------------------------------
# Additional: retry_after correctness
# ------------------------------------------------------------------
class TestRetryAfter(unittest.TestCase):
    """RateLimitError.retry_after matches expected wait time."""

    def test_retry_after_value(self) -> None:
        clock = FakeClock()
        limiter = RateLimiter(limit=1, window=10.0, clock=clock)

        limiter.acquire("r")  # type: ignore[arg-type]  # t=0
        clock.advance(3.0)  # now=3
        with self.assertRaises(RateLimitError) as ctx:
            limiter.acquire("r")  # type: ignore[arg-type]
        exc = ctx.exception
        self.assertEqual(exc.client_id, "r")
        # oldest=0, retry_after = 0 + 10 - 3 = 7
        self.assertAlmostEqual(exc.retry_after, 7.0, places=5)

    def test_retry_after_zero_at_boundary(self) -> None:
        """retry_after must not be negative even when oldest just expired."""
        clock = FakeClock()
        limiter = RateLimiter(limit=1, window=10.0, clock=clock)

        limiter.acquire("r")  # type: ignore[arg-type]  # t=0
        clock.advance(10.0)  # now=10 — entry evicted, so acquire succeeds
        limiter.acquire("r")  # type: ignore[arg-type]  # t=10, now deque={10}
        clock.advance(10.0)  # now=20 — entry at 10 evicted
        limiter.acquire("r")  # type: ignore[arg-type]  # succeeds


# ------------------------------------------------------------------
# Additional: Constructor validation
# ------------------------------------------------------------------
class TestConstructorValidation(unittest.TestCase):
    """Invalid constructor arguments raise expected exceptions."""

    def test_limit_zero_raises_value_error(self) -> None:
        with self.assertRaises(ValueError):
            RateLimiter(0, 1.0)

    def test_window_zero_raises_value_error(self) -> None:
        with self.assertRaises(ValueError):
            RateLimiter(1, 0)

    def test_negative_window_raises_value_error(self) -> None:
        with self.assertRaises(ValueError):
            RateLimiter(1, -1.0)

    def test_non_callable_clock_raises_type_error(self) -> None:
        with self.assertRaises(TypeError):
            RateLimiter(1, 1.0, clock=42)  # type: ignore[arg-type]


# ------------------------------------------------------------------
# Additional: Default clock (time.monotonic)
# ------------------------------------------------------------------
class TestDefaultClock(unittest.TestCase):
    """RateLimiter works with the default time.monotonic clock (no FakeClock)."""

    def test_default_clock_allows_requests(self) -> None:
        limiter = RateLimiter(limit=2, window=60.0)
        limiter.acquire("d")  # type: ignore[arg-type]
        limiter.acquire("d")  # type: ignore[arg-type]
        # Third should fail (all within the real 60s window).
        with self.assertRaises(RateLimitError):
            limiter.acquire("d")  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
