"""validation — валидация данных по схеме (spec.md §5)."""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any

from .errors import HttpError


class Field:
    """Описатель одного поля схемы."""

    __slots__ = ("kind", "required", "default", "min_len", "ge", "le", "choices")

    def __init__(
        self,
        kind: str,
        *,
        required: bool = True,
        default: Any = None,
        min_len: int | None = None,
        ge: int | None = None,
        le: int | None = None,
        choices: list[Any] | None = None,
    ) -> None:
        if kind not in {"str", "int", "bool", "email"}:
            raise ValueError(f"Unknown field kind: {kind!r}")
        self.kind = kind
        self.required = required
        self.default = default
        self.min_len = min_len
        self.ge = ge
        self.le = le
        self.choices = choices


class ValidationError(HttpError):
    """Ошибки валидации (400)."""

    def __init__(self, errors: list[dict]) -> None:
        self.errors = errors
        self.status = 400
        self.code = "validation"
        self.message = "Validation failed"
        super().__init__(self.status, self.code, self.message)


def _check_str(value: Any, f: Field, errors: list[dict], field_name: str) -> bool:
    if not isinstance(value, str):
        errors.append({"field": field_name, "message": f"expected str, got {type(value).__name__}"})
        return False
    if f.min_len is not None and len(value) < f.min_len:
        errors.append({"field": field_name, "message": f"string too short (min_len={f.min_len})"})
        return False
    return True


def _check_int(value: Any, f: Field, errors: list[dict], field_name: str) -> bool:
    if isinstance(value, bool) or not isinstance(value, int):
        errors.append({"field": field_name, "message": f"expected int, got {type(value).__name__}"})
        return False
    if f.ge is not None and value < f.ge:
        errors.append({"field": field_name, "message": f"value {value} < ge={f.ge}"})
        return False
    if f.le is not None and value > f.le:
        errors.append({"field": field_name, "message": f"value {value} > le={f.le}"})
        return False
    return True


def _check_bool(value: Any, errors: list[dict], field_name: str) -> bool:
    if not isinstance(value, bool):
        errors.append({"field": field_name, "message": f"expected bool, got {type(value).__name__}"})
        return False
    return True


def _check_email(value: Any, errors: list[dict], field_name: str) -> bool:
    if not isinstance(value, str):
        errors.append({"field": field_name, "message": f"expected email (str), got {type(value).__name__}"})
        return False
    parts = value.split("@")
    if len(parts) != 2:
        errors.append({"field": field_name, "message": "email must contain exactly one '@'"})
        return False
    local, domain = parts
    if not local or not domain:
        errors.append({"field": field_name, "message": "email local and domain parts must be non-empty"})
        return False
    if "." not in domain:
        errors.append({"field": field_name, "message": "email domain must contain a dot"})
        return False
    return True


def _validate_field_value(value: Any, f: Field, errors: list[dict], field_name: str) -> bool:
    """Проверяет значение по kind; возвращает True если валидно."""
    ok = False
    if f.kind == "str":
        ok = _check_str(value, f, errors, field_name)
    elif f.kind == "int":
        ok = _check_int(value, f, errors, field_name)
    elif f.kind == "bool":
        ok = _check_bool(value, errors, field_name)
    elif f.kind == "email":
        ok = _check_email(value, errors, field_name)

    if ok and f.choices is not None:
        if value not in f.choices:
            errors.append({"field": field_name, "message": f"value {value!r} not in choices"})
            return False
    return ok


def validate(data: dict, schema: dict[str, Field]) -> dict:
    """Валидировать data по schema. Возвращает очищенную копию (только ключи схемы)."""
    errors: list[dict] = []
    result: dict[str, Any] = {}

    for field_name, f in schema.items():
        if field_name not in data:
            if f.required:
                errors.append({"field": field_name, "message": "missing field"})
            else:
                result[field_name] = f.default
            continue

        value = data[field_name]
        if _validate_field_value(value, f, errors, field_name):
            result[field_name] = value

    if errors:
        raise ValidationError(errors)

    return result
