"""Безопасный парсинг идентификаторов маршрута."""
from __future__ import annotations

from app.utils.errors import NotFoundError


def to_id(domain: str, raw: str) -> int:
    """Преобразует сегмент пути в int; невалидный — NotFoundError (404)."""
    try:
        return int(raw)
    except ValueError as exc:
        raise NotFoundError(domain, f"invalid id={raw!r}") from exc
