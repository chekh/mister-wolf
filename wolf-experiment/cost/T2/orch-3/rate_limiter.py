"""In-memory rate limiter со скользящим окном (sliding window).

Реализует ограничение количества запросов для каждого клиента
в рамках скользящего временного окна. Только стандартная библиотека.
"""

from __future__ import annotations

import time
from collections import deque
from typing import Callable


class RateLimitError(Exception):
    """Исключение, выбрасываемое при превышении лимита запросов клиента."""
    pass


class RateLimiter:
    """Ограничитель частоты запросов со скользящим окном.

    Для каждого ``client_id`` хранит временные метки успешных вызовов
    :meth:`acquire`. Если в текущем окне уже набрано ``max_requests``
    активных меток — выбрасывает :class:`RateLimitError`.

    Скользящее окно: метка ``t`` активна в момент ``now``, если
    ``now - t < window_seconds`` (возраст СТРОГО меньше окна).
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Инициализировать ограничитель.

        Args:
            max_requests: Максимальное количество запросов в окне
                (должно быть >= 1).
            window_seconds: Длина скользящего окна в секундах
                (должна быть > 0).
            clock: Функция, возвращающая текущее время (по умолчанию
                ``time.monotonic``). Инжектируется для тестирования.

        Raises:
            ValueError: Если ``max_requests < 1`` или ``window_seconds <= 0``.
        """
        if max_requests < 1:
            raise ValueError(
                f"max_requests должен быть >= 1, получено {max_requests}"
            )
        if window_seconds <= 0:
            raise ValueError(
                f"window_seconds должен быть > 0, получено {window_seconds}"
            )
        self._max_requests: int = max_requests
        self._window_seconds: float = window_seconds
        self._clock: Callable[[], float] = clock
        # Словарь: client_id → deque временных меток (старые слева)
        self._buckets: dict[str, deque[float]] = {}

    def _prune(self, timestamps: deque[float], now: float) -> deque[float]:
        """Удалить неактивные метки (возраст >= окна).

        Args:
            timestamps: Очередь временных меток клиента.
            now: Текущее время.

        Returns:
            Очередь с оставленными только активными метками.
        """
        while timestamps and (now - timestamps[0]) >= self._window_seconds:
            timestamps.popleft()
        return timestamps

    def acquire(self, client_id: str) -> None:
        """Попытаться получить разрешение на запрос для клиента.

        Удаляет неактивные метки клиента. Если активных меток осталось
        ``>= max_requests`` — выбрасывает :class:`RateLimitError`
        (метка запроса НЕ записывается). Иначе записывает текущую
        временную метку.

        Args:
            client_id: Идентификатор клиента.

        Raises:
            RateLimitError: Если лимит запросов для клиента исчерпан
                в текущем скользящем окне.
        """
        now = self._clock()
        timestamps = self._buckets.setdefault(client_id, deque())
        self._prune(timestamps, now)

        if len(timestamps) >= self._max_requests:
            raise RateLimitError(
                f"Лимит {self._max_requests} запросов в окне "
                f"{self._window_seconds}с превышен для клиента '{client_id}'"
            )

        timestamps.append(now)
