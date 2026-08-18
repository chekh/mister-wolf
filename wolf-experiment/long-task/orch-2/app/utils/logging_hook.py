"""Middleware логирования вызовов для swiftframe (подключается после миграции)."""
from __future__ import annotations

from typing import Callable

from frameworks.swiftframe import Reply

_LOG: list[tuple[str, str]] = []


def log_call(method: str, path: str, core: Callable[[], Reply]) -> Reply:
    """Логирует (method, path) и передаёт управление дальше."""
    _LOG.append((method, path))
    return core()


def last_calls() -> list[tuple[str, str]]:
    """Возвращает журнал вызовов (для отладки/тестов)."""
    return list(_LOG)
