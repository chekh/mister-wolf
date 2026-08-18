"""Модуль валидации запросов фреймворка nanohttp.

Предоставляет декларативное описание полей (Field) и функцию
validate для проверки и очистки входных данных по схеме.
"""

from __future__ import annotations

from typing import Any

from .errors import HttpError

# Допустимые типы полей
_VALID_KINDS: frozenset[str] = frozenset({"str", "int", "bool", "email"})


class ValidationError(HttpError):
    """Ошибка валидации: собирает ошибки по всем полям.

    Attributes:
        errors: Список ошибок вида {"field": str, "message": str}.
    """

    def __init__(self, errors: list[dict[str, str]]) -> None:
        super().__init__(status=400, code="validation", message="Validation failed")
        self.errors: list[dict[str, str]] = errors


class Field:
    """Описание одного поля схемы валидации.

    Args:
        kind: Тип поля — один из {"str", "int", "bool", "email"}.
        required: Обязательность поля.
        default: Значение по умолчанию для необязательных полей.
        min_len: Минимальная длина строки.
        ge: Минимальное значение для int (greater-or-equal).
        le: Максимальное значение для int (less-or-equal).
        choices: Допустимые значения (после проверки типа).

    Raises:
        ValueError: kind не входит в допустимый набор.
    """

    __slots__ = (
        "kind",
        "required",
        "default",
        "min_len",
        "ge",
        "le",
        "choices",
    )

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
        if kind not in _VALID_KINDS:
            raise ValueError(
                f"Invalid field kind: '{kind}'. Must be one of {_VALID_KINDS}"
            )
        self.kind: str = kind
        self.required: bool = required
        self.default: Any = default
        self.min_len: int | None = min_len
        self.ge: int | None = ge
        self.le: int | None = le
        self.choices: list[Any] | None = choices


def _check_kind(value: Any, kind: str) -> list[str]:
    """Проверить соответствие значения типу kind.

    Returns:
        Список сообщений об ошибках (пустой, если проверка пройдена).
    """
    errors: list[str] = []

    if kind == "str":
        if not isinstance(value, str):
            errors.append("must be a string")
    elif kind == "int":
        # int, но НЕ bool (bool — подкласс int в Python)
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append("must be an int")
    elif kind == "bool":
        if not isinstance(value, bool):
            errors.append("must be a bool")
    elif kind == "email":
        if not isinstance(value, str):
            errors.append("must be a string")
        else:
            parts = value.split("@")
            if len(parts) != 2 or not parts[0] or not parts[1] or "." not in parts[1]:
                errors.append("invalid email")

    return errors


def _check_constraints(
    value: Any, field: Field
) -> list[str]:
    """Проверить ограничения (min_len, ge, le, choices).

    Предусловие: проверка типа уже пройдена.
    """
    errors: list[str] = []

    if field.kind == "str" and isinstance(value, str):
        if field.min_len is not None and len(value) < field.min_len:
            errors.append("too short")

    if field.kind == "int" and isinstance(value, int) and not isinstance(value, bool):
        if field.ge is not None and value < field.ge:
            errors.append(f"less than {field.ge}")
        if field.le is not None and value > field.le:
            errors.append(f"greater than {field.le}")

    if field.choices is not None and value not in field.choices:
        errors.append("must be one of choices")

    return errors


def validate(
    data: dict[str, Any],
    schema: dict[str, Field],
) -> dict[str, Any]:
    """Валидировать и очистить входные данные по схеме.

    Возвращает словарь только с ключами схемы. Необязательные поля
    без значения в data заменяются на default.

    Args:
        data: Входные данные (сырой dict).
        schema: Схема — отображение имени поля → Field.

    Returns:
        Очищенная копия данных (только ключи схемы).

    Raises:
        ValidationError: хотя бы одно поле не прошло проверку.
    """
    errors: list[dict[str, str]] = []
    result: dict[str, Any] = {}

    for field_name, field in schema.items():
        if field_name not in data:
            if field.required:
                errors.append({"field": field_name, "message": "missing field"})
            else:
                result[field_name] = field.default
            continue

        value = data[field_name]

        # Проверка типа (None не проходит ни один kind)
        kind_errors = _check_kind(value, field.kind)
        if kind_errors:
            for msg in kind_errors:
                errors.append({"field": field_name, "message": msg})
            continue

        # Проверка ограничений
        constraint_errors = _check_constraints(value, field)
        if constraint_errors:
            for msg in constraint_errors:
                errors.append({"field": field_name, "message": msg})
            continue

        result[field_name] = value

    if errors:
        raise ValidationError(errors)

    return result
