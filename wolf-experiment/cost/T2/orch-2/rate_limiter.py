"""In-memory rate limiter со скользящим окном."""

from collections import deque
from typing import Callable

import time


class RateLimitError(Exception):
    """Превышен лимит запросов в текущем окне."""


class RateLimiter:
    """Ограничитель частоты запросов по ключу клиента.

    Реализует скользящее окно: хранит timestamps успешных вызовов
    для каждого client_id и отклоняет запросы, превысившие лимит.

    Args:
        max_requests: Максимальное число запросов в окне.
        window_seconds: Длительность скользящего окна (секунды).
        clock: Функция, возвращающая текущее время (float).
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_requests <= 0:
            raise ValueError("max_requests должен быть > 0")
        if window_seconds <= 0:
            raise ValueError("window_seconds должен быть > 0")
        self._max = max_requests
        self._window = window_seconds
        self._clock = clock
        self._buckets: dict[str, deque[float]] = {}

    def acquire(self, client_id: str) -> None:
        """Занять слот для клиента.

        Удаляет истёкшие записи, проверяет лимит, добавляет timestamp.

        Args:
            client_id: Идентификатор клиента (пустая строка допустима).

        Raises:
            RateLimitError: Если лимит исчерпан в текущем окне.
        """
        now = self._clock()
        timestamps = self._buckets.setdefault(client_id, deque())

        # Отбрасываем истёкшие: запись t свободна, если now - t >= window
        while timestamps and now - timestamps[0] >= self._window:
            timestamps.popleft()

        if len(timestamps) >= self._max:
            raise RateLimitError(
                f"Лимит {self._max} запросов за {self._window}с "
                f"исчерпан для клиента {client_id!r}"
            )

        timestamps.append(now)
