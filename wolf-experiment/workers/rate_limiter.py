"""Sliding-window-log rate limiter for local single-process Python APIs.

Restricts each client to *limit* requests within a rolling *window* of *T*
seconds.  Exceeding the limit raises :class:`RateLimitError`.  The
implementation is thread-safe, uses no background threads, and depends only
on the Python standard library.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Callable

__all__ = ["RateLimitError", "RateLimiter"]


class RateLimitError(Exception):
    """Raised when a client exceeds its request quota.

    Attributes:
        client_id: Identifier of the client that triggered the error.
        retry_after: Seconds until the earliest request slot becomes free (>= 0).
    """

    def __init__(self, client_id: str, retry_after: float) -> None:
        self.client_id: str = client_id
        self.retry_after: float = max(retry_after, 0.0)
        super().__init__(
            f"Rate limit exceeded for client {client_id!r}; "
            f"retry after {self.retry_after:.3f}s"
        )


class RateLimiter:
    """Thread-safe sliding-window-log rate limiter.

    Each client is tracked independently.  Within any window of length
    ``window`` seconds a client may issue at most ``limit`` requests.
    Requests that would exceed the quota raise :class:`RateLimitError`.

    Args:
        limit: Maximum number of requests allowed per client per window.
            Must be >= 1.
        window: Duration of the sliding window in seconds.  Must be > 0.
        clock: A callable returning the current time as a ``float``.
            Defaults to :func:`time.monotonic`.

    Raises:
        ValueError: If *limit* < 1 or *window* <= 0.
        TypeError: If *clock* is not callable.
    """

    def __init__(
        self,
        limit: int,
        window: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not isinstance(limit, int) or limit < 1:
            raise ValueError(f"limit must be >= 1, got {limit!r}")
        if not isinstance(window, (int, float)) or window <= 0:
            raise ValueError(f"window must be > 0, got {window!r}")
        if not callable(clock):
            raise TypeError(f"clock must be callable, got {type(clock)!r}")
        self._limit: int = limit
        self._window: float = float(window)
        self._clock: Callable[[], float] = clock
        self._events: dict[str, deque[float]] = {}
        self._lock: threading.Lock = threading.Lock()

    def acquire(self, client_id: str) -> None:
        """Record one request for *client_id* or raise if the quota is full.

        Args:
            client_id: Logical identifier of the requesting client.

        Raises:
            RateLimitError: If recording this request would exceed the
                per-client limit within the current sliding window.
        """
        with self._lock:
            now = self._clock()
            dq: deque[float] | None = self._events.get(client_id)
            if dq is not None:
                # Evict entries outside the half-open window (t <= now - T).
                while dq and dq[0] <= now - self._window:
                    dq.popleft()
                # Lazy cleanup: remove empty deque.
                if not dq:
                    del self._events[client_id]
                    dq = None

            if dq is not None and len(dq) >= self._limit:
                # Quota exhausted — compute retry_after.
                oldest: float = dq[0]
                retry_after: float = oldest + self._window - now
                raise RateLimitError(client_id, retry_after)

            # Record the request.
            if dq is None:
                dq = deque()
                self._events[client_id] = dq
            dq.append(now)
