"""Валидация схем (спека LONG-002, §5)."""
from __future__ import annotations

from typing import Any

from .errors import HttpError

_KINDS = {"str", "int", "bool", "email"}


class Field:
    """Описание одного поля схемы.

    kind — один из ``{"str", "int", "bool", "email"}``;
    ``min_len`` — только для str; ``ge``/``le`` — только для int;
    ``choices`` — список допустимых значений (проверяется после kind).
    """

    def __init__(
        self,
        kind: str,
        *,
        required: bool = True,
        default: Any = None,
        min_len: int | None = None,
        ge: int | None = None,
        le: int | None = None,
        choices: list | None = None,
    ) -> None:
        if kind not in _KINDS:
            raise ValueError(f"unknown kind {kind!r}; expected one of {sorted(_KINDS)}")
        self.kind = kind
        self.required = required
        self.default = default
        self.min_len = min_len
        self.ge = ge
        self.le = le
        self.choices = choices


class ValidationError(HttpError):
    """Ошибка валидации: status=400, code='validation', детали в ``.errors``.

    Конструктор без статуса/кода (см. §5–§6 спеки).
    """

    def __init__(self, errors: list[dict]) -> None:
        self.errors: list[dict] = list(errors)
        super().__init__(400, "validation", "validation failed")


def validate(data: dict, schema: dict[str, Field]) -> dict:
    """Проверить data по schema; вернуть очищенную копию (только ключи схемы).

    Все ошибки полей собираются в один ValidationError. Неизвестные ключи
    data игнорируются.
    """
    errors: list[dict] = []
    cleaned: dict[str, Any] = {}
    for name, field in schema.items():
        if name not in data:
            if field.required:
                errors.append({"field": name, "message": "missing field"})
            else:
                cleaned[name] = field.default
            continue
        value = data[name]
        kind_error = _check_kind(field, value)
        if kind_error is not None:
            errors.append({"field": name, "message": kind_error})
            continue
        if field.choices is not None and value not in field.choices:
            errors.append({"field": name, "message": "value not in choices"})
            continue
        cleaned[name] = value
    if errors:
        raise ValidationError(errors)
    return cleaned


def _check_kind(field: Field, value: Any) -> str | None:
    """Проверить значение по kind; вернуть текст ошибки или None."""
    kind = field.kind
    if kind == "str":
        if not isinstance(value, str):
            return "must be a string"
        if field.min_len is not None and len(value) < field.min_len:
            return f"shorter than min_len={field.min_len}"
        return None
    if kind == "int":
        if not isinstance(value, int) or isinstance(value, bool):
            return "must be an integer"
        if field.ge is not None and value < field.ge:
            return f"must be >= {field.ge}"
        if field.le is not None and value > field.le:
            return f"must be <= {field.le}"
        return None
    if kind == "bool":
        if not isinstance(value, bool):
            return "must be a boolean"
        return None
    if kind == "email":
        if not isinstance(value, str):
            return "must be a string"
        if value.count("@") != 1:
            return "invalid email"
        local, domain = value.split("@")
        if not local or not domain or "." not in domain:
            return "invalid email"
        return None
    return "unknown kind"
