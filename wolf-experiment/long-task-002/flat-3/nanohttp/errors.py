"""Иерархия ошибок и error handler (спека LONG-002, §6)."""
from __future__ import annotations

from typing import Any, Callable

from .ctx import Ctx, Response


class HttpError(Exception):
    """Базовая HTTP-ошибка.

    Attributes:
        status: HTTP-статус.
        code: машиносчитываемый код ошибки.
        message: человекочитаемое сообщение.
    """

    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message
        super().__init__(message)


class ErrorHandler:
    """Диспетчер обработчиков исключений: точный тип -> MRO -> fallback."""

    def __init__(self) -> None:
        self._handlers: dict[type, Callable[[Ctx, BaseException], Response]] = {}

    def on(
        self,
        exc_type: type[BaseException],
        handler: Callable[[Ctx, BaseException], Response],
    ) -> None:
        """Зарегистрировать обработчик для типа исключения."""
        self._handlers[exc_type] = handler

    def handle(self, ctx: Ctx, exc: BaseException) -> Response:
        """Превратить исключение в Response.

        Порядок: точный тип, затем ближайшие базовые по MRO; если обработчика
        нет — HttpError превращается в свой статус/код (у ValidationError
        добавляется details), прочее — 500 internal.
        """
        for exc_type in type(exc).__mro__:
            if exc_type in self._handlers:
                return self._handlers[exc_type](ctx, exc)
        if isinstance(exc, HttpError):
            body: dict[str, Any] = {"error": exc.code, "message": exc.message}
            details = getattr(exc, "errors", None)
            if details is not None:
                body["details"] = details
            return Response(exc.status, body)
        return Response(500, {"error": "internal", "message": str(exc)})


# Реэкспорт доменных ошибок (прил. A, п. 29–30: «в errors (или реэкспорт)»).
# Канонические определения живут в своих модулях (router / di / validation),
# здесь — ленивые псевдонимы через PEP 562, чтобы не создавать циклов импорта.
_REEXPORTS: dict[str, str] = {
    "RouteConflictError": "router",
    "NotFoundError": "router",
    "MethodNotAllowedError": "router",
    "ResolutionError": "di",
    "CircularDependencyError": "di",
    "ValidationError": "validation",
}


def __getattr__(name: str) -> Any:
    if name in _REEXPORTS:
        import importlib

        module = importlib.import_module(f".{_REEXPORTS[name]}", __package__)
        return getattr(module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["HttpError", "ErrorHandler", *_REEXPORTS]
