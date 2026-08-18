"""Хелперы ответов в терминах swiftframe (обёртки над sf.ok / sf.created)."""
from __future__ import annotations

from typing import Any

from frameworks import swiftframe as sf


def ok(payload: Any, status: int = 200) -> sf.Reply:
    """Успешный ответ swiftframe."""
    return sf.ok(payload, status)


def created(payload: Any) -> sf.Reply:
    """Ответ 201 swiftframe."""
    return sf.created(payload)
