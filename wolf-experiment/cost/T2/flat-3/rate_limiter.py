"""In-memory rate limiter со скользящим окном (sliding window log).

Каждый клиент имеет собственную очередь отметок времени запросов; отметки
старше окна считаются истёкшими и не учитываются при подсчёте лимита.
Время инъектируется через callable (по умолчанию ``time.monotonic``), что
делает поведение детерминируемым в тестах.
"""

from __future__ import annotations

import time
from collections import deque
from typing import Callable, Deque, Dict


class RateLimitError(Exception):
    """Превышен лимит запросов для клиента в текущем окне."""


class RateLimiter:
    """Ограничитель частоты запросов по клиентским идентификаторам.

    Args:
        max_requests: Максимальное число запросов в окне для одного клиента.
        window_seconds: Длина скользящего окна в секундах.
        clock: Источник времени (callable, возвращающий секунды);
            инъекция времени обязательна для тестируемости.

    Raises:
        ValueError: Если параметры лимита не положительны.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if max_requests < 1:
            raise ValueError("max_requests должен быть >= 1")
        if window_seconds <= 0:
            raise ValueError("window_seconds должен быть > 0")
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._clock = clock
        self._history: Dict[str, Deque[float]] = {}

    def acquire(self, client_id: str) -> None:
        """Пропустить запрос либо возбудить RateLimitError.

        Args:
            client_id: Идентификатор клиента (пространства лимитов независимы).

        Raises:
            RateLimitError: Число активных запросов клиента в окне уже
                достигло ``max_requests``. Отклонённый запрос не занимает слот
                и не изменяет состояние окна.
        """
        now = self._clock()
        window = self._history.setdefault(client_id, deque())
        cutoff = now - self._window_seconds
        # Активными считаются отметки строго новее cutoff: отметка ровно
        # на границе окна уже истекла.
        while window and window[0] <= cutoff:
            window.popleft()
        if len(window) >= self._max_requests:
            raise RateLimitError(
                f"Клиент {client_id!r}: лимит {self._max_requests} запросов "
                f"за {self._window_seconds} с исчерпан"
            )
        window.append(now)
