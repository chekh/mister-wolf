"""Хелперы ответов в терминах miniframe (после миграции — в терминах swiftframe)."""
from __future__ import annotations

from typing import Any

from frameworks import miniframe as mf


def ok(payload: Any, status: int = 200) -> mf.Response:
    """Успешный ответ miniframe."""
    return mf.Response(status, payload)


def created(payload: Any) -> mf.Response:
    """Ответ 201 miniframe."""
    return mf.Response(201, payload)
