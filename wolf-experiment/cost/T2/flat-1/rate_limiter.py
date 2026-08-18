"""In-memory rate limiter со скользящим окном (задача COST-T2, flat-1).

Только stdlib. Время инъектируется через callable (по умолчанию time.monotonic),
что позволяет тестировать без реальных sleep.
"""

from __future__ import annotations

import time
from collections import deque
from typing import Callable, Deque, Dict


class RateLimitError(Exception):
    """Запрос отклонён: превышен лимит в текущем окне."""


class RateLimiter:
    """Ограничитель частоты запросов per ``client_id`` (скользящее окно).

    Запросы одного клиента независимо друг от друга: для каждого client_id
    хранятся метки времени его запросов; метка живёт window_seconds, после
    чего слот освобождается.

    Args:
        max_requests: допустимое число запросов в окне (>= 1).
        window_seconds: длина окна в секундах (> 0).
        clock: источник текущего времени в секундах; инъекция обязательна
            для тестов (FakeClock), по умолчанию time.monotonic.

    Raises:
        ValueError: при некорректных аргументах конструктора.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not isinstance(max_requests, int) or isinstance(max_requests, bool):
            raise ValueError("max_requests must be int")
        if max_requests < 1:
            raise ValueError("max_requests must be >= 1, got %r" % (max_requests,))
        if not isinstance(window_seconds, (int, float)) or isinstance(window_seconds, bool):
            raise ValueError("window_seconds must be numeric")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be > 0, got %r" % (window_seconds,))
        if not callable(clock):
            raise ValueError("clock must be callable")

        self._max_requests: int = max_requests
        self._window: float = float(window_seconds)
        self._clock: Callable[[], float] = clock
        self._history: Dict[str, Deque[float]] = {}

    def acquire(self, client_id: str) -> None:
        """Пропустить запрос клиента либо выбросить RateLimitError.

        Args:
            client_id: идентификатор клиента.

        Raises:
            RateLimitError: если за последние window_seconds секунд клиент
                уже сделал max_requests запросов.
        """
        now = float(self._clock())
        cutoff = now - self._window

        stamps = self._history.setdefault(client_id, deque())
        # Выкидываем метки, вышедшие из окна (включая ровно на границе).
        while stamps and stamps[0] <= cutoff:
            stamps.popleft()

        if len(stamps) >= self._max_requests:
            raise RateLimitError(
                "client %r: %d request(s) in last %gs window"
                % (client_id, len(stamps), self._window)
            )
        stamps.append(now)
