"""Валидация схем (спека §5). ValidationError наследует HttpError из .errors."""

from __future__ import annotations

from .errors import HttpError

_VALID_KINDS = frozenset({"str", "int", "bool", "email"})


class Field:
    """Field(kind, *, required=True, default=None, min_len=None, ge=None,
    le=None, choices=None); kind in {"str","int","bool","email"}."""

    def __init__(self, kind: str, *, required: bool = True, default=None,
                 min_len: int | None = None, ge: int | None = None,
                 le: int | None = None, choices: list | None = None) -> None:
        if kind not in _VALID_KINDS:
            raise ValueError(f"invalid field kind: {kind!r}")
        self.kind = kind
        self.required = required
        self.default = default
        self.min_len = min_len
        self.ge = ge
        self.le = le
        self.choices = choices


class ValidationError(HttpError):
    """__init__(errors: list[dict]); status=400, code="validation", .errors."""

    def __init__(self, errors: list[dict]) -> None:
        super().__init__(400, "validation", "validation failed")
        self.errors = errors


def _check_email(value: str) -> bool:
    """email: ровно один @, непустые части, правая содержит точку."""
    parts = value.split("@")
    if len(parts) != 2:
        return False
    left, right = parts
    if not left or not right:
        return False
    if "." not in right:
        return False
    return True


def validate(data: dict, schema: dict[str, Field]) -> dict:
    """Возвращает очищенную копию (только ключи схемы).

    Несколько ошибок -> один ValidationError со списком .errors
    (элементы {"field": str, "message": str}).
    """
    errors: list[dict[str, str]] = []
    result: dict = {}

    for field_name, field in schema.items():
        if field_name not in data:
            if field.required:
                errors.append({"field": field_name, "message": "missing field"})
            else:
                result[field_name] = field.default
            continue

        value = data[field_name]

        # --- kind check ---
        if field.kind == "str":
            if not isinstance(value, str):
                errors.append({"field": field_name, "message": "expected str"})
                continue
            if field.min_len is not None and len(value) < field.min_len:
                errors.append({"field": field_name, "message": "min_len violation"})

        elif field.kind == "int":
            if isinstance(value, bool) or not isinstance(value, int):
                errors.append({"field": field_name, "message": "expected int"})
                continue
            if field.ge is not None and value < field.ge:
                errors.append({"field": field_name, "message": "ge violation"})
            if field.le is not None and value > field.le:
                errors.append({"field": field_name, "message": "le violation"})

        elif field.kind == "bool":
            if not isinstance(value, bool):
                errors.append({"field": field_name, "message": "expected bool"})
                continue

        elif field.kind == "email":
            if not isinstance(value, str) or not _check_email(value):
                errors.append({"field": field_name, "message": "invalid email"})
                continue

        # --- choices check (after kind) ---
        if field.choices is not None and value not in field.choices:
            errors.append({"field": field_name, "message": "invalid choice"})
            continue

        # If we reach here, value passed all checks
        if not any(e["field"] == field_name for e in errors):
            result[field_name] = value

    if errors:
        raise ValidationError(errors)

    return result
