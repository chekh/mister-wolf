"""In-memory хранилище доменов (общее для всех эндпоинтов)."""
from __future__ import annotations

from typing import Any

from app.utils.errors import NotFoundError

_DATA: dict[str, dict[int, dict[str, Any]]] = {}
_SEQ: dict[str, int] = {}


def _domain(name: str) -> dict[int, dict[str, Any]]:
    return _DATA.setdefault(name, {})


def insert(domain: str, item: dict[str, Any]) -> dict[str, Any]:
    """Вставляет запись с новым автоинкрементным id."""
    seq = _SEQ.get(domain, 0) + 1
    _SEQ[domain] = seq
    stored = {"id": seq, **item}
    _domain(domain)[seq] = stored
    return stored


def get_or_404(domain: str, item_id: int) -> dict[str, Any]:
    """Возвращает запись или NotFoundError."""
    found = _domain(domain).get(item_id)
    if found is None:
        raise NotFoundError(domain, f"id={item_id}")
    return found


def find_by(domain: str, key: str, value: Any) -> dict[str, Any] | None:
    """Ищет первую запись с равным значением ключа (для unique-проверок)."""
    for item in _domain(domain).values():
        if item.get(key) == value:
            return item
    return None


def update(domain: str, item_id: int, changes: dict[str, Any]) -> dict[str, Any]:
    """Частично обновляет запись."""
    item = get_or_404(domain, item_id)
    item.update(changes)
    return item
