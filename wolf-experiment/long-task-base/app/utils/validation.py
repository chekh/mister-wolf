"""Схемы валидации доменов и универсальный валидатор."""
from __future__ import annotations

from typing import Any

from app.utils.errors import ValidationError

# Спецификации полей: (ключ, тип, ограничение) — ограничение:
# min_len для str, ge (>=) для int.

FIELDS_USERS: list[tuple[str, str, int]] = [
    ("name", "str", 3),
    ("email", "str", 5),
    ("age", "int", 0),
    ("status", "str", 2),
    ("logins", "int", 0),
]

FIELDS_PRODUCTS: list[tuple[str, str, int]] = [
    ("sku", "str", 3),
    ("title", "str", 3),
    ("price", "int", 0),
    ("currency", "str", 3),
    ("stock", "int", 0),
]

FIELDS_ORDERS: list[tuple[str, str, int]] = [
    ("ref", "str", 3),
    ("customer", "str", 2),
    ("total", "int", 0),
    ("channel", "str", 2),
    ("items", "int", 0),
]

FIELDS_SESSIONS: list[tuple[str, str, int]] = [
    ("token", "str", 8),
    ("user", "str", 2),
    ("ttl", "int", 1),
    ("scope", "str", 2),
    ("refreshes", "int", 0),
]

FIELDS_INVENTORY: list[tuple[str, str, int]] = [
    ("sku", "str", 2),
    ("warehouse", "str", 2),
    ("qty", "int", 0),
    ("bin", "str", 2),
    ("reserved", "int", 0),
]

FIELDS_NOTIFICATIONS: list[tuple[str, str, int]] = [
    ("topic", "str", 2),
    ("message", "str", 1),
    ("priority", "int", 1),
    ("lang", "str", 2),
    ("attempts", "int", 0),
]

FIELDS_REPORTS: list[tuple[str, str, int]] = [
    ("code", "str", 2),
    ("title", "str", 2),
    ("period", "str", 2),
    ("owner", "str", 2),
    ("weight", "int", 0),
]

FIELDS_SEARCHES: list[tuple[str, str, int]] = [
    ("query", "str", 2),
    ("scope", "str", 2),
    ("limit", "int", 1),
    ("locale", "str", 2),
    ("hits", "int", 0),
]

FIELDS_BILLINGS: list[tuple[str, str, int]] = [
    ("invoice", "str", 3),
    ("customer", "str", 2),
    ("amount", "int", 0),
    ("method", "str", 2),
    ("attempts", "int", 0),
]

FIELDS_SHIPMENTS: list[tuple[str, str, int]] = [
    ("tracking", "str", 5),
    ("carrier", "str", 2),
    ("weight", "int", 0),
    ("mode", "str", 2),
    ("parcels", "int", 0),
]

FIELDS_COUPONS: list[tuple[str, str, int]] = [
    ("code", "str", 3),
    ("discount", "int", 1),
    ("uses", "int", 0),
    ("tier", "str", 2),
    ("days", "int", 0),
]

FIELDS_REVIEWS: list[tuple[str, str, int]] = [
    ("ref", "str", 2),
    ("author", "str", 2),
    ("stars", "int", 1),
    ("status", "str", 2),
    ("votes", "int", 0),
]

FIELDS_TICKETS: list[tuple[str, str, int]] = [
    ("num", "str", 2),
    ("subject", "str", 3),
    ("urgency", "int", 1),
    ("queue", "str", 2),
    ("escalations", "int", 0),
]

FIELDS_WEBHOOKS: list[tuple[str, str, int]] = [
    ("url", "str", 5),
    ("event", "str", 3),
    ("retries", "int", 0),
    ("format", "str", 2),
    ("failures", "int", 0),
]

FIELDS_PROFILES: list[tuple[str, str, int]] = [
    ("login", "str", 3),
    ("display", "str", 2),
    ("karma", "int", 0),
    ("plan", "str", 2),
    ("badges", "int", 0),
]



def validate(body: dict[str, Any], spec: list[tuple[str, str, int]], *, partial: bool = False) -> dict[str, Any]:
    """Проверяет body против spec; partial=True пропускает отсутствующие ключи."""
    out: dict[str, Any] = {}
    for key, kind, limit in spec:
        if key not in body:
            if partial:
                continue
            raise ValidationError("request", f"missing field: {key}")
        value = body[key]
        if kind == "str":
            if not isinstance(value, str) or len(value.strip()) < limit:
                raise ValidationError("request", f"field {key}: str with min length {limit} required")
        elif kind == "int":
            if not isinstance(value, int) or isinstance(value, bool) or value < limit:
                raise ValidationError("request", f"field {key}: int >= {limit} required")
        else:  # pragma: no cover - фикстура использует только str/int
            raise ValidationError("request", f"unsupported kind {kind}")
        out[key] = value
    return out
