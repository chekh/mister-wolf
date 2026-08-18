"""errors — иерархия ошибок и ErrorHandler (spec.md §6)."""

from __future__ import annotations

from typing import Any, Callable

from .ctx import Ctx, Response


class HttpError(Exception):
    """Базовая HTTP-ошибка."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class ErrorHandler:
    """Регистрация обработчиков исключений с поиском по MRO."""

    def __init__(self) -> None:
        self._handlers: dict[type, Callable[[Ctx, Any], Response]] = {}

    def on(
        self,
        exc_type: type,
        handler: Callable[[Ctx, Any], Response],
    ) -> None:
        """Зарегистрировать обработчик для типа исключения."""
        self._handlers[exc_type] = handler

    def handle(self, ctx: Ctx, exc: BaseException) -> Response:
        """Найти и вызвать обработчик; fallback для неизвестных."""
        for cls in type(exc).__mro__:
            handler = self._handlers.get(cls)
            if handler is not None:
                return handler(ctx, exc)

        if isinstance(exc, HttpError):
            body: dict = {"error": exc.code, "message": exc.message}
            if hasattr(exc, "errors"):
                body["details"] = getattr(exc, "errors")
            return Response(exc.status, body)

        return Response(500, {"error": "internal", "message": str(exc)})


# Реэкспорт ошибок роутера (разрешение цикла импортов)
from .router import MethodNotAllowedError, NotFoundError, RouteConflictError  # noqa: E402,F401
