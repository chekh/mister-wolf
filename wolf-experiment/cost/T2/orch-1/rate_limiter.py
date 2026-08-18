"""In-memory rate limiter with sliding window and injectable clock.

Алгоритм: **скользящее окно (sliding window)**. Для каждого `client_id`
хранится deque меток времени запросов (`clock()`). При каждом вызове
`acquire()` stale-запросы (старше или равные `window_seconds`) отбрасываются;
если оставшийся размер deque ≥ `max_requests` — выбрасывается
`RateLimitError`.

Только стандартная библиотека; никаких реальных sleep.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Callable


class RateLimitError(Exception):
    """Исключение, выбрасываемое при превышении лимита запросов.

    Attributes:
        client_id: Идентификатор клиента, превысившего лимит.
        max_requests: Максимально допустимое число запросов в окне.
        window_seconds: Длина окна в секундах.
    """

    def __init__(
        self,
        client_id: str,
        max_requests: int,
        window_seconds: float,
    ) -> None:
        self.client_id = client_id
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        super().__init__(
            f"Rate limit exceeded for client '{client_id}': "
            f"{max_requests} requests per {window_seconds}s"
        )


class RateLimiter:
    """In-memory rate limiter с инъекцией часов и скользящим окном.

    Каждый `client_id` имеет независимый счётчик запросов. Лимит
    считается за скользящее окно длиной ``window_seconds``;
    запросы, вышедшие за пределы окна, автоматически очищаются.

    Args:
        max_requests: Максимальное число запросов, допустимое за окно.
        window_seconds: Длина временного окна в секундах.
        clock: Вызываемый объект, возвращающий текущее время (по умолчанию
            ``time.monotonic``). Инъекция нужна для детерминистичного
            тестирования.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_requests <= 0:
            raise ValueError("max_requests must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        self._max_requests: int = max_requests
        self._window_seconds: float = window_seconds
        self._clock: Callable[[], float] = clock

        # client_id → deque с метками времени каждого запроса
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    @property
    def max_requests(self) -> int:
        """Максимальное число запросов в окне."""
        return self._max_requests

    @property
    def window_seconds(self) -> float:
        """Длина временного окна в секундах."""
        return self._window_seconds

    def _prune_stale(self, timestamps: deque[float], now: float) -> None:
        """Удаляет из deque записи, вышедшие за пределы окна.

        Так как записи добавляются в хронологическом порядке,
        достаточно popleft, пока самая старая метка <= now - window.

        Args:
            timestamps: Deque меток времени запросов клиента.
            now: Текущее время, полученное из ``clock()``.
        """
        cutoff = now - self._window_seconds
        while timestamps and timestamps[0] <= cutoff:
            timestamps.popleft()

    def acquire(self, client_id: str) -> None:
        """Зарегистрировать один запрос от ``client_id``.

        Если за текущее скользящее окно от ``client_id`` уже поступило
        ``max_requests`` запросов — выбрасывает :class:`RateLimitError`.

        Args:
            client_id: Уникальный идентификатор клиента.

        Raises:
            RateLimitError: Лимит запросов для данного клиента исчерпан.
        """
        now = self._clock()
        timestamps = self._requests[client_id]
        self._prune_stale(timestamps, now)

        if len(timestamps) >= self._max_requests:
            raise RateLimitError(client_id, self._max_requests, self._window_seconds)

        timestamps.append(now)

    def _remaining(self, client_id: str) -> int:
        """Возвращает число оставшихся запросов для клиента (интернал).

        Используется в тестах; в проде не нужен.

        Args:
            client_id: Идентификатор клиента.

        Returns:
            Число запросов, которое клиент ещё может сделать
            в текущем окне (может быть 0).
        """
        now = self._clock()
        timestamps = self._requests[client_id]
        self._prune_stale(timestamps, now)
        return max(0, self._max_requests - len(timestamps))
