"""Валидация схем nanohttp.

Схема — ``dict[str, Field]``; :func:`validate` возвращает очищенную
копию (только ключи схемы) либо кидает :class:`ValidationError`
со всеми накопленными ошибками. Неизвестные ключи data игнорируются.
"""

from .errors import HttpError


class Field:
    """Описание одного поля схемы.

    Args:
        kind: ``"str" | "int" | "bool" | "email"``.
        required: обязательность (по умолчанию True).
        default: значение при отсутствии ключа и required=False
            (подставляется даже None).
        min_len: минимальная длина для kind="str".
        ge / le: границы для kind="int" (проверяются после типа).
        choices: допустимые значения (проверка после kind).
    """

    def __init__(
        self,
        kind,
        *,
        required=True,
        default=None,
        min_len=None,
        ge=None,
        le=None,
        choices=None,
    ):
        self.kind = kind
        self.required = required
        self.default = default
        self.min_len = min_len
        self.ge = ge
        self.le = le
        self.choices = choices


class ValidationError(HttpError):
    """400 validation — ошибки валидации тела запроса.

    Attributes:
        errors: список ``{"field": str, "message": str}``.
    """

    def __init__(self, errors):
        super().__init__(400, "validation", "validation failed")
        self.errors = list(errors)


def validate(data, schema):
    """Проверить data по схеме, вернуть очищенную копию.

    Raises:
        ValidationError: все ошибки всех полей одним исключением.
    """
    errors = []
    result = {}
    for name, field in schema.items():
        if name not in data:
            if field.required:
                errors.append({"field": name, "message": "missing field"})
            else:
                result[name] = field.default
            continue
        value = data[name]
        message = _check_kind(field, value)
        if message is not None:
            errors.append({"field": name, "message": message})
            continue
        if field.choices is not None and value not in field.choices:
            errors.append(
                {"field": name, "message": f"value not in choices: {field.choices}"}
            )
            continue
        result[name] = value
    if errors:
        raise ValidationError(errors)
    return result


def _check_kind(field, value):
    """Проверить kind-правила; None — ок, иначе текст ошибки."""
    kind = field.kind
    if kind == "str":
        if not isinstance(value, str):
            return "expected str"
        if field.min_len is not None and len(value) < field.min_len:
            return f"length must be >= {field.min_len}"
        return None
    if kind == "int":
        if not isinstance(value, int) or isinstance(value, bool):
            return "expected int"
        if field.ge is not None and value < field.ge:
            return f"must be >= {field.ge}"
        if field.le is not None and value > field.le:
            return f"must be <= {field.le}"
        return None
    if kind == "bool":
        if not isinstance(value, bool):
            return "expected bool"
        return None
    if kind == "email":
        if not isinstance(value, str):
            return "expected str email"
        parts = value.split("@")
        if len(parts) != 2:
            return "invalid email"
        left, right = parts
        if not left or not right or "." not in right:
            return "invalid email"
        return None
    return f"unknown kind: {kind}"
