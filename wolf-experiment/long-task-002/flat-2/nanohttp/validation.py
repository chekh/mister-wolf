"""Валидация схем данных (спека LONG-002, раздел 5)."""

from typing import Any, Optional

from .errors import HttpError

KINDS = ("str", "int", "bool", "email")


class ValidationError(HttpError):
    """Ошибка валидации: 400/"validation", .errors — список по полям.

    Конструктор без статуса/кода: наследует HttpError с переопределённым
    __init__(errors: list[dict])."""

    def __init__(self, errors: Optional[list[dict[str, str]]] = None) -> None:
        super().__init__(400, "validation", "validation failed")
        self.errors: list[dict[str, str]] = list(errors or [])


class Field:
    """Описание одного поля схемы: kind + ограничения."""

    __slots__ = ("kind", "required", "default", "min_len", "ge", "le", "choices")

    def __init__(
        self,
        kind: str,
        *,
        required: bool = True,
        default: Any = None,
        min_len: Optional[int] = None,
        ge: Optional[int] = None,
        le: Optional[int] = None,
        choices: Optional[list] = None,
    ) -> None:
        if kind not in KINDS:
            raise ValueError(f"unknown field kind {kind!r}; expected one of {KINDS}")
        self.kind = kind
        self.required = required
        self.default = default
        self.min_len = min_len
        self.ge = ge
        self.le = le
        self.choices = choices


def _check_kind(field: Field, value: Any) -> Optional[str]:
    """Проверить kind-правила; вернуть сообщение ошибки или None."""
    if field.kind == "str":
        if not isinstance(value, str):
            return "expected str"
        if field.min_len is not None and len(value) < field.min_len:
            return f"length must be >= {field.min_len}"
        return None
    if field.kind == "int":
        if isinstance(value, bool) or not isinstance(value, int):
            return "expected int"
        if field.ge is not None and value < field.ge:
            return f"must be >= {field.ge}"
        if field.le is not None and value > field.le:
            return f"must be <= {field.le}"
        return None
    if field.kind == "bool":
        if not isinstance(value, bool):
            return "expected bool"
        return None
    # email
    if not isinstance(value, str):
        return "expected str"
    if value.count("@") != 1:
        return "invalid email"
    left, right = value.split("@")
    if not left or not right or "." not in right:
        return "invalid email"
    return None


def validate(data: dict, schema: dict[str, Field]) -> dict:
    """Валидировать data по schema; вернуть очищенную копию (только ключи
    схемы). Все ошибки полей собираются в один ValidationError."""
    result: dict[str, Any] = {}
    errors: list[dict[str, str]] = []
    for name, field in schema.items():
        if name not in data:
            if field.required:
                errors.append({"field": name, "message": "missing field"})
            else:
                result[name] = field.default
            continue
        value = data[name]
        message = _check_kind(field, value)
        if message is None and field.choices is not None and value not in field.choices:
            message = f"value must be one of {field.choices}"
        if message is None:
            result[name] = value
        else:
            errors.append({"field": name, "message": message})
    if errors:
        raise ValidationError(errors)
    return result
