"""Иерархия HTTP-ошибок + ErrorHandler (спека §6).

Контракты конструкторов (согласованы между воркерами):

- HttpError(status: int, code: str, message: str) — .status, .code, .message
- NotFoundError(message: str = "not found") — 404, "not_found"
- MethodNotAllowedError(allowed: list[str]) — 405, "method_not_allowed",
  атрибут .allowed (отсортированные методы этого path)
- RouteConflictError(message: str = "route conflict") — 409, "route_conflict"
- ResolutionError(message: str = "cannot resolve dependency") — 500, "resolution"
- CircularDependencyError(message: str = "circular dependency") — 500,
  "circular_dependency"
- ValidationError — определяется в validation.py (наследует HttpError,
  __init__(errors: list[dict]), status=400, code="validation", .errors)
"""

from __future__ import annotations

from typing import Any, Callable

from .ctx import Ctx, Response


class HttpError(Exception):
    """Базовая: (status: int, code: str, message: str)."""

    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message
        super().__init__(message)


class NotFoundError(HttpError):
    """404, "not_found". Сообщение по умолчанию "not found"."""

    def __init__(self, message: str = "not found") -> None:
        super().__init__(404, "not_found", message)


class MethodNotAllowedError(HttpError):
    """405, "method_not_allowed"; .allowed — отсортированные методы path."""

    def __init__(self, allowed: list[str]) -> None:
        self.allowed = sorted(allowed)
        super().__init__(405, "method_not_allowed", "method not allowed")


class RouteConflictError(HttpError):
    """409, "route_conflict"."""

    def __init__(self, message: str = "route conflict") -> None:
        super().__init__(409, "route_conflict", message)


class ResolutionError(HttpError):
    """500, "resolution"."""

    def __init__(self, message: str = "cannot resolve dependency") -> None:
        super().__init__(500, "resolution", message)


class CircularDependencyError(HttpError):
    """500, "circular_dependency"."""

    def __init__(self, message: str = "circular dependency") -> None:
        super().__init__(500, "circular_dependency", message)


class ErrorHandler:
    """.on(exc_type, handler) / .handle(ctx, exc) -> Response.

    Поиск: точный тип -> иначе по MRO (ближайший базовый сначала).
    Нет совпадения -> fallback Response(500, {"error": "internal",
    "message": str(exc)}). Тело HttpError: {"error": code, "message": msg};
    если у исключения есть атрибут .errors (ValidationError) — добавить
    "details": exc.errors (duck typing, без импорта validation).
    """

    def __init__(self) -> None:
        self._handlers: dict[type[BaseException], Callable[[Ctx, BaseException], Response]] = {}

    def on(self, exc_type: type[BaseException], handler: Callable[[Ctx, BaseException], Response]) -> None:
        self._handlers[exc_type] = handler

    def handle(self, ctx: Ctx, exc: BaseException) -> Response:
        # Поиск по MRO: точный тип, затем ближайший базовый
        for cls in type(exc).__mro__:
            if cls in self._handlers:
                return self._handlers[cls](ctx, exc)

        # Нет зарегистрированного обработчика — fallback
        if isinstance(exc, HttpError):
            body: dict[str, Any] = {"error": exc.code, "message": exc.message}
            errors_attr = getattr(exc, "errors", None)
            if errors_attr is not None:
                body["details"] = errors_attr
            return Response(exc.status, body)

        return Response(500, {"error": "internal", "message": str(exc)})
