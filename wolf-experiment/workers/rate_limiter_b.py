"""Rate limiter — fixed window counter (round B).

Trade-offs
----------
1. Burst up to 2N on window boundary
   N requests at the end of a window + N at the beginning of the next one
   all pass — this is the known price of the fixed-window algorithm,
   accepted consciously.
2. State is in-memory only and does not survive a process restart.
3. No eviction of inactive clients — memory grows linearly with the
   number of unique client IDs seen.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import Any


class RateLimitError(Exception):
    """Raised when a client exceeds the allowed request rate.

    Attributes:
        client_id: Identifier of the rate-limited client.
        retry_after: Seconds until the end of the current window (always > 0).
    """

    def __init__(self, client_id: str, retry_after: float) -> None:
        self.client_id: str = client_id
        self.retry_after: float = retry_after
        super().__init__(
            f"Rate limit exceeded for {client_id!r}; "
            f"retry after {retry_after:.3f}s"
        )


class RateLimiter:
    """Fixed-window counter rate limiter.

    Each client has an independent ``(window_start, count)`` pair.
    When ``now - window_start >= T`` a new window is opened.
    If ``count >= max_requests`` the request is denied with
    :class:`RateLimitError`.

    Args:
        max_requests: Maximum requests per client per window (>= 1).
        window_seconds: Duration of one window in seconds (> 0).
        clock: Callable returning current time (default: ``time.monotonic``).

    Raises:
        ValueError: If *max_requests* < 1 or *window_seconds* <= 0.
        TypeError: If *clock* is not callable.
    """

    __slots__ = ("_max_requests", "_window_seconds", "_clock", "_counters", "_lock")

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not isinstance(max_requests, int) or max_requests < 1:
            raise ValueError(
                f"max_requests must be an integer >= 1, got {max_requests!r}"
            )
        if not isinstance(window_seconds, (int, float)) or window_seconds <= 0:
            raise ValueError(
                f"window_seconds must be a number > 0, got {window_seconds!r}"
            )
        if not callable(clock):
            raise TypeError(f"clock must be callable, got {type(clock).__name__}")
        self._max_requests: int = max_requests
        self._window_seconds: float = float(window_seconds)
        self._clock: Callable[[], float] = clock
        self._counters: dict[str, tuple[float, int]] = {}
        self._lock: threading.Lock = threading.Lock()

    def acquire(self, client_id: str) -> None:
        """Acquire a request slot for *client_id*.

        If the client has reached ``max_requests`` within the current
        window, :class:`RateLimitError` is raised; otherwise the
        internal counter is incremented and the call returns silently.

        Args:
            client_id: Unique identifier of the requesting client.

        Raises:
            RateLimitError: If the client is rate-limited.
        """
        now: float = self._clock()

        with self._lock:
            window_start: float
            count: int

            entry = self._counters.get(client_id)
            if entry is not None:
                window_start, count = entry
            else:
                window_start, count = now, 0

            # Half-open boundary: now - window_start >= T → new window
            if now - window_start >= self._window_seconds:
                window_start = now
                count = 0

            if count >= self._max_requests:
                retry_after: float = window_start + self._window_seconds - now
                # retry_after must be strictly positive by construction,
                # but guard against floating-point edge cases.
                if retry_after <= 0:
                    retry_after = 0.0
                raise RateLimitError(client_id=client_id, retry_after=retry_after)

            count += 1
            self._counters[client_id] = (window_start, count)
