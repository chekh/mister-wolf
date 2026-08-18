"""In-memory rate limiter со скользящим окном (sliding window log).

Реализует независимое ограничение частоты запросов на каждого клиента.
Однопоточная среда, только стандартная библиотека.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Callable


class RateLimitError(Exception):
    """Сигнализирует превышение лимита запросов клиентом."""


class RateLimiter:
    """Ограничитель частоты запросов по принципу скользящего окна.

    Для каждого ``client_id`` ведётся журнал временных меток успешных вызовов
    ``acquire``. Если количество меток, попадающих в текущее окно, достигло
    ``max_requests`` — поднимается :class:`RateLimitError`.

    Args:
        max_requests: Максимальное число запросов в окне (≥ 1).
        window_seconds: Длительность окна в секундах (> 0).
        clock: Функция, возвращающая монотонное время. По умолчанию
            ``time.monotonic``; инъекция нужна для детерминистичного тестирования.

    Raises:
        ValueError: Если ``max_requests < 1`` или ``window_seconds <= 0``.
    """

    __slots__ = ("_max_requests", "_window", "_clock", "_log")

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_requests < 1:
            raise ValueError(f"max_requests должен быть ≥ 1, получено {max_requests}")
        if window_seconds <= 0:
            raise ValueError(
                f"window_seconds должен быть > 0, получено {window_seconds}"
            )

        self._max_requests: int = max_requests
        self._window: float = window_seconds
        self._clock: Callable[[], float] = clock
        self._log: dict[str, list[float]] = defaultdict(list)

    def acquire(self, client_id: str) -> None:
        """Зарегистрировать один запрос для клиента.

        Если количество активных запросов клиента за текущее окно меньше
        ``max_requests`` — метка записывается, вызов завершается успешно.

        Иначе поднимается :class:`RateLimitError`, состояние клиента не меняется.

        Args:
            client_id: Идентификатор клиента.

        Raises:
            RateLimitError: Лимит запросов превышен для данного клиента.
        """
        now = self._clock()
        cutoff = now - self._window

        timestamps = self._log[client_id]

        # Удаляем протухшие метки, сдвигая старт валидного сегмента.
        # Линейный поиск с вырезанием — О(n) в худшем случае, но зато in-place
        # и без аллокации нового списка при каждом вызове.
        i = 0
        while i < len(timestamps) and timestamps[i] <= cutoff:
            i += 1
        if i > 0:
            del timestamps[:i]

        if len(timestamps) < self._max_requests:
            timestamps.append(now)
            return

        raise RateLimitError(
            f"Лимит {self._max_requests} запросов за {self._window} с "
            f"превышен для клиента '{client_id}'"
        )
