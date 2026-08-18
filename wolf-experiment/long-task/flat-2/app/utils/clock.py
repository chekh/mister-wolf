"""Часы приложения (изоляция времени для тестов)."""
from __future__ import annotations

from datetime import datetime, timezone

_NOW: datetime | None = None


def now() -> str:
    """ISO-таймстемп (переопределяется в тестах при необходимости)."""
    if _NOW is not None:
        return _NOW.isoformat()
    return datetime.now(tz=timezone.utc).isoformat()


def freeze(moment: datetime | None) -> None:
    """Фиксирует/освобождает время."""
    global _NOW
    _NOW = moment
