# -*- coding: utf-8 -*-
"""In-memory rate limiter со скользящим окном и инъекцией времени.

COST-T2, итерация flat-2. Только stdlib.
"""

import time
from collections import deque
from typing import Callable, Deque, Dict

__all__ = ["RateLimiter", "RateLimitError"]


class RateLimitError(Exception):
    """Лимит запросов для клиента исчерпан в текущем окне."""


class RateLimiter:
    """Скользящий оконный лимитер: не более ``max_requests`` на ``client_id``
    за ``window_seconds``.

    Args:
        max_requests: максимум запросов в окне; >= 0.
        window_seconds: длина окна в секундах; > 0.
        clock: источник времени (секунды, монотонный), по умолчанию
            :func:`time.monotonic`. Инъекция обязательна для тестируемости.

    Raises:
        ValueError: если ``max_requests < 0`` или ``window_seconds <= 0``.
        TypeError: если ``clock`` не вызывается.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not isinstance(max_requests, int) or isinstance(max_requests, bool):
            raise TypeError("max_requests должен быть int")
        if max_requests < 0:
            raise ValueError("max_requests должен быть >= 0")
        if window_seconds <= 0:
            raise ValueError("window_seconds должен быть > 0")
        if not callable(clock):
            raise TypeError("clock должен быть вызываемым")
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._clock = clock
        self._hits: Dict[str, Deque[float]] = {}

    def acquire(self, client_id: str) -> None:
        """Пропустить запрос клиента либо поднять :class:`RateLimitError`.

        Скользящее окно: запись возраста >= ``window_seconds`` считается
        истёкшей и отбрасывается.
        """
        now = self._clock()
        window = self._window_seconds
        hits = self._hits.setdefault(client_id, deque())

        # Выбрасываем истёкшие записи (возраст >= window).
        while hits and now - hits[0] >= window:
            hits.popleft()

        if len(hits) >= self._max_requests:
            raise RateLimitError(
                f"лимит {self._max_requests} запросов за {window}s "
                f"исчерпан для клиента {client_id!r}"
            )

        hits.append(now)
